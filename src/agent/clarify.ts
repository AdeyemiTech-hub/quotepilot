// Clarification step of the QuotePilot agent.
// When extraction decides the inquiry is too ambiguous to quote, this drafts
// 2-3 short client-facing questions targeting ONLY the missing fields.
import "dotenv/config";
import { z } from "zod";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { qwen, MODEL_FLASH } from "../lib/qwen";
import type { ExtractedRequirements } from "./state-machine";

// 2-3 short questions, nothing else.
const QuestionsSchema = z.object({
  questions: z.array(z.string()).min(2).max(3),
});

// Plain-language guidance per field — the model must ask about these WITHOUT
// using the internal field names ("scope", "platform") as jargon.
const FIELD_GUIDANCE: Record<
  "budget" | "timeline" | "scope" | "platform",
  string
> = {
  budget:
    'budget — ask for a rough price range they have in mind (e.g. "a few hundred" vs "a few thousand"). Never demand an exact figure.',
  timeline:
    "timeline — ask when they need it ready, or whether there is a deadline.",
  scope:
    'scope — ask what the thing should actually DO: the main features or pages they need. Do NOT use the word "scope".',
  platform:
    "platform — ask whether the app should be for iPhone, Android, or both. Only relevant for mobile apps.",
};

const SYSTEM_PROMPT = `You are a senior freelance consultant replying to a potential client whose inquiry was too vague to quote accurately. Write 2 to 3 short, friendly questions that get exactly the information still missing.

Rules:
- Ask ONLY about the fields listed as missing. Do not ask about anything already known.
- Write for a non-technical client. No jargon: never say words like "scope", "platform", "stack", "requirements", or "specs".
- Each question is one sentence, easy to answer.
- Mirror the client's tone. If their message is casual/informal, be warm and casual but still professional; if their message is formal, be polished and formal. Match their language and register.
- Return ONLY a JSON object of the form {"questions": ["...", "..."]} with 2 or 3 strings. No prose, no markdown fences.`;

function buildUserMessage(
  requirements: ExtractedRequirements,
  rawText: string
): string {
  const missing = requirements.missing_fields;
  const guidance =
    missing.length > 0
      ? missing.map((f) => `- ${FIELD_GUIDANCE[f]}`).join("\n")
      : "- (none flagged — ask a single gentle question to confirm the most important detail)";

  const known: string[] = [];
  known.push(`project_type: ${requirements.project_type}`);
  known.push(`understood as: ${requirements.summary}`);
  if (requirements.features.length > 0) {
    known.push(`features already mentioned: ${requirements.features.join(", ")}`);
  }
  if (requirements.budget_signal) known.push(`budget signal: ${requirements.budget_signal}`);
  if (requirements.timeline) known.push(`timeline: ${requirements.timeline}`);

  return (
    `The client's original message (match this tone and language):\n"""\n${rawText}\n"""\n\n` +
    `What we already understand (do NOT ask about these):\n${known
      .map((k) => `- ${k}`)
      .join("\n")}\n\n` +
    `Information still missing — write questions about ONLY these:\n${guidance}`
  );
}

export async function draftClarifyingQuestions(
  requirements: ExtractedRequirements,
  rawText: string
): Promise<{
  questions: string[];
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
    { role: "user", content: buildUserMessage(requirements, rawText) },
  ];

  const response: ChatCompletion = await qwen.chat.completions.create({
    model: MODEL_FLASH,
    response_format: { type: "json_object" },
    messages,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  let parsed: { questions: string[] };
  try {
    parsed = QuestionsSchema.parse(JSON.parse(raw));
  } catch (e) {
    throw new Error(
      `draftClarifyingQuestions: model did not return 2-3 valid questions.\n` +
        `Error: ${(e as Error).message}\n` +
        `Raw output: ${raw}`
    );
  }

  return {
    questions: parsed.questions,
    usage: {
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
      model: MODEL_FLASH,
    },
  };
}
