// End-to-end smoke test for the extract → (clarify | retrieve) pipeline.
// Run:  npx tsx test-pipeline.ts   (or: npm run test:pipeline)
// Makes billed model calls AND hits Postgres — see README/.env for DATABASE_URL.
import "dotenv/config";
import { extractRequirements } from "./src/agent/extract";
import { draftClarifyingQuestions } from "./src/agent/clarify";
import { retrieveSimilarWork } from "./src/agent/retrieve";
import type { ExtractedRequirements } from "./src/agent/state-machine";

const INQUIRIES: { label: string; text: string }[] = [
  {
    label: "a) Amsterdam bakery — detailed",
    text:
      "Hi, I run a small bakery in Amsterdam and I want an online store where " +
      "customers can order cakes for pickup. I have about $2,000 budget and need " +
      "it before the holidays, so roughly 6 weeks. I already have photos and a logo.",
  },
  {
    label: "b) One-liner app inquiry",
    text: "hey do you make apps? how much",
  },
  {
    label: "c) Pidgin website inquiry",
    text:
      "pls i wan website for my shop i dey sell clothes and shoe how much e go " +
      "cost abeg make e no too cost",
  },
];

// The agent's "do I know enough?" gate, from state-machine.ts.
function shouldProceed(req: ExtractedRequirements): boolean {
  return req.confidence >= 0.7 && req.missing_fields.length <= 1;
}

async function runOne(label: string, text: string) {
  console.log("\n" + "=".repeat(72));
  console.log(label);
  console.log("-".repeat(72));
  console.log(`Inquiry: ${text}`);

  let totalTokens = 0;
  let totalLatencyMs = 0;

  // ── 1. Extract ──
  const { requirements, usage: exUsage } = await extractRequirements(text);
  totalTokens += exUsage.tokensIn + exUsage.tokensOut;
  totalLatencyMs += exUsage.latencyMs;

  const proceed = shouldProceed(requirements);
  console.log("\n[extract]");
  console.log(`  project_type : ${requirements.project_type}`);
  console.log(`  summary      : ${requirements.summary}`);
  console.log(`  features     : ${requirements.features.join(", ") || "(none)"}`);
  console.log(`  budget       : ${requirements.budget_signal ?? "null"}`);
  console.log(`  timeline     : ${requirements.timeline ?? "null"}`);
  console.log(`  complexity   : ${requirements.complexity}`);
  console.log(`  confidence   : ${requirements.confidence}`);
  console.log(`  missing      : [${requirements.missing_fields.join(", ")}]`);
  console.log(
    `  DECISION     : ${
      proceed
        ? "→ proceed to retrieval (confidence >= 0.7 and <= 1 missing field)"
        : "→ ask clarifying questions (low confidence or too many missing fields)"
    }`
  );

  // ── 2. Clarify branch (only when the gate says ask) ──
  if (!proceed) {
    try {
      const { questions, usage: clUsage } = await draftClarifyingQuestions(
        requirements,
        text
      );
      totalTokens += clUsage.tokensIn + clUsage.tokensOut;
      totalLatencyMs += clUsage.latencyMs;
      console.log("\n[clarify] questions the agent would send:");
      questions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
    } catch (e) {
      console.log(`\n[clarify] failed: ${(e as Error).message}`);
    }
  }

  // ── 3. Retrieval branch (always, for visibility) ──
  const retrStart = Date.now();
  try {
    const { pastProjects, services, rerankUsed } = await retrieveSimilarWork(
      requirements
    );
    totalLatencyMs += Date.now() - retrStart;
    console.log(
      `\n[retrieve] top 3 past projects (${
        rerankUsed ? "qwen3-rerank" : "vector-similarity fallback"
      }):`
    );
    pastProjects.forEach((p, i) =>
      console.log(
        `  ${i + 1}. ${p.title} — $${p.final_price} (${p.duration_days}d, ` +
          `sim ${p.similarity.toFixed(3)})`
      )
    );
    console.log(`  matched ${services.length} catalog services.`);
  } catch (e) {
    totalLatencyMs += Date.now() - retrStart;
    console.log(`\n[retrieve] failed: ${(e as Error).message}`);
  }

  console.log(
    `\n[totals] ${totalTokens} model tokens (extract + clarify), ` +
      `${totalLatencyMs} ms end-to-end (embedding/rerank tokens not metered).`
  );
}

async function main() {
  for (const { label, text } of INQUIRIES) {
    await runOne(label, text);
  }
  console.log("\n" + "=".repeat(72));
  console.log("Done.");
  process.exit(0); // close the pg pool's idle sockets so the script exits
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
