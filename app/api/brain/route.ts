import { NextResponse } from "next/server";
import { tripletsToGraphData } from "@/lib/graph-data";
import { fetchBrainGraph } from "@/lib/memory-store";
import type { ApiErrorResponse, BrainGraphResponse } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get("sourceId") ?? undefined;
    const cursorParam = searchParams.get("cursor");
    const cursor =
      cursorParam !== null && cursorParam !== "" ? Number(cursorParam) : null;

    const raw = await fetchBrainGraph({
      sourceId,
      cursor: Number.isFinite(cursor) ? cursor : null,
    });

    const superNodeIds = new Set(raw.superNodes.map((node) => node.entity_id));
    const graph = tripletsToGraphData(raw.relations, superNodeIds);

    return NextResponse.json<BrainGraphResponse>({
      ...graph,
      nextCursor: raw.nextCursor,
      isTruncated: raw.isTruncated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load memory graph";
    console.error("[GET /api/brain]", error);
    return NextResponse.json<ApiErrorResponse>(
      { error: message },
      { status: 500 },
    );
  }
}
