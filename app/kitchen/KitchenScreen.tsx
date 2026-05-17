"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
  total: number;
  items: { id?: string; name: string; price: number; qty: number; image?: string }[];
};

const K = {
  bg: "#0f2918",
  card: "#1a3d24",
  cardDone: "#252f28",
  accent: "#22c55e",
  white: "#ffffff",
  muted: "#a7c4b0",
  doneCircle: "#5c6d64",
  doneBorder: "rgba(255,255,255,0.06)",
};

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
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

type KitchenView = "pending" | "completed";

export function KitchenScreen() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listView, setListView] = useState<KitchenView>("pending");

  const load = useCallback(async () => {
    const start = startOfTodayIso();
    let q = supabase
      .from("orders")
      .select("id, order_number, created_at, status, total, items")
      .gte("created_at", start);

    if (listView === "pending") {
      q = q.eq("status", "pending").order("created_at", { ascending: true });
    } else {
      q = q.eq("status", "ready").order("created_at", { ascending: false });
    }

    const { data, error } = await q;

    if (error) {
      console.error(error);
      return;
    }
    setOrders((data ?? []) as OrderRow[]);
  }, [listView]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 10_000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const markReady = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.from("orders").update({ status: "ready" }).eq("id", id);
    setBusyId(null);
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }
    await load();
  };

  const reopenOrder = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.from("orders").update({ status: "pending" }).eq("id", id);
    setBusyId(null);
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }
    await load();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: K.bg,
        color: K.white,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "20px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 24,
          borderBottom: `1px solid ${K.card}`,
          paddingBottom: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "1 1 auto" }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Kitchen Orders</h1>
          <button
            type="button"
            onClick={() => setListView((v) => (v === "pending" ? "completed" : "pending"))}
            style={{
              alignSelf: "flex-start",
              padding: "10px 16px",
              fontSize: 15,
              fontWeight: 600,
              borderRadius: 10,
              border: `1px solid ${K.muted}`,
              background: "rgba(255,255,255,0.06)",
              color: K.white,
              cursor: "pointer",
            }}
          >
            {listView === "pending" ? "View Completed" : "View Pending"}
          </button>
        </div>
        <div style={{ fontSize: 22, fontVariantNumeric: "tabular-nums", color: K.muted }}>
          {clock.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
      </div>

      {orders.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            fontSize: 32,
            fontWeight: 600,
            color: K.muted,
            marginTop: "18vh",
          }}
        >
          {listView === "pending" ? "All caught up! 🎉" : "No completed orders today."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {orders.map((o) => {
            const isDone = listView === "completed";
            return (
            <div
              key={o.id}
              style={{
                background: isDone ? K.cardDone : K.card,
                borderRadius: 16,
                padding: 20,
                border: `1px solid ${isDone ? K.doneBorder : "rgba(255,255,255,0.08)"}`,
                opacity: isDone ? 0.92 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: isDone ? K.doneCircle : K.accent,
                    color: isDone ? K.white : K.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 26,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {o.order_number}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: K.muted }}>Order #{o.order_number}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: isDone ? K.muted : K.white }}>
                    {formatTime(o.created_at)}
                  </div>
                </div>
              </div>
              <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0 }}>
                {(o.items ?? []).map((it, i) => (
                  <li
                    key={`${it.id ?? it.name}-${i}`}
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      padding: "10px 0",
                      borderTop: i ? `1px solid rgba(255,255,255,0.1)` : "none",
                      color: isDone ? K.muted : K.white,
                    }}
                  >
                    <span style={{ color: isDone ? "#8a9b91" : K.accent, marginRight: 8 }}>{it.qty}×</span>
                    {it.name}
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
                    padding: "18px",
                    fontSize: 20,
                    fontWeight: 700,
                    border: `1px solid ${K.doneBorder}`,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.08)",
                    color: K.muted,
                    cursor: busyId === o.id ? "wait" : "pointer",
                    opacity: busyId === o.id ? 0.7 : 1,
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
                    padding: "18px",
                    fontSize: 22,
                    fontWeight: 700,
                    border: "none",
                    borderRadius: 14,
                    background: K.accent,
                    color: K.bg,
                    cursor: busyId === o.id ? "wait" : "pointer",
                    opacity: busyId === o.id ? 0.7 : 1,
                  }}
                >
                  {busyId === o.id ? "…" : "✅ Ready"}
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
