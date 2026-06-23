interface Props {
  onNewInquiry: () => void;
}

const NAV = [
  { key: "inbox", label: "Inbox", enabled: true },
  { key: "sent", label: "Sent", enabled: false },
  { key: "kb", label: "Knowledge base", enabled: false },
];

export function Sidebar({ onNewInquiry }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">◆</span>
        <div>
          <div className="sidebar__title">QuotePilot</div>
          <div className="sidebar__subtitle">AI Approval Engine</div>
        </div>
      </div>

      <nav className="sidebar__nav">
        {NAV.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${item.enabled ? "nav-item--active" : "nav-item--disabled"}`}
            disabled={!item.enabled}
            title={item.enabled ? undefined : "Coming soon"}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar__spacer" />

      <button className="btn btn--primary sidebar__new" onClick={onNewInquiry}>
        + New inquiry
      </button>
    </aside>
  );
}
