import { NextResponse } from "next/server";
import { uploadMarkdownKnowledge } from "@/lib/memory-store";
import type { ApiErrorResponse, UploadKnowledgeResponse } from "@/lib/types";
import { markdownUploadSchema } from "@/lib/validation";

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
        { error: "Markdown file is required" },
        { status: 400 },
      );
    }

    const parsed = markdownUploadSchema.safeParse({
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

    const result = await uploadMarkdownKnowledge(file, parsed.data.context);

    return NextResponse.json<UploadKnowledgeResponse>({
      ...result,
      message:
        result.tags.length > 0
          ? `Markdown knowledge indexed with tags: ${result.tags.join(", ")}`
          : "Markdown knowledge indexed for Action Brain",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload Markdown";
    console.error("[POST /api/knowledge]", error);
    return NextResponse.json<ApiErrorResponse>(
      { error: message },
      { status: 500 },
    );
  }
}
