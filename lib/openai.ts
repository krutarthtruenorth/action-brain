import OpenAI from "openai";
import {
  DEFAULT_OPENAI_ANSWER_MODEL,
  DEFAULT_OPENAI_TRANSCRIBE_MODEL,
} from "@/lib/constants";
import type {
  AgentInterpretation,
  AgentPlan,
  MemorySource,
  ToolResult,
} from "@/lib/types";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAI_APIKEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

function getAnswerModel() {
  return process.env.OPENAI_ANSWER_MODEL ?? DEFAULT_OPENAI_ANSWER_MODEL;
}

function getTranscribeModel() {
  return process.env.OPENAI_TRANSCRIBE_MODEL ?? DEFAULT_OPENAI_TRANSCRIBE_MODEL;
}

function formatSources(sources: MemorySource[]) {
  if (sources.length === 0) {
    return "No relevant memories were found.";
  }

  return sources
    .map((source, index) => {
      const title = source.title ? ` (${source.title})` : "";
      return `[${index + 1}]${title}\n${source.content}`;
    })
    .join("\n\n---\n\n");
}

function parseJsonObject<T>(raw: string, fallback: T): T {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match?.[0] ?? raw) as T;
  } catch {
    return fallback;
  }
}

export async function interpretUserRequest(
  request: string,
  sources: MemorySource[],
): Promise<AgentInterpretation> {
  const fallback = buildFallbackInterpretation(request);
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: getAnswerModel(),
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "Classify an Action Brain request. Return only compact JSON with keys: intent, goal, requestedOutput, constraints, needsClarification, clarificationQuestion, adaptationDetected. intent must be one of create_tasks, summarize_notes, draft_output, rank_options, extract_unresolved_items, general_action.",
      },
      {
        role: "user",
        content: `Request:\n${request}\n\nRelevant memories:\n${formatSources(sources)}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    return fallback;
  }

  return { ...fallback, ...parseJsonObject(content, fallback) };
}

export async function createAgentPlan(
  request: string,
  interpretation: AgentInterpretation,
  sources: MemorySource[],
): Promise<AgentPlan> {
  const fallback = buildFallbackPlan(interpretation);
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: getAnswerModel(),
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Create a concise execution plan for a memory-driven action agent. Return only JSON: {\"summary\":\"...\",\"steps\":[{\"id\":\"step-1\",\"title\":\"...\",\"status\":\"pending\",\"toolName\":\"optional\",\"notes\":\"optional\"}]}. Use toolName only when one of create_tasks, summarize_notes, draft_output, rank_options, extract_unresolved_items applies.",
      },
      {
        role: "user",
        content: `Request:\n${request}\n\nInterpretation:\n${JSON.stringify(interpretation)}\n\nRelevant memories:\n${formatSources(sources)}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    return fallback;
  }

  return parseJsonObject(content, fallback);
}

export async function summarizeAgentOutcome(options: {
  request: string;
  interpretation: AgentInterpretation;
  sources: MemorySource[];
  toolResults: ToolResult[];
  recoveryMessages: string[];
}): Promise<string> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: getAnswerModel(),
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content:
          "You are Action Brain, a resilient memory-driven action agent. Produce a direct action-oriented final output. Use retrieved memories as context, explain partial recovery when needed, and do not invent facts beyond the request and supplied memories.",
      },
      {
        role: "user",
        content: `Request:\n${options.request}\n\nInterpretation:\n${JSON.stringify(options.interpretation)}\n\nRelevant memories:\n${formatSources(options.sources)}\n\nTool results:\n${options.toolResults.map((result) => `${result.toolName} (${result.status}):\n${result.output}`).join("\n\n")}\n\nRecovery notes:\n${options.recoveryMessages.join("\n") || "None"}`,
      },
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error("OpenAI returned an empty response");
  }

  return answer;
}

export async function transcribeAudioFile(
  file: File,
  context?: string,
): Promise<string> {
  const client = getClient();
  const transcription = await client.audio.transcriptions.create({
    file,
    model: getTranscribeModel(),
    language: "en",
    prompt: context,
    response_format: "json",
  });

  const transcript = transcription.text.trim();
  if (!transcript) {
    throw new Error("OpenAI returned an empty transcription");
  }

  return transcript;
}

export function buildFallbackInterpretation(request: string): AgentInterpretation {
  const normalized = request.toLowerCase();
  const intent = normalized.includes("email") || normalized.includes("draft")
    ? "draft_output"
    : normalized.includes("rank") || normalized.includes("prioritize")
      ? "rank_options"
      : normalized.includes("summarize") || normalized.includes("summary")
        ? "summarize_notes"
        : normalized.includes("blocker") || normalized.includes("unresolved")
          ? "extract_unresolved_items"
          : normalized.includes("task") || normalized.includes("checklist") || normalized.includes("plan")
            ? "create_tasks"
            : "general_action";

  return {
    intent,
    goal: request,
    requestedOutput: intent.replaceAll("_", " "),
    constraints: [],
    needsClarification: request.length < 12,
    clarificationQuestion:
      request.length < 12 ? "What outcome should I optimize this for?" : null,
    adaptationDetected: /\b(instead|actually|change|shorter|rank them|turn this)\b/i.test(request),
  };
}

function buildFallbackPlan(interpretation: AgentInterpretation): AgentPlan {
  return {
    summary: `Use memory context and ${interpretation.intent.replaceAll("_", " ")} to produce the requested outcome.`,
    steps: [
      {
        id: "step-1",
        title: "Retrieve relevant memory context",
        status: "completed",
        notes: "HydraDB recall is used before planning.",
      },
      {
        id: "step-2",
        title: "Run the best matching action tool",
        status: "pending",
        toolName: interpretation.intent,
      },
      {
        id: "step-3",
        title: "Save outcome and recovery notes back to memory",
        status: "pending",
      },
    ],
  };
}
