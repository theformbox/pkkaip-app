import { useState, useEffect, useRef, useCallback } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabase";

// ── Palette ────────────────────────────────────────────────────
const G = {
  green: "#2D5A27", greenLight: "#4A7C42", greenPale: "#EDF5EB",
  amber: "#E8891A", amberLight: "#F5A93A",
  cream: "#FAF6EE", brown: "#6B4226", brownLight: "#9C6B45",
  white: "#FFFFFF", text: "#2C2C2C", textLight: "#6B6B6B",
  red: "#CC0000", redPale: "#FFF0F0",
};

// ── Shared styles ──────────────────────────────────────────────
const lbl = { display: "block", fontSize: 13, fontWeight: "bold", color: G.text, marginBottom: 6 };
const inp = { width: "100%", fontSize: 16, border: `1.5px solid ${G.greenPale}`, borderRadius: 12, padding: "11px 14px", background: G.white, marginBottom: 16, boxSizing: "border-box", outline: "none", fontFamily: "Georgia,serif", color: G.text };

// ── Helpers ────────────────────────────────────────────────────
function getBreakdown(amount) {
  const denoms = [
    { label: "RM 50", value: 50 }, { label: "RM 10", value: 10 },
    { label: "RM 5", value: 5 }, { label: "RM 1", value: 1 },
    { label: "50 sen", value: 0.5 }, { label: "20 sen", value: 0.2 },
    { label: "10 sen", value: 0.1 }, { label: "5 sen", value: 0.05 },
  ];
  let rem = Math.round(amount * 100) / 100;
  return denoms.reduce((acc, d) => {
    const count = Math.floor(Math.round(rem / d.value * 100) / 100);
    if (count > 0) { acc.push({ label: d.label, count }); rem = Math.round((rem - count * d.value) * 100) / 100; }
    return acc;
  }, []);
}

function plantFromRow(row) {
  return {
    id: row.id,
    name: row.name ?? "",
    malay: row.malay ?? "",
    description: row.description ?? "",
    care: row.care ?? "",
    uses: row.uses ?? "",
    image: row.image ?? "",
  };
}

function categoriesFromJoin(cats, items) {
  const map = new Map();
  for (const c of cats) {
    map.set(c.id, { id: c.id, label: c.label, emoji: c.emoji ?? "🍽️", items: [] });
  }
  for (const it of items) {
    const bucket = map.get(it.category_id);
    if (bucket) bucket.items.push({ id: it.id, name: it.name, price: Number(it.price), image: it.image ?? "" });
  }
  return Array.from(map.values());
}

