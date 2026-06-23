import { useCallback, useEffect, useRef, useState } from "react";
import { api, type InquiryDetail as Detail, type InquiryListItem } from "./api";
import { isWaiting } from "./lib/status";
import { Sidebar } from "./components/Sidebar";
import { InquiryList } from "./components/InquiryList";
import { InquiryDetail } from "./components/InquiryDetail";
import { NewInquiryModal, RejectModal } from "./components/Modals";
import { Toasts, type Toast } from "./components/Toasts";

const POLL_MS = 5000;

export default function App() {
  const [list, setList] = useState<InquiryListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<"new" | "reject" | null>(null);
  const [approving, setApproving] = useState(false);

  // Refs so the single polling interval always sees current values.
  const selectedRef = useRef<string | null>(null);
  const detailRef = useRef<Detail | null>(null);
  selectedRef.current = selectedId;
  detailRef.current = detail;

  const toast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const fetchDetail = useCallback(
    async (id: string) => {
      try {
        const d = await api.getInquiry(id);
        // Ignore stale responses if the user switched inquiries mid-flight.
        if (selectedRef.current === id) setDetail(d);
      } catch (e) {
        toast(`Couldn't load inquiry: ${(e as Error).message}`);
      }
    },
    [toast]
  );

  const refreshList = useCallback(async (): Promise<InquiryListItem[] | null> => {
    try {
      const items = await api.listInquiries();
      setList(items);
      return items;
    } catch (e) {
      toast(`Couldn't load inbox: ${(e as Error).message}`);
      return null;
    }
  }, [toast]);

  // Initial load.
  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // Fetch detail immediately when a selection is made.
  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setDetail(null);
  }, [selectedId, fetchDetail]);

  // One 5s poll: always refresh the inbox; refresh the open detail while it's in
  // a non-waiting state, or whenever the inbox shows its status has changed.
  useEffect(() => {
    const tick = async () => {
      const items = await refreshList();
      const id = selectedRef.current;
      if (!id) return;
      const cur = detailRef.current;
      const listed = items?.find((i) => i.id === id);
      const statusChanged = listed && cur && listed.status !== cur.inquiry.status;
      const active = cur && !isWaiting(cur.inquiry.status);
      if (active || statusChanged || !cur) fetchDetail(id);
    };
    const h = setInterval(tick, POLL_MS);
    return () => clearInterval(h);
  }, [refreshList, fetchDetail]);

  // ── actions ──
  const onReply = async (text: string) => {
    if (!selectedId) return;
    try {
      await api.reply(selectedId, text);
      await fetchDetail(selectedId);
      await refreshList();
    } catch (e) {
      toast(`Reply failed: ${(e as Error).message}`);
    }
  };

  const onApprove = async () => {
    if (!selectedId) return;
    setApproving(true);
    try {
      await api.approve(selectedId);
      await fetchDetail(selectedId);
      await refreshList();
    } catch (e) {
      toast(`Approve failed: ${(e as Error).message}`);
    } finally {
      setApproving(false);
    }
  };

  const onReject = async (feedback: string) => {
    if (!selectedId) return;
    try {
      await api.reject(selectedId, feedback);
      setModal(null);
      await fetchDetail(selectedId);
      await refreshList();
    } catch (e) {
      toast(`Reject failed: ${(e as Error).message}`);
    }
  };

  const onCreate = async (data: { name: string; email: string; message: string }) => {
    try {
      const { id } = await api.createInquiry(data);
      setModal(null);
      await refreshList();
      setSelectedId(id);
    } catch (e) {
      toast(`Couldn't create inquiry: ${(e as Error).message}`);
    }
  };

  return (
    <div className="app">
      <Sidebar onNewInquiry={() => setModal("new")} />

      <main className="main">
        <InquiryList items={list} selectedId={selectedId} onSelect={setSelectedId} />

        <div className="detail-pane">
          {detail ? (
            <InquiryDetail
              detail={detail}
              onReply={onReply}
              onApprove={onApprove}
              onOpenReject={() => setModal("reject")}
              approving={approving}
            />
          ) : (
            <div className="empty-detail">
              <div className="empty-detail__logo">◆</div>
              <p>Select an inquiry to review the agent's work.</p>
            </div>
          )}
        </div>
      </main>

      {modal === "new" && (
        <NewInquiryModal onCancel={() => setModal(null)} onSubmit={onCreate} />
      )}
      {modal === "reject" && (
        <RejectModal onCancel={() => setModal(null)} onSubmit={onReject} />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
