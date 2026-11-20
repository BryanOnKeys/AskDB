import type { ChunkType } from "@askdb/rag";

/**
 * Every RAG chunk type, in the order the query debugger lists them. The server's
 * `/api/rag/query` accepts exactly these, so the two can't drift apart (#1047).
 */
export const STUDIO_CHUNK_TYPES = [
  "table",
  "column",
  "cql",
  "question",
  "concept",
  "relationship",
  "tenant-policy",
] as const satisfies readonly ChunkType[];

// Fails to compile when @askdb/rag adds a chunk type this list doesn't name.
type MissingChunkType = Exclude<ChunkType, (typeof STUDIO_CHUNK_TYPES)[number]>;
const everyChunkTypeListed: [MissingChunkType] extends [never] ? true : MissingChunkType = true;
void everyChunkTypeListed;
