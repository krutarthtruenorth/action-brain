"use client";

import dynamic from "next/dynamic";
import { Brain, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BrainGraphResponse } from "@/lib/types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

type ForceGraphNode = BrainGraphResponse["nodes"][number] & {
  x?: number;
  y?: number;
};

export function BrainPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<BrainGraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 640, height: 480 });
  const [selectedNode, setSelectedNode] = useState<ForceGraphNode | null>(null);
  const fetchGraph = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/brain");
      const json = (await response.json()) as BrainGraphResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(json.error ?? "Failed to load brain graph");
      }

      setData(json);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load brain graph";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialGraph() {
      try {
        const response = await fetch("/api/brain");
        const json = (await response.json()) as BrainGraphResponse & {
          error?: string;
        };

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          throw new Error(json.error ?? "Failed to load brain graph");
        }

        setData(json);
        setError(null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load brain graph";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialGraph();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;
      setDimensions({
        width: Math.max(Math.floor(width), 320),
        height: Math.max(Math.floor(height), 360),
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  if (loading) {
    return (
      <div
        className="flex min-h-80 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/80 text-sm text-muted-foreground"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading knowledge graph…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-6 text-center">
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
        <Button variant="outline" size="sm" onClick={() => void fetchGraph(true)}>
          <RefreshCw className="size-3.5" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  if (!data?.nodes.length) {
    return (
      <div className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-6 text-center">
        <Brain className="mx-auto size-8 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          No graph yet. Save memories with named people, places, and
          relationships, then wait ~30 seconds for HydraDB to build the graph.
        </p>
        <Button variant="outline" size="sm" onClick={() => void fetchGraph(true)}>
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-primary">Knowledge graph</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Explore connected concepts
          </h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchGraph(true)}>
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh
        </Button>
      </div>

      <div>
        <div
          ref={containerRef}
          className="h-[min(80vh,720px)] min-h-120 overflow-hidden rounded-2xl border border-border/70 bg-[radial-gradient(circle_at_center,oklch(0.955_0.045_68),oklch(0.995_0.012_80))] dark:bg-[radial-gradient(circle_at_center,oklch(0.25_0.035_58),oklch(0.15_0.012_65))]"
        >
        <ForceGraph2D
          width={dimensions.width}
          height={dimensions.height}
          graphData={{ nodes: data.nodes, links: data.links }}
          backgroundColor="rgba(255,255,255,0)"
          nodeLabel="label"
          linkLabel="label"
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          cooldownTicks={80}
          onNodeClick={(node) => setSelectedNode(node as ForceGraphNode)}
          linkColor={() => "rgba(196, 90, 47, 0.36)"}
          linkWidth={() => 1.4}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const graphNode = node as ForceGraphNode;
            const radius = graphNode.val ?? 4;
            const label = graphNode.label;
            const fontSize = Math.max(12 / globalScale, 3);
            const isSelected = selectedNode?.id === graphNode.id;

            ctx.beginPath();
            ctx.arc(graphNode.x ?? 0, graphNode.y ?? 0, radius + (isSelected ? 4 : 0), 0, 2 * Math.PI);
            ctx.fillStyle = isSelected ? "rgba(224, 122, 79, 0.2)" : "rgba(224, 122, 79, 0.11)";
            ctx.fill();

            ctx.beginPath();
            ctx.arc(graphNode.x ?? 0, graphNode.y ?? 0, radius, 0, 2 * Math.PI);
            ctx.fillStyle = graphNode.type === "document" ? "#f59e0b" : "#e07a4f";
            ctx.fill();
            ctx.strokeStyle = isSelected ? "#8a3c18" : "#ffffff";
            ctx.lineWidth = (isSelected ? 2.5 : 1.5) / globalScale;
            ctx.stroke();

            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";

            const padding = 4 / globalScale;
            const textWidth = ctx.measureText(label).width;
            const boxX = (graphNode.x ?? 0) + radius + 6 / globalScale;
            const boxY = (graphNode.y ?? 0) - fontSize / 2 - padding;
            const boxHeight = fontSize + padding * 2;

            const boxWidth = textWidth + padding * 2;

            ctx.fillStyle = isSelected
              ? "rgba(96, 42, 16, 0.92)"
              : "rgba(255, 255, 255, 0.88)";
            ctx.strokeStyle = "rgba(196, 90, 47, 0.18)";
            ctx.lineWidth = 1 / globalScale;
            ctx.beginPath();
            ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6 / globalScale);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = isSelected ? "rgba(255,255,255,0.95)" : "rgba(31, 41, 55, 0.92)";
            ctx.fillText(label, boxX + padding, graphNode.y ?? 0);
          }}
        />
      </div>

      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {data.nodes.length} entities · {data.links.length} relationships
          {data.isTruncated ? " · showing first page" : ""}
        </p>
      </div>
    </div>
  );
}
