"use client";

import {
  FileText,
  Loader2,
  Mic,
  Square,
  Upload,
  Volume2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  AudioMemoryResponse,
  UploadKnowledgeResponse,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type UploadStatus =
  | { type: "idle" }
  | { type: "loading"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        aria-hidden
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export function UploadPanel() {
  const [context, setContext] = useState("");
  const [status, setStatus] = useState<UploadStatus>({ type: "idle" });
  const [recording, setRecording] = useState(false);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isLoading = status.type === "loading";

  async function uploadMarkdown(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("context", context);

    setStatus({
      type: "loading",
      message: "Uploading Markdown and waiting for indexing...",
    });

    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as UploadKnowledgeResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to upload Markdown");
      }

      const tagSummary =
        data.tags.length > 0 ? ` Tags: ${data.tags.join(", ")}.` : "";
      setStatus({
        type: "success",
        message: `${data.fileName} indexed (ID: ${data.sourceId.slice(0, 8)}..., status: ${data.status}).${tagSummary}`,
      });
      toast.success(data.message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to upload Markdown";
      setStatus({ type: "error", message });
      toast.error(message);
    }
  }

  async function uploadAudio(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("context", context);

    setStatus({
      type: "loading",
      message: "Transcribing audio and saving it as a memory...",
    });

    try {
      const response = await fetch("/api/audio", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as AudioMemoryResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to process audio");
      }

      const preview =
        data.transcript.length > 120
          ? `${data.transcript.slice(0, 120)}...`
          : data.transcript;
      setStatus({
        type: "success",
        message: `Audio saved (ID: ${data.sourceId.slice(0, 8)}..., status: ${data.status}). Transcript: ${preview}`,
      });
      setRecordedFile(null);
      toast.success(data.message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to process audio";
      setStatus({ type: "error", message });
      toast.error(message);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus({
        type: "error",
        message: "Audio recording is not supported in this browser.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const extension = type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
          type,
        });
        setRecordedFile(file);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatus({ type: "idle" });
    } catch {
      setStatus({
        type: "error",
        message: "Microphone permission was denied or unavailable.",
      });
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-background/80 p-3 shadow-inner">
        <Textarea
          aria-label="Upload context and tags"
          placeholder="Optional context or #tags to attach to uploaded files and audio..."
          value={context}
          onChange={(event) => setContext(event.target.value)}
          maxLength={500}
          rows={3}
          disabled={isLoading}
          className="min-h-24 resize-y border-0 bg-transparent px-1 py-2 shadow-none focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent dark:bg-transparent dark:disabled:bg-transparent"
        />
        <div className="border-t border-border/50 pt-2 text-xs tabular-nums text-muted-foreground">
          {context.length} / 500
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm">
          <SectionHeader
            icon={FileText}
            title="Markdown Knowledge"
            description="Upload .md files into HydraDB knowledge for semantic retrieval."
          />
          <label
            className={cn(
              "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/70 p-4 text-center transition-all",
              "hover:-translate-y-0.5 hover:border-primary/30 hover:bg-muted/50 hover:shadow-sm",
              isLoading && "pointer-events-none opacity-60",
            )}
          >
            <Upload className="size-5 text-primary" aria-hidden />
            <span className="text-sm font-medium text-foreground">
              Choose Markdown file
            </span>
            <span className="text-xs text-muted-foreground">
              .md files up to 2 MB
            </span>
            <input
              type="file"
              accept=".md,text/markdown,text/plain"
              className="sr-only"
              disabled={isLoading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  void uploadMarkdown(file);
                }
              }}
            />
          </label>
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm">
          <SectionHeader
            icon={Volume2}
            title="Audio Memory"
            description="Record or upload audio, transcribe it, and save the transcript as memory."
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={recording ? "destructive" : "outline"}
              onClick={recording ? stopRecording : () => void startRecording()}
              disabled={isLoading}
              className="h-10"
            >
              {recording ? (
                <Square className="size-4" />
              ) : (
                <Mic className="size-4" />
              )}
              {recording ? "Stop" : "Record"}
            </Button>

            <label
              className={cn(
                "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm font-medium transition-colors hover:bg-muted",
                isLoading && "pointer-events-none opacity-60",
              )}
            >
              <Upload className="size-4" aria-hidden />
              Audio File
              <input
                type="file"
                accept="audio/*"
                className="sr-only"
                disabled={isLoading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void uploadAudio(file);
                  }
                }}
              />
            </label>
          </div>

          {recordedFile ? (
            <div className="space-y-2 rounded-xl bg-muted/60 p-3">
              <p className="truncate text-xs text-muted-foreground">
                Recording ready: {recordedFile.name}
              </p>
              <Button
                type="button"
                onClick={() => void uploadAudio(recordedFile)}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Save Recording
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {status.type !== "idle" ? (
        <Alert variant={status.type === "error" ? "destructive" : "default"}>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
