import type { InquiryDetail as Detail, Quote } from "../api";
import { StatusBadge } from "./StatusBadge";
import { ReasoningTrace } from "./ReasoningTrace";
import { Clarifications } from "./Clarifications";
import { QuoteCard } from "./QuoteCard";
import { fullTime } from "../lib/format";

interface Props {
  detail: Detail;
  onReply: (text: string) => Promise<void>;
  onApprove: () => Promise<void>;
  onOpenReject: () => void;
  approving: boolean;
}

// The quotes table lacks estimated_days/assumptions; pull them from the matching
// draft/revise event's stored DraftedQuote (events are in version order).
function augmentQuotes(detail: Detail): Quote[] {
  const draftEvents = detail.events
    .filter((e) => (e.step === "draft" || e.step === "revise") && e.detail?.quote)
    .map((e) => e.detail.quote);
  return detail.quotes.map((q, i) => {
    const src = draftEvents[i]; // version i+1 ↔ i-th draft/revise
    return {
      ...q,
      estimated_days: src?.estimated_days,
      assumptions: src?.assumptions,
    };
  });
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`chip ${accent ? "chip--accent" : ""}`}>
      <span className="chip__label">{label}</span>
      <span className="chip__value">{value}</span>
    </div>
  );
}

export function InquiryDetail({ detail, onReply, onApprove, onOpenReject, approving }: Props) {
  const { inquiry } = detail;
  const req = inquiry.requirements;
  const quotes = augmentQuotes(detail).reverse(); // newest first
  const showActions = inquiry.status === "awaiting_approval";

  return (
    <div className="detail">
      <div className="detail__scroll">
        {/* 1. Header */}
        <header className="detail__header">
          <div>
            <h2 className="detail__client">{inquiry.client_name || "Unknown client"}</h2>
            <div className="detail__sub">
              via {inquiry.channel} · received {fullTime(inquiry.created_at)}
              {inquiry.client_email ? ` · ${inquiry.client_email}` : ""}
            </div>
          </div>
          <StatusBadge status={inquiry.status} />
        </header>

        {/* 2. Original message */}
        <section className="section">
          <div className="section__head">
            <span className="section__title">Original message</span>
          </div>
          <blockquote className="quoted">{inquiry.raw_text}</blockquote>
        </section>

        {/* 3. Agent analysis */}
        <section className="section">
          <div className="section__head">
            <span className="section__title">Agent analysis</span>
          </div>
          {!req ? (
            <div className="muted">The agent is still analyzing this inquiry…</div>
          ) : (
            <>
              <div className="chips">
                <Chip label="Project" value={req.project_type} accent />
                <Chip label="Budget" value={req.budget_signal || "not stated"} />
                <Chip label="Timeline" value={req.timeline || "not stated"} />
                <Chip label="Complexity" value={`${req.complexity}/5`} />
                <Chip label="Confidence" value={`${Math.round(req.confidence * 100)}%`} />
              </div>
              {req.features.length > 0 && (
                <div className="features">
                  <div className="features__title">Extracted features</div>
                  <ul>
                    {req.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {req.missing_fields.length > 0 && (
                <div className="missing">
                  Missing: {req.missing_fields.join(", ")}
                </div>
              )}
            </>
          )}
        </section>

        {/* 4. Reasoning trace */}
        <ReasoningTrace events={detail.events} />

        {/* 5. Clarifications */}
        <Clarifications
          clarifications={detail.clarifications}
          status={inquiry.status}
          onReply={onReply}
        />

        {/* 6. Quotes */}
        {quotes.length > 0 && (
          <section className="section">
            <div className="section__head">
              <span className="section__title">Quotes</span>
              <span className="section__meta">{quotes.length} version{quotes.length === 1 ? "" : "s"}</span>
            </div>
            <div className="quotes">
              {quotes.map((q) => (
                <QuoteCard key={q.id} quote={q} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 7. Sticky action bar — only when awaiting approval */}
      {showActions && (
        <div className="actionbar">
          <button className="btn btn--ghost-danger" onClick={onOpenReject} disabled={approving}>
            Reject with feedback
          </button>
          <button className="btn btn--primary btn--lg" onClick={onApprove} disabled={approving}>
            {approving ? "Approving…" : "Approve & send ▸"}
          </button>
        </div>
      )}
    </div>
  );
}
