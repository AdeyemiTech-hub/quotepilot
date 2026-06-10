// Full-chain smoke test: extract → retrieve → draftQuote, then a simulated
// human-in-the-loop revision round, for the Amsterdam bakery inquiry.
// Run:  npx tsx test-quote.ts   (or: npm run test:quote)
// Makes billed model calls AND hits Postgres (DATABASE_URL + embeddings).
import "dotenv/config";
import { extractRequirements } from "./src/agent/extract";
import { retrieveSimilarWork } from "./src/agent/retrieve";
import { draftQuote, type DraftedQuote } from "./src/agent/quote";

const BAKERY =
  "Hi, I run a small bakery in Amsterdam and I want an online store where " +
  "customers can order cakes for pickup. I have about $2,000 budget and need " +
  "it before the holidays, so roughly 6 weeks. I already have photos and a logo.";

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function printQuote(title: string, q: DraftedQuote) {
  console.log("\n" + "=".repeat(76));
  console.log(title);
  console.log("=".repeat(76));

  const labelW = Math.max(20, ...q.line_items.map((li) => li.label.length));
  const header =
    "  " +
    "Deliverable".padEnd(labelW) +
    " | " +
    "Qty".padStart(4) +
    " | " +
    "Unit".padStart(11) +
    " | " +
    "Total".padStart(11);
  console.log(header);
  console.log("  " + "-".repeat(header.length - 2));
  for (const li of q.line_items) {
    console.log(
      "  " +
        li.label.padEnd(labelW) +
        " | " +
        String(li.qty).padStart(4) +
        " | " +
        usd(li.unit_price).padStart(11) +
        " | " +
        usd(li.line_total).padStart(11)
    );
    console.log(`    ↳ ${li.description}`);
  }
  console.log("  " + "-".repeat(header.length - 2));
  console.log(
    "  " +
      "SUBTOTAL".padEnd(labelW) +
      " | " +
      "".padStart(4) +
      " | " +
      "".padStart(11) +
      " | " +
      usd(q.subtotal).padStart(11)
  );
  console.log(
    "  " +
      `TOTAL (${q.currency})`.padEnd(labelW) +
      " | " +
      "".padStart(4) +
      " | " +
      "".padStart(11) +
      " | " +
      usd(q.total).padStart(11)
  );
  console.log(`  Estimated delivery: ${q.estimated_days} working days`);

  console.log("\n  Assumptions:");
  q.assumptions.forEach((a) => console.log(`    • ${a}`));
  console.log("\n  Reasoning:");
  console.log(`    ${q.reasoning}`);
}

async function main() {
  let totalTokens = 0;
  let totalLatencyMs = 0;
  const tally = (u: { tokensIn: number; tokensOut: number; latencyMs: number }) => {
    totalTokens += u.tokensIn + u.tokensOut;
    totalLatencyMs += u.latencyMs;
  };

  console.log("Inquiry:", BAKERY);

  // ── extract → retrieve → draft v1 ──
  const { requirements, usage: exUsage } = await extractRequirements(BAKERY);
  tally(exUsage);

  const retrStart = Date.now();
  const retrieved = await retrieveSimilarWork(requirements);
  totalLatencyMs += Date.now() - retrStart;
  console.log(
    `\n[retrieve] ${retrieved.pastProjects.length} precedents ` +
      `(${retrieved.rerankUsed ? "reranked" : "vector fallback"}), ` +
      `${retrieved.services.length} catalog services.`
  );

  const { quote: v1, usage: q1Usage } = await draftQuote(requirements, retrieved);
  tally(q1Usage);
  printQuote("QUOTE v1 — initial draft", v1);

  // ── human-in-the-loop revision → draft v2 ──
  const feedback =
    "Too cheap for this scope — add delivery zone and pickup scheduling as " +
    "separate line items, and the total should be closer to the client's $2,000 budget.";
  console.log("\n" + "-".repeat(76));
  console.log("HUMAN FEEDBACK:", feedback);

  const { quote: v2, usage: q2Usage } = await draftQuote(requirements, retrieved, {
    previousQuote: v1,
    feedback,
  });
  tally(q2Usage);
  printQuote("QUOTE v2 — after revision", v2);

  // ── diff + totals ──
  console.log("\n" + "=".repeat(76));
  console.log(
    `Revision diff: v1 total ${usd(v1.total)} → v2 total ${usd(v2.total)} ` +
      `(${v2.total >= v1.total ? "+" : "-"}${usd(Math.abs(v2.total - v1.total))})`
  );
  console.log(
    `Combined usage: ${totalTokens} model tokens, ${totalLatencyMs} ms end-to-end ` +
      `(embedding/rerank tokens not metered).`
  );

  process.exit(0); // close pg pool idle sockets so the script exits
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
