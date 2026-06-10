// embed.ts — fills the embedding columns after seeding.
// Run:  npx tsx embed.ts
// Needs in .env:  DASHSCOPE_API_KEY  and  DATABASE_URL
// Install first:  npm install pg && npm install -D @types/pg

import "dotenv/config";
import OpenAI from "openai";
import { Client } from "pg";

const qwen = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

async function embed(text: string): Promise<number[]> {
  const res = await qwen.embeddings.create({
    model: "text-embedding-v4",
    input: text,
    dimensions: 1024, // must match vector(1024) in schema.sql
  });
  return res.data[0].embedding;
}

// pgvector expects the vector as a string like "[0.1,0.2,...]"
const toVec = (v: number[]) => `[${v.join(",")}]`;

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  // ── service_catalog ──
  const services = await db.query(
    `SELECT id, name, description FROM service_catalog WHERE embedding IS NULL`
  );
  for (const row of services.rows) {
    const vec = await embed(`${row.name}. ${row.description}`);
    await db.query(`UPDATE service_catalog SET embedding = $1 WHERE id = $2`, [
      toVec(vec),
      row.id,
    ]);
    console.log(`✓ embedded service: ${row.name}`);
  }

  // ── past_projects ──
  const projects = await db.query(
    `SELECT id, title, description, tags FROM past_projects WHERE embedding IS NULL`
  );
  for (const row of projects.rows) {
    const vec = await embed(
      `${row.title}. ${row.description} Tags: ${row.tags.join(", ")}`
    );
    await db.query(`UPDATE past_projects SET embedding = $1 WHERE id = $2`, [
      toVec(vec),
      row.id,
    ]);
    console.log(`✓ embedded project: ${row.title}`);
  }

  // ── sanity check: does similarity search actually work? ──
  const probe = await embed("client wants an online shop to sell products");
  const similar = await db.query(
    `SELECT title, final_price FROM past_projects
     ORDER BY embedding <=> $1 LIMIT 3`,
    [toVec(probe)]
  );
  console.log("\nTop matches for 'client wants an online shop':");
  similar.rows.forEach((r, i) =>
    console.log(`  ${i + 1}. ${r.title} — $${r.final_price}`)
  );

  await db.end();
  console.log("\nDone. Retrieval layer is live.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});