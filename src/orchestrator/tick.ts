// The QuotePilot orchestrator — the commented skeleton in state-machine.ts
// made real against Postgres. One tick advances ONE inquiry by ONE state.
// The inquiry's `status` column is the single source of truth.
import "dotenv/config";
import { pool, isConnectionError } from "../lib/db";
import { logEvent } from "../lib/events";
import { qwen, MODEL_FLASH } from "../lib/qwen";
import { extractRequirements } from "../agent/extract";
import { draftClarifyingQuestions } from "../agent/clarify";
import { retrieveSimilarWork } from "../agent/retrieve";
import { draftQuote, type DraftedQuote } from "../agent/quote";
import type { ExtractedRequirements } from "../agent/state-machine";
import {
  assertTransition,
  type InquiryStatus,
} from "../agent/state-machine";
import { renderQuotePdf } from "../tools/pdf";
import { sendEmail } from "../tools/email";

type Retrieved = Awaited<ReturnType<typeof retrieveSimilarWork>>;

// A row from `inquiries`. `requirements` may carry a non-contract "_retrieved"
// key (jsonb is flexible — the zod contract only governs the model output).
export interface InquiryRow {
  id: string;
  status: InquiryStatus;
  raw_text: string;
  client_id: string | null;
  requirements: (ExtractedRequirements & { _retrieved?: Retrieved }) | null;
}

// ── status transitions (always validated) ──
export async function setStatus(
  inquiry: { id: string; status: InquiryStatus },
  to: InquiryStatus
): Promise<void> {
  assertTransition(inquiry.status, to);
  await pool.query(
    `UPDATE inquiries SET status = $1, updated_at = now() WHERE id = $2`,
    [to, inquiry.id]
  );
  inquiry.status = to;
}

// Force an inquiry to `failed` even from a state that has no legal failed edge
// (e.g. needs_clarification). We still try the legal assertion first.
async function forceFail(inquiry: InquiryRow): Promise<void> {
  try {
    assertTransition(inquiry.status, "failed");
  } catch {
    /* no legal edge — fail anyway rather than wedge the inquiry forever */
  }
  await pool.query(
    `UPDATE inquiries SET status = 'failed', updated_at = now() WHERE id = $1`,
    [inquiry.id]
  );
}

// ── small DB helpers ──
async function getAnsweredClarifications(
  inquiryId: string
): Promise<{ questions: string[]; response_text: string }[]> {
  const res = await pool.query(
    `SELECT questions, response_text
       FROM clarifications
      WHERE inquiry_id = $1 AND response_text IS NOT NULL
      ORDER BY sent_at ASC`,
    [inquiryId]
  );
  return res.rows;
}

function buildClarificationHistory(
  rows: { questions: string[]; response_text: string }[]
): string | undefined {
  if (rows.length === 0) return undefined;
  return rows
    .map((r) => {
      const qs = (r.questions ?? []).map((q) => `- ${q}`).join("\n");
      return `Consultant asked:\n${qs}\nClient replied:\n${r.response_text}`;
    })
    .join("\n\n");
}

// The agent's only channel to a real client — fail loudly (throw) rather
// than silently skip the email when there's no one to send it to.
async function loadClient(
  clientId: string | null
): Promise<{ name: string | null; email: string }> {
  if (!clientId) throw new Error("inquiry has no associated client");
  const res = await pool.query(`SELECT name, email FROM clients WHERE id = $1`, [clientId]);
  const row = res.rows[0];
  if (!row?.email) throw new Error("client has no email on file");
  return row;
}

async function nextVersion(inquiryId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM quotes WHERE inquiry_id = $1`,
    [inquiryId]
  );
  return res.rows[0].v;
}

// Reconstruct the full previous DraftedQuote for a revision. We persisted the
// complete object in the draft event's detail; fall back to the quotes row.
async function loadPreviousQuote(inquiryId: string): Promise<DraftedQuote> {
  const ev = await pool.query(
    `SELECT detail
       FROM agent_events
      WHERE inquiry_id = $1 AND step IN ('draft', 'revise') AND detail IS NOT NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [inquiryId]
  );
  const stored = ev.rows[0]?.detail?.quote as DraftedQuote | undefined;
  if (stored) return stored;

  const r = await pool.query(
    `SELECT line_items, subtotal, total, reasoning
       FROM quotes WHERE inquiry_id = $1 ORDER BY version DESC LIMIT 1`,
    [inquiryId]
  );
  const row = r.rows[0];
  return {
    line_items: row?.line_items ?? [],
    subtotal: Number(row?.subtotal ?? 0),
    total: Number(row?.total ?? 0),
    currency: "USD",
    estimated_days: 0,
    assumptions: [],
    reasoning: row?.reasoning ?? "",
  };
}

