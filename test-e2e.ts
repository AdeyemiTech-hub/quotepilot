// End-to-end smoke test against a RUNNING QuotePilot API (npm run dev).
// Drives the full human-in-the-loop lifecycle over HTTP:
//   intake → (agent works) → awaiting_approval → reject → revise → approve → sent
// Run:  npm run test:e2e   (with the server already running on :3001)
const BASE = process.env.API_BASE || "http://localhost:3001";

const BAKERY =
  "Hi, I run a small bakery in Amsterdam and I want an online store where " +
  "customers can order cakes for pickup. I have about $2,000 budget and need " +
  "it before the holidays, so roughly 6 weeks. I already have photos and a logo.";

const usd = (n: unknown) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// Poll detail until `predicate` is true, printing every status change.
async function pollUntil(
  id: string,
  predicate: (detail: any) => boolean,
  timeoutMs: number,
  lastStatus?: string
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let prev = lastStatus;
  while (Date.now() < deadline) {
    const detail = await api("GET", `/api/inquiries/${id}`);
    const status = detail.inquiry.status;
    if (status !== prev) {
      console.log(`  status: ${prev ?? "(start)"} → ${status}`);
      prev = status;
    }
    if (status === "failed") {
      throw new Error("inquiry reached 'failed' — check the server logs / agent_events");
    }
    if (predicate(detail)) return detail;
    await sleep(5000);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting on inquiry ${id}`);
}

function printQuote(label: string, q: any) {
  console.log("\n" + "=".repeat(72));
  console.log(`${label} — version ${q.version}`);
  console.log("=".repeat(72));
  const items: any[] = q.line_items ?? [];
  const w = Math.max(20, ...items.map((li) => String(li.label).length));
  for (const li of items) {
    console.log(
      `  ${String(li.label).padEnd(w)} | ${String(li.qty).padStart(3)} x ` +
        `${usd(li.unit_price).padStart(10)} = ${usd(li.line_total).padStart(10)}`
    );
  }
  console.log("  " + "-".repeat(w + 30));
  console.log(`  ${"TOTAL".padEnd(w)} | ${usd(q.total).padStart(10 + 8 + 13)}`);
  if (q.reasoning) console.log(`\n  Reasoning: ${q.reasoning}`);
}

function latestQuote(detail: any): any | undefined {
  const quotes = detail.quotes ?? [];
  return quotes.length ? quotes[quotes.length - 1] : undefined;
}

async function main() {
  console.log(`QuotePilot E2E against ${BASE}`);
  console.log("Inquiry:", BAKERY, "\n");

  // 1. Intake
  const { id } = await api("POST", "/api/inquiries", {
    name: "Amsterdam Bakery",
    email: `bakery+${Date.now()}@example.com`,
    message: BAKERY,
  });
  console.log("Created inquiry:", id);

  // 2. Wait for the agent to produce the first quote.
  console.log("\nWaiting for first quote (awaiting_approval)…");
  let detail = await pollUntil(
    id,
    (d) => d.inquiry.status === "awaiting_approval",
    5 * 60 * 1000
  );

  // 3. Quote v1
  const v1 = latestQuote(detail);
  printQuote("QUOTE v1", v1);

  // 4. Reject with feedback
  const feedback =
    "Too cheap — add pickup scheduling as its own line item and get closer to the $2,000 budget.";
  console.log("\n" + "-".repeat(72));
  console.log("REJECT with feedback:", feedback);
  await api("POST", `/api/inquiries/${id}/reject`, { feedback });

  // 5. Wait for the revised quote (version 2).
  console.log("\nWaiting for revised quote (v2)…");
  detail = await pollUntil(
    id,
    (d) =>
      d.inquiry.status === "awaiting_approval" &&
      (latestQuote(d)?.version ?? 0) >= 2,
    5 * 60 * 1000,
    "awaiting_approval"
  );
  const v2 = latestQuote(detail);
  printQuote("QUOTE v2", v2);
  console.log(
    `\nTotals diff: v1 ${usd(v1.total)} → v2 ${usd(v2.total)} ` +
      `(${Number(v2.total) >= Number(v1.total) ? "+" : "-"}${usd(Math.abs(Number(v2.total) - Number(v1.total)))})`
  );

  // 6. Approve and wait until sent.
  console.log("\n" + "-".repeat(72));
  console.log("APPROVE");
  await api("POST", `/api/inquiries/${id}/approve`);
  detail = await pollUntil(
    id,
    (d) => d.inquiry.status === "sent",
    2 * 60 * 1000,
    "awaiting_approval"
  );
  console.log("Reached: sent ✅");

  // 7. Full event timeline.
  console.log("\n" + "=".repeat(72));
  console.log("AGENT EVENT TIMELINE");
  console.log("=".repeat(72));
  for (const e of detail.events as any[]) {
    const model = e.model ? ` [${e.model}]` : "";
    const lat = e.latency_ms != null ? ` (${e.latency_ms}ms)` : "";
    console.log(`  ${String(e.step).padEnd(10)}${model.padEnd(18)} ${e.summary}${lat}`);
  }
}

main().catch((e) => {
  console.error("\nE2E FAILED:", (e as Error).message);
  process.exit(1);
});
