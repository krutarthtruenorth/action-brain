"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ListChecks,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { AgentResponse } from "@/lib/types";

type AgentTracePanelProps = {
  run: AgentResponse | null;
};

export function AgentTracePanel({ run }: AgentTracePanelProps) {
  if (!run) {
    return (
      <Card className="rounded-2xl border-border/70 bg-card/85 shadow-card">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">
            Run the agent to see retrieved memories, plan steps, tools,
            recovery, and saved outcomes.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/70 bg-card/85 shadow-card">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <ListChecks className="size-4 text-primary" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Plan</h2>
          </div>
          <p className="text-sm text-muted-foreground">{run.plan.summary}</p>
          <div className="space-y-2">
            {run.plan.steps.map((step) => (
              <div
                key={step.id}
                className="rounded-xl border border-border/70 bg-background/70 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{step.status}</Badge>
                  {step.toolName ? <Badge variant="secondary">{step.toolName}</Badge> : null}
                  <span className="text-sm font-medium text-foreground">
                    {step.title}
                  </span>
                </div>
                {step.notes ? (
                  <p className="mt-2 text-xs text-muted-foreground">{step.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70 bg-card/85 shadow-card">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-primary" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Tool Trace</h2>
          </div>
          {run.toolResults.length > 0 ? (
            run.toolResults.map((result) => (
              <article
                key={result.callId}
                className="rounded-xl border border-border/70 bg-background/70 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge>{result.toolName}</Badge>
                  <Badge variant={result.status === "failed" ? "destructive" : "outline"}>
                    {result.status}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {result.output || result.error}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No tools were executed.</p>
          )}
        </CardContent>
      </Card>

      {run.recoveryActions.length > 0 ? (
        <Card className="rounded-2xl border-border/70 bg-card/85 shadow-card">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" aria-hidden />
              <h2 className="text-base font-semibold text-foreground">Recovery</h2>
            </div>
            {run.recoveryActions.map((action, index) => (
              <div
                key={`${action.type}-${index}`}
                className="rounded-xl border border-border/70 bg-background/70 p-3"
              >
                <Badge variant="outline">{action.type}</Badge>
                <p className="mt-2 text-sm text-muted-foreground">{action.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-2xl border-border/70 bg-card/85 shadow-card">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Memory Evidence</h2>
          </div>
          {run.sources.length > 0 ? (
            run.sources.map((source, index) => (
              <article
                key={`${source.sourceId}-${index}`}
                className="rounded-xl border border-border/70 bg-background/70 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Source {index + 1}</Badge>
                  <Badge variant="outline">{source.sourceType}</Badge>
                  {source.score != null ? (
                    <Badge variant="outline">{Math.round(source.score * 100)}% match</Badge>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {source.content}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No matching memory was found for this run.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70 bg-card/85 shadow-card">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-primary" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Saved Outcomes</h2>
          </div>
          {run.savedMemories.length > 0 ? (
            <div className="grid gap-2">
              {run.savedMemories.map((memory) => (
                <div
                  key={memory.sourceId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2"
                >
                  <Badge variant="outline">{memory.memoryKind}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {memory.sourceId.slice(0, 12)}... · {memory.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No memory writeback completed.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
