// Quote-drafting step of the QuotePilot agent.
// Turns extracted requirements + retrieved precedents into a priced,
// client-ready quote using qwen3.7-max. The model proposes line items and
// prose; the code owns all arithmetic — LLMs are never trusted with math.
import "dotenv/config";
import { z } from "zod";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { qwen, MODEL_MAX } from "../lib/qwen";
import type { ExtractedRequirements } from "./state-machine";
import type { retrieveSimilarWork } from "./retrieve";

export interface DraftedQuote {
  line_items: {
    label: string;
    description: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }[];
  subtotal: number;
  total: number;
  currency: "USD";
  estimated_days: number;
  assumptions: string[];
  reasoning: string;
}

// ── zod schema mirroring DraftedQuote ──
const LineItemSchema = z.object({
  label: z.string(),
  description: z.string(),
  qty: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});

const QuoteSchema = z.object({
  line_items: z.array(LineItemSchema).min(3).max(6),
  subtotal: z.number(),
  total: z.number(),
  currency: z.literal("USD"),
  estimated_days: z.number(),
  assumptions: z.array(z.string()),
  reasoning: z.string(),
});

// Compile-time guard: schema and interface must not drift.
type SchemaShape = z.infer<typeof QuoteSchema>;
const _contractCheck: SchemaShape extends DraftedQuote
  ? DraftedQuote extends SchemaShape
    ? true
    : never
  : never = true;
void _contractCheck;

type Retrieved = Awaited<ReturnType<typeof retrieveSimilarWork>>;

const SYSTEM_PROMPT = `You are a senior freelance developer pricing a project for a potential client. You will receive the structured requirements, the 3 most similar past projects you have actually delivered (with their real final prices and durations), and the catalog services that best match this work (with their price ranges).

Produce ONE JSON object (no prose, no markdown fences) with EXACTLY these fields:
- "line_items": array of 3 to 6 objects, each { "label": string, "description": string, "qty": number, "unit_price": number, "line_total": number }. Every item must be a concrete deliverable a client immediately understands (e.g. "Product catalog & cart", "Payment integration", "Delivery zone logic"). NEVER use a vague catch-all like "Development" or "Misc". qty is usually 1; hourly or per-unit items are allowed (qty = hours, unit_price = hourly rate).
- "subtotal": number. Sum of all line_total values.
- "total": number. Equals subtotal (no separate taxes/discounts unless folded into a line item).
- "currency": exactly "USD".
- "estimated_days": number. Realistic working days to deliver, informed by the durations of the similar past projects.
- "assumptions": array of strings. Every detail the client did NOT state that affects this price (timeline, hosting, content, integrations, platform, etc.) becomes one entry, each written starting with "Assuming ".
- "reasoning": 2 to 4 sentences, professional and in the first person, that reference AT LEAST ONE of the past projects BY ITS TITLE as a pricing precedent.

Pricing rules:
- Anchor on the matched catalog service's price range, adjusted by complexity: complexity 1-2 → lower half of the range, 3 → middle, 4-5 → upper half. Then sanity-check the anchored figure against what the similar past projects actually cost and adjust toward reality.
- If the client stated a budget and the scope reasonably fits it, the total should respect that budget. If honest pricing genuinely exceeds their budget, quote the honest price anyway AND either add an assumption explaining the gap or offer a reduced-scope option inside "reasoning". Never quietly under-quote real work.
- Be internally consistent: each line_total = qty * unit_price, subtotal = sum of line_totals, total = subtotal. (The numbers will be re-verified, but get them right.)`;

function renderContext(
  requirements: ExtractedRequirements,
  retrieved: Retrieved
): string {
  const projects = retrieved.pastProjects
    .map(
      (p, i) =>
        `  ${i + 1}. "${p.title}" — delivered for $${p.final_price} over ${p.duration_days} days.\n` +
        `     ${p.description}`
    )
    .join("\n");

  const services = retrieved.services
    .map(
      (s) =>
        `  - ${s.name}: $${s.base_price_min}-${s.base_price_max} per ${s.unit}. ${s.description}`
    )
    .join("\n");

  return (
    `EXTRACTED REQUIREMENTS:\n` +
    `  project_type: ${requirements.project_type}\n` +
    `  summary: ${requirements.summary}\n` +
    `  features: ${requirements.features.join(", ") || "(none stated)"}\n` +
    `  budget_signal: ${requirements.budget_signal ?? "none stated"}\n` +
    `  timeline: ${requirements.timeline ?? "none stated"}\n` +
    `  complexity (1-5): ${requirements.complexity}\n` +
    `  missing_fields: ${requirements.missing_fields.join(", ") || "(none)"}\n\n` +
    `TOP SIMILAR PAST PROJECTS (real prices — use as precedent):\n${projects || "  (none found)"}\n\n` +
    `MATCHED CATALOG SERVICES (anchor ranges):\n${services || "  (none found)"}`
  );
}

