import { NextResponse } from "next/server";
import { runActionAgent } from "@/lib/agent/orchestrator";
import type { AgentResponse, ApiErrorResponse } from "@/lib/types";
import { agentRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = agentRequestSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return NextResponse.json<ApiErrorResponse>(
        { error: message },
        { status: 400 },
      );
    }

    const result = await runActionAgent(parsed.data);
    return NextResponse.json<AgentResponse>(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to run Action Brain";
    console.error("[POST /api/agent]", error);
    return NextResponse.json<ApiErrorResponse>(
      { error: message },
      { status: 500 },
    );
  }
}
