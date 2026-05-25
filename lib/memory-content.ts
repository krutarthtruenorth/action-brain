const HASHTAG_PATTERN = /#([\p{L}\p{N}_-]+)/gu;
const TAGS_SUFFIX_PATTERN = /\n\nTags: ([^\n]+)$/;

export type ParsedMemoryContent = {
  content: string;
  tags: string[];
};

export function parseMemoryContent(
  raw: string,
  maxTags = 20,
): ParsedMemoryContent {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const match of raw.matchAll(HASHTAG_PATTERN)) {
    const tag = match[1].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  const content = raw
    .replace(HASHTAG_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    content,
    tags: tags.slice(0, maxTags),
  };
}

export function formatIndexedMemoryText(
  content: string,
  tags: string[],
): string {
  if (tags.length === 0) {
    return content;
  }

  return `${content}\n\nTags: ${tags.join(", ")}`;
}

export function extractTagsFromIndexedContent(text: string): string[] {
  const match = text.match(TAGS_SUFFIX_PATTERN);
  if (!match) {
    return [];
  }

  return match[1]
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveMemoryTags(
  memoryTags: unknown,
  indexedContent?: string,
): string[] {
  const fromMeta = Array.isArray(memoryTags)
    ? memoryTags.map((tag) => String(tag).toLowerCase())
    : [];
  const fromContent = indexedContent
    ? extractTagsFromIndexedContent(indexedContent)
    : [];

  return [...new Set([...fromMeta, ...fromContent])];
}

export function memoryHasAllTags(
  memoryTags: unknown,
  requiredTags: string[],
): boolean {
  if (requiredTags.length === 0) {
    return true;
  }

  if (!Array.isArray(memoryTags)) {
    return false;
  }

  const normalized = memoryTags.map((tag) => String(tag).toLowerCase());
  return requiredTags.every((tag) => normalized.includes(tag));
}

export function memoryMatchesTags(
  memoryTags: unknown,
  indexedContent: string | undefined,
  requiredTags: string[],
): boolean {
  if (requiredTags.length === 0) {
    return true;
  }

  return memoryHasAllTags(
    resolveMemoryTags(memoryTags, indexedContent),
    requiredTags,
  );
}

export function getQuestionForAnswer(
  raw: string,
  maxTags = 20,
): { content: string; tags: string[]; questionForAnswer: string } {
  const { content, tags } = parseMemoryContent(raw, maxTags);

  const questionForAnswer =
    content ||
    `What do my saved memories tagged ${tags.join(", ")} say?`;

  return { content, tags, questionForAnswer };
}
