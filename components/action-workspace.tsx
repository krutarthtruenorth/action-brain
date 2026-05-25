"use client";

import dynamic from "next/dynamic";
import {
  Brain,
  Database,
  FileUp,
  Loader2,
  Play,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AgentTracePanel } from "@/components/agent-trace-panel";
import { UploadPanel } from "@/components/upload-panel";
import { VoiceInput } from "@/components/voice-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_AGENT_REQUEST_LENGTH,
  MAX_MEMORY_LENGTH,
} from "@/lib/constants";
import type {
  AgentResponse,
  MemoryKind,
  SaveMemoryResponse,
  WorkspaceMode,
} from "@/lib/types";
import { MEMORY_KINDS } from "@/lib/types";
import { cn } from "@/lib/utils";

const BrainPanel = dynamic(
  () => import("@/components/brain-panel").then((mod) => mod.BrainPanel),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading memory graph...
      </div>
    ),
  },
);

type StatusState =
  | { type: "idle" }
  | { type: "loading"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

const tabClassName = cn(
  "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-medium text-muted-foreground transition-all sm:gap-2 sm:px-3 sm:text-sm",
  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

export function ActionWorkspace() {
  const [mode, setMode] = useState<WorkspaceMode>("agent");
  const [text, setText] = useState("");
  const [memoryKind, setMemoryKind] = useState<MemoryKind>("idea");
  const [status, setStatus] = useState<StatusState>({ type: "idle" });
  const [run, setRun] = useState<AgentResponse | null>(null);

  const isLoading = status.type === "loading";
  const isTextMode = mode === "agent" || mode === "memory";
  const maxLength = mode === "agent" ? MAX_AGENT_REQUEST_LENGTH : MAX_MEMORY_LENGTH;

  function appendTranscript(transcript: string) {
    if (!isTextMode) {
      return;
    }

    setText((current) => {
      const trimmed = current.trim();
      const next = trimmed ? `${trimmed} ${transcript}` : transcript;
      return next.slice(0, maxLength);
    });
  }

  async function runAgent() {
    const request = text.trim();
    if (!request) {
      setStatus({ type: "error", message: "Enter a goal for Action Brain." });
      return;
    }

    setStatus({
      type: "loading",
      message: "Retrieving memory, planning, running tools, and saving outcome...",
    });

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, previousRunId: run?.runId }),
      });
      const data = (await response.json()) as AgentResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to run Action Brain");
      }

      setRun(data);
      setStatus({
        type: "success",
        message: `Run complete. ${data.toolResults.length} tool result(s), ${data.recoveryActions.length} recovery note(s), ${data.savedMemories.length} memory write(s).`,
      });
      toast.success("Action Brain run complete");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to run Action Brain";
      setStatus({ type: "error", message });
      toast.error(message);
    }
  }

  async function saveMemory() {
    const content = text.trim();
    if (!content) {
      setStatus({ type: "error", message: "Enter memory content to save." });
      return;
    }

    setStatus({ type: "loading", message: "Saving memory to HydraDB..." });

    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, memoryKind }),
      });
      const data = (await response.json()) as SaveMemoryResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save memory");
      }

      setText("");
      setStatus({
        type: "success",
        message: `${data.memoryKind} saved (${data.sourceId.slice(0, 8)}..., ${data.status}).`,
      });
      toast.success(data.message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save memory";
      setStatus({ type: "error", message });
      toast.error(message);
    }
  }

  function primaryAction() {
    if (mode === "agent") {
      void runAgent();
    }
    if (mode === "memory") {
      void saveMemory();
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/85 py-0 shadow-card">
        <div className="border-b border-border/70 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-primary">
                Agent workspace
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                Plan, execute, recover, remember
              </h2>
            </div>
            <Badge variant={status.type === "error" ? "destructive" : "outline"}>
              {status.type === "loading" ? status.message : "Ready"}
            </Badge>
          </div>
        </div>

        <div
          className="mx-4 mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-muted/70 p-1 sm:mx-5"
          role="tablist"
          aria-label="Workspace mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "agent"}
            onClick={() => setMode("agent")}
            className={cn(tabClassName, mode === "agent" && "bg-card text-foreground shadow-sm")}
          >
            <Play className="size-4" />
            Agent
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "memory"}
            onClick={() => setMode("memory")}
            className={cn(tabClassName, mode === "memory" && "bg-card text-foreground shadow-sm")}
          >
            <Database className="size-4" />
            Memory
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            onClick={() => setMode("upload")}
            className={cn(tabClassName, mode === "upload" && "bg-card text-foreground shadow-sm")}
          >
            <FileUp className="size-4" />
            Upload
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "brain"}
            onClick={() => setMode("brain")}
            className={cn(tabClassName, mode === "brain" && "bg-card text-foreground shadow-sm")}
          >
            <Brain className="size-4" />
            Graph
          </button>
        </div>

        <CardContent className="space-y-4 px-4 pt-4 pb-5 sm:px-5">
          {mode === "brain" ? <BrainPanel /> : null}
          {mode === "upload" ? <UploadPanel /> : null}
          {isTextMode ? (
            <>
              {mode === "memory" ? (
                <label className="block text-sm font-medium text-foreground">
                  Memory kind
                  <select
                    value={memoryKind}
                    onChange={(event) => setMemoryKind(event.target.value as MemoryKind)}
                    disabled={isLoading}
                    className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                  >
                    {MEMORY_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="rounded-2xl border border-border/70 bg-background/80 p-3 shadow-inner">
                <Textarea
                  aria-label={mode === "agent" ? "Agent request" : "Memory content"}
                  placeholder={
                    mode === "agent"
                      ? "Paste messy notes or describe a goal. Example: turn these launch ideas into a practical task list, and remember the outcome."
                      : "Save an idea, task, decision, preference, plan, unresolved item, or execution history. #tags are supported."
                  }
                  value={text}
                  onChange={(event) => setText(event.target.value.slice(0, maxLength))}
                  maxLength={maxLength}
                  rows={8}
                  disabled={isLoading}
                  className="min-h-48 resize-y border-0 bg-transparent px-1 py-2 shadow-none focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent dark:bg-transparent"
                />
                <div className="flex items-center justify-between border-t border-border/50 pt-2">
                  <span
                    className={cn(
                      "text-xs tabular-nums text-muted-foreground",
                      text.length >= maxLength && "text-destructive",
                    )}
                  >
                    {text.length} / {maxLength}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setText("")}
                    disabled={isLoading || text.length === 0}
                    className="h-7 gap-1.5 text-muted-foreground"
                  >
                    <Trash2 className="size-3.5" />
                    Clear
                  </Button>
                </div>
              </div>

              <VoiceInput onTranscript={appendTranscript} disabled={isLoading} />

              <Button
                onClick={primaryAction}
                disabled={isLoading}
                className="h-11 w-full rounded-xl shadow-lg shadow-primary/15"
                size="lg"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : mode === "agent" ? (
                  <Send className="size-4" />
                ) : (
                  <Save className="size-4" />
                )}
                {mode === "agent" ? "Run Action Brain" : "Save Action Memory"}
              </Button>
            </>
          ) : null}

          {status.type !== "idle" ? (
            <Alert variant={status.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {mode === "agent" ? (
        <Card className="rounded-2xl border-border/70 bg-card/85 shadow-card">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">
                  Final output
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  Action result
                </h2>
              </div>
              {run ? <Badge variant="outline">{run.interpretation.intent}</Badge> : null}
            </div>
            {run ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {run.finalOutput}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                The final action-oriented output will appear here.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {mode === "agent" ? <AgentTracePanel run={run} /> : null}
    </div>
  );
}
