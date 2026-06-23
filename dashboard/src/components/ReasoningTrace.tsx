import { useState } from "react";
import type { AgentEvent } from "../api";

function duration(e: AgentEvent): string {
  if (e.latency_ms == null) return "";
  if (e.latency_ms < 1000) return `${e.latency_ms}ms`;
  return `${(e.latency_ms / 1000).toFixed(1)}s`;
}

export function ReasoningTrace({ events }: { events: AgentEvent[] }) {
  const [open, setOpen] = useState(true);

  return (
    <section className="section">
      <button className="section__head section__head--toggle" onClick={() => setOpen((o) => !o)}>
        <span className="section__title">Reasoning trace</span>
        <span className="section__meta">
          {events.length} event{events.length === 1 ? "" : "s"} {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="timeline">
          {events.length === 0 && <div className="muted">No agent activity yet.</div>}
          {events.map((e) => (
            <div key={String(e.id)} className={`timeline__row ${e.step === "error" ? "timeline__row--error" : ""}`}>
              <div className="timeline__marker" />
              <div className="timeline__body">
                <div className="timeline__line1">
                  <span className="timeline__step">{e.step}</span>
                  {e.model && <span className="mono-tag">{e.model}</span>}
                  {e.latency_ms != null && <span className="timeline__dur">{duration(e)}</span>}
                </div>
                {e.summary && <div className="timeline__summary">{e.summary}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
