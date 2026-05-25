export const MEMORY_KINDS = [
  "idea",
  "task",
  "decision",
  "preference",
  "plan",
  "unresolved_item",
  "execution_history",
  "failure_recovery",
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

export type MemorySource = {
  sourceId: string;
  title: string | null;
  content: string;
  score: number | null;
  sourceType: "knowledge" | "memory";
  metadata: Record<string, unknown> | null;
};

export type AgentIntent =
  | "create_tasks"
  | "summarize_notes"
  | "draft_output"
  | "rank_options"
  | "extract_unresolved_items"
  | "general_action";

export type AgentInterpretation = {
  intent: AgentIntent;
  goal: string;
  requestedOutput: string;
  constraints: string[];
  needsClarification: boolean;
  clarificationQuestion: string | null;
  adaptationDetected: boolean;
};

export type AgentStep = {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  toolName?: string;
  notes?: string;
};

export type AgentPlan = {
  summary: string;
  steps: AgentStep[];
};

export type ToolCall = {
  id: string;
  toolName: string;
  input: string;
};

export type ToolResult = {
  callId: string;
  toolName: string;
  status: "success" | "partial" | "failed";
  output: string;
  error?: string;
};

export type RecoveryAction = {
  type:
    | "missing_memory"
    | "ambiguous_request"
    | "conflicting_memory"
    | "tool_failure"
    | "partial_execution";
  message: string;
};

export type SavedMemoryRecord = {
  sourceId: string;
  status: string;
  memoryKind: MemoryKind;
};

export type AgentRun = {
  runId: string;
  createdAt: string;
  request: string;
  interpretation: AgentInterpretation;
  sources: MemorySource[];
  plan: AgentPlan;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  recoveryActions: RecoveryAction[];
  finalOutput: string;
  savedMemories: SavedMemoryRecord[];
};

export type SaveMemoryResponse = {
  sourceId: string;
  status: string;
  message: string;
  tags: string[];
  memoryKind: MemoryKind;
};

export type AgentResponse = AgentRun;

export type ApiErrorResponse = {
  error: string;
};

export type UploadKnowledgeResponse = {
  sourceId: string;
  status: string;
  fileName: string;
  tags: string[];
  message: string;
};

export type AudioMemoryResponse = {
  sourceId: string;
  status: string;
  transcript: string;
  tags: string[];
  message: string;
};

export type WorkspaceMode = "agent" | "memory" | "upload" | "brain";

export type BrainGraphNode = {
  id: string;
  label: string;
  type: string;
  val: number;
};

export type BrainGraphLink = {
  id: string;
  source: string;
  target: string;
  label: string;
};

export type BrainGraphResponse = {
  nodes: BrainGraphNode[];
  links: BrainGraphLink[];
  nextCursor: number | null;
  isTruncated: boolean;
};