async function loadLatestRejectionFeedback(inquiryId: string): Promise<string> {
  const res = await pool.query(
    `SELECT qf.feedback_text
       FROM quote_feedback qf
       JOIN quotes q ON q.id = qf.quote_id
      WHERE q.inquiry_id = $1 AND qf.action = 'rejected'
      ORDER BY qf.created_at DESC
      LIMIT 1`,
    [inquiryId]
  );
  return res.rows[0]?.feedback_text ?? "Please revise the quote.";
}

// Lightweight project-type sanity classification (qwen3.6-flash).
async function classify(
  rawText: string
): Promise<{ label: string; usage: { tokensIn: number; tokensOut: number; latencyMs: number; model: string } }> {
  const start = Date.now();
  const res = await qwen.chat.completions.create({
    model: MODEL_FLASH,
    messages: [
      {
        role: "system",
        content:
          "Classify this freelance inquiry into exactly one label: web_app, mobile_app, ecommerce, automation, other. Reply with ONLY the label.",
      },
      { role: "user", content: rawText },
    ],
  });
  return {
    label: (res.choices[0]?.message?.content ?? "other").trim(),
    usage: {
      tokensIn: res.usage?.prompt_tokens ?? 0,
      tokensOut: res.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
      model: MODEL_FLASH,
    },
  };
}

function splitRequirements(
  stored: ExtractedRequirements & { _retrieved?: Retrieved }
): { requirements: ExtractedRequirements; retrieved?: Retrieved } {
  const { _retrieved, ...requirements } = stored;
  return { requirements, retrieved: _retrieved };
}

