"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
  total: number;
  items: { id?: string; name: string; price: number; qty: number; image?: string }[];
};

/** Pending order cards: one consistent dark green, white text. */
const PENDING_CARD = {
  bg: "#1e4d1e",
  border: "#2f6b2f",
  itemDot: "#a3e635",
  divider: "rgba(255,255,255,0.2)",
  orderCircle: "#145214",
} as const;

const PAGE = {
  bg: "#0d2818",
  white: "#ffffff",
  ink: "#1a1a1a",
  amberPill: "#FFC107",
  amberPillInk: "#1a1a1a",
  readyGreen: "#28A745",
  reopenAmber: "#FFBF00",
  reopenAmberInk: "#1a1a1a",
  completedBg: "#F5F5F5",
  completedInk: "#1a1a1a",
  badgeGreen: "#28A745",
};

const K = {
  bodyMin: 24,
  itemName: 28,
};

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Local calendar day as YYYY-MM-DD (for `<input type="date" />`). */
function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inclusive local-day start and exclusive next-midnight (UTC ISO for Supabase). */
function localDayBoundsIso(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return localDayBoundsIso(todayYmdLocal());
  }
  const [y, mo, day] = ymd.split("-").map(Number);
  const start = new Date(y, mo - 1, day, 0, 0, 0, 0);
  const endExclusive = new Date(y, mo - 1, day + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endExclusiveIso: endExclusive.toISOString() };
}

/** e.g. "17 May 2026" from YYYY-MM-DD in local timezone. */
function formatOrdersHeadingDate(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return todayYmdLocal();
  const [y, mo, day] = ymd.split("-").map(Number);
  const d = new Date(y, mo - 1, day);
  try {
    return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return ymd;
  }
}

export function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function readAudioUnlockedFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("kitchen-audio-unlocked") === "1";
  } catch {
    return false;
  }
}

function getWebAudioContextConstructor(): (typeof AudioContext) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}


/** Stronger attention pattern: alert beeps + longer ascending fanfare. */
function playNewOrderChime(ctx: AudioContext) {
  const t0 = ctx.currentTime;
  const peakMain = 0.22;
  const peakBeep = 0.16;

  const playTone = (
    freq: number,
    start: number,
    sustain: number,
    type: OscillatorType = "triangle",
    peak: number = peakMain,
  ) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.05);
    g.gain.linearRampToValueAtTime(peak * 0.55, start + sustain * 0.55);
    g.gain.linearRampToValueAtTime(0.001, start + sustain);
    o.start(start);
    o.stop(start + sustain + 0.02);
  };

  playTone(880, t0, 0.14, "square", peakBeep);
  playTone(1046.5, t0 + 0.11, 0.14, "square", peakBeep);

  const fanfare = [392, 523.25, 659.25, 783.99, 987.77, 1174.66];
  let t = t0 + 0.32;
  for (const f of fanfare) {
    playTone(f, t, 0.42, "triangle", peakMain);
    t += 0.19;
  }
}

/** Descending two-tone “done” cue. */
function playReadyChime(ctx: AudioContext) {
  const freqs = [783.99, 523.25];
  let t = ctx.currentTime;
  for (const freq of freqs) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.03);
    g.gain.linearRampToValueAtTime(0.001, t + 0.42);
    o.start(t);
    o.stop(t + 0.43);
    t += 0.2;
  }
}

type OrderItem = OrderRow["items"][number];

function sumItemsTotal(items: OrderItem[]): number {
  return items.filter((it) => it.qty > 0).reduce((s, it) => s + Number(it.price) * it.qty, 0);
}

function cloneItems(items: OrderItem[] | undefined): OrderItem[] {
  return (items ?? []).map((it) => ({ ...it }));
}

type KitchenView = "pending" | "completed";

