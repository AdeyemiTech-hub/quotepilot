// Requirements-extraction step of the QuotePilot agent.
// Turns a raw client inquiry into a structured ExtractedRequirements object
// using qwen3.7-max with JSON output, validated against the contract in
// state-machine.ts via zod.
import "dotenv/config";
import { z } from "zod";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { qwen, MODEL_MAX } from "../lib/qwen";
import type { ExtractedRequirements } from "./state-machine";

// ── zod schema: mirrors ExtractedRequirements in state-machine.ts exactly ──
const RequirementsSchema = z.object({
  project_type: z.enum([
    "web_app",
    "mobile_app",
    "ecommerce",
    "automation",
    "other",
  ]),
  summary: z.string(),
  features: z.array(z.string()),
  budget_signal: z.string().nullable(),
  timeline: z.string().nullable(),
  complexity: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  missing_fields: z.array(
    z.enum(["budget", "timeline", "scope", "platform"])
  ),
  confidence: z.number().min(0).max(1),
});

// Compile-time guard: if the interface and the schema ever drift, this fails
// to typecheck.
type SchemaShape = z.infer<typeof RequirementsSchema>;
const _contractCheck: SchemaShape extends ExtractedRequirements
  ? ExtractedRequirements extends SchemaShape
    ? true
    : never
  : never = true;
void _contractCheck;

const SYSTEM_PROMPT = `You are a senior freelance consultant analyzing an incoming client inquiry.

Read the inquiry and infer what the client is asking for. Return ONLY a single JSON object (no prose, no markdown fences) with EXACTLY these fields and nothing else:

- "project_type": one of exactly these strings: "web_app", "mobile_app", "ecommerce", "automation", "other".
- "summary": string. A single-sentence restatement of what the client wants.
- "features": array of strings. The explicit asks pulled from the text. Use [] if none are stated.
- "budget_signal": string or null. A short normalized budget hint such as "2000-3000 USD" or "tight", or null if the inquiry gives no budget signal at all.
- "timeline": string or null. A short normalized timeline such as "6 weeks" or "ASAP", or null if none is given.
- "complexity": integer from 1 to 5 inclusive (1 = trivial, 5 = very complex). It MUST be one of 1, 2, 3, 4, 5 — never a decimal or a string.
- "missing_fields": array whose items are ONLY from this set: "budget", "timeline", "scope", "platform". A field belongs here ONLY if its absence genuinely prevents you from producing an accurate quote. Apply these rules strictly:
    • "scope": include ONLY if you cannot list at least 2 concrete features for this project. If you can name 2 or more concrete features, scope is NOT missing.
    • "platform": include ONLY when project_type is "mobile_app" AND the client has not said iOS, Android, or both, AND that choice would change the price. For websites, web apps, ecommerce, or automation, the platform is the developer's professional choice — NEVER mark platform missing for those.
    • "budget": include when no budget is stated and none can be reasonably inferred from the text.
    • "timeline": include when no timeline is stated and none can be reasonably inferred from the text.
  Use [] when nothing is genuinely blocking an accurate quote. Do not pad this list.
- "confidence": number between 0 and 1 inclusive. How sure you are that you correctly understood the inquiry.

Do not add, rename, or omit any field. Do not wrap the JSON in code fences.`;

function buildUserMessage(
  rawText: string,
  clarificationHistory?: string
): string {
  let msg = `Client inquiry:\n"""\n${rawText}\n"""`;
  if (clarificationHistory && clarificationHistory.trim().length > 0) {
    msg +=
      `\n\nAdditional context from a previous email exchange with this client ` +
      `(use it to fill gaps and raise confidence):\n"""\n${clarificationHistory}\n"""`;
  }
  return msg;
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
  | { ok: true; value: ExtractedRequirements }
  | { ok: false; error: string };

function tryParse(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  const result = RequirementsSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, value: result.data };
}

export async function extractRequirements(
  rawText: string,
  clarificationHistory?: string
): Promise<{
  requirements: ExtractedRequirements;
  usage: {
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    model: string;
  };
}> {
  const start = Date.now();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(rawText, clarificationHistory) },
  ];

  let response = await callModel(messages);
  let raw = response.choices[0]?.message?.content ?? "";
  let parsed = tryParse(raw);

  // Retry ONCE, feeding the model its invalid output + the error so it can fix it.
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
          `described earlier. Return ONLY the JSON object, with no prose or code fences.`,
      },
    ];

    response = await callModel(retryMessages);
    raw = response.choices[0]?.message?.content ?? "";
    const retryParsed = tryParse(raw);

    if (!retryParsed.ok) {
      throw new Error(
        `extractRequirements failed after one retry.\n` +
          `First attempt error: ${firstError}\n` +
          `First attempt output: ${firstRaw}\n` +
          `Retry error: ${retryParsed.error}\n` +
          `Retry output: ${raw}`
      );
    }
    parsed = retryParsed;
  }

  const requirements: ExtractedRequirements = parsed.value;

  return {
    requirements,
    usage: {
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
      model: MODEL_MAX,
    },
  };
}
