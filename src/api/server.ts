// QuotePilot API + in-process worker.
// The HTTP endpoints are the human-in-the-loop surface; the worker drives the
// state machine. They share one process and one pg pool.
import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { pool, isConnectionError } from "../lib/db";
import { tick, setStatus, type InquiryRow } from "../orchestrator/tick";
import { WAITING_STATES, type InquiryStatus } from "../agent/state-machine";

const app = express();
app.use(cors());
app.use(express.json());

// Small async wrapper so a thrown error becomes a 500 instead of an unhandled
// rejection.
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error("API error:", err);
      if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
    });
  };

async function loadInquiry(id: string): Promise<InquiryRow | null> {
  const r = await pool.query(
    `SELECT id, status, raw_text, client_id, requirements FROM inquiries WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

// ── POST /api/inquiries — intake ──
app.post(
  "/api/inquiries",
  h(async (req, res) => {
    const { name, email, message } = req.body ?? {};
    if (!email || !message) {
      res.status(400).json({ error: "email and message are required" });
      return;
    }
    const client = await pool.query(
      `INSERT INTO clients (name, email) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, clients.name)
       RETURNING id`,
      [name ?? null, email]
    );
    const inquiry = await pool.query(
      `INSERT INTO inquiries (client_id, channel, raw_text, status)
       VALUES ($1, 'web_form', $2, 'received')
       RETURNING id`,
      [client.rows[0].id, message]
    );
    res.status(201).json({ id: inquiry.rows[0].id });
  })
);

// ── GET /api/inquiries — list ──
app.get(
  "/api/inquiries",
  h(async (_req, res) => {
    const r = await pool.query(
      `SELECT i.id, i.status, i.created_at,
              c.name AS client_name,
              LEFT(i.raw_text, 80) AS preview,
              (SELECT total FROM quotes q WHERE q.inquiry_id = i.id
                ORDER BY version DESC LIMIT 1) AS latest_quote_total
         FROM inquiries i
         LEFT JOIN clients c ON c.id = i.client_id
        ORDER BY i.created_at DESC`
    );
    res.json(r.rows);
  })
);

// ── GET /api/inquiries/:id — full detail ──
app.get(
  "/api/inquiries/:id",
  h(async (req, res) => {
    const { id } = req.params;
    const inquiry = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email
         FROM inquiries i LEFT JOIN clients c ON c.id = i.client_id
        WHERE i.id = $1`,
      [id]
    );
    if (inquiry.rows.length === 0) {
      res.status(404).json({ error: "not found" });
      return;
    }

    const clarifications = await pool.query(
      `SELECT * FROM clarifications WHERE inquiry_id = $1 ORDER BY sent_at ASC`,
      [id]
    );
    const quotes = await pool.query(
      `SELECT * FROM quotes WHERE inquiry_id = $1 ORDER BY version ASC`,
      [id]
    );
    const feedback = await pool.query(
      `SELECT qf.* FROM quote_feedback qf
         JOIN quotes q ON q.id = qf.quote_id
        WHERE q.inquiry_id = $1
        ORDER BY qf.created_at ASC`,
      [id]
    );
    const events = await pool.query(
      `SELECT * FROM agent_events WHERE inquiry_id = $1 ORDER BY created_at ASC, id ASC`,
      [id]
    );

    const row = inquiry.rows[0];
    // Don't leak the internal _retrieved cache into the public requirements.
    let requirements = row.requirements;
    if (requirements && typeof requirements === "object" && "_retrieved" in requirements) {
      const { _retrieved, ...rest } = requirements;
      requirements = rest;
    }

    res.json({
      inquiry: { ...row, requirements },
      clarifications: clarifications.rows,
      quotes: quotes.rows.map((q) => ({
        ...q,
        feedback: feedback.rows.filter((f) => f.quote_id === q.id),
      })),
      events: events.rows,
    });
  })
);

