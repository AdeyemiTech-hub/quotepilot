// Thin client for the QuotePilot API. Response shapes mirror src/api/server.ts.

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

export interface InquiryListItem {
  id: string;
  status: InquiryStatus;
  created_at: string;
  client_name: string | null;
  preview: string | null;
  latest_quote_total: string | number | null;
}

export interface Requirements {
  project_type: string;
  summary: string;
  features: string[];
  budget_signal: string | null;
  timeline: string | null;
  complexity: number;
  missing_fields: string[];
  confidence: number;
}

export interface Clarification {
  id: string;
  inquiry_id: string;
  questions: string[];
  sent_at: string;
  response_text: string | null;
  responded_at: string | null;
}

export interface LineItem {
  label: string;
  description?: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface QuoteFeedback {
  id: string;
  quote_id: string;
  action: "approved" | "edited" | "rejected";
  feedback_text: string | null;
  created_at: string;
}

export interface Quote {
  id: string;
  inquiry_id: string;
  version: number;
  line_items: LineItem[];
  subtotal: string | number;
  total: string | number;
  reasoning: string | null;
  pdf_url: string | null;
  created_at: string;
  feedback: QuoteFeedback[];
  // Augmented client-side from the matching draft/revise event (these columns
  // don't exist on the quotes table):
  estimated_days?: number;
  assumptions?: string[];
}

export interface AgentEvent {
  id: string | number;
  step: string;
  model: string | null;
  summary: string | null;
  detail: any;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface InquiryDetail {
  inquiry: {
    id: string;
    status: InquiryStatus;
    channel: string;
    raw_text: string;
    requirements: Requirements | null;
    created_at: string;
    updated_at: string;
    client_name: string | null;
    client_email: string | null;
  };
  clarifications: Clarification[];
  quotes: Quote[];
  events: AgentEvent[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(body?.error || `${res.status} ${res.statusText}`);
  }
  return body as T;
}

export const api = {
  listInquiries: () => request<InquiryListItem[]>("/api/inquiries"),
  getInquiry: (id: string) => request<InquiryDetail>(`/api/inquiries/${id}`),
  createInquiry: (body: { name: string; email: string; message: string }) =>
    request<{ id: string }>("/api/inquiries", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reply: (id: string, text: string) =>
    request<{ ok: true }>(`/api/inquiries/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  approve: (id: string) =>
    request<{ ok: true }>(`/api/inquiries/${id}/approve`, { method: "POST" }),
  reject: (id: string, feedback: string) =>
    request<{ ok: true }>(`/api/inquiries/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    }),
};
