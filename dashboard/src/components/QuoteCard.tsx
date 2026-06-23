import type { Quote } from "../api";
import { usd, timeAgo } from "../lib/format";

export function QuoteCard({ quote }: { quote: Quote }) {
  const rejected = quote.feedback.find((f) => f.action === "rejected");
  const approved = quote.feedback.some((f) => f.action === "approved");
  const items = quote.line_items ?? [];

  return (
    <div className={`quote ${rejected ? "quote--rejected" : ""} ${approved ? "quote--approved" : ""}`}>
      <div className="quote__head">
        <span className="quote__version">Quote v{quote.version}</span>
        <span className="quote__meta">
          {approved && <span className="tag tag--green">approved</span>}
          {rejected && <span className="tag tag--amber">rejected</span>}
          {quote.pdf_url && (
            <a className="quote__pdf-link" href={quote.pdf_url} target="_blank" rel="noreferrer">
              View PDF
            </a>
          )}
          <span className="muted">{timeAgo(quote.created_at)}</span>
        </span>
      </div>

      <table className="quote__table">
        <thead>
          <tr>
            <th>Deliverable</th>
            <th className="num">Qty</th>
            <th className="num">Unit</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((li, i) => (
            <tr key={i}>
              <td>
                <div className="quote__label">{li.label}</div>
                {li.description && <div className="quote__desc">{li.description}</div>}
              </td>
              <td className="num">{li.qty}</td>
              <td className="num mono">{usd(li.unit_price)}</td>
              <td className="num mono">{usd(li.line_total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="num quote__total-label">
              Total{quote.estimated_days != null ? ` · ~${quote.estimated_days} working days` : ""}
            </td>
            <td className="num mono quote__total">{usd(quote.total)}</td>
          </tr>
        </tfoot>
      </table>

      {quote.assumptions && quote.assumptions.length > 0 && (
        <div className="quote__block">
          <div className="quote__block-title">Assumptions</div>
          <ul className="quote__assumptions">
            {quote.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {quote.reasoning && <p className="quote__reasoning">{quote.reasoning}</p>}

      {rejected && (
        <div className="quote__feedback">
          <span className="quote__feedback-label">Your feedback</span>
          <p>{rejected.feedback_text}</p>
        </div>
      )}
    </div>
  );
}