// ── POST /api/inquiries/:id/reply — client answers clarification ──
app.post(
  "/api/inquiries/:id/reply",
  h(async (req, res) => {
    const id = String(req.params.id);
    const { text } = req.body ?? {};
    const inquiry = await loadInquiry(id);
    if (!inquiry) return void res.status(404).json({ error: "not found" });
    if (inquiry.status !== "awaiting_client") {
      return void res
        .status(409)
        .json({ error: `cannot reply while status is ${inquiry.status}` });
    }
    // Answer the single open clarification row (most recent unanswered).
    await pool.query(
      `UPDATE clarifications SET response_text = $1, responded_at = now()
        WHERE id = (
          SELECT id FROM clarifications
           WHERE inquiry_id = $2 AND responded_at IS NULL
           ORDER BY sent_at DESC LIMIT 1
        )`,
      [text ?? "", id]
    );
    await setStatus(inquiry, "extracting");
    res.json({ ok: true, status: "extracting" });
  })
);

// ── POST /api/inquiries/:id/approve ──
app.post(
  "/api/inquiries/:id/approve",
  h(async (req, res) => {
    const id = String(req.params.id);
    const inquiry = await loadInquiry(id);
    if (!inquiry) return void res.status(404).json({ error: "not found" });
    if (inquiry.status !== "awaiting_approval") {
      return void res
        .status(409)
        .json({ error: `cannot approve while status is ${inquiry.status}` });
    }
    await pool.query(
      `INSERT INTO quote_feedback (quote_id, action)
       SELECT id, 'approved' FROM quotes WHERE inquiry_id = $1
        ORDER BY version DESC LIMIT 1`,
      [id]
    );
    await setStatus(inquiry, "approved");
    res.json({ ok: true, status: "approved" });
  })
);

// ── POST /api/inquiries/:id/reject ──
app.post(
  "/api/inquiries/:id/reject",
  h(async (req, res) => {
    const id = String(req.params.id);
    const { feedback } = req.body ?? {};
    const inquiry = await loadInquiry(id);
    if (!inquiry) return void res.status(404).json({ error: "not found" });
    if (inquiry.status !== "awaiting_approval") {
      return void res
        .status(409)
        .json({ error: `cannot reject while status is ${inquiry.status}` });
    }
    await pool.query(
      `INSERT INTO quote_feedback (quote_id, action, feedback_text)
       SELECT id, 'rejected', $2 FROM quotes WHERE inquiry_id = $1
        ORDER BY version DESC LIMIT 1`,
      [id, feedback ?? ""]
    );
    await setStatus(inquiry, "revising");
    res.json({ ok: true, status: "revising" });
  })
);

// ─────────────────────────────────────────────
// In-process worker — drives the state machine.
// Every 5s: fetch inquiries NOT in a waiting state and tick them ONE AT A TIME
// (these are billed model calls — never run them in parallel). Skip the cycle
// if the previous one is still running.
// ─────────────────────────────────────────────
let isTicking = false;

async function workerCycle(): Promise<void> {
  if (isTicking) return;
  isTicking = true;
  try {
    const r = await pool.query<InquiryRow>(
      `SELECT id, status, raw_text, client_id, requirements
         FROM inquiries
        WHERE status::text <> ALL($1::text[])
        ORDER BY updated_at ASC`,
      [WAITING_STATES as InquiryStatus[]]
    );
    for (const inquiry of r.rows) {
      await tick(inquiry); // sequential by design
    }
  } catch (err) {
    // Connection drops (the fetch query or a rethrow from tick) are transient:
    // log one line and let the next cycle retry. Anything else is a real bug.
    if (isConnectionError(err)) {
      console.warn(
        `[worker] connection error, retrying next cycle: ${(err as Error).message}`
      );
    } else {
      console.error("worker cycle error:", err);
    }
  } finally {
    isTicking = false;
  }
}

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`QuotePilot API listening on http://localhost:${PORT}`);
  console.log("Worker polling every 5s for inquiries to advance…");
  setInterval(() => void workerCycle(), 5000);
});
