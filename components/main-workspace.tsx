import { Activity, Database, Wrench } from "lucide-react";
import { ActionWorkspace } from "@/components/action-workspace";
import { AppHeader } from "@/components/app-header";

const signals = [
  {
    icon: Database,
    label: "Memory foundation",
    value: "HydraDB recall and writeback",
  },
  {
    icon: Wrench,
    label: "Tool system",
    value: "Tasks, summaries, drafts, ranking",
  },
  {
    icon: Activity,
    label: "Recovery",
    value: "Fallbacks, partial runs, checkpoints",
  },
];

export function MainWorkspace() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 py-5 sm:px-6 sm:py-7 lg:grid-cols-[0.34fr_0.66fr] lg:items-start">
        <section className="space-y-4 lg:sticky lg:top-20">
          <div className="rounded-2xl border border-border/70 bg-card/85 p-5 shadow-card">
            <p className="text-xs font-semibold uppercase text-primary">
              Agentic memory
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Turn remembered context into action.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Action Brain retrieves relevant memory, chooses an explicit tool,
              handles messy input, and saves important outcomes back to HydraDB.
            </p>
          </div>

          <div className="grid gap-3">
            {signals.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-2xl border border-border/70 bg-card/75 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {value}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0">
          <ActionWorkspace />
        </section>
      </main>
    </div>
  );
}
