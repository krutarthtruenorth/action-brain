import { BrainCircuit, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"
            aria-hidden
          >
            <BrainCircuit className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none text-foreground">
              Action Brain
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Memory-driven agent under pressure
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden />
            HydraDB memory + tool execution
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