function LoadingScreen() {
  return (
    <div style={{ fontFamily: "Georgia,serif", background: G.cream, minHeight: "100vh", maxWidth: 430, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <style>{"@keyframes pkkaip-spin { to { transform: rotate(360deg); } }"}</style>
      <div style={{ width: 40, height: 40, border: `4px solid ${G.greenPale}`, borderTopColor: G.green, borderRadius: "50%", animation: "pkkaip-spin 0.8s linear infinite" }} />
      <div style={{ color: G.textLight, fontSize: 14, fontStyle: "italic" }}>Loading…</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ══════════════════════════════════════════════════════════════

function Header({ title, sub, onBack, right }) {
  return (
    <div style={{ background: G.green, color: G.white, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: G.white, borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          ←
        </button>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: "bold", fontFamily: "Georgia,serif" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, opacity: 0.8, fontStyle: "italic" }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function BigBtn({ label, sub, emoji, color, onClick, compact, isLast }) {
  const [p, setP] = useState(false);
  const mb = compact ? (isLast ? 0 : 8) : 14;
  const pad = compact ? "14px 16px" : "20px 18px";
  const gap = compact ? 10 : 14;
  const fsEmoji = compact ? 26 : 30;
  const fsLabel = compact ? 17 : 19;
  const fsSub = compact ? 11 : 12;
  return (
    <button onClick={onClick} onMouseDown={() => setP(true)} onMouseUp={() => setP(false)} onTouchStart={() => setP(true)} onTouchEnd={() => setP(false)}
      style={{ width: "100%", padding: pad, borderRadius: 20, border: "none", background: color, color: G.white, cursor: "pointer", marginBottom: mb, display: "flex", alignItems: "center", gap, textAlign: "left", boxShadow: p ? "0 2px 6px rgba(0,0,0,0.1)" : "0 4px 16px rgba(0,0,0,0.13)", transform: p ? "scale(0.97)" : "scale(1)", transition: "all 0.1s", fontFamily: "Georgia,serif" }}>
      <span style={{ fontSize: fsEmoji }}>{emoji}</span>
      <div>
        <div style={{ fontSize: fsLabel, fontWeight: "bold" }}>{label}</div>
        <div style={{ fontSize: fsSub, opacity: 0.85, fontStyle: "italic" }}>{sub}</div>
      </div>
    </button>
  );
}

function ActionBtn({ label, color, onClick, outline }) {
  return (
    <button onClick={onClick} style={{ width: "100%", padding: "15px", borderRadius: 14, marginBottom: 10, border: outline ? `1px solid ${G.brownLight}` : "none", background: outline ? G.cream : color, color: outline ? G.brown : G.white, fontSize: 16, fontFamily: "Georgia,serif", fontWeight: "bold", cursor: "pointer", boxShadow: outline ? "none" : "0 3px 10px rgba(0,0,0,0.12)" }}>
      {label}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// HOME
// ══════════════════════════════════════════════════════════════

const ADMIN_PASSWORD = "pkkaip2024";
const SECRET_TAPS = 5;

function HomeScreen({ onNav, logo }) {
  const [taps, setTaps] = useState(0);
  const [flash, setFlash] = useState(false);
  const tapTimer = useRef(null);

  const handleLogoTap = () => {
    const next = taps + 1;
    setTaps(next);
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    clearTimeout(tapTimer.current);
    if (next >= SECRET_TAPS) {
      setTaps(0);
      onNav("admin");
    } else {
      tapTimer.current = setTimeout(() => setTaps(0), 2000);
    }
  };

  return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", boxSizing: "border-box", overflow: "hidden", padding: "24px", background: `linear-gradient(160deg, ${G.greenPale} 0%, ${G.cream} 60%)` }}>
      <img
        onClick={handleLogoTap}
        src={logo || "data:image/png;base64,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"}
        alt="PKKAIP Logo"
        style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", marginBottom: 10, boxShadow: "0 4px 20px rgba(45,90,39,0.25)", border: `3px solid ${G.green}`, cursor: "pointer", userSelect: "none", opacity: flash ? 0.7 : 1, transition: "opacity 0.15s" }}
      />
      <div style={{ fontSize: 13, color: G.green, fontWeight: "bold", textAlign: "center", letterSpacing: 0.4, marginBottom: 2, lineHeight: 1.25 }}>Persatuan Kebun Komuniti Anak Istimewa Puchong</div>
      <div style={{ fontSize: 12, color: G.textLight, fontStyle: "italic", marginBottom: 16, lineHeight: 1.3 }}>Growing together with love 💚</div>
      <BigBtn emoji="☕" label="Café Order" sub="Take a customer's order" color={G.green} compact onClick={() => onNav("cafe")} />
      <BigBtn emoji="🌱" label="Garden Plants" sub="Scan or explore plants" color={G.amber} compact isLast onClick={() => onNav("garden")} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CAFÉ POS
// ══════════════════════════════════════════════════════════════

function CafeScreen({ onBack, categories }) {
  const [tab, setTab] = useState(0);
  const [order, setOrder] = useState({});
  const [screen, setScreen] = useState("menu");
  const [paid, setPaid] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);

  const total = Object.values(order).reduce((s, { price, qty }) => s + price * qty, 0);
  const orderItems = Object.values(order).filter(i => i.qty > 0);
  const paidNum = parseFloat(paid) || 0;
  const change = paidNum - total;
  const neg = change < -0.001;
  const breakdown = !neg && change > 0.001 ? getBreakdown(change) : [];

  const add = (item) => setOrder(p => ({ ...p, [item.id]: { ...item, qty: (p[item.id]?.qty || 0) + 1 } }));
  const adj = (id, d) => setOrder(p => {
    const q = (p[id]?.qty || 0) + d;
    if (q <= 0) { const n = { ...p }; delete n[id]; return n; }
    return { ...p, [id]: { ...p[id], qty: q } };
  });
  const reset = () => { setOrder({}); setPaid(""); setScreen("menu"); setShowBreakdown(false); setTab(0); };

  const cat = categories[tab] || categories[0];

  if (screen === "done") return (
    <div>
      <Header title="✅ Order Complete" />
      <div style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 72, marginBottom: 12 }}>🙏</div>
        <div style={{ fontSize: 22, fontWeight: "bold", color: G.green, marginBottom: 4, fontFamily: "Georgia,serif" }}>Thank You!</div>
        <div style={{ fontSize: 14, color: G.textLight, fontStyle: "italic", marginBottom: 24 }}>Terima Kasih</div>
        <div style={{ background: G.greenPale, borderRadius: 20, padding: 20, border: `2px solid ${G.green}`, marginBottom: 32 }}>
          <div style={{ fontSize: 13, color: G.textLight, fontStyle: "italic", marginBottom: 6 }}>Change given</div>
          <div style={{ fontSize: 44, fontWeight: "bold", fontFamily: "monospace", color: G.green }}>RM {Math.max(0, change).toFixed(2)}</div>
        </div>
        <ActionBtn label="New Order" color={G.green} onClick={reset} />
      </div>
    </div>
  );

  if (screen === "payment") return (
    <div>
      <Header title="Payment" sub={`Total: RM ${total.toFixed(2)}`} onBack={() => setScreen("menu")} />
      <div style={{ padding: "20px 16px" }}>
        <div style={{ fontSize: 14, color: G.textLight, marginBottom: 8, fontStyle: "italic" }}>How much did the customer give you?</div>
        <input type="number" inputMode="decimal" autoFocus value={paid} onChange={e => { setPaid(e.target.value); setShowBreakdown(false); }} placeholder="RM 0.00"
          style={{ width: "100%", fontSize: 32, fontFamily: "monospace", fontWeight: "bold", color: G.green, border: `2px solid ${G.green}`, borderRadius: 14, padding: "12px 16px", background: G.white, marginBottom: 16, boxSizing: "border-box", outline: "none" }} />
        {paid !== "" && (
          <>
            <div style={{ background: neg ? G.redPale : G.greenPale, borderRadius: 20, padding: 20, textAlign: "center", marginBottom: 16, border: `2px solid ${neg ? "#FFCCCC" : G.green}` }}>
              <div style={{ fontSize: 13, color: G.textLight, fontStyle: "italic", marginBottom: 6 }}>{neg ? "⚠️ Not enough money" : "Give back this change"}</div>
              <div style={{ fontSize: 44, fontWeight: "bold", fontFamily: "monospace", color: neg ? G.red : G.green }}>
                {neg ? `RM ${Math.abs(change).toFixed(2)} short` : `RM ${change.toFixed(2)}`}
              </div>
              {!neg && change > 0.001 && (
                <button onClick={() => setShowBreakdown(v => !v)} style={{ background: "none", border: `1px solid ${G.greenLight}`, color: G.greenLight, borderRadius: 20, padding: "6px 16px", fontSize: 12, cursor: "pointer", marginTop: 8, fontFamily: "Georgia,serif", fontStyle: "italic" }}>
                  {showBreakdown ? "Hide" : "How to give change?"}
                </button>
              )}
              {Math.abs(change) < 0.001 && <div style={{ fontSize: 13, color: G.green, marginTop: 8, fontStyle: "italic" }}>Exact amount — no change needed!</div>}
            </div>
            {showBreakdown && breakdown.length > 0 && (
              <div style={{ background: G.white, borderRadius: 16, padding: "14px 16px", marginBottom: 16, border: `1px solid ${G.greenPale}` }}>
                <div style={{ fontSize: 13, fontWeight: "bold", color: G.text, marginBottom: 10 }}>💰 Notes & coins to give:</div>
                {breakdown.map(({ label, count }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${G.greenPale}`, fontSize: 15 }}>
                    <span>{label}</span><span style={{ fontWeight: "bold", color: G.green }}>× {count}</span>
                  </div>
                ))}
              </div>
            )}
            {!neg && <ActionBtn label="✓ Done — Change Given" color={G.green} onClick={() => setScreen("done")} />}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <Header title="☕ Café Order" sub="Tap items to add to order" onBack={onBack} />
      <div style={{ display: "flex", background: G.white, borderBottom: `2px solid ${G.greenPale}`, overflowX: "auto" }}>
        {categories.map((c, i) => (
          <button key={c.id} onClick={() => setTab(i)} style={{ flex: 1, padding: "12px 8px", border: "none", background: tab === i ? G.green : G.white, color: tab === i ? G.white : G.textLight, fontSize: 13, fontFamily: "Georgia,serif", fontWeight: tab === i ? "bold" : "normal", cursor: "pointer", whiteSpace: "nowrap", borderBottom: tab === i ? `3px solid ${G.amber}` : "none" }}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 16 }}>
        {(cat?.items || []).map(item => {
          const qty = order[item.id]?.qty || 0;
          const hasImg = Boolean(item.image);
          return (
            <button key={item.id} onClick={() => add(item)} style={{ background: G.white, borderRadius: 16, padding: 0, border: `2px solid ${qty > 0 ? G.green : G.greenPale}`, cursor: "pointer", boxShadow: qty > 0 ? "0 4px 12px rgba(45,90,39,0.25)" : "0 2px 8px rgba(0,0,0,0.06)", position: "relative", textAlign: "left", display: "flex", flexDirection: "column", alignItems: "stretch", overflow: "hidden", minHeight: hasImg ? 138 : undefined }}>
              {qty > 0 && <div style={{ position: "absolute", top: -8, right: -8, background: G.amber, color: G.white, borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: "bold", zIndex: 2 }}>{qty}</div>}
              {hasImg && (
                <div
                  aria-hidden
                  style={{ height: 92, flexShrink: 0, backgroundImage: `url(${item.image})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
                />
              )}
              <div style={{ padding: hasImg ? "12px 12px 14px" : "14px 12px", flex: 1, background: qty > 0 ? G.green : G.white, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: 14, fontWeight: "bold", color: qty > 0 ? G.white : G.text, marginBottom: 4, lineHeight: 1.3 }}>{item.name}</div>
                <div style={{ fontSize: 16, fontWeight: "bold", color: qty > 0 ? G.amberLight : G.amber, fontFamily: "monospace" }}>RM {item.price.toFixed(2)}</div>
              </div>
            </button>
          );
        })}
      </div>
      {orderItems.length > 0 && (
        <div style={{ background: G.white, margin: "0 16px 24px", borderRadius: 20, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 13, color: G.textLight, marginBottom: 10, fontStyle: "italic" }}>Current Order</div>
          {orderItems.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
              <div style={{ flex: 1, fontSize: 13 }}>{item.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {["-", item.qty, "+"].map((v, i) => i === 1
                  ? <span key="q" style={{ fontSize: 15, fontWeight: "bold", minWidth: 22, textAlign: "center" }}>{v}</span>
                  : <button key={v} onClick={() => adj(item.id, i === 0 ? -1 : 1)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${G.greenPale}`, background: G.greenPale, color: G.green, fontSize: 16, cursor: "pointer", fontWeight: "bold" }}>{v}</button>
                )}
              </div>
              <div style={{ fontSize: 13, fontFamily: "monospace", color: G.amber, minWidth: 60, textAlign: "right" }}>RM {(item.price * item.qty).toFixed(2)}</div>
            </div>
          ))}
          <div style={{ borderTop: `1px dashed ${G.greenPale}`, margin: "12px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: "bold" }}>Total</span>
            <span style={{ fontSize: 26, fontWeight: "bold", color: G.green, fontFamily: "monospace" }}>RM {total.toFixed(2)}</span>
          </div>
          <ActionBtn label="Proceed to Payment →" color={G.green} onClick={() => setScreen("payment")} />
          <ActionBtn label="Clear Order" outline onClick={reset} />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PLANT PUBLIC VIEW
// ══════════════════════════════════════════════════════════════

function PlantCard({ plant, onBack }) {
  return (
    <div style={{ background: G.cream, minHeight: "100vh" }}>
      <Header title="🌿 Plant Info" onBack={onBack} />
      {plant.image && <img src={plant.image} alt={plant.name} style={{ width: "100%", height: 220, objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
      <div style={{ padding: "20px 20px 40px" }}>
        <div style={{ fontSize: 26, fontWeight: "bold", color: G.green, fontFamily: "Georgia,serif", marginBottom: 4 }}>{plant.name}</div>
        {plant.malay && <div style={{ fontSize: 15, color: G.brownLight, fontStyle: "italic", marginBottom: 18 }}>{plant.malay}</div>}
        {plant.description && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: "bold", color: G.amber, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>About</div>
            <div style={{ fontSize: 15, color: G.text, lineHeight: 1.75 }}>{plant.description}</div>
          </div>
        )}
        {plant.care && (
          <div style={{ background: G.greenPale, borderRadius: 16, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: "bold", color: G.green, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>💧 Care Tips</div>
            <div style={{ fontSize: 14, color: G.text, lineHeight: 1.75 }}>{plant.care}</div>
          </div>
        )}
        {plant.uses && (
          <div style={{ background: "#FFF8EE", borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: "bold", color: G.amber, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>🌟 Uses</div>
            <div style={{ fontSize: 14, color: G.text, lineHeight: 1.75 }}>{plant.uses}</div>
          </div>
        )}
        <div style={{ marginTop: 28, textAlign: "center", fontSize: 12, color: G.textLight, fontStyle: "italic" }}>🌿 PKKAIP Community Garden, Puchong</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// GARDEN LIST
// ══════════════════════════════════════════════════════════════

function GardenScreen({ onBack, plants }) {
  const [selected, setSelected] = useState(null);
  if (selected) return <PlantCard plant={selected} onBack={() => setSelected(null)} />;
  return (
    <div>
      <Header title="🌱 Garden Plants" sub="PKKAIP Community Garden" onBack={onBack} />
      <div style={{ padding: 16 }}>
        {plants.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: G.textLight }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🌿</div>
            <div style={{ fontSize: 16, fontStyle: "italic" }}>No plants added yet.</div>
          </div>
        ) : plants.map(p => (
          <button key={p.id} onClick={() => setSelected(p)} style={{ width: "100%", background: G.white, borderRadius: 16, border: `1px solid ${G.greenPale}`, cursor: "pointer", marginBottom: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", textAlign: "left" }}>
            {p.image
              ? <img src={p.image} alt={p.name} style={{ width: 80, height: 80, objectFit: "cover", flexShrink: 0 }} onError={e => e.target.style.display = "none"} />
              : <div style={{ width: 80, height: 80, background: G.greenPale, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0 }}>🌿</div>
            }
            <div style={{ padding: "10px 14px" }}>
              <div style={{ fontSize: 16, fontWeight: "bold", color: G.green, fontFamily: "Georgia,serif", marginBottom: 2 }}>{p.name}</div>
              {p.malay && <div style={{ fontSize: 11, color: G.brownLight, fontStyle: "italic", marginBottom: 4 }}>{p.malay}</div>}
              <div style={{ fontSize: 12, color: G.textLight }}>{p.description?.slice(0, 60)}{p.description?.length > 60 ? "…" : ""}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// IMAGE PICKER — crop helpers (react-easy-crop)
// ══════════════════════════════════════════════════════════════

function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (err) => reject(err));
    if (String(url).startsWith("http://") || String(url).startsWith("https://")) {
      image.crossOrigin = "anonymous";
    }
    image.src = url;
  });
}

async function getCroppedImgDataUrl(imageSrc, pixelCrop) {
  if (!pixelCrop || pixelCrop.width < 1 || pixelCrop.height < 1) {
    throw new Error("Invalid crop");
  }
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );
  return canvas.toDataURL("image/png");
}

// ══════════════════════════════════════════════════════════════
// IMAGE PICKER
// ══════════════════════════════════════════════════════════════

function ImagePicker({ searchLabel, unsplashQuery, aspectRatio = 1, onSelect, onClose }) {
  const [phase, setPhase] = useState("pick");
  const [cropSrc, setCropSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [cropBusy, setCropBusy] = useState(false);

  const [images, setImages] = useState(null);
  const [customUrl, setCustomUrl] = useState("");
  const [loadedMap, setLoadedMap] = useState({});
  const fileRef = useRef(null);

  const displayName = searchLabel?.trim() || "this";

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const openCrop = (src) => {
    setCropSrc(src);
    setPhase("crop");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const backToPick = () => {
    setPhase("pick");
    setCropSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl === "string") {
        setCustomUrl("");
        openCrop(dataUrl);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropUse = async () => {
    if (!cropSrc || !croppedAreaPixels) return;
    setCropBusy(true);
    try {
      const dataUrl = await getCroppedImgDataUrl(cropSrc, croppedAreaPixels);
      onSelect(dataUrl);
    } catch (err) {
      console.error(err);
      alert("Could not crop this image. Try another photo or URL.");
    } finally {
      setCropBusy(false);
    }
  };

  useEffect(() => {
    const label = searchLabel?.trim() || "this";
    const searchQuery =
      unsplashQuery != null && String(unsplashQuery).trim() !== ""
        ? String(unsplashQuery).trim()
        : `${label} plant herb garden`.trim() || "nature";

    const apiKey = process.env.NEXT_PUBLIC_PEXELS_API_KEY;
    if (!apiKey) {
      console.error("NEXT_PUBLIC_PEXELS_API_KEY is not set");
      setImages([]);
      setLoadedMap({});
      return;
    }

    const ac = new AbortController();
    setImages(null);
    setLoadedMap({});
    setPhase("pick");
    setCropSrc(null);

    (async () => {
      try {
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=9`;
        const res = await fetch(url, {
          headers: { Authorization: apiKey },
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`Pexels ${res.status}`);
        const data = await res.json();
        const urls = (data.photos ?? [])
          .slice(0, 9)
          .map((p) => p.src?.medium)
          .filter(Boolean);
        if (!ac.signal.aborted) setImages(urls);
      } catch (e) {
        if (e.name === "AbortError") return;
        console.error(e);
        if (!ac.signal.aborted) setImages([]);
      }
    })();

    return () => ac.abort();
  }, [searchLabel, unsplashQuery]);

  const slots =
    images === null
      ? Array.from({ length: 9 }, () => null)
      : [...images, ...Array(Math.max(0, 9 - images.length)).fill(null)].slice(0, 9);

  const chosen = customUrl.trim();

  if (phase === "crop" && cropSrc) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ background: G.white, borderRadius: "20px 20px 0 0", padding: 20, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <button type="button" onClick={backToPick} style={{ background: "none", border: "none", color: G.green, fontSize: 15, fontWeight: "bold", cursor: "pointer", fontFamily: "Georgia,serif", textDecoration: "underline", padding: 0 }}>
              Back
            </button>
            <div style={{ fontSize: 16, fontWeight: "bold", fontFamily: "Georgia,serif", color: G.text }}>Crop photo</div>
            <button type="button" onClick={onClose} style={{ background: G.greenPale, border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: G.green, fontWeight: "bold", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ position: "relative", width: "100%", flex: 1, minHeight: 280, maxHeight: "56vh", background: "#1a1a1a", borderRadius: 12, overflow: "hidden" }}>
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspectRatio}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div style={{ fontSize: 11, color: G.textLight, fontStyle: "italic", textAlign: "center", marginTop: 10, marginBottom: 6 }}>Pinch or use scroll to zoom · drag to reposition</div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: "100%", marginBottom: 14, accentColor: G.green }}
          />
          <ActionBtn label={cropBusy ? "Working…" : "Crop & Use"} color={!croppedAreaPixels || cropBusy ? G.brownLight : G.green} onClick={() => { if (!croppedAreaPixels || cropBusy) return; handleCropUse(); }} />
          <ActionBtn label="Cancel" outline onClick={onClose} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ background: G.white, borderRadius: "20px 20px 0 0", padding: 20, maxHeight: "82vh", overflowY: "auto" }}>
        <style>{`
          @keyframes pkkaip-picker-shimmer {
            0%, 100% { background-color: #e5e5e5; }
            50% { background-color: #f3f3f3; }
          }
        `}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: "bold", fontFamily: "Georgia,serif", color: G.text }}>Choose a Photo</div>
          <button type="button" onClick={onClose} style={{ background: G.greenPale, border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: G.green, fontWeight: "bold", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: G.textLight, fontStyle: "italic", marginBottom: images === null ? 6 : 14 }}>Showing photos for "{displayName}" — tap one to select</div>
        {images === null && (
          <div style={{ fontSize: 11, color: G.textLight, marginBottom: 12, fontStyle: "italic", textAlign: "center", opacity: 0.9 }}>Searching photos…</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
          {images === null
            ? Array.from({ length: 9 }, (_, i) => (
              <div
                key={`shimmer-${i}`}
                aria-hidden
                style={{
                  aspectRatio: "1",
                  borderRadius: 12,
                  border: "3px solid transparent",
                  animation: "pkkaip-picker-shimmer 1.5s ease-in-out infinite",
                  animationDelay: `${i * 0.06}s`,
                }}
              />
            ))
            : slots.map((url, i) => (
              <div key={url ?? `slot-${i}`} onClick={() => url && openCrop(url)} style={{ aspectRatio: "1", borderRadius: 12, overflow: "hidden", border: "3px solid transparent", cursor: url ? "pointer" : "default", position: "relative", background: G.greenPale, opacity: url ? 1 : 0.85 }}>
                {url && (
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: loadedMap[i] ? "block" : "none" }}
                    onLoad={() => setLoadedMap(m => ({ ...m, [i]: true }))}
                  />
                )}
                {(!url || !loadedMap[i]) && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🌿</div>}
              </div>
            ))}
        </div>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        <button type="button" onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: "13px", borderRadius: 12, border: `2px dashed ${G.green}`, background: G.greenPale, color: G.green, fontSize: 15, cursor: "pointer", marginBottom: 14, fontFamily: "Georgia,serif" }}>
          📷 Upload your own photo
        </button>

        <div style={{ borderTop: `1px dashed ${G.greenPale}`, marginBottom: 14 }} />
        <div style={{ fontSize: 12, color: G.textLight, marginBottom: 6, fontStyle: "italic" }}>Or paste your own image link:</div>
        <input style={{ ...inp, marginBottom: 16 }} value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="https://example.com/photo.jpg" />

        {chosen ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: G.textLight, marginBottom: 6 }}>Preview:</div>
            <img src={chosen} alt="preview" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 12, border: `2px solid ${G.greenPale}` }} onError={e => e.target.style.opacity = 0.2} />
          </div>
        ) : null}
        <ActionBtn label={chosen ? "Continue to crop" : "Select a photo first"} color={chosen ? G.green : G.brownLight} onClick={() => chosen && openCrop(chosen)} />
        <ActionBtn label="Cancel" outline onClick={onClose} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// QR MODAL
