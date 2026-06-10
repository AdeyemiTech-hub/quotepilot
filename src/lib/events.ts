// Agent event trace. Every orchestrator step writes exactly one row here so the
// dashboard "Reasoning Trace" (and judges) can see what the agent did and what
// it cost.
import { pool } from "./db";

// Same usage shape the model steps return; only the metered fields are stored.
export interface StepUsage {
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  model?: string;
}

export async function logEvent(
  inquiryId: string,
  step: string,
  model: string | null,
  summary: string,
  detail?: unknown,
  usage?: StepUsage
): Promise<void> {
  await pool.query(
    `INSERT INTO agent_events
       (inquiry_id, step, model, summary, detail, tokens_in, tokens_out, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      inquiryId,
      step,
      model,
      summary,
      // jsonb column: pass a JSON string so Postgres parses it (a JS object
      // would be stringified to "[object Object]" by the driver).
      detail === undefined || detail === null ? null : JSON.stringify(detail),
      usage?.tokensIn ?? null,
      usage?.tokensOut ?? null,
      usage?.latencyMs ?? null,
    ]
  );
}
