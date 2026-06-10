// Retrieval step of the QuotePilot agent.
// Embeds the extracted requirements, pulls the most similar past projects and
// catalog services from pgvector, then reranks the projects with qwen3-rerank.
// Rerank is best-effort: any failure falls back to pure vector similarity.
import "dotenv/config";
import { pool } from "../lib/db";
import { qwen, MODEL_EMBED } from "../lib/qwen";
import type { ExtractedRequirements } from "./state-machine";

const RERANK_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-api/v1/reranks";
const RERANK_MODEL = "qwen3-rerank";

export interface PastProjectMatch {
  title: string;
  description: string;
  final_price: number;
  duration_days: number;
  similarity: number;
}

export interface ServiceMatch {
  name: string;
  description: string;
  base_price_min: number;
  base_price_max: number;
  unit: string;
}

// pgvector wants the vector as a string literal like "[0.1,0.2,...]".
const toVec = (v: number[]) => `[${v.join(",")}]`;

async function embed(text: string): Promise<number[]> {
  const res = await qwen.embeddings.create({
    model: MODEL_EMBED,
    input: text,
    dimensions: 1024, // must match vector(1024) in schema.sql
  });
  return res.data[0].embedding;
}

// Rerank the candidate projects with qwen3-rerank. Returns the candidate
// indices ordered best-first. Throws on any unexpected shape so the caller's
// try/catch can fall back.
async function rerank(query: string, documents: string[]): Promise<number[]> {
  const res = await fetch(RERANK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: RERANK_MODEL,
      query,
      documents,
      top_n: 3,
    }),
  });

  if (!res.ok) {
    throw new Error(`rerank HTTP ${res.status}: ${await res.text()}`);
  }

  const data: any = await res.json();
  // Be liberal about where the results live across compatible-mode variants.
  const results: any[] =
    data?.results ?? data?.output?.results ?? data?.data ?? [];
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`rerank: unexpected response shape: ${JSON.stringify(data).slice(0, 200)}`);
  }

  // Each result has an index into `documents` and a relevance score.
  const ordered = results
    .map((r) => ({
      index: r.index ?? r.document?.index,
      score: r.relevance_score ?? r.score ?? 0,
    }))
    .filter((r) => typeof r.index === "number")
    .sort((a, b) => b.score - a.score)
    .map((r) => r.index as number);

  if (ordered.length === 0) {
    throw new Error("rerank: no usable indices in response");
  }
  return ordered;
}

export async function retrieveSimilarWork(
  requirements: ExtractedRequirements
): Promise<{
  pastProjects: PastProjectMatch[];
  services: ServiceMatch[];
  rerankUsed: boolean; // additive: lets callers report rerank vs fallback
}> {
  const queryText = `${requirements.summary} Features: ${requirements.features.join(
    ", "
  )}`;
  const vec = toVec(await embed(queryText));

  // Top 8 past projects + top 4 services by cosine distance.
  const projectsRes = await pool.query<PastProjectMatch>(
    `SELECT title, description, final_price, duration_days,
            1 - (embedding <=> $1) AS similarity
       FROM past_projects
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1
      LIMIT 8`,
    [vec]
  );
  const servicesRes = await pool.query<ServiceMatch>(
    `SELECT name, description, base_price_min, base_price_max, unit
       FROM service_catalog
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1
      LIMIT 4`,
    [vec]
  );

  const candidates = projectsRes.rows;

  // Rerank the 8 candidates down to the best 3 — never let this crash retrieval.
  let topProjects: PastProjectMatch[];
  let rerankUsed = false;
  try {
    const documents = candidates.map((p) => `${p.title}. ${p.description}`);
    const order = await rerank(requirements.summary, documents);
    const seen = new Set<number>();
    topProjects = order
      .filter((i) => i >= 0 && i < candidates.length && !seen.has(i) && (seen.add(i), true))
      .slice(0, 3)
      .map((i) => candidates[i]);
    if (topProjects.length === 0) throw new Error("rerank produced no in-range indices");
    rerankUsed = true;
  } catch (err) {
    console.warn(
      `⚠ rerank unavailable, falling back to vector similarity: ${(err as Error).message}`
    );
    topProjects = candidates.slice(0, 3); // already ordered by cosine distance
  }

  return {
    pastProjects: topProjects,
    services: servicesRes.rows,
    rerankUsed,
  };
}
