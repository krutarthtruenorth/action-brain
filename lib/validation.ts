import { z } from "zod";
import {
  MAX_AGENT_REQUEST_LENGTH,
  MAX_AUDIO_FILE_BYTES,
  MAX_MARKDOWN_FILE_BYTES,
  MAX_MEMORY_LENGTH,
} from "@/lib/constants";
import { parseMemoryContent } from "@/lib/memory-content";
import { MEMORY_KINDS } from "@/lib/types";

export const memoryKindSchema = z.enum(MEMORY_KINDS);

export const saveMemorySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Memory content cannot be empty")
    .max(MAX_MEMORY_LENGTH, "Memory content is too long")
    .refine((raw) => parseMemoryContent(raw).content.length > 0, {
      message: "Memory content cannot be empty after removing hashtags.",
    }),
  memoryKind: memoryKindSchema.default("idea"),
});

export const agentRequestSchema = z.object({
  request: z
    .string()
    .trim()
    .min(1, "Request cannot be empty")
    .max(MAX_AGENT_REQUEST_LENGTH, "Request is too long"),
  previousRunId: z.string().trim().optional(),
});

export const markdownUploadSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "Markdown file name is required")
    .refine((fileName) => fileName.toLowerCase().endsWith(".md"), {
      message: "Only .md files are supported",
    }),
  fileSize: z
    .number()
    .int()
    .positive("Markdown file cannot be empty")
    .max(MAX_MARKDOWN_FILE_BYTES, "Markdown file is too large"),
  contentType: z.string().optional(),
  context: z.string().trim().max(500, "Context is too long").optional(),
});

export const audioUploadSchema = z.object({
  fileName: z.string().trim().min(1, "Audio file name is required"),
  fileSize: z
    .number()
    .int()
    .positive("Audio file cannot be empty")
    .max(MAX_AUDIO_FILE_BYTES, "Audio file is too large"),
  contentType: z
    .string()
    .min(1, "Audio content type is required")
    .refine((contentType) => contentType.startsWith("audio/"), {
      message: "Only audio files are supported",
    }),
  context: z.string().trim().max(500, "Context is too long").optional(),
});

export type SaveMemoryInput = z.infer<typeof saveMemorySchema>;
export type AgentRequestInput = z.infer<typeof agentRequestSchema>;
export type MarkdownUploadInput = z.infer<typeof markdownUploadSchema>;
export type AudioUploadInput = z.infer<typeof audioUploadSchema>;
