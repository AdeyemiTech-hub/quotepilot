// Manual smoke test for the extraction step.
// Run:  npx tsx test-extract.ts   (or: npm run test:extract)
import "dotenv/config";
import { extractRequirements } from "./src/agent/extract";
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

// The agent's "do I know enough?" gate, straight from state-machine.ts.
function nextAction(req: ExtractedRequirements): string {
  const proceed = req.confidence >= 0.7 && req.missing_fields.length <= 1;
  return proceed
    ? "→ NEXT: proceed to retrieval (confidence >= 0.7 and <= 1 missing field)"
    : "→ NEXT: ask clarifying questions (low confidence or too many missing fields)";
}

async function main() {
  for (const { label, text } of INQUIRIES) {
    console.log("\n" + "=".repeat(70));
    console.log(label);
    console.log("-".repeat(70));
    console.log(`Inquiry: ${text}`);
    console.log("-".repeat(70));

    try {
      const { requirements, usage } = await extractRequirements(text);
      console.log("Requirements:");
      console.log(JSON.stringify(requirements, null, 2));
      console.log(
        `Usage: ${usage.tokensIn} in / ${usage.tokensOut} out tokens, ` +
          `${usage.latencyMs} ms, model ${usage.model}`
      );
      console.log(nextAction(requirements));
    } catch (err) {
      console.error("✗ extraction failed:", (err as Error).message);
    }
  }
  console.log("\n" + "=".repeat(70));
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
