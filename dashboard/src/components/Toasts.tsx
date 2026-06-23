export interface Toast {
  id: number;
  message: string;
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role="alert">
          <span className="toast__icon">⚠</span>
          <span className="toast__msg">{t.message}</span>
          <button className="toast__close" onClick={() => onDismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
