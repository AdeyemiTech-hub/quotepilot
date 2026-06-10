// QuotePilot agent state machine
// ─────────────────────────────────────────────
// The inquiry's `status` column in Postgres is the single source of
// truth. The orchestrator is a simple worker: load inquiry → look at
// status → run that step → write results + new status → repeat.
// Crash-safe by design: restart the worker and it resumes exactly
// where the database says it was.

export type InquiryStatus =
  | "received"
  | "classifying"
  | "extracting"
  | "needs_clarification"
  | "awaiting_client"
  | "retrieving"
  | "drafting"
  | "awaiting_approval"
  | "revising"
  | "approved"
  | "sending"
  | "sent"
  | "failed";

// Legal transitions. Anything not listed here is a bug —
// the orchestrator throws instead of silently corrupting state.
export const TRANSITIONS: Record<InquiryStatus, InquiryStatus[]> = {
  received: ["classifying"],
  classifying: ["extracting", "failed"],
  extracting: ["needs_clarification", "retrieving", "failed"],
  needs_clarification: ["awaiting_client"],
  awaiting_client: ["extracting"], // client replied → re-extract with new info
  retrieving: ["drafting", "failed"],
  drafting: ["awaiting_approval", "failed"],
  awaiting_approval: ["approved", "revising"], // ← only a HUMAN moves it from here
  revising: ["awaiting_approval", "failed"],
  approved: ["sending"],
  sending: ["sent", "failed"],
  sent: [],
  failed: [],
};

export function assertTransition(from: InquiryStatus, to: InquiryStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`Illegal transition: ${from} → ${to}`);
  }
}

// States where the loop PAUSES and waits for an external actor.
// The worker skips these; webhooks / dashboard actions move them forward.
export const WAITING_STATES: InquiryStatus[] = [
  "awaiting_client",    // waits for: client email reply
  "awaiting_approval",  // waits for: YOU in the dashboard
  "sent",
  "failed",
];

// ─────────────────────────────────────────────
// Structured output schema for the extraction step.
// Passed to qwen3.7-max as a JSON schema so the model
// MUST return exactly this shape (no prose parsing).
// ─────────────────────────────────────────────
export interface ExtractedRequirements {
  project_type: "web_app" | "mobile_app" | "ecommerce" | "automation" | "other";
  summary: string;              // one-line restatement of what the client wants
  features: string[];           // explicit asks pulled from the text
  budget_signal: string | null; // "2000-3000 USD" | "tight" | null if absent
  timeline: string | null;      // "4 weeks" | "ASAP" | null
  complexity: 1 | 2 | 3 | 4 | 5;
  missing_fields: ("budget" | "timeline" | "scope" | "platform")[];
  confidence: number;           // 0–1: how sure the model is it understood
}

// The clarification rule — the agent's "do I know enough?" gate:
//   proceed to retrieval  IF  confidence >= 0.7 AND missing_fields.length <= 1
//   ask clarifying Qs     OTHERWISE (max 2 rounds, then proceed with
//                         explicit assumptions stated in the quote)

// ─────────────────────────────────────────────
// Orchestrator skeleton — the whole agent in one loop
// ─────────────────────────────────────────────
//
// async function tick(inquiry: Inquiry) {
//   switch (inquiry.status) {
//     case "received":
//       await setStatus(inquiry, "classifying");
//       break;
//
//     case "classifying": {
//       // qwen3.6-flash — cheap, fast
//       const type = await classify(inquiry.raw_text);
//       await logEvent(inquiry, "classify", "qwen3.6-flash", type);
//       await setStatus(inquiry, "extracting");
//       break;
//     }
//
//     case "extracting": {
//       // qwen3.7-max + structured output → ExtractedRequirements
//       const req = await extractRequirements(inquiry);
//       await saveRequirements(inquiry, req);
//       const ambiguous = req.confidence < 0.7 || req.missing_fields.length > 1;
//       const rounds = await clarificationRounds(inquiry);
//       await setStatus(
//         inquiry,
//         ambiguous && rounds < 2 ? "needs_clarification" : "retrieving"
//       );
//       break;
//     }
//
//     case "needs_clarification": {
//       // qwen3.6-flash drafts 2–3 targeted questions → email tool sends
//       const qs = await draftClarifyingQuestions(inquiry);
//       await sendClarificationEmail(inquiry, qs);
//       await setStatus(inquiry, "awaiting_client");
//       break;
//     }
//
//     case "retrieving": {
//       // 1. text-embedding-v4 → embed the requirements summary
//       // 2. pgvector cosine search → top 10 past_projects + catalog items
//       // 3. qwen3-rerank → keep top 3 most relevant
//       const context = await retrieveSimilarWork(inquiry);
//       await logEvent(inquiry, "retrieve", "text-embedding-v4 + qwen3-rerank",
//                      `${context.length} precedents found`);
//       await setStatus(inquiry, "drafting");
//       break;
//     }
//
//     case "drafting":
//     case "revising": {
//       // qwen3.7-max: requirements + retrieved precedents + catalog
//       // (+ rejection feedback if revising) → line items, totals, reasoning
//       const quote = await draftQuote(inquiry);
//       await saveQuoteVersion(inquiry, quote);
//       await setStatus(inquiry, "awaiting_approval");
//       break;
//     }
//
//     // awaiting_approval: worker does NOTHING. Dashboard endpoints call:
//     //   approve(inquiry)              → status "approved"
//     //   reject(inquiry, feedbackText) → status "revising"
//
//     case "approved": {
//       await setStatus(inquiry, "sending");
//       break;
//     }
//
//     case "sending": {
//       await renderQuotePdf(inquiry);     // → OSS bucket
//       await sendQuoteEmail(inquiry);     // PDF + call booking link
//       await logOutcome(inquiry);         // back into past_projects later
//       await setStatus(inquiry, "sent");
//       break;
//     }
//   }
// }
//
// The worker: every few seconds, fetch inquiries NOT in WAITING_STATES,
// call tick() on each. That's the entire engine.