import { NextResponse } from "next/server";
import { saveAudioTranscriptionMemory } from "@/lib/memory-store";
import { transcribeAudioFile } from "@/lib/openai";
import type { ApiErrorResponse, AudioMemoryResponse } from "@/lib/types";
import { audioUploadSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const contextValue = formData.get("context");
    const context =
      typeof contextValue === "string" && contextValue.trim()
        ? contextValue.trim()
        : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json<ApiErrorResponse>(
        { error: "Audio file is required" },
        { status: 400 },
      );
    }

    const parsed = audioUploadSchema.safeParse({
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
      context,
    });

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return NextResponse.json<ApiErrorResponse>(
        { error: message },
        { status: 400 },
      );
    }

    const transcript = await transcribeAudioFile(file, parsed.data.context);
    const result = await saveAudioTranscriptionMemory({
      transcript,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      fileSize: parsed.data.fileSize,
      context: parsed.data.context,
    });

    return NextResponse.json<AudioMemoryResponse>({
      ...result,
      message:
        result.tags.length > 0
          ? `Audio captured with tags: ${result.tags.join(", ")}`
          : "Audio transcribed and saved as Action Brain memory",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process audio";
    console.error("[POST /api/audio]", error);
    return NextResponse.json<ApiErrorResponse>(
      { error: message },
      { status: 500 },
    );
  }
}
