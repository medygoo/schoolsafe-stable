export type RagScope = "global" | "school";
export type RagChunkMetadata = {
  document_id: string;
  chunk_id: string;
  scope: RagScope;
  school_id?: string;
  source_type: string;
  title: string;
  created_at: string;
  version: number;
  text: string;
};

export function chunkDocument(text: string, maxChars = 1200): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current.length + word.length + 1) > maxChars) {
      chunks.push(current);
      current = "";
    }
    current = current ? current + " " + word : word;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function buildRagMetadata(input: {
  documentId: string;
  text: string;
  scope: RagScope;
  schoolId?: string;
  sourceType: string;
  title: string;
  version: number;
  createdAt?: string;
}): RagChunkMetadata[] {
  if (input.scope === "school" && !input.schoolId) throw new Error("school_id_required");
  return chunkDocument(input.text).map((chunk, index) => ({
    document_id: input.documentId,
    chunk_id: input.documentId + ":" + index,
    scope: input.scope,
    ...(input.scope === "school" ? { school_id: input.schoolId } : {}),
    source_type: input.sourceType,
    title: input.title,
    created_at: input.createdAt ?? new Date().toISOString(),
    version: input.version,
    text: chunk,
  }));
}

export async function ingestRagDocument(env: {
  AI: { run(model: string, input: unknown): Promise<any> };
  VECTORIZE: { upsert(vectors: Array<{ id: string; values: number[]; metadata: RagChunkMetadata }>): Promise<unknown> };
}, input: Parameters<typeof buildRagMetadata>[0]): Promise<{ chunks: number }> {
  const metadata = buildRagMetadata(input);
  const vectors = [];
  for (const chunk of metadata) {
    const result = await env.AI.run("@cf/baai/bge-m3", { text: [chunk.text] });
    const values = result?.data?.[0] ?? result?.[0];
    if (!Array.isArray(values)) throw new Error("embedding_unavailable");
    vectors.push({ id: chunk.chunk_id, values, metadata: chunk });
  }
  await env.VECTORIZE.upsert(vectors);
  return { chunks: vectors.length };
}