function EditOrderModal({
  order,
  draft,
  setDraft,
  onClose,
  onSave,
  saving,
}: {
  order: OrderRow;
  draft: OrderItem[];
  setDraft: Dispatch<SetStateAction<OrderItem[]>>;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const draftTotal = sumItemsTotal(draft);
  const ink = PAGE.ink;
  const canSave = draft.some((it) => it.qty > 0);

  const bumpQty = (index: number, delta: number) => {
    setDraft((prev) => {
      const next = prev.map((it, i) => {
        if (i !== index) return it;
        const q = Math.max(0, it.qty + delta);
        return { ...it, qty: q };
      });
      return next.filter((it) => it.qty > 0);
    });
  };

  const removeLine = (index: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kitchen-edit-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: "#FFFBF0",
          color: ink,
          borderRadius: 28,
          maxWidth: 560,
          width: "100%",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
          border: `4px solid ${PAGE.amberPill}`,
        }}
      >
        <div style={{ padding: "24px 24px 16px", borderBottom: `2px solid rgba(0,0,0,0.08)` }}>
          <h2 id="kitchen-edit-title" style={{ margin: 0, fontSize: 32, fontWeight: 900, fontFamily: "Georgia, serif" }}>
            ✏️ Order #{order.order_number}
          </h2>
          <p style={{ margin: "12px 0 0", fontSize: 22, fontWeight: 600, lineHeight: 1.35 }}>
            Change amounts or remove items that ran out. This updates the order for Admin too.
          </p>
        </div>
        <div style={{ overflowY: "auto", padding: 20, flex: 1 }}>
          {draft.length === 0 ? (
            <div style={{ fontSize: 24, fontWeight: 700, textAlign: "center", padding: 24 }}>
              No items left — add quantities with + or cancel.
            </div>
          ) : (
            draft.map((it, i) => (
              <div
                key={`${it.id ?? it.name}-${i}`}
                style={{
                  background: PAGE.white,
                  borderRadius: 20,
                  padding: 18,
                  marginBottom: 16,
                  border: `2px solid ${PAGE.amberPill}`,
                }}
              >
                <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 16, lineHeight: 1.25 }}>{it.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => bumpQty(i, -1)}
                      aria-label={`Reduce ${it.name}`}
                      style={{
                        width: 56,
                        height: 56,
                        fontSize: 32,
                        fontWeight: 900,
                        borderRadius: 16,
                        border: `3px solid ${ink}`,
                        background: PAGE.white,
                        cursor: saving ? "wait" : "pointer",
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        minWidth: 64,
                        textAlign: "center",
                        fontSize: 28,
                        fontWeight: 900,
                        fontFamily: "monospace",
                      }}
                    >
                      {it.qty}×
                    </span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => bumpQty(i, 1)}
                      aria-label={`Add ${it.name}`}
                      style={{
                        width: 56,
                        height: 56,
                        fontSize: 32,
                        fontWeight: 900,
                        borderRadius: 16,
                        border: `3px solid ${ink}`,
                        background: PAGE.white,
                        cursor: saving ? "wait" : "pointer",
                      }}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => removeLine(i)}
                    style={{
                      marginLeft: "auto",
                      padding: "14px 20px",
                      fontSize: 20,
                      fontWeight: 800,
                      borderRadius: 16,
                      border: "none",
                      background: "#DC3545",
                      color: PAGE.white,
                      cursor: saving ? "wait" : "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 20, fontWeight: 600, color: "#555" }}>
                  RM {Number(it.price).toFixed(2)} each
                </div>
              </div>
            ))
          )}
        </div>
        <div
          style={{
            padding: "20px 24px 24px",
            borderTop: `2px solid rgba(0,0,0,0.08)`,
            background: "rgba(255,193,7,0.2)",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 20, fontFamily: "monospace" }}>
            New total: RM {draftTotal.toFixed(2)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <button
              type="button"
              disabled={saving || !canSave}
              onClick={onSave}
              style={{
                width: "100%",
                minHeight: 72,
                fontSize: 26,
                fontWeight: 900,
                border: "none",
                borderRadius: 20,
                background: canSave ? PAGE.readyGreen : "#999",
                color: PAGE.white,
                cursor: saving || !canSave ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : "💾 Save changes"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              style={{
                width: "100%",
                minHeight: 64,
                fontSize: 24,
                fontWeight: 800,
                borderRadius: 20,
                border: `3px solid ${ink}`,
                background: PAGE.white,
                color: ink,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function KitchenScreen() {
  const initialUnlocked = readAudioUnlockedFromStorage();
  const [pendingOrders, setPendingOrders] = useState<OrderRow[]>([]);
  const [completedOrders, setCompletedOrders] = useState<OrderRow[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderRow | null>(null);
  const [editDraft, setEditDraft] = useState<OrderItem[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [listView, setListView] = useState<KitchenView>("pending");
  const [completedDateYmd, setCompletedDateYmd] = useState(todayYmdLocal);
  const [soundOn, setSoundOn] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(initialUnlocked);
  const soundOnRef = useRef(true);
  const audioUnlockedRef = useRef(initialUnlocked);
  /** Previous pending order IDs from last successful poll — for new-order sound only. */
  const prevPendingIdsRef = useRef<Set<string> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  /** True while any Supabase write is in flight; polls skip to avoid clobbering optimistic UI. */
  const isUpdating = useRef(false);

  soundOnRef.current = soundOn;
  audioUnlockedRef.current = audioUnlocked;

  const getOrCreateAudioContext = useCallback((): AudioContext | null => {
    const AC = getWebAudioContextConstructor();
    if (!AC) return null;
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new AC();
      } catch {
        return null;
      }
    }
    return audioContextRef.current;
  }, []);

  const ensureAudioRunning = useCallback(async () => {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return false;
    try {
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      return false;
    }
    return ctx.state === "running";
  }, [getOrCreateAudioContext]);

  const unlockKitchenAudio = useCallback(async () => {
    try {
      await ensureAudioRunning();
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem("kitchen-audio-unlocked", "1");
    } catch {
      /* private mode */
    }
    setAudioUnlocked(true);
    audioUnlockedRef.current = true;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
      const isMuted = !soundOnRef.current;
      console.log("Muted:", isMuted);
      if (!isMuted) {
        try {
          window.speechSynthesis.cancel();
          const test = new SpeechSynthesisUtterance("Sound enabled");
          test.lang = "en-US";
          test.rate = 0.85;
          test.pitch = 1.0;
          test.volume = 1.0;
          console.log("Speaking:", "Sound enabled");
          window.speechSynthesis.speak(test);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [ensureAudioRunning]);

  useEffect(() => {
    audioUnlockedRef.current = audioUnlocked;
  }, [audioUnlocked]);

  useEffect(() => {
    try {
      if (localStorage.getItem("kitchen-sound-muted") === "1") setSoundOn(false);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    prevPendingIdsRef.current = null;
  }, [listView]);

  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on;
      if (!next && typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      try {
        localStorage.setItem("kitchen-sound-muted", next ? "0" : "1");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const load = useCallback(async () => {
    if (isUpdating.current) return;

    // Read-only fetch: never INSERT/UPDATE/DELETE order rows here (no accidental status changes).
    let q = supabase.from("orders").select("id, order_number, created_at, status, total, items");

    if (listView === "pending") {
      q = q
        .eq("status", "pending")
        .gte("created_at", startOfTodayIso())
        .order("created_at", { ascending: true });
    } else {
      const { startIso, endExclusiveIso } = localDayBoundsIso(completedDateYmd);
      q = q
        .eq("status", "ready")
        .gte("created_at", startIso)
        .lt("created_at", endExclusiveIso)
        .order("created_at", { ascending: false });
    }

    const { data, error } = await q;

    if (error) {
      console.error(error);
      return;
    }
    const rows = (data ?? []) as OrderRow[];

    if (listView === "pending") {
      setPendingOrders(rows);

      const newIds = new Set(rows.filter((r) => r.id).map((r) => String(r.id)));
      const prev = prevPendingIdsRef.current;
      if (prev !== null) {
        const newlyAdded = rows.filter((r) => r.id && !prev.has(String(r.id)));
        if (newlyAdded.length > 0) {
          const sorted = [...newlyAdded].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );

          if (soundOnRef.current && audioUnlockedRef.current) {
            void ensureAudioRunning().then((running) => {
              // Audio + speech only; no Supabase writes.
              if (!running || !soundOnRef.current || !audioUnlockedRef.current) return;
              const ctx = getOrCreateAudioContext();
              if (!ctx) return;
              try {
                playNewOrderChime(ctx);
              } catch (e) {
                console.error(e);
              }
              window.setTimeout(() => {
                const isMuted = !soundOnRef.current;
                console.log("Muted:", isMuted);
                if (isMuted || !audioUnlockedRef.current) return;
                if (typeof window === "undefined" || !window.speechSynthesis) return;
                try {
                  window.speechSynthesis.cancel();
                  for (const o of sorted) {
                    const text = `New order! Order number ${o.order_number}. ${(o.items ?? [])
                      .map((i) => `${i.qty} ${i.name}`)
                      .join(", ")}`;
                    console.log("Speaking:", text);
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.lang = "en-US";
                    utterance.rate = 0.85;
                    utterance.pitch = 1.0;
                    utterance.volume = 1.0;
                    window.speechSynthesis.speak(utterance);
                  }
                } catch (e) {
                  console.error(e);
                }
              }, 500);
            });
          }
        }
      }
      prevPendingIdsRef.current = newIds;
    } else {
      setCompletedOrders(rows);
    }
  }, [listView, completedDateYmd, ensureAudioRunning, getOrCreateAudioContext]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const markReady = async (id: string) => {
    const row = pendingOrders.find((o) => o.id === id);
    if (!row) return;

    isUpdating.current = true;

    if (soundOnRef.current && audioUnlockedRef.current && typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    }

    setBusyId(id);
    const { error } = await supabase.from("orders").update({ status: "ready" }).eq("id", id);
    setBusyId(null);

    if (error) {
      console.error(error);
      alert(error.message);
      isUpdating.current = false;
      return;
    }

    setPendingOrders((prev) => {
      const next = prev.filter((o) => o.id !== id);
      prevPendingIdsRef.current = new Set(next.filter((o) => o.id).map((o) => String(o.id)));
      return next;
    });

    isUpdating.current = false;

    if (soundOnRef.current && audioUnlockedRef.current) {
      const running = await ensureAudioRunning();
      if (running) {
        const ctx = getOrCreateAudioContext();
        if (ctx) {
          try {
            playReadyChime(ctx);
          } catch (e) {
            console.error(e);
          }
        }
        if (typeof window !== "undefined" && window.speechSynthesis) {
          window.setTimeout(() => {
            const isMuted = !soundOnRef.current;
            console.log("Muted:", isMuted);
            if (isMuted || !audioUnlockedRef.current) return;
            const text = `Order number ${row.order_number} is ready for collection!`;
            console.log("Speaking:", text);
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = "en-US";
            utterance.rate = 0.85;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            try {
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(utterance);
            } catch (e) {
              console.error(e);
            }
          }, 300);
        }
      }
    }
  };

  const reopenOrder = async (id: string) => {
    const row = completedOrders.find((o) => o.id === id);
    if (!row) return;

    isUpdating.current = true;
    setBusyId(id);

    const { error } = await supabase.from("orders").update({ status: "pending" }).eq("id", id);
    setBusyId(null);

    if (error) {
      console.error(error);
      alert(error.message);
      isUpdating.current = false;
      return;
    }

    const backToPending: OrderRow = { ...row, status: "pending" };
    setCompletedOrders((prev) => prev.filter((o) => o.id !== id));
    setPendingOrders((prev) => {
      const next = [...prev, backToPending].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      prevPendingIdsRef.current = new Set(next.filter((o) => o.id).map((o) => String(o.id)));
      return next;
    });

    isUpdating.current = false;
  };

  const openEditOrder = (o: OrderRow) => {
    setEditingOrder(o);
    setEditDraft(cloneItems(o.items));
  };

  const closeEditOrder = () => {
    if (editSaving) return;
    setEditingOrder(null);
    setEditDraft([]);
  };

  const saveEditOrder = async () => {
    if (!editingOrder) return;
    const filtered = editDraft.filter((it) => it.qty > 0);
    if (filtered.length === 0) {
      alert("Keep at least one item in the order.");
      return;
    }

    isUpdating.current = true;
    setEditSaving(true);
    const total = sumItemsTotal(filtered);
    const itemsPayload = filtered.map((it) => {
      const row: Record<string, unknown> = {
        name: it.name,
        price: Number(it.price),
        qty: it.qty,
        image: it.image ?? "",
      };
      if (it.id != null && it.id !== "") row.id = String(it.id);
      return row;
    });
    const editId = editingOrder.id;
    const updatedRow: OrderRow = { ...editingOrder, items: filtered, total };

    const { error } = await supabase
      .from("orders")
      .update({ items: itemsPayload, total })
      .eq("id", editId);

    setEditSaving(false);

    if (error) {
      console.error(error);
      alert(error.message);
      isUpdating.current = false;
      return;
    }

    setPendingOrders((prev) => prev.map((o) => (o.id === editId ? updatedRow : o)));
    setCompletedOrders((prev) => prev.map((o) => (o.id === editId ? updatedRow : o)));
    setEditingOrder(null);
    setEditDraft([]);
    isUpdating.current = false;
  };

  const orders = listView === "pending" ? pendingOrders : completedOrders;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PAGE.bg,
        color: PAGE.white,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "28px 20px 48px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          draft={editDraft}
          setDraft={setEditDraft}
          onClose={closeEditOrder}
          onSave={() => void saveEditOrder()}
          saving={editSaving}
        />
      )}
      {!audioUnlocked && (
        <button
          type="button"
          onClick={() => void unlockKitchenAudio()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            margin: 0,
            padding: 32,
            border: "none",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            background: "rgba(13, 40, 24, 0.96)",
            color: PAGE.white,
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
        >
          <span style={{ fontSize: 52, fontWeight: 800 }}>🔔</span>
          <span style={{ fontSize: 36, fontWeight: 800, textAlign: "center", maxWidth: 520, lineHeight: 1.3 }}>
            Tap to enable sound
          </span>
          <span style={{ fontSize: 24, fontWeight: 600, textAlign: "center", maxWidth: 480, opacity: 0.95, lineHeight: 1.4 }}>
            Tap anywhere to turn on chimes and spoken order announcements for this screen.
          </span>
        </button>
      )}
      <header
        style={{
          marginBottom: 32,
          paddingBottom: 24,
          borderBottom: `2px solid rgba(255,255,255,0.2)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 40,
              fontWeight: 800,
              fontFamily: "Georgia, 'Times New Roman', serif",
              color: PAGE.white,
              letterSpacing: 0.5,
              lineHeight: 1.2,
            }}
          >
            👨‍🍳 Kitchen Orders
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? "Mute chimes and voice announcements" : "Unmute chimes and voice announcements"}
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                border: `3px solid ${PAGE.white}`,
                background: soundOn ? PAGE.amberPill : "#444",
                fontSize: 30,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              }}
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
            <div
              style={{
                fontSize: 28,
                fontVariantNumeric: "tabular-nums",
                fontWeight: 700,
                color: PAGE.white,
              }}
            >
              {clock.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Order list view"
          style={{
            display: "flex",
            width: "100%",
            gap: 10,
            boxSizing: "border-box",
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={listView === "pending"}
            onClick={() => setListView("pending")}
            style={{
              flex: 1,
              minHeight: 60,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              borderRadius: 18,
              border: "4px solid rgba(255,255,255,0.25)",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 24,
              boxShadow: listView === "pending" ? "0 6px 0 #C49000, 0 8px 16px rgba(0,0,0,0.2)" : "inset 0 2px 8px rgba(0,0,0,0.35)",
              background: listView === "pending" ? "#FFC107" : "#2d2404",
              color: listView === "pending" ? PAGE.ink : "rgba(255,220,120,0.85)",
            }}
          >
            <span style={{ fontSize: 32, lineHeight: 1 }} aria-hidden>
              🟡
            </span>
            Preparing
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listView === "completed"}
            onClick={() => setListView("completed")}
            style={{
              flex: 1,
              minHeight: 60,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              borderRadius: 18,
              border: "4px solid rgba(255,255,255,0.25)",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 24,
              boxShadow: listView === "completed" ? "0 6px 0 #146c43, 0 8px 16px rgba(0,0,0,0.2)" : "inset 0 2px 8px rgba(0,0,0,0.35)",
              background: listView === "completed" ? "#22C55E" : "#0f2918",
              color: listView === "completed" ? PAGE.white : "rgba(134,239,172,0.85)",
            }}
          >
            <span style={{ fontSize: 32, lineHeight: 1 }} aria-hidden>
              ✅
            </span>
            Done
          </button>
        </div>
        {listView === "completed" && (
          <div style={{ marginTop: 20 }}>
            <label
              htmlFor="kitchen-completed-date"
              style={{
                display: "block",
                fontSize: 18,
                fontWeight: 700,
                marginBottom: 10,
                color: "rgba(255,255,255,0.95)",
              }}
            >
              Show orders for this day
            </label>
            <input
              id="kitchen-completed-date"
              type="date"
              value={completedDateYmd}
              onChange={(e) => setCompletedDateYmd(e.target.value || todayYmdLocal())}
              style={{
                width: "100%",
                maxWidth: 420,
                minHeight: 52,
                fontSize: 22,
                fontWeight: 700,
                padding: "8px 14px",
                borderRadius: 14,
                border: `3px solid ${PAGE.white}`,
                background: PAGE.white,
                color: PAGE.ink,
                boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </header>

      {listView === "completed" && (
        <div
          style={{
            marginBottom: 20,
            fontSize: 28,
            fontWeight: 800,
            color: PAGE.white,
            fontFamily: "Georgia, 'Times New Roman', serif",
            textAlign: "center",
          }}
        >
          Orders for {formatOrdersHeadingDate(completedDateYmd)}
        </div>
      )}

      {orders.length === 0 ? (
        <div style={{ textAlign: "center", marginTop: "12vh", padding: "0 16px" }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: PAGE.white, lineHeight: 1.3 }}>
            {listView === "pending" ? "All caught up! 🎉" : "No completed orders for this day."}
          </div>
          {listView === "pending" && (
            <p
              style={{
                margin: "24px 0 0",
                fontSize: K.bodyMin,
                fontWeight: 600,
                color: PAGE.white,
                lineHeight: 1.4,
              }}
            >
              No pending orders right now
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {orders.map((o) => {
            const isDone = listView === "completed";

            return (
              <article
                key={o.id}
                style={{
                  background: isDone ? PAGE.completedBg : PENDING_CARD.bg,
                  color: isDone ? PAGE.completedInk : PAGE.white,
                  borderRadius: 24,
                  padding: 28,
                  border: `4px solid ${isDone ? "#CCCCCC" : PENDING_CARD.border}`,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  position: "relative",
                }}
              >
                <button
                  type="button"
                  title="Adjust order"
                  aria-label="Adjust order"
                  disabled={busyId === o.id || editSaving}
                  onClick={() => openEditOrder(o)}
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    padding: 0,
                    border: "none",
                    background: PAGE.amberPill,
                    cursor: busyId === o.id || editSaving ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    lineHeight: 1,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                    zIndex: 2,
                  }}
                >
                  ✏️
                </button>
                {isDone && (
                  <div
                    style={{
                      position: "absolute",
                      top: 16,
                      left: 16,
                      background: PAGE.badgeGreen,
                      color: PAGE.white,
                      fontSize: 22,
                      fontWeight: 800,
                      padding: "10px 18px",
                      borderRadius: 999,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}
                  >
                    ✅ Ready
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 24,
                    marginBottom: 24,
                    flexWrap: "wrap",
                    paddingRight: 52,
                    paddingTop: isDone ? 56 : 0,
                  }}
                >
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      background: isDone ? "#495057" : PENDING_CARD.orderCircle,
                      color: PAGE.white,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 48,
                      fontWeight: 900,
                      flexShrink: 0,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    }}
                  >
                    {o.order_number}
                  </div>
                  <div style={{ flex: "1 1 200px" }}>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        marginBottom: 8,
                        color: isDone ? PAGE.completedInk : PAGE.white,
                      }}
                    >
                      Order #{o.order_number}
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: isDone ? PAGE.completedInk : "rgba(255,255,255,0.9)",
                      }}
                    >
                      {formatTime(o.created_at)}
                    </div>
                  </div>
                </div>

                <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0 }}>
                  {(o.items ?? []).map((it, i) => (
                    <li
                      key={`${it.id ?? it.name}-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "18px 0",
                        borderTop: i ? `2px solid ${isDone ? "#DEE2E6" : PENDING_CARD.divider}` : "none",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: isDone ? "#6C757D" : PENDING_CARD.itemDot,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: K.itemName,
                          fontWeight: 800,
                          lineHeight: 1.25,
                          color: isDone ? PAGE.completedInk : PAGE.white,
                        }}
                      >
                        {it.name}
                      </span>
                      <span
                        style={{
                          fontSize: 24,
                          fontWeight: 900,
                          background: "#FFC107",
                          color: PAGE.reopenAmberInk,
                          padding: "10px 18px",
                          borderRadius: 16,
                          minWidth: 56,
                          textAlign: "center",
                        }}
                      >
                        {it.qty}×
                      </span>
                    </li>
                  ))}
                </ul>

                {isDone ? (
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() => reopenOrder(o.id)}
                    style={{
                      width: "100%",
                      minHeight: 80,
                      padding: "20px 24px",
                      fontSize: 28,
                      fontWeight: 800,
                      border: "none",
                      borderRadius: 20,
                      background: PAGE.reopenAmber,
                      color: PAGE.reopenAmberInk,
                      cursor: busyId === o.id ? "wait" : "pointer",
                      opacity: busyId === o.id ? 0.75 : 1,
                      boxShadow: "0 6px 0 #CC9900, 0 8px 20px rgba(0,0,0,0.15)",
                    }}
                  >
                    {busyId === o.id ? "…" : "🔄 Reopen"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() => markReady(o.id)}
                    style={{
                      width: "100%",
                      minHeight: 80,
                      fontSize: 28,
                      fontWeight: 800,
                      border: "none",
                      borderRadius: 20,
                      background: PAGE.readyGreen,
                      color: PAGE.white,
                      cursor: busyId === o.id ? "wait" : "pointer",
                      opacity: busyId === o.id ? 0.75 : 1,
                      boxShadow: "0 6px 0 #1E7E34, 0 8px 20px rgba(0,0,0,0.2)",
                    }}
                  >
                    {busyId === o.id ? "…" : "✅ Mark as Ready"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
