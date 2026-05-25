import type {
  AgentInterpretation,
  AgentIntent,
  MemorySource,
  ToolCall,
  ToolResult,
} from "@/lib/types";

export type ActionTool = {
  name: AgentIntent;
  label: string;
  description: string;
  run: (input: {
    request: string;
    interpretation: AgentInterpretation;
    sources: MemorySource[];
  }) => Promise<string>;
};

function sourceLines(sources: MemorySource[]) {
  return sources
    .slice(0, 5)
    .map((source, index) => `${index + 1}. ${source.content}`)
    .join("\n");
}

function splitCandidateLines(text: string) {
  return text
    .split(/\n|\. /)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 8)
    .slice(0, 8);
}

const tools: ActionTool[] = [
  {
    name: "create_tasks",
    label: "Create Tasks",
    description: "Turns messy notes or ideas into a concrete checklist.",
    async run({ request, sources }) {
      const candidates = splitCandidateLines(`${request}\n${sourceLines(sources)}`);
      const tasks = candidates.length > 0 ? candidates : [request];
      return [
        "Checklist",
        ...tasks.map((item, index) => `${index + 1}. [ ] ${item}`),
        "",
        "Execution note: start with the smallest item that removes uncertainty.",
      ].join("\n");
    },
  },
  {
    name: "summarize_notes",
    label: "Summarize Notes",
    description: "Condenses input and retrieved memories into a decision-ready summary.",
    async run({ request, sources }) {
      const context = sourceLines(sources);
      return [
        "Summary",
        request,
        context ? `\nRelevant memory context\n${context}` : "\nNo matching saved context was found.",
        "\nPractical next move",
        "Pick the one outcome this should drive, then convert it into an owner/date/action format.",
      ].join("\n");
    },
  },
  {
    name: "draft_output",
    label: "Draft Output",
    description: "Drafts an email, follow-up, update, or short written artifact.",
    async run({ request, sources }) {
      const context = sourceLines(sources);
      return [
        "Draft",
        "Hi,",
        "",
        `Here is the current direction: ${request}`,
        context ? `\nI am using the following saved context:\n${context}` : "",
        "",
        "Next steps:",
        "- Confirm the desired outcome.",
        "- Identify any missing owner or deadline.",
        "- Send the shortest useful version.",
      ].join("\n");
    },
  },
  {
    name: "rank_options",
    label: "Rank Options",
    description: "Ranks ideas or options using request constraints and remembered preferences.",
    async run({ request, sources }) {
      const candidates = splitCandidateLines(`${request}\n${sourceLines(sources)}`);
      const ranked = candidates.length > 0 ? candidates : [request];
      return [
        "Ranked options",
        ...ranked.map((item, index) => `${index + 1}. ${item} — ranked by fit, urgency, and memory-backed relevance.`),
        "",
        "Tie-breaker: choose the option with the clearest next action and lowest recovery cost.",
      ].join("\n");
    },
  },
  {
    name: "extract_unresolved_items",
    label: "Extract Unresolved Items",
    description: "Finds blockers, unanswered questions, and follow-up actions.",
    async run({ request, sources }) {
      const text = `${request}\n${sourceLines(sources)}`;
      const questions = text.match(/[^.?!]*\?/g)?.slice(0, 6) ?? [];
      return [
        "Unresolved items",
        ...(questions.length > 0
          ? questions.map((item, index) => `${index + 1}. ${item.trim()}`)
          : [
              "1. Confirm the owner.",
              "2. Confirm the deadline.",
              "3. Confirm what output format is needed.",
            ]),
        "",
        "Recovery path: answer the highest-impact unresolved item first, then rerun the agent on the updated goal.",
      ].join("\n");
    },
  },
  {
    name: "general_action",
    label: "General Action",
    description: "Produces a practical action-oriented response when no specialized tool fits.",
    async run({ request, sources }) {
      return [
        "Action response",
        `Goal: ${request}`,
        "",
        "Recommended moves",
        "1. Clarify the desired final artifact.",
        "2. Use retrieved memory as constraints.",
        "3. Produce a small concrete output now.",
        sources.length > 0 ? `\nMemory used\n${sourceLines(sources)}` : "\nNo saved memory was available, so this is a best-effort response.",
      ].join("\n");
    },
  },
];

export const toolRegistry = new Map(tools.map((tool) => [tool.name, tool]));

export function selectTool(interpretation: AgentInterpretation) {
  return toolRegistry.get(interpretation.intent) ?? toolRegistry.get("general_action");
}

export async function executeToolCall(options: {
  call: ToolCall;
  request: string;
  interpretation: AgentInterpretation;
  sources: MemorySource[];
}): Promise<ToolResult> {
  const tool = toolRegistry.get(options.call.toolName as AgentIntent);
  if (!tool) {
    return {
      callId: options.call.id,
      toolName: options.call.toolName,
      status: "failed",
      output: "",
      error: `Unknown tool: ${options.call.toolName}`,
    };
  }

  try {
    const output = await tool.run({
      request: options.request,
      interpretation: options.interpretation,
      sources: options.sources,
    });

    return {
      callId: options.call.id,
      toolName: options.call.toolName,
      status: output.trim() ? "success" : "partial",
      output: output.trim() || "Tool completed but produced no output.",
    };
  } catch (error) {
    return {
      callId: options.call.id,
      toolName: options.call.toolName,
      status: "failed",
      output: "",
      error: error instanceof Error ? error.message : "Tool execution failed",
    };
  }
}
