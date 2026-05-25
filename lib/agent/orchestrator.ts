import { randomUUID } from "node:crypto";
import {
  buildFallbackInterpretation,
  createAgentPlan,
  interpretUserRequest,
  summarizeAgentOutcome,
} from "@/lib/openai";
import {
  retrieveContextForGoal,
  saveAgentCheckpoint,
  saveExecutionHistory,
  saveFailureRecovery,
} from "@/lib/memory-store";
import { executeToolCall, selectTool } from "@/lib/agent/tools";
import type {
  AgentPlan,
  AgentResponse,
  MemorySource,
  RecoveryAction,
  SavedMemoryRecord,
  ToolCall,
  ToolResult,
} from "@/lib/types";

function fallbackPlan(request: string): AgentPlan {
  return {
    summary: "Best-effort action run using deterministic fallback planning.",
    steps: [
      {
        id: "step-1",
        title: "Interpret the request",
        status: "completed",
      },
      {
        id: "step-2",
        title: "Execute a matching action tool",
        status: "pending",
      },
      {
        id: "step-3",
        title: "Persist the result to memory",
        status: "pending",
        notes: request,
      },
    ],
  };
}

function markToolStepCompleted(plan: AgentPlan, result: ToolResult): AgentPlan {
  let matched = false;
  return {
    ...plan,
    steps: plan.steps.map((step) => {
      const isMatch =
        step.toolName === result.toolName ||
        (!matched &&
          !step.toolName &&
          step.status === "pending" &&
          step.title.toLowerCase().includes("tool"));

      if (isMatch) {
        matched = true;
        return {
            ...step,
            toolName: result.toolName,
            status: result.status === "failed" ? "failed" : "completed",
            notes: result.error ?? "Tool completed.",
          };
      }

      return step;
    }),
  };
}

function buildFallbackFinalOutput(options: {
  request: string;
  toolResults: ToolResult[];
  recoveryActions: RecoveryAction[];
}) {
  const successful = options.toolResults.filter((result) => result.output);
  return [
    `Goal: ${options.request}`,
    "",
    successful.map((result) => result.output).join("\n\n") ||
      "I could not complete a specialized tool run, but I preserved the request and recovery state.",
    options.recoveryActions.length > 0
      ? `\nRecovery notes\n${options.recoveryActions.map((item) => `- ${item.message}`).join("\n")}`
      : "",
  ].join("\n");
}

export async function runActionAgent(options: {
  request: string;
  previousRunId?: string;
}): Promise<AgentResponse> {
  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const recoveryActions: RecoveryAction[] = [];
  const savedMemories: SavedMemoryRecord[] = [];
  let sources: MemorySource[] = [];

  try {
    sources = await retrieveContextForGoal(options.request);
  } catch (error) {
    recoveryActions.push({
      type: "missing_memory",
      message:
        error instanceof Error
          ? `Memory retrieval failed, continuing without recalled context: ${error.message}`
          : "Memory retrieval failed, continuing without recalled context.",
    });
  }

  if (sources.length === 0) {
    recoveryActions.push({
      type: "missing_memory",
      message:
        "No relevant HydraDB memories were found. The agent produced a best-effort output and saved the outcome so future runs have context.",
    });
  }

  let interpretation;
  try {
    interpretation = await interpretUserRequest(options.request, sources);
  } catch (error) {
    interpretation = buildFallbackInterpretation(options.request);
    recoveryActions.push({
      type: "partial_execution",
      message:
        error instanceof Error
          ? `OpenAI interpretation failed, using deterministic fallback: ${error.message}`
          : "OpenAI interpretation failed, using deterministic fallback.",
    });
  }

  if (interpretation.needsClarification) {
    recoveryActions.push({
      type: "ambiguous_request",
      message:
        interpretation.clarificationQuestion ??
        "The request is ambiguous. The agent continued with the most practical interpretation.",
    });
  }

  if (interpretation.adaptationDetected) {
    recoveryActions.push({
      type: "partial_execution",
      message:
        "Goal change language was detected. The agent treated this as an adaptation and revised the plan around the latest request.",
    });
  }

  let plan;
  try {
    plan = await createAgentPlan(options.request, interpretation, sources);
  } catch (error) {
    plan = fallbackPlan(options.request);
    recoveryActions.push({
      type: "partial_execution",
      message:
        error instanceof Error
          ? `Plan generation failed, using fallback plan: ${error.message}`
          : "Plan generation failed, using fallback plan.",
    });
  }

  const selectedTool = selectTool(interpretation);
  const toolCalls: ToolCall[] = selectedTool
    ? [
        {
          id: "tool-1",
          toolName: selectedTool.name,
          input: options.request,
        },
      ]
    : [];

  const toolResults: ToolResult[] = [];
  for (const call of toolCalls) {
    const result = await executeToolCall({
      call,
      request: options.request,
      interpretation,
      sources,
    });
    toolResults.push(result);
    plan = markToolStepCompleted(plan, result);

    if (result.status === "failed") {
      recoveryActions.push({
        type: "tool_failure",
        message: `${result.toolName} failed: ${result.error ?? "Unknown error"}. The agent continued with available partial state.`,
      });
    }
  }

  let finalOutput;
  try {
    finalOutput = await summarizeAgentOutcome({
      request: options.request,
      interpretation,
      sources,
      toolResults,
      recoveryMessages: recoveryActions.map((action) => action.message),
    });
  } catch {
    finalOutput = buildFallbackFinalOutput({
      request: options.request,
      toolResults,
      recoveryActions,
    });
  }

  try {
    const checkpoint = await saveAgentCheckpoint({
      agentRunId: runId,
      goal: interpretation.goal,
      content: `Agent run started for goal: ${interpretation.goal}`,
      status: "started",
    });
    savedMemories.push({
      sourceId: checkpoint.sourceId,
      status: checkpoint.status,
      memoryKind: checkpoint.memoryKind,
    });
  } catch (error) {
    recoveryActions.push({
      type: "partial_execution",
      message:
        error instanceof Error
          ? `Checkpoint save failed: ${error.message}`
          : "Checkpoint save failed.",
    });
  }

  try {
    const execution = await saveExecutionHistory({
      agentRunId: runId,
      goal: interpretation.goal,
      content: finalOutput,
      status: recoveryActions.length > 0 ? "completed_with_recovery" : "completed",
      toolName: toolResults[0]?.toolName,
    });
    savedMemories.push({
      sourceId: execution.sourceId,
      status: execution.status,
      memoryKind: execution.memoryKind,
    });
  } catch (error) {
    recoveryActions.push({
      type: "partial_execution",
      message:
        error instanceof Error
          ? `Execution history save failed: ${error.message}`
          : "Execution history save failed.",
    });
  }

  if (recoveryActions.length > 0) {
    try {
      const recovery = await saveFailureRecovery({
        agentRunId: runId,
        goal: interpretation.goal,
        content: recoveryActions.map((action) => action.message).join("\n"),
        toolName: toolResults.find((result) => result.status === "failed")?.toolName,
      });
      savedMemories.push({
        sourceId: recovery.sourceId,
        status: recovery.status,
        memoryKind: recovery.memoryKind,
      });
    } catch {
      // The response already carries the recovery state; avoid masking a useful run.
    }
  }

  return {
    runId,
    createdAt,
    request: options.request,
    interpretation,
    sources,
    plan,
    toolCalls,
    toolResults,
    recoveryActions,
    finalOutput,
    savedMemories,
  };
}