function renderRevision(revision: {
  previousQuote: DraftedQuote;
  feedback: string;
}): string {
  return (
    `\n\nThis is a REVISION. Here is the previous quote you produced:\n` +
    `${JSON.stringify(revision.previousQuote, null, 2)}\n\n` +
    `The human reviewer gave this feedback:\n"""\n${revision.feedback}\n"""\n\n` +
    `Produce a corrected version that fully addresses the feedback. Do NOT change ` +
    `anything that was not criticized — keep the untouched line items, assumptions, ` +
    `and wording as they were.`
  );
}

async function callModel(
  messages: ChatCompletionMessageParam[]
): Promise<ChatCompletion> {
  return qwen.chat.completions.create({
    model: MODEL_MAX,
    response_format: { type: "json_object" },
    messages,
  });
}

type ParseResult =
  | { ok: true; value: DraftedQuote }
  | { ok: false; error: string };

function tryParse(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  const result = QuoteSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, value: result.data };
}

// Round to cents so floating-point noise never trips the equality checks.
const round2 = (n: number) => Math.round(n * 100) / 100;

// Recompute every total in code. The model's arithmetic is advisory only.
function enforceArithmetic(quote: DraftedQuote): DraftedQuote {
  let corrected = false;

  const line_items = quote.line_items.map((li) => {
    const expected = round2(li.qty * li.unit_price);
    if (round2(li.line_total) !== expected) {
      corrected = true;
      return { ...li, line_total: expected };
    }
    return { ...li, line_total: round2(li.line_total) };
  });

  const subtotal = round2(line_items.reduce((s, li) => s + li.line_total, 0));
  if (round2(quote.subtotal) !== subtotal) corrected = true;

  // total === subtotal by contract.
  if (round2(quote.total) !== subtotal) corrected = true;

  if (corrected) {
    console.warn("⚠ quote arithmetic did not add up (totals corrected)");
  }

  return { ...quote, line_items, subtotal, total: subtotal };
}

export async function draftQuote(
  requirements: ExtractedRequirements,
  retrieved: Retrieved,
  revision?: { previousQuote: DraftedQuote; feedback: string }
): Promise<{
  quote: DraftedQuote;
  usage: {
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    model: string;
  };
}> {
  const start = Date.now();

  let userContent = renderContext(requirements, retrieved);
  if (revision) userContent += renderRevision(revision);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  let response = await callModel(messages);
  let raw = response.choices[0]?.message?.content ?? "";
  let parsed = tryParse(raw);

  // Retry ONCE on validation failure, feeding back the error + bad output.
  if (!parsed.ok) {
    const firstError = parsed.error;
    const firstRaw = raw;

    const retryMessages: ChatCompletionMessageParam[] = [
      ...messages,
      { role: "assistant", content: firstRaw },
      {
        role: "user",
        content:
          `Your previous response did not pass validation.\n\n` +
          `Validation error:\n${firstError}\n\n` +
          `Your invalid output was:\n${firstRaw}\n\n` +
          `Return a corrected JSON object that satisfies every field requirement ` +
          `described earlier. Return ONLY the JSON object, no prose or code fences.`,
      },
    ];

    response = await callModel(retryMessages);
    raw = response.choices[0]?.message?.content ?? "";
    const retryParsed = tryParse(raw);

    if (!retryParsed.ok) {
      throw new Error(
        `draftQuote failed after one retry.\n` +
          `First attempt error: ${firstError}\n` +
          `First attempt output: ${firstRaw}\n` +
          `Retry error: ${retryParsed.error}\n` +
          `Retry output: ${raw}`
      );
    }
    parsed = retryParsed;
  }

  // Code owns the math — overwrite whatever the model computed.
  const quote = enforceArithmetic(parsed.value);

  return {
    quote,
    usage: {
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
      model: MODEL_MAX,
    },
  };
}
