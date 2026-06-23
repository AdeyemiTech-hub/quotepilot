import { badgeFor } from "../lib/status";
import type { InquiryStatus } from "../api";

export function StatusBadge({ status }: { status: InquiryStatus }) {
  const { label, tone, pulse } = badgeFor(status);
  return (
    <span className={`badge badge--${tone}`}>
      {pulse && <span className="badge__dot" />}
      {label}
    </span>
  );
}
