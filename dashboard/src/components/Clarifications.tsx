import { useState } from "react";
import type { Clarification, InquiryStatus } from "../api";
import { timeAgo } from "../lib/format";

interface Props {
  clarifications: Clarification[];
  status: InquiryStatus;
  onReply: (text: string) => Promise<void>;
}

export function Clarifications({ clarifications, status, onReply }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  if (clarifications.length === 0) return null;

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onReply(text.trim());
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <div className="section__head">
        <span className="section__title">Clarifications</span>
      </div>

      {clarifications.map((c, i) => {
        const answered = !!c.responded_at;
        const canReply = !answered && status === "awaiting_client";
        return (
          <div key={c.id} className="clarify">
            <div className="clarify__round">
              Round {i + 1} · sent {timeAgo(c.sent_at)}
            </div>
            <ul className="clarify__questions">
              {(c.questions ?? []).map((q, qi) => (
                <li key={qi}>{q}</li>
              ))}
            </ul>

            {answered && (
              <div className="clarify__answer">
                <span className="clarify__answer-label">Client replied</span>
                <p>{c.response_text}</p>
              </div>
            )}

            {canReply && (
              <div className="clarify__reply">
                <textarea
                  className="textarea"
                  placeholder="Type the client's reply here (stand-in for their email)…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                />
                <button className="btn btn--primary" onClick={submit} disabled={busy || !text.trim()}>
                  {busy ? "Submitting…" : "Submit client reply"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