// ══════════════════════════════════════════════════════════════

function QRModal({ plant, onClose }) {
  const plantPageUrl = `https://pkkaip.com/?plant=${plant.id}`;
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [saveImg, setSaveImg] = useState(null);
  const printRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(plantPageUrl, { width: 300, margin: 2 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch((err) => console.error(err));
    return () => { cancelled = true; };
  }, [plantPageUrl]);

  useEffect(() => {
    if (!qrDataUrl) {
      setSaveImg(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      const el = printRef.current;
      if (!el || cancelled) return;
      html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
      })
        .then((canvas) => {
          if (!cancelled) setSaveImg(canvas.toDataURL("image/png"));
        })
        .catch((err) => console.error(err));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [qrDataUrl, plant.name, plant.malay]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: G.white, borderRadius: 24, padding: 28, textAlign: "center", width: "100%", maxWidth: 340 }}>
        <div style={{ display: "inline-block", position: "relative", maxWidth: "100%", verticalAlign: "top", marginBottom: 8 }}>
          {qrDataUrl ? (
            <>
              <div ref={printRef} aria-hidden={saveImg ? true : undefined} style={{ textAlign: "center", padding: "0 4px", boxSizing: "border-box" }}>
                <img src={qrDataUrl} alt="" style={{ width: 200, height: 200, border: `4px solid ${G.greenPale}`, borderRadius: 16, marginBottom: 16, objectFit: "contain", display: "block", marginLeft: "auto", marginRight: "auto" }} />
                <div style={{ fontSize: 22, fontWeight: "bold", color: G.green, fontFamily: "Georgia,serif", lineHeight: 1.2, marginBottom: plant.malay ? 6 : 8, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>{plant.name}</div>
                {plant.malay ? <div style={{ fontSize: 15, color: G.brownLight, fontStyle: "italic", fontFamily: "Georgia,serif", lineHeight: 1.35, marginBottom: 10, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>{plant.malay}</div> : null}
                <div style={{ fontSize: 12, color: G.textLight, fontStyle: "italic", marginBottom: 0, fontFamily: "Georgia,serif" }}>Scan to learn more 🌿</div>
              </div>
              {saveImg ? (
                <img
                  src={saveImg}
                  alt={`${plant.name} — QR`}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    zIndex: 1,
                    WebkitTouchCallout: "default",
                  }}
                />
              ) : null}
            </>
          ) : (
            <div style={{ width: 200, height: 200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", border: `4px solid ${G.greenPale}`, borderRadius: 16, background: G.greenPale, color: G.green, fontSize: 14, fontStyle: "italic" }}>Loading QR…</div>
          )}
        </div>
        <ActionBtn label="Close" outline onClick={onClose} />
        <div style={{ fontSize: 10, color: G.textLight, fontStyle: "italic", marginTop: 16, lineHeight: 1.5, textAlign: "center", fontFamily: "Georgia,serif", wordBreak: "break-all" }}>
          <div>Hold down on the image to save</div>
          <div style={{ marginTop: 10 }}>{plantPageUrl}</div>
          <div style={{ marginTop: 10 }}>📸 Screenshot this to print the QR sticker</div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ADMIN — PLANT MANAGEMENT
// ══════════════════════════════════════════════════════════════

function PlantAdmin({ plants, setPlants, onBack }) {
  const [view, setView] = useState("list");
  const [editPlant, setEditPlant] = useState(null);
  const [form, setForm] = useState({ name: "", malay: "", description: "", care: "", uses: "", image: "" });
  const [showPicker, setShowPicker] = useState(false);
  const [showQR, setShowQR] = useState(null);

  const ff = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  const openAdd = () => { setEditPlant(null); setForm({ name: "", malay: "", description: "", care: "", uses: "", image: "" }); setView("form"); };
  const openEdit = p => { setEditPlant(p); setForm({ name: p.name, malay: p.malay || "", description: p.description || "", care: p.care || "", uses: p.uses || "", image: p.image || "" }); setView("form"); };

  const save = async () => {
    if (!form.name.trim()) return;
    if (editPlant) {
      const { error } = await supabase.from("plants").update({ ...form }).eq("id", editPlant.id);
      if (error) { alert(error.message); return; }
      setPlants(ps => ps.map(p => p.id === editPlant.id ? { ...p, ...form } : p));
    } else {
      const { data, error } = await supabase.from("plants").insert({ ...form }).select().single();
      if (error) { alert(error.message); return; }
      setPlants(ps => [...ps, plantFromRow(data)]);
    }
    setView("list");
  };

  const del = async () => {
    const { error } = await supabase.from("plants").delete().eq("id", editPlant.id);
    if (error) { alert(error.message); return; }
    setPlants(ps => ps.filter(p => p.id !== editPlant.id));
    setView("list");
  };

  if (view === "form") return (
    <div>
      <Header title={editPlant ? "Edit Plant" : "Add New Plant"} onBack={() => setView("list")} />
      {showPicker && (
        <ImagePicker
          searchLabel={form.name || "plant"}
          aspectRatio={16 / 9}
          onSelect={url => { setForm(f => ({ ...f, image: url })); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {showQR && <QRModal plant={showQR} onClose={() => setShowQR(null)} />}
      <div style={{ padding: 20 }}>
        <label style={lbl}>Plant Name (English) *</label>
        <input style={inp} value={form.name} onChange={ff("name")} placeholder="e.g. Rosemary" />

        <label style={lbl}>Name in Bahasa Malaysia</label>
        <input style={inp} value={form.malay} onChange={ff("malay")} placeholder="e.g. Pokok Rosemari" />

        <label style={lbl}>About this plant</label>
        <textarea style={{ ...inp, height: 85, resize: "none" }} value={form.description} onChange={ff("description")} placeholder="A short description of this plant…" />

        <label style={lbl}>💧 Care Tips</label>
        <textarea style={{ ...inp, height: 85, resize: "none" }} value={form.care} onChange={ff("care")} placeholder="e.g. Water twice a week. Needs full sunlight." />

        <label style={lbl}>🌟 Uses</label>
        <textarea style={{ ...inp, height: 70, resize: "none" }} value={form.uses} onChange={ff("uses")} placeholder="e.g. Used in cooking and herbal medicine." />

        <label style={lbl}>Photo</label>
        {form.image && <img src={form.image} alt="" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 12, marginBottom: 10 }} onError={e => e.target.style.display = "none"} />}
        <button onClick={() => form.name.trim() ? setShowPicker(true) : alert("Please enter the plant name first so we can find photos for it!")}
          style={{ width: "100%", padding: "13px", borderRadius: 12, border: `2px dashed ${G.green}`, background: G.greenPale, color: G.green, fontSize: 14, cursor: "pointer", marginBottom: 20, fontFamily: "Georgia,serif" }}>
          {form.image ? "🔄 Change Photo" : "📷 Choose Photo"}
        </button>

        <ActionBtn label="💾 Save Plant" color={G.green} onClick={save} />
        {editPlant && <>
          <ActionBtn label="Show QR code" color={G.amber} onClick={() => setShowQR(editPlant)} />
          <ActionBtn label="🗑 Delete Plant" color={G.red} onClick={del} />
        </>}
        <ActionBtn label="Cancel" outline onClick={() => setView("list")} />
      </div>
    </div>
  );

  return (
    <div>
      <Header title="🌿 Manage Plants" sub="Tap a plant to edit" onBack={onBack} />
      {showQR && <QRModal plant={showQR} onClose={() => setShowQR(null)} />}
      <div style={{ padding: 16 }}>
        {plants.length === 0
          ? <div style={{ textAlign: "center", padding: "40px 0", color: G.textLight, fontStyle: "italic" }}>No plants yet. Add your first one!</div>
          : plants.map(p => (
            <div key={p.id} style={{ background: G.white, borderRadius: 14, marginBottom: 10, border: `1px solid ${G.greenPale}`, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden", display: "flex", alignItems: "stretch" }}>
              <button onClick={() => openEdit(p)} style={{ flex: 1, display: "flex", alignItems: "center", cursor: "pointer", background: "none", border: "none", textAlign: "left", padding: 0 }}>
                {p.image
                  ? <img src={p.image} alt="" style={{ width: 70, height: 70, objectFit: "cover", flexShrink: 0 }} onError={e => e.target.style.display = "none"} />
                  : <div style={{ width: 70, height: 70, background: G.greenPale, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🌿</div>
                }
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 15, fontWeight: "bold", color: G.green, fontFamily: "Georgia,serif" }}>{p.name}</div>
                  {p.malay && <div style={{ fontSize: 11, color: G.brownLight, fontStyle: "italic" }}>{p.malay}</div>}
                </div>
              </button>
              <button type="button" onClick={() => setShowQR(p)} style={{ background: G.white, border: `2px solid ${G.green}`, borderRadius: 10, padding: "6px 12px", margin: "8px 12px 8px 0", cursor: "pointer", color: G.green, fontSize: 12, fontWeight: "bold", flexShrink: 0, fontFamily: "Georgia,serif", alignSelf: "center" }} title="Show QR Code">
                QR
              </button>
            </div>
          ))
        }
        <ActionBtn label="+ Add New Plant" color={G.green} onClick={openAdd} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ADMIN — MENU MANAGEMENT
// ══════════════════════════════════════════════════════════════

function MenuAdmin({ categories, setCategories, onBack }) {
  const [view, setView] = useState("list");
  const [editCat, setEditCat] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [catForm, setCatForm] = useState({ name: "", emoji: "🍽️" });
  const [itemForm, setItemForm] = useState({ name: "", price: "", image: "" });
  const [showPicker, setShowPicker] = useState(false);

  const EMOJIS = ["🍽️","🥗","🍜","🥤","🧁","🍱","🥞","🫖","🍛","🥙","🧆","🍰"];

  const saveItem = async () => {
    if (!itemForm.name.trim() || !itemForm.price) return;
    const price = parseFloat(itemForm.price);
    const image = itemForm.image?.trim() || "";
    if (editItem) {
      const { error } = await supabase.from("menu_items").update({ name: itemForm.name, price, image }).eq("id", editItem.id);
      if (error) { alert(error.message); return; }
      setCategories(cats => cats.map(c => {
        if (c.id !== editCat.id) return c;
        return { ...c, items: c.items.map(i => i.id === editItem.id ? { ...i, name: itemForm.name, price, image } : i) };
      }));
    } else {
      const sort_order = (categories.find(c => c.id === editCat.id)?.items.length) ?? 0;
      const { data, error } = await supabase.from("menu_items").insert({ category_id: editCat.id, name: itemForm.name, price, sort_order, image }).select().single();
      if (error) { alert(error.message); return; }
      setCategories(cats => cats.map(c => {
        if (c.id !== editCat.id) return c;
        return { ...c, items: [...c.items, { id: data.id, name: data.name, price: Number(data.price), image: data.image ?? "" }] };
      }));
    }
    setView("editCat");
  };

  const delItem = async (catId, itemId) => {
    const { error } = await supabase.from("menu_items").delete().eq("id", itemId);
    if (error) { alert(error.message); return; }
    setCategories(cats => cats.map(c => c.id !== catId ? c : { ...c, items: c.items.filter(i => i.id !== itemId) }));
  };
  const delCat = async () => {
    const { error: e1 } = await supabase.from("menu_items").delete().eq("category_id", editCat.id);
    if (e1) { alert(e1.message); return; }
    const { error: e2 } = await supabase.from("menu_categories").delete().eq("id", editCat.id);
    if (e2) { alert(e2.message); return; }
    setCategories(cats => cats.filter(c => c.id !== editCat.id));
    setView("list");
  };

  const addCat = async () => {
    if (!catForm.name.trim()) return;
    const sort_order = categories.length;
    const { data, error } = await supabase.from("menu_categories").insert({ label: catForm.name, emoji: catForm.emoji, sort_order }).select().single();
    if (error) { alert(error.message); return; }
    setCategories(cats => [...cats, { id: data.id, label: data.label, emoji: data.emoji, items: [] }]);
    setCatForm({ name: "", emoji: "🍽️" });
    setView("list");
  };

  if (view === "addCat") return (
    <div>
      <Header title="Add New Category" onBack={() => setView("list")} />
      <div style={{ padding: 20 }}>
        <label style={lbl}>Category Name</label>
        <input style={inp} value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Lunch, Snacks" />
        <label style={lbl}>Choose an Emoji</label>
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {EMOJIS.map(e => (
            <button key={e} onClick={() => setCatForm(f => ({ ...f, emoji: e }))} style={{ fontSize: 26, background: catForm.emoji === e ? G.greenPale : "none", border: `2px solid ${catForm.emoji === e ? G.green : G.greenPale}`, borderRadius: 10, padding: "6px 8px", cursor: "pointer" }}>{e}</button>
          ))}
        </div>
        <ActionBtn label="Add Category" color={G.green} onClick={addCat} />
        <ActionBtn label="Cancel" outline onClick={() => setView("list")} />
      </div>
    </div>
  );

  if (view === "itemForm") return (
    <div>
      <Header title={editItem ? "Edit Item" : "Add Item"} onBack={() => setView("editCat")} />
      {showPicker && (
        <ImagePicker
          searchLabel={itemForm.name || "food"}
          unsplashQuery={itemForm.name.trim() || "food"}
          aspectRatio={1}
          onSelect={url => { setItemForm(f => ({ ...f, image: url })); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
      <div style={{ padding: 20 }}>
        <label style={lbl}>Item Name</label>
        <input style={inp} value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Nasi Lemak" />
        <label style={lbl}>Price (RM)</label>
        <input style={inp} type="number" inputMode="decimal" value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))} placeholder="e.g. 5.00" />
        <label style={lbl}>Photo</label>
        {itemForm.image && <img src={itemForm.image} alt="" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 12, marginBottom: 10 }} onError={e => { e.target.style.display = "none"; }} />}
        <button onClick={() => itemForm.name.trim() ? setShowPicker(true) : alert("Please enter the item name first so we can find photos for it!")}
          style={{ width: "100%", padding: "13px", borderRadius: 12, border: `2px dashed ${G.green}`, background: G.greenPale, color: G.green, fontSize: 14, cursor: "pointer", marginBottom: 20, fontFamily: "Georgia,serif" }}>
          {itemForm.image ? "🔄 Change Photo" : "📷 Choose Photo"}
        </button>
        <ActionBtn label="Save" color={G.green} onClick={saveItem} />
        {editItem && <ActionBtn label="Delete Item" color={G.red} onClick={async () => { await delItem(editCat.id, editItem.id); setView("editCat"); }} />}
        <ActionBtn label="Cancel" outline onClick={() => setView("editCat")} />
      </div>
    </div>
  );

  if (view === "editCat") {
    const cat = categories.find(c => c.id === editCat?.id);
    return (
      <div>
        <Header title={`${cat?.emoji} ${cat?.label}`} sub="Tap item to edit" onBack={() => setView("list")} />
        <div style={{ padding: 16 }}>
          {(cat?.items || []).map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", background: G.white, borderRadius: 12, padding: "12px 14px", marginBottom: 10, border: `1px solid ${G.greenPale}`, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: "bold", color: G.text }}>{item.name}</div>
                <div style={{ fontSize: 13, color: G.amber, fontFamily: "monospace" }}>RM {item.price.toFixed(2)}</div>
              </div>
              <button onClick={() => { setEditItem(item); setItemForm({ name: item.name, price: String(item.price), image: item.image || "" }); setView("itemForm"); }} style={{ background: G.greenPale, border: "none", borderRadius: 8, padding: "6px 14px", color: G.green, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>Edit</button>
            </div>
          ))}
          <ActionBtn label="+ Add Item" color={G.green} onClick={() => { setEditItem(null); setItemForm({ name: "", price: "", image: "" }); setView("itemForm"); }} />
          <ActionBtn label="Delete This Category" color={G.red} onClick={delCat} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="☕ Manage Menu" sub="Tap category to edit" onBack={onBack} />
      <div style={{ padding: 16 }}>
        {categories.map(cat => (
          <button key={cat.id} onClick={() => { setEditCat(cat); setView("editCat"); }} style={{ width: "100%", background: G.white, borderRadius: 14, padding: "14px 16px", border: `1px solid ${G.greenPale}`, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", textAlign: "left" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: "bold", color: G.text, fontFamily: "Georgia,serif" }}>{cat.emoji} {cat.label}</div>
              <div style={{ fontSize: 12, color: G.textLight }}>{cat.items.length} item{cat.items.length !== 1 ? "s" : ""}</div>
            </div>
            <span style={{ fontSize: 22, color: G.greenLight }}>›</span>
          </button>
        ))}
        <ActionBtn label="+ Add New Category" color={G.amber} onClick={() => setView("addCat")} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ADMIN — LOGO MANAGEMENT
// ══════════════════════════════════════════════════════════════

function LogoAdmin({ logo, setLogo, onBack }) {
  const [preview, setPreview] = useState(logo || null);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (preview) {
      const { error } = await supabase.from("app_settings").upsert({ key: "logo", value: preview }, { onConflict: "key" });
      if (error) { alert(error.message); return; }
      setLogo(preview);
    }
    onBack();
  };

  const reset = async () => {
    const { error } = await supabase.from("app_settings").delete().eq("key", "logo");
    if (error) { alert(error.message); return; }
    setLogo(null);
    setPreview(null);
    onBack();
  };

  return (
    <div>
      <Header title="🖼️ Change Logo" onBack={onBack} />
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 13, color: G.textLight, fontStyle: "italic", marginBottom: 20, textAlign: "center" }}>
          Upload a new logo image or paste an image link below
        </div>

        {/* Current preview */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          {preview
            ? <img src={preview} alt="Logo preview" style={{ width: 140, height: 140, borderRadius: "50%", objectFit: "cover", border: `3px solid ${G.green}`, boxShadow: "0 4px 16px rgba(45,90,39,0.2)" }} onError={e => e.target.style.opacity = 0.2} />
            : <div style={{ width: 140, height: 140, borderRadius: "50%", background: G.greenPale, border: `3px dashed ${G.green}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>🌿</div>
          }
          <div style={{ fontSize: 12, color: G.textLight, marginTop: 8, fontStyle: "italic" }}>Preview (shown as circle on home screen)</div>
        </div>

        {/* Upload from phone */}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        <button onClick={() => fileRef.current.click()} style={{ width: "100%", padding: "13px", borderRadius: 12, border: `2px dashed ${G.green}`, background: G.greenPale, color: G.green, fontSize: 15, cursor: "pointer", marginBottom: 14, fontFamily: "Georgia,serif" }}>
          📷 Upload Photo from Phone
        </button>

        {/* Or paste URL */}
        <label style={lbl}>Or paste an image link:</label>
        <input style={inp} value={urlInput} onChange={e => { setUrlInput(e.target.value); setPreview(e.target.value); }} placeholder="https://example.com/logo.png" />

        <ActionBtn label="✓ Save Logo" color={G.green} onClick={save} />
        {logo && <ActionBtn label="Reset to Original Logo" color={G.red} onClick={reset} />}
        <ActionBtn label="Cancel" outline onClick={onBack} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ADMIN HOME
// ══════════════════════════════════════════════════════════════

function AdminScreen({ onBack, categories, setCategories, plants, setPlants, logo, setLogo }) {
  const [view, setView] = useState("home");
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [error, setError] = useState(false);

  if (!unlocked) return (
    <div>
      <Header title="⚙️ Admin" onBack={onBack} />
      <div style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: "bold", color: G.green, fontFamily: "Georgia,serif", marginBottom: 6 }}>Admin Access</div>
        <div style={{ fontSize: 13, color: G.textLight, fontStyle: "italic", marginBottom: 28 }}>Enter the admin password to continue</div>
        <input
          type="password" autoFocus
          value={pwInput}
          onChange={e => { setPwInput(e.target.value); setError(false); }}
          onKeyDown={e => { if (e.key === "Enter") { if (pwInput === ADMIN_PASSWORD) setUnlocked(true); else setError(true); } }}
          placeholder="Password"
          style={{ ...inp, textAlign: "center", fontSize: 22, letterSpacing: 4, marginBottom: error ? 8 : 20 }}
        />
        {error && <div style={{ color: G.red, fontSize: 13, marginBottom: 16, fontStyle: "italic" }}>Wrong password. Please try again.</div>}
        <ActionBtn label="Enter" color={G.green} onClick={() => { if (pwInput === ADMIN_PASSWORD) setUnlocked(true); else setError(true); }} />
        <ActionBtn label="Cancel" outline onClick={onBack} />
      </div>
    </div>
  );

  if (view === "menu") return <MenuAdmin categories={categories} setCategories={setCategories} onBack={() => setView("home")} />;
  if (view === "plants") return <PlantAdmin plants={plants} setPlants={setPlants} onBack={() => setView("home")} />;
  if (view === "logo") return <LogoAdmin logo={logo} setLogo={setLogo} onBack={() => setView("home")} />;
  return (
    <div>
      <Header title="⚙️ Admin" sub="Manage your content" onBack={onBack} />
      <div style={{ padding: "28px 20px" }}>
        <div style={{ fontSize: 14, color: G.textLight, fontStyle: "italic", textAlign: "center", marginBottom: 28 }}>What would you like to manage?</div>
        <BigBtn emoji="☕" label="Manage Menu" sub="Add, edit or remove food & drink items" color={G.green} onClick={() => setView("menu")} />
        <BigBtn emoji="🌿" label="Manage Plants" sub="Add plants & generate QR codes" color={G.amber} onClick={() => setView("plants")} />
        <BigBtn emoji="🖼️" label="Change Logo" sub="Update the home screen logo" color={G.brownLight} onClick={() => setView("logo")} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════════

export default function App() {
  const [bootLoading, setBootLoading] = useState(true);
  const [screen, setScreen] = useState("home");
  const [categories, setCategories] = useState([]);
  const [plants, setPlants] = useState([]);
  const [logo, setLogo] = useState(null); // null = use built-in logo
  const [qrLanding, setQrLanding] = useState(() =>
    typeof window !== "undefined" && Boolean(new URLSearchParams(window.location.search).get("plant"))
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plantsQ = supabase.from("plants").select("*").order("id", { ascending: true });
        const catsQ = supabase.from("menu_categories").select("*").order("sort_order", { ascending: true });
        const itemsQ = supabase.from("menu_items").select("*").order("sort_order", { ascending: true });
        const logoQ = supabase.from("app_settings").select("value").eq("key", "logo").maybeSingle();
        const [plantsRes, catsRes, itemsRes, logoRes] = await Promise.all([plantsQ, catsQ, itemsQ, logoQ]);
        if (cancelled) return;
        if (plantsRes.error) console.error(plantsRes.error);
        if (catsRes.error) console.error(catsRes.error);
        if (itemsRes.error) console.error(itemsRes.error);
        if (logoRes.error) console.error(logoRes.error);
        setPlants((plantsRes.data ?? []).map(plantFromRow));
        setCategories(categoriesFromJoin(catsRes.data ?? [], itemsRes.data ?? []));
        setLogo(logoRes.data?.value ?? null);
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (bootLoading) return;
    const id = new URLSearchParams(window.location.search).get("plant");
    if (!id) {
      setQrLanding(false);
      return;
    }
    setQrLanding(plants.some(p => String(p.id) === id));
  }, [bootLoading, plants]);

  if (bootLoading) return <LoadingScreen />;

  const params = new URLSearchParams(window.location.search);
  const plantId = params.get("plant");
  const qrPlant = plantId ? plants.find(p => String(p.id) === plantId) : null;

  if (qrLanding && qrPlant) {
    return (
      <div style={{ fontFamily: "Georgia,serif", background: G.cream, minHeight: "100vh", maxWidth: 430, margin: "0 auto" }}>
        <PlantCard
          plant={qrPlant}
          onBack={() => {
            setQrLanding(false);
            setScreen("garden");
            window.history.replaceState({}, "", "/");
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Georgia,serif", background: G.cream, minHeight: "100vh", maxWidth: 430, margin: "0 auto" }}>
      {screen === "home"   && <HomeScreen onNav={setScreen} logo={logo} />}
      {screen === "cafe"   && <CafeScreen onBack={() => setScreen("home")} categories={categories} />}
      {screen === "garden" && <GardenScreen onBack={() => setScreen("home")} plants={plants} />}
      {screen === "admin"  && <AdminScreen onBack={() => setScreen("home")} categories={categories} setCategories={setCategories} plants={plants} setPlants={setPlants} logo={logo} setLogo={setLogo} />}
    </div>
  );
}
