import { useState } from "react";

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function RejectModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (feedback: string) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!feedback.trim()) return;
    setBusy(true);
    try {
      await onSubmit(feedback.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop onClose={onCancel}>
      <div className="modal__head">
        <div className="modal__icon modal__icon--danger">!</div>
        <div>
          <h3 className="modal__title">Reject with feedback</h3>
          <p className="modal__sub">
            Tell the agent what's wrong — it will revise the quote and bring it back for approval.
          </p>
        </div>
        <button className="modal__close" onClick={onCancel}>
          ×
        </button>
      </div>

      <div className="modal__body">
        <label className="field-label">Feedback instructions</label>
        <textarea
          className="textarea textarea--danger"
          rows={4}
          autoFocus
          placeholder="Too cheap for this scope — add pickup scheduling as its own line item and get closer to the $2,000 budget."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>

      <div className="modal__foot">
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--danger" onClick={submit} disabled={busy || !feedback.trim()}>
          {busy ? "Sending…" : "Send back to agent"}
        </button>
      </div>
    </Backdrop>
  );
}

export function NewInquiryModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (data: { name: string; email: string; message: string }) => Promise<void>;
}) {
  const [name, setName] = useState("Amsterdam Bakery");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(
    "Hi, I run a small bakery in Amsterdam and I want an online store where customers can order cakes for pickup. I have about $2,000 budget and need it before the holidays, so roughly 6 weeks. I already have photos and a logo."
  );
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !message.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), message: message.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop onClose={onCancel}>
      <div className="modal__head">
        <div className="modal__icon">✉</div>
        <div>
          <h3 className="modal__title">New inquiry</h3>
          <p className="modal__sub">Drop a client message in — the agent picks it up within ~5s.</p>
        </div>
        <button className="modal__close" onClick={onCancel}>
          ×
        </button>
      </div>

      <div className="modal__body">
        <label className="field-label">Client name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="field-label">Email</label>
        <input
          className="input"
          type="email"
          placeholder="client@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="field-label">Message</label>
        <textarea
          className="textarea"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <div className="modal__foot">
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn--primary"
          onClick={submit}
          disabled={busy || !email.trim() || !message.trim()}
        >
          {busy ? "Creating…" : "Create inquiry"}
        </button>
      </div>
    </Backdrop>
  );
}
