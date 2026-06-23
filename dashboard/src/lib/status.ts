import type { InquiryStatus } from "../api";

export type BadgeTone = "working" | "waiting" | "approval" | "revising" | "sending" | "sent" | "failed";

interface BadgeSpec {
  label: string;
  tone: BadgeTone;
  pulse?: boolean;
}

// Status → badge mapping per the dashboard spec.
const MAP: Record<InquiryStatus, BadgeSpec> = {
  received: { label: "Working", tone: "working", pulse: true },
  classifying: { label: "Working", tone: "working", pulse: true },
  extracting: { label: "Working", tone: "working", pulse: true },
  retrieving: { label: "Working", tone: "working", pulse: true },
  drafting: { label: "Working", tone: "working", pulse: true },
  needs_clarification: { label: "Waiting on client", tone: "waiting" },
  awaiting_client: { label: "Waiting on client", tone: "waiting" },
  awaiting_approval: { label: "Needs your approval", tone: "approval", pulse: true },
  revising: { label: "Revising", tone: "revising", pulse: true },
  approved: { label: "Sending", tone: "sending" },
  sending: { label: "Sending", tone: "sending" },
  sent: { label: "Sent", tone: "sent" },
  failed: { label: "Failed", tone: "failed" },
};

export function badgeFor(status: InquiryStatus): BadgeSpec {
  return MAP[status] ?? { label: status, tone: "working" };
}

// Waiting states pause the worker (mirrors WAITING_STATES on the server).
const WAITING = new Set<InquiryStatus>([
  "awaiting_client",
  "awaiting_approval",
  "sent",
  "failed",
]);

export const isWaiting = (status: InquiryStatus) => WAITING.has(status);
