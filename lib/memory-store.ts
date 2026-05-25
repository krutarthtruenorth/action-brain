import { createHash } from "node:crypto";
import { HydraDBClient, HydraDBError } from "@hydradb/sdk";
import {
  BRAIN_GRAPH_LIMIT,
  BRAIN_SUPER_NODES_LIMIT,
  INDEXING_DELAY_MS,
  INDEXING_MAX_ATTEMPTS,
  MAX_MEMORY_TAGS,
  RECALL_MAX_RESULTS,
  RECALL_TAG_FILTER_MAX_RESULTS,
} from "@/lib/constants";
import type { GraphTriplet } from "@/lib/graph-data";
import {
  formatIndexedMemoryText,
  memoryMatchesTags,
  parseMemoryContent,
} from "@/lib/memory-content";
import type { MemoryKind, MemorySource } from "@/lib/types";

const DEFAULT_SUB_TENANT_ID = "action_demo_user";
const APP_METADATA = "action-brain-mvp";
let ensureTenantPromise: Promise<void> | null = null;

function getConfig() {
  const apiKey = process.env.HYDRADB_API_KEY;
  const tenantId = process.env.HYDRADB_PROJECT_ID;
  const baseUrl = process.env.HYDRADB_URL;
  const subTenantId = process.env.HYDRADB_SUB_TENANT_ID ?? DEFAULT_SUB_TENANT_ID;

  if (!apiKey) {
    throw new Error("HYDRADB_API_KEY is not configured");
  }
  if (!tenantId) {
    throw new Error("HYDRADB_PROJECT_ID is not configured");
  }

  return { apiKey, tenantId, baseUrl, subTenantId };
}

function createClient() {
  const { apiKey, baseUrl } = getConfig();
  return new HydraDBClient({
    token: apiKey,
    ...(baseUrl ? { baseUrl } : {}),
  });
}

function getNamespaceMetadata() {
  const { tenantId, subTenantId } = getConfig();
  return {
    tenant_id: tenantId,
    sub_tenant_id: subTenantId,
  };
}

const READY_STATUSES = new Set(["completed", "graph_creation", "success"]);

async function waitForIndexing(sourceId: string): Promise<string> {
  const client = createClient();
  const { tenant_id, sub_tenant_id } = getNamespaceMetadata();

  for (let attempt = 0; attempt < INDEXING_MAX_ATTEMPTS; attempt += 1) {
    const response = await client.upload.verifyProcessing({
      tenant_id,
      sub_tenant_id,
      file_ids: [sourceId],
    });

    const status = response.statuses?.[0];
    if (!status) {
      break;
    }

    if (status.indexing_status === "errored") {
      throw new Error(status.message || "Memory indexing failed. Please try again.");
    }

    if (READY_STATUSES.has(status.indexing_status)) {
      return status.indexing_status;
    }

    await new Promise((resolve) => setTimeout(resolve, INDEXING_DELAY_MS));
  }

  return "queued";
}

function isHydraMetadataList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isHydraMetadataValue(
  value: unknown,
): value is string | number | boolean | string[] {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean" ||
    isHydraMetadataList(value)
  );
}

