import type { InquiryListItem } from "../api";
import { StatusBadge } from "./StatusBadge";
import { timeAgo } from "../lib/format";

interface Props {
  items: InquiryListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// awaiting_approval floats to the top; the rest keep API order (newest first).
function sortForReview(items: InquiryListItem[]): InquiryListItem[] {
  const score = (s: string) => (s === "awaiting_approval" ? 0 : 1);
  return [...items].sort((a, b) => score(a.status) - score(b.status));
}

export function InquiryList({ items, selectedId, onSelect }: Props) {
  const sorted = sortForReview(items);
  return (
    <div className="list">
      <div className="list__header">
        <span>Inquiries</span>
        <span className="list__hint">Sorted by priority</span>
      </div>
      <div className="list__scroll">
        {sorted.length === 0 && (
          <div className="list__empty">
            No inquiries yet. Click <strong>+ New inquiry</strong> to start the demo.
          </div>
        )}
        {sorted.map((item) => (
          <button
            key={item.id}
            className={`inquiry-card ${selectedId === item.id ? "inquiry-card--active" : ""} ${
              item.status === "awaiting_approval" ? "inquiry-card--attention" : ""
            }`}
            onClick={() => onSelect(item.id)}
          >
            <div className="inquiry-card__top">
              <span className="inquiry-card__name">{item.client_name || "Unknown client"}</span>
              <span className="inquiry-card__time">{timeAgo(item.created_at)}</span>
            </div>
            <div className="inquiry-card__preview">{item.preview || "—"}</div>
            <div className="inquiry-card__bottom">
              <StatusBadge status={item.status} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
