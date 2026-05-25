import { NextResponse } from "next/server";
import { saveMemoryRecord } from "@/lib/memory-store";
import type { ApiErrorResponse, SaveMemoryResponse } from "@/lib/types";
import { saveMemorySchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = saveMemorySchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return NextResponse.json<ApiErrorResponse>(
        { error: message },
        { status: 400 },
      );
    }

    const result = await saveMemoryRecord({
      content: parsed.data.content,
      memoryKind: parsed.data.memoryKind,
      sourceType: "direct_capture",
      outcomeType: "captured_memory",
    });

    const baseMessage =
      result.tags.length > 0
        ? `${result.memoryKind} saved with tags: ${result.tags.join(", ")}`
        : `${result.memoryKind} saved successfully`;
    const message =
      result.status === "queued"
        ? `${baseMessage}. Still indexing — try running the agent again in ~30 seconds.`
        : baseMessage;

    return NextResponse.json<SaveMemoryResponse>({
      sourceId: result.sourceId,
      status: result.status,
      tags: result.tags,
      memoryKind: result.memoryKind,
      message,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save memory";
    console.error("[POST /api/memories]", error);
    return NextResponse.json<ApiErrorResponse>(
      { error: message },
      { status: 500 },
    );
  }
}