function sanitizeHydraMetadata(metadata: Record<string, unknown>) {
  const sanitized: Record<string, string | number | boolean | string[]> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      continue;
    }

    if (isHydraMetadataValue(value)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function metadataWithNamespace(metadata: Record<string, unknown>) {
  return sanitizeHydraMetadata({
    ...metadata,
    app: APP_METADATA,
    ...getNamespaceMetadata(),
  });
}

function isExistingTenantError(error: unknown): boolean {
  if (!(error instanceof HydraDBError)) {
    return false;
  }

  const body = JSON.stringify(error.body ?? {}).toLowerCase();
  return (
    error.statusCode === 400 ||
    error.statusCode === 409 ||
    (error.statusCode === 422 && body.includes("exist"))
  );
}

async function ensureTenant() {
  if (!ensureTenantPromise) {
    ensureTenantPromise = (async () => {
      const client = createClient();
      const { tenant_id } = getNamespaceMetadata();

      try {
        await client.tenant.create({ tenant_id });
      } catch (error) {
        if (!isExistingTenantError(error)) {
          throw error;
        }
      }
    })();
  }

  return ensureTenantPromise;
}

function sourceIdForFile(fileName: string, content: string) {
  const normalizedName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const digest = createHash("sha256")
    .update(fileName)
    .update("\0")
    .update(content)
    .digest("hex")
    .slice(0, 16);

  return `md_${normalizedName || "upload"}_${digest}`;
}

export async function saveMemoryRecord(options: {
  content: string;
  memoryKind?: MemoryKind;
  title?: string;
  agentRunId?: string;
  goal?: string;
  status?: string;
  toolName?: string;
  outcomeType?: string;
  sourceType?: string;
}): Promise<{ sourceId: string; status: string; tags: string[]; memoryKind: MemoryKind }> {
  const { content, tags } = parseMemoryContent(options.content, MAX_MEMORY_TAGS);
  const memoryKind = options.memoryKind ?? "idea";

  if (!content) {
    throw new Error("Memory content cannot be empty after removing hashtags.");
  }

  const client = createClient();
  const { tenant_id, sub_tenant_id } = getNamespaceMetadata();
  await ensureTenant();

  const additional_metadata = metadataWithNamespace({
    created_at: new Date().toISOString(),
    source_type: options.sourceType ?? "action_memory",
    memory_kind: memoryKind,
    agent_run_id: options.agentRunId,
    goal: options.goal,
    status: options.status,
    tool_name: options.toolName,
    outcome_type: options.outcomeType,
    tags,
  });

  const response = await client.upload.addMemory({
    tenant_id,
    sub_tenant_id,
    memories: [
      {
        text: formatIndexedMemoryText(content, tags),
        infer: false,
        title: options.title ?? `${memoryKind}: ${content.slice(0, 72)}`,
        additional_metadata,
      },
    ],
  });

  const result = response.results?.[0];
  if (!result?.source_id) {
    throw new Error(response.message || "Failed to save memory");
  }

  return {
    sourceId: result.source_id,
    status: await waitForIndexing(result.source_id),
    tags,
    memoryKind,
  };
}

export async function saveAgentCheckpoint(options: {
  agentRunId: string;
  goal: string;
  content: string;
  status: string;
}) {
  return saveMemoryRecord({
    content: options.content,
    memoryKind: "execution_history",
    agentRunId: options.agentRunId,
    goal: options.goal,
    status: options.status,
    sourceType: "agent_checkpoint",
    outcomeType: "checkpoint",
  });
}

export async function saveExecutionHistory(options: {
  agentRunId: string;
  goal: string;
  content: string;
  status: string;
  toolName?: string;
}) {
  return saveMemoryRecord({
    content: options.content,
    memoryKind: "execution_history",
    agentRunId: options.agentRunId,
    goal: options.goal,
    status: options.status,
    toolName: options.toolName,
    sourceType: "agent_execution",
    outcomeType: "final_outcome",
  });
}

export async function saveFailureRecovery(options: {
  agentRunId: string;
  goal: string;
  content: string;
  toolName?: string;
}) {
  return saveMemoryRecord({
    content: options.content,
    memoryKind: "failure_recovery",
    agentRunId: options.agentRunId,
    goal: options.goal,
    status: "recovered",
    toolName: options.toolName,
    sourceType: "agent_recovery",
    outcomeType: "recovery",
  });
}

export async function uploadMarkdownKnowledge(file: File, context?: string): Promise<{
  sourceId: string;
  status: string;
  fileName: string;
  tags: string[];
}> {
  const fileName = file.name.trim();
  const content = await file.text();
  const { tags } = parseMemoryContent(`${context ?? ""}\n${content}`, MAX_MEMORY_TAGS);
  const sourceId = sourceIdForFile(fileName, content);
  const uploadedAt = new Date().toISOString();
  const client = createClient();
  const { tenant_id, sub_tenant_id } = getNamespaceMetadata();
  await ensureTenant();
  const markdownFile = new File([content], fileName, {
    type: file.type || "text/markdown",
  });

  const response = await client.upload.knowledge({
    tenant_id,
    sub_tenant_id,
    files: [markdownFile],
    file_metadata: JSON.stringify([
      {
        file_id: sourceId,
        metadata: metadataWithNamespace({
          source_type: "markdown",
          memory_kind: "idea",
        }),
        additional_metadata: metadataWithNamespace({
          source: "markdown_upload",
          source_type: "markdown",
          memory_kind: "idea",
          file_name: fileName,
          content_type: markdownFile.type,
          file_size: markdownFile.size,
          uploaded_at: uploadedAt,
          context: context || undefined,
          tags,
        }),
      },
    ]),
    upsert: true,
  });

  const result = response.results?.[0];
  const resultSourceId = result?.source_id ?? sourceId;
  if (!resultSourceId) {
    throw new Error(response.message || "Failed to upload Markdown knowledge");
  }

  return {
    sourceId: resultSourceId,
    status: await waitForIndexing(resultSourceId),
    fileName,
    tags,
  };
}

export async function saveAudioTranscriptionMemory(options: {
  transcript: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  context?: string;
}): Promise<{ sourceId: string; status: string; transcript: string; tags: string[] }> {
  const { content: transcript, tags: transcriptTags } = parseMemoryContent(
    options.transcript,
    MAX_MEMORY_TAGS,
  );
  const { content: context, tags: contextTags } = parseMemoryContent(
    options.context ?? "",
    MAX_MEMORY_TAGS,
  );
  const tags = [...new Set([...transcriptTags, ...contextTags])].slice(0, MAX_MEMORY_TAGS);

  if (!transcript) {
    throw new Error("Audio transcription cannot be empty");
  }

  const indexedContent = context
    ? `Context: ${context}\n\nTranscript: ${transcript}`
    : transcript;

  const result = await saveMemoryRecord({
    content: formatIndexedMemoryText(indexedContent, tags),
    memoryKind: "idea",
    title: `Voice note: ${transcript.slice(0, 64)}`,
    sourceType: "audio_transcription",
    outcomeType: "captured_input",
  });

  return {
    sourceId: result.sourceId,
    status: result.status,
    transcript,
    tags,
  };
}

function toMemorySource(
  chunk: {
    source_id?: string;
    source_title?: string;
    chunk_content?: string;
    relevancy_score?: number | null;
    metadata?: Record<string, unknown> | null;
    additional_metadata?: Record<string, unknown> | null;
  },
  sourceType: "knowledge" | "memory",
): MemorySource {
  return {
    sourceId: chunk.source_id ?? "unknown",
    title: chunk.source_title ?? null,
    content: chunk.chunk_content ?? "",
    score: typeof chunk.relevancy_score === "number" ? chunk.relevancy_score : null,
    sourceType,
    metadata: {
      ...(chunk.metadata ?? {}),
      ...(chunk.additional_metadata ?? {}),
    },
  };
}

function uniqueSources(sources: MemorySource[]): MemorySource[] {
  const seen = new Set<string>();
  const unique: MemorySource[] = [];

  for (const source of sources) {
    const key = `${source.sourceType}:${source.sourceId}:${source.content}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(source);
  }

  return unique;
}

function isRecoverableRecallError(error: unknown): boolean {
  return error instanceof HydraDBError && error.statusCode === 404;
}

export async function retrieveContextForGoal(rawGoal: string): Promise<MemorySource[]> {
  const { content, tags } = parseMemoryContent(rawGoal, MAX_MEMORY_TAGS);
  const query = [content, ...tags].filter(Boolean).join(" ").trim() || rawGoal;
  const client = createClient();
  const { tenant_id, sub_tenant_id } = getNamespaceMetadata();

  const [knowledgeResult, memoryResult] = await Promise.allSettled([
    client.recall.fullRecall({
      tenant_id,
      sub_tenant_id,
      query,
      max_results: tags.length > 0 ? RECALL_TAG_FILTER_MAX_RESULTS : RECALL_MAX_RESULTS,
      mode: "fast",
      alpha: "auto",
      recency_bias: 0,
      graph_context: true,
    }),
    client.recall.recallPreferences({
      tenant_id,
      sub_tenant_id,
      query,
      max_results: tags.length > 0 ? RECALL_TAG_FILTER_MAX_RESULTS : RECALL_MAX_RESULTS,
      mode: "fast",
    }),
  ]);

  if (knowledgeResult.status === "rejected" && !isRecoverableRecallError(knowledgeResult.reason)) {
    throw knowledgeResult.reason;
  }
  if (memoryResult.status === "rejected" && !isRecoverableRecallError(memoryResult.reason)) {
    throw memoryResult.reason;
  }

  const knowledgeChunks = knowledgeResult.status === "fulfilled" ? (knowledgeResult.value.chunks ?? []) : [];
  const memoryChunks = memoryResult.status === "fulfilled" ? (memoryResult.value.chunks ?? []) : [];

  let sources = [
    ...knowledgeChunks.map((chunk) => toMemorySource(chunk, "knowledge")),
    ...memoryChunks.map((chunk) => toMemorySource(chunk, "memory")),
  ];

  if (tags.length > 0) {
    sources = sources.filter((source) =>
      memoryMatchesTags(source.metadata?.tags, source.content, tags),
    );
  }

  return uniqueSources(sources)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, RECALL_MAX_RESULTS);
}

type GraphRelationsPayload = {
  relations: (GraphTriplet | null)[];
  next_cursor?: number | null;
  is_truncated?: boolean;
};

function isRecoverableGraphError(error: unknown): boolean {
  return error instanceof HydraDBError && (error.statusCode === 404 || error.statusCode === 500);
}

function getGraphRelationsPayload(
  result: PromiseSettledResult<GraphRelationsPayload>,
): GraphRelationsPayload {
  if (result.status === "fulfilled") {
    return result.value;
  }
  if (isRecoverableGraphError(result.reason)) {
    return { relations: [], next_cursor: null, is_truncated: false };
  }
  throw result.reason;
}

export async function fetchBrainGraph(options?: {
  sourceId?: string;
  limit?: number;
  cursor?: number | null;
}) {
  const client = createClient();
  const { tenant_id, sub_tenant_id } = getNamespaceMetadata();
  const limit = options?.limit ?? BRAIN_GRAPH_LIMIT;

  const [memoryRelationsResult, knowledgeRelationsResult, superNodesResult] =
    await Promise.allSettled([
      client.fetch.graphRelationsBySourceId({
        tenant_id,
        sub_tenant_id,
        is_memory: true,
        source_id: options?.sourceId,
        limit,
        cursor: options?.cursor,
      }),
      client.fetch.graphRelationsBySourceId({
        tenant_id,
        sub_tenant_id,
        is_memory: false,
        source_id: options?.sourceId,
        limit,
        cursor: options?.cursor,
      }),
      client.graphHealth.getSuperNodes({
        tenant_id,
        sub_tenant_id,
        limit: BRAIN_SUPER_NODES_LIMIT,
      }),
    ]);

  const memoryRelations = getGraphRelationsPayload(memoryRelationsResult);
  const knowledgeRelations = getGraphRelationsPayload(knowledgeRelationsResult);
  const superNodes =
    superNodesResult.status === "fulfilled"
      ? (superNodesResult.value.super_nodes ?? [])
      : [];

  return {
    relations: [
      ...(memoryRelations.relations ?? []),
      ...(knowledgeRelations.relations ?? []),
    ],
    superNodes,
    nextCursor: memoryRelations.next_cursor ?? knowledgeRelations.next_cursor ?? null,
    isTruncated:
      Boolean(memoryRelations.is_truncated) ||
      Boolean(knowledgeRelations.is_truncated),
  };
}