// ── the one-step state machine ──
export async function tick(inquiry: InquiryRow): Promise<void> {
  const id = inquiry.id;
  try {
    switch (inquiry.status) {
      // received → classifying (transition only)
      case "received": {
        await setStatus(inquiry, "classifying");
        break;
      }

      case "classifying": {
        const { label, usage } = await classify(inquiry.raw_text);
        await logEvent(id, "classify", usage.model, `classified as ${label}`, { label }, usage);
        await setStatus(inquiry, "extracting");
        break;
      }

      case "extracting": {
        const answered = await getAnsweredClarifications(id);
        const history = buildClarificationHistory(answered);

        const { requirements, usage } = await extractRequirements(
          inquiry.raw_text,
          history
        );
        // Persist fresh requirements (a previous _retrieved cache, if any, is
        // intentionally dropped — we re-retrieve after re-extraction).
        await pool.query(`UPDATE inquiries SET requirements = $1 WHERE id = $2`, [
          JSON.stringify(requirements),
          id,
        ]);

        const ambiguous =
          requirements.confidence < 0.7 || requirements.missing_fields.length > 1;
        const rounds = answered.length; // answered clarification rounds so far
        const proceed = !ambiguous || rounds >= 2;

        await logEvent(
          id,
          "extract",
          usage.model,
          `confidence ${requirements.confidence}, missing [${requirements.missing_fields.join(", ")}], ` +
            `round ${rounds} → ${proceed ? "retrieving" : "needs_clarification"}`,
          { requirements, rounds },
          usage
        );

        await setStatus(inquiry, proceed ? "retrieving" : "needs_clarification");
        break;
      }

      case "needs_clarification": {
        if (!inquiry.requirements) throw new Error("needs_clarification: requirements missing");
        const { requirements } = splitRequirements(inquiry.requirements);

        const { questions, usage } = await draftClarifyingQuestions(
          requirements,
          inquiry.raw_text
        );
        await pool.query(
          `INSERT INTO clarifications (inquiry_id, questions) VALUES ($1, $2)`,
          [id, JSON.stringify(questions)]
        );
        await logEvent(
          id,
          "clarify",
          usage.model,
          `clarification drafted: ${questions.length} questions`,
          { questions },
          usage
        );

        const client = await loadClient(inquiry.client_id);
        const greeting = client.name ? `Hi ${client.name},` : "Hi there,";
        const questionList = questions.map((q) => `- ${q}`).join("\n");
        let mailResult: { stubbed?: boolean };
        try {
          mailResult = await sendEmail({
            to: client.email,
            subject: "Quick questions about your project",
            text:
              `${greeting}\n\n` +
              `Thanks for reaching out — to put together an accurate quote, could you help me with a couple of quick questions?\n\n` +
              `${questionList}\n\n` +
              `Looking forward to hearing back.\n\nBest,\nAdeyemiTech`,
          });
        } catch (err) {
          throw new Error(`clarification email send failed: ${(err as Error).message}`);
        }
        await logEvent(
          id,
          "email",
          null,
          mailResult.stubbed ? "clarification email stubbed" : "clarification email sent",
          { to: client.email, questions }
        );

        await setStatus(inquiry, "awaiting_client");
        break;
      }

      case "retrieving": {
        if (!inquiry.requirements) throw new Error("retrieving: requirements missing");
        const { requirements } = splitRequirements(inquiry.requirements);

        const retrieved = await retrieveSimilarWork(requirements);
        // Cache retrieval on the inquiry row under the flexible _retrieved key.
        await pool.query(`UPDATE inquiries SET requirements = $1 WHERE id = $2`, [
          JSON.stringify({ ...requirements, _retrieved: retrieved }),
          id,
        ]);

        await logEvent(
          id,
          "retrieve",
          null,
          `${retrieved.pastProjects.length} precedents (${
            retrieved.rerankUsed ? "qwen3-rerank" : "vector fallback"
          }), ${retrieved.services.length} catalog services`,
          { rerankUsed: retrieved.rerankUsed, precedents: retrieved.pastProjects.map((p) => p.title) }
        );
        await setStatus(inquiry, "drafting");
        break;
      }

      case "drafting":
      case "revising": {
        if (!inquiry.requirements) throw new Error("drafting: requirements missing");
        const { requirements, retrieved } = splitRequirements(inquiry.requirements);
        if (!retrieved) throw new Error("drafting: cached retrieval (_retrieved) missing");

        const isRevision = inquiry.status === "revising";
        let revision: { previousQuote: DraftedQuote; feedback: string } | undefined;
        if (isRevision) {
          revision = {
            previousQuote: await loadPreviousQuote(id),
            feedback: await loadLatestRejectionFeedback(id),
          };
        }

        const { quote, usage } = await draftQuote(requirements, retrieved, revision);
        const version = await nextVersion(id);
        await pool.query(
          `INSERT INTO quotes (inquiry_id, version, line_items, subtotal, total, reasoning)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            version,
            JSON.stringify(quote.line_items),
            quote.subtotal,
            quote.total,
            quote.reasoning,
          ]
        );
        await logEvent(
          id,
          isRevision ? "revise" : "draft",
          usage.model,
          `quote v${version}: total $${quote.total} (${quote.line_items.length} line items)`,
          { quote },
          usage
        );
        await setStatus(inquiry, "awaiting_approval");
        break;
      }

      // approved → sending (transition only)
      case "approved": {
        await setStatus(inquiry, "sending");
        break;
      }

      case "sending": {
        const q = await pool.query(
          `SELECT version FROM quotes WHERE inquiry_id = $1 ORDER BY version DESC LIMIT 1`,
          [id]
        );
        const version = q.rows[0]?.version as number | undefined;
        if (version == null) throw new Error("sending: no quote found for inquiry");

        const client = await loadClient(inquiry.client_id);
        const quote = await loadPreviousQuote(id);

        let pdf: { filePath: string; publicUrl: string };
        try {
          pdf = await renderQuotePdf({ id }, client, {
            version,
            line_items: quote.line_items,
            subtotal: quote.subtotal,
            total: quote.total,
            assumptions: quote.assumptions,
            estimated_days: quote.estimated_days,
            currency: quote.currency,
          });
        } catch (err) {
          throw new Error(`pdf render failed: ${(err as Error).message}`);
        }
        await logEvent(id, "pdf", null, `quote pdf rendered (v${version})`, {
          pdf_url: pdf.publicUrl,
        });

        const projectSummary = inquiry.requirements
          ? splitRequirements(inquiry.requirements).requirements.summary
          : "your project";
        const bookingUrl = process.env.BOOKING_URL || "#";
        const greeting = client.name ? `Hi ${client.name},` : "Hi there,";

        let mailResult: { stubbed?: boolean };
        try {
          mailResult = await sendEmail({
            to: client.email,
            subject: "Your quote is ready",
            text:
              `${greeting}\n\n` +
              `Here is your quote for ${projectSummary}: $${quote.total} total. I've attached the full breakdown as a PDF.\n\n` +
              `Pick a time for a quick call: ${bookingUrl}\n\n` +
              `Best,\nAdeyemiTech`,
            attachmentPath: pdf.filePath,
          });
        } catch (err) {
          throw new Error(`quote email send failed: ${(err as Error).message}`);
        }
        await logEvent(
          id,
          "email",
          null,
          mailResult.stubbed ? "quote email stubbed" : "quote email sent",
          { pdf_url: pdf.publicUrl, to: client.email }
        );

        await setStatus(inquiry, "sent");
        break;
      }

      default:
        // Waiting states (awaiting_client/approval, sent, failed) — the worker
        // filters these out, so reaching here is a no-op.
        break;
    }
  } catch (err) {
    // A dropped DB connection is transient — do NOT fail the inquiry (and don't
    // try to write to the DB, which would also fail). Rethrow so the worker
    // cycle logs it and simply retries this inquiry next cycle.
    if (isConnectionError(err)) throw err;

    const msg = (err as Error).message ?? String(err);
    await forceFail(inquiry);
    await logEvent(id, "error", null, `tick failed: ${msg}`.slice(0, 500), {
      error: msg,
    }).catch(() => {
      /* never let logging mask the original failure */
    });
  }
}
