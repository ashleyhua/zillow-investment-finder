import { useState, useRef, useEffect, useCallback } from "react";

const API_BASE = "https://zillow-backend-oikm.onrender.com";

const HOME_TYPES = [
  { value: "", label: "Any type" },
  { value: "Houses", label: "🏠 Houses" },
  { value: "Condos", label: "🏢 Condos" },
  { value: "Townhomes", label: "🏘 Townhomes" },
  { value: "Multi-family", label: "🏗 Multi-family" },
  { value: "Lots", label: "🌿 Lots / Land" },
  { value: "Apartments", label: "🏙 Apartments" },
  { value: "Manufactured", label: "🚐 Manufactured" },
];

const DAYS_ON_ZILLOW = [
  { value: "", label: "Any time" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
];

const BEDS    = ["Any", "1+", "2+", "3+", "4+", "5+"];
const BATHS   = ["Any", "1+", "1.5+", "2+", "3+", "4+"];
const PARKING = ["Any", "1+", "2+", "3+"];

const scoreConfig = {
  excellent: { label: "Excellent ≥1%", color: "#14532d", bg: "#dcfce7", border: "#86efac", pin: "#16a34a" },
  good:      { label: "Good ≥0.8%",    color: "#14532d", bg: "#f0fdf4", border: "#4ade80", pin: "#4ade80" },
  fair:      { label: "Fair ≥0.6%",    color: "#713f12", bg: "#fefce8", border: "#fde047", pin: "#eab308" },
  poor:      { label: "Poor <0.6%",    color: "#7f1d1d", bg: "#fef2f2", border: "#fca5a5", pin: "#ef4444" },
  unknown:   { label: "No Rent Data",  color: "#374151", bg: "#f3f4f6", border: "#d1d5db", pin: "#9ca3af" },
};

function fmt(n) {
  if (n == null || n === "") return "—";
  return "$" + Number(n).toLocaleString();
}

const inputStyle = {
  padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db",
  fontSize: 14, background: "#fff", color: "#111827", outline: "none",
  width: "100%", boxSizing: "border-box",
};
const selectStyle = { ...inputStyle, cursor: "pointer", color: "#111827" };
const labelStyle = {
  fontSize: 11, fontWeight: 700, color: "#6b7280",
  textTransform: "uppercase", letterSpacing: "0.06em",
  marginBottom: 5, display: "block",
};

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase",
      letterSpacing: "0.08em", margin: "20px 0 12px",
      borderBottom: "1px solid #f1f5f9", paddingBottom: 6,
    }}>{children}</div>
  );
}

function Toggle({ label, value, onChange, icon }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "8px 12px", borderRadius: 8,
      border: `1.5px solid ${value ? "#0f172a" : "#e2e8f0"}`,
      background: value ? "#0f172a" : "#fff",
      color: value ? "#fff" : "#374151",
      fontSize: 13, fontWeight: 500, cursor: "pointer",
      transition: "all 0.15s", whiteSpace: "nowrap",
    }}>
      <span>{icon}</span> {label}
    </button>
  );
}

// ── PIN Modal ────────────────────────────────────────────────
function PinModal({ title, onConfirm, onCancel }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!pin.trim()) { setError("Please enter your PIN"); return; }
    onConfirm(pin.trim());
    setError("");
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: 28, width: 340,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 17, color: "#111827" }}>🔒 {title}</h3>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6b7280" }}>Enter your PIN to continue.</p>
        <input
          type="password"
          autoFocus
          style={{ ...inputStyle, marginBottom: 10 }}
          placeholder="Enter PIN"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
        />
        {error && <p style={{ margin: "0 0 10px", fontSize: 12, color: "#dc2626" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "9px", borderRadius: 8, border: "1px solid #e2e8f0",
            background: "#fff", color: "#374151", fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={handleSubmit} style={{
            flex: 1, padding: "9px", borderRadius: 8, border: "none",
            background: "#0f172a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── Map ──────────────────────────────────────────────────────
function PropertyMap({ listings, selectedZpid, onSelectPin }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = React.useRef({});
  const [leafletReady, setLeafletReady] = useState(false);

  // Load Leaflet CSS + JS, set ready when done
  useEffect(() => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css"; link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    if (window.L) { setLeafletReady(true); return; }
    if (!document.getElementById("leaflet-js")) {
      const script = document.createElement("script");
      script.id = "leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => setLeafletReady(true);
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.L) { clearInterval(interval); setLeafletReady(true); }
      }, 100);
      setTimeout(() => clearInterval(interval), 10000);
    }
  }, []);

  // Init map only after Leaflet is ready
  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapInstanceRef.current) return;
    const L = window.L;
    if (mapRef.current._leaflet_id) mapRef.current._leaflet_id = null;
    try {
      const map = L.map(mapRef.current, { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19,
      }).addTo(map);
      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    } catch(e) { console.warn("Map init error:", e); }
  }, [leafletReady]);

  // Update markers when listings change
  useEffect(() => {
    if (!leafletReady) return;
    const L = window.L;
    if (!L || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    setTimeout(() => map.invalidateSize(), 100);
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};
    const valid = listings.filter(p => p.latitude && p.longitude);
    if (!valid.length) return;
    const bounds = [];
    valid.forEach(p => {
      const score = scoreConfig[p.score] || scoreConfig.unknown;
      const color = score.pin;
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${color};border:2px solid white;border-radius:50%;width:14px;height:14px;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:pointer;"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      const marker = L.marker([p.latitude, p.longitude], { icon });
      const ratio = p.ratio != null ? p.ratio.toFixed(3) + "%" : "—";
      marker.bindPopup(`
        <div style="font-family:sans-serif;min-width:200px">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#111">${p.address}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px">
            <div><span style="color:#6b7280">Price</span><br/><b>${fmt(p.price)}</b></div>
            <div><span style="color:#6b7280">Rent/mo</span><br/><b>${fmt(p.rentZestimate)}</b></div>
            <div><span style="color:#6b7280">Zestimate</span><br/><b>${fmt(p.zestimate)}</b></div>
            <div><span style="color:#6b7280">Ratio</span><br/><b style="color:${color}">${ratio}</b></div>
          </div>
          <a href="${p.detailUrl}" target="_blank" style="display:block;margin-top:8px;text-align:center;background:#0f172a;color:#fff;padding:5px;border-radius:6px;font-size:12px;text-decoration:none">View on Zillow ↗</a>
        </div>
      `);
      marker.on("click", () => onSelectPin(p.zpid));
      marker.addTo(map);
      markersRef.current[p.zpid] = marker;
      bounds.push([p.latitude, p.longitude]);
    });
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [30, 30] });
      setTimeout(() => map.invalidateSize(), 300);
    }
  }, [listings, leafletReady]);

  // Highlight selected marker
  useEffect(() => {
    if (!leafletReady) return;
    const L = window.L;
    if (!L || !selectedZpid) return;
    Object.entries(markersRef.current).forEach(([zpid, marker]) => {
      const p = listings.find(l => l.zpid === zpid);
      if (!p) return;
      const score = scoreConfig[p.score] || scoreConfig.unknown;
      const isSelected = zpid === selectedZpid;
      const size = isSelected ? 20 : 14;
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${score.pin};border:${isSelected ? "3px solid #0f172a" : "2px solid white"};border-radius:50%;width:${size}px;height:${size}px;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:pointer;"></div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });
      marker.setIcon(icon);
      if (isSelected) { marker.openPopup(); mapInstanceRef.current.panTo(marker.getLatLng()); }
    });
  }, [selectedZpid]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%", borderRadius: 12, zIndex: 0 }} />;
}


// ── Property Card ────────────────────────────────────────────
function PropertyCard({ p, isSelected, onSelect, favoriteZpids, onFavoriteAction, showFavoriteControls = false, favoriteStatus }) {
  const score = scoreConfig[p.score] || scoreConfig.unknown;
  const ratioDisplay = p.ratio != null ? p.ratio.toFixed(3) + "%" : "—";
  const cardRef = useRef(null);
  const isFavorited = favoriteZpids?.has(p.zpid);

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isSelected]);

  return (
    <div ref={cardRef} style={{
      background: "#fff",
      border: isSelected ? "2px solid #0f172a" : "1px solid #e5e7eb",
      borderRadius: 14, overflow: "hidden",
      display: "flex", flexDirection: "column",
      transition: "box-shadow 0.2s, transform 0.2s",
      cursor: "pointer",
      boxShadow: isSelected ? "0 4px 20px rgba(0,0,0,0.15)" : "none",
      position: "relative",
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = isSelected ? "0 4px 20px rgba(0,0,0,0.15)" : "none"; e.currentTarget.style.transform = "none"; }}
      onClick={() => { onSelect?.(p.zpid); window.open(p.detailUrl, "_blank"); }}
    >
      {/* Star / favorite button */}
      <button
        onClick={e => { e.stopPropagation(); onFavoriteAction(p, isFavorited ? "remove" : "add"); }}
        title={isFavorited ? "Remove from favorites" : "Add to favorites"}
        style={{
          position: "absolute", top: 8, right: 8,
          background: isFavorited ? "#fef3c7" : "rgba(255,255,255,0.9)",
          border: isFavorited ? "1px solid #fcd34d" : "1px solid #e5e7eb",
          borderRadius: "50%", width: 32, height: 32,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", fontSize: 16, zIndex: 10,
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        }}
      >{isFavorited ? "⭐" : "☆"}</button>

      {p.imgSrc
        ? <img src={p.imgSrc} alt={p.address} style={{ width: "100%", height: 160, objectFit: "cover" }} />
        : <div style={{ width: "100%", height: 160, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>No image</div>
      }

      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            padding: "3px 8px", borderRadius: 99,
            background: score.bg, color: score.color, border: `1px solid ${score.border}`
          }}>{score.label}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: score.color }}>{ratioDisplay}</span>
        </div>

        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", lineHeight: 1.4 }}>{p.address}</p>

        {/* Price / Zestimate / Rent boxes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
          {[
            { label: "Price",     val: fmt(p.price) },
            { label: "Zestimate", val: fmt(p.zestimate) },
            { label: "Rent/mo",   val: p.rentZestimate ? fmt(p.rentZestimate) : "—" },
          ].map(({ label, val }) => (
            <div key={label} style={{ background: "#f9fafb", borderRadius: 6, padding: "6px 8px" }}>
              <p style={{ margin: 0, fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111827" }}>{val}</p>
            </div>
          ))}
        </div>

        {/* Property tax estimate */}
        {p.annualTax && (
          <div style={{ background: "#fafafa", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#374151", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>🏛 Est. Property Tax</span>
            <span style={{ fontWeight: 600 }}>{fmt(p.annualTax)}/yr · {fmt(p.monthlyTax)}/mo</span>
          </div>
        )}
        {p.taxRate && (
          <div style={{ fontSize: 10, color: "#9ca3af" }}>
            {p.isCityTax
              ? `${p.city} city rate (${(p.taxRate * 100).toFixed(2)}%)`
              : `${p.state} state avg rate (${(p.taxRate * 100).toFixed(2)}%) — city rate unavailable`
            }
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "#6b7280" }}>
          {p.bedrooms   && <span>🛏 {p.bedrooms} bd</span>}
          {p.bathrooms  && <span>🚿 {p.bathrooms} ba</span>}
          {p.livingArea && <span>📐 {Number(p.livingArea).toLocaleString()} sqft</span>}
          {p.daysOnZillow != null && <span>📅 {p.daysOnZillow}d listed</span>}
        </div>

        {p.hasOpenHouse && (
          <div style={{ background: "#eff6ff", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "#1d4ed8", fontWeight: 500 }}>
            🚪 Open House: {p.openHouseStartDate}
          </div>
        )}
        {p.statusText && <div style={{ fontSize: 10, color: "#6b7280" }}>{p.statusText}</div>}
        {p.priceChange && (
          <div style={{ fontSize: 11, color: p.priceChange < 0 ? "#15803d" : "#b91c1c", fontWeight: 600 }}>
            {p.priceChange < 0 ? "▼" : "▲"} Price changed {fmt(Math.abs(p.priceChange))}
          </div>
        )}

        {/* Favorites-specific action buttons */}
        {showFavoriteControls && (
          <div style={{ display: "flex", gap: 6, marginTop: 4 }} onClick={e => e.stopPropagation()}>
            {favoriteStatus === "saved" && (
              <button onClick={() => onFavoriteAction(p, "bought")} style={{
                flex: 1, padding: "6px", borderRadius: 6, border: "1px solid #86efac",
                background: "#f0fdf4", color: "#14532d", fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>🏠 Mark as Bought</button>
            )}
            {favoriteStatus === "bought" && (
              <button onClick={() => onFavoriteAction(p, "unsave")} style={{
                flex: 1, padding: "6px", borderRadius: 6, border: "1px solid #d1d5db",
                background: "#f9fafb", color: "#374151", fontSize: 11, cursor: "pointer",
              }}>↩ Move back to Saved</button>
            )}
            <button onClick={() => onFavoriteAction(p, "delete")} style={{
              padding: "6px 10px", borderRadius: 6, border: "1px solid #fca5a5",
              background: "#fef2f2", color: "#991b1b", fontSize: 11, cursor: "pointer",
            }}>🗑 Remove</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Favorites Tab ────────────────────────────────────────────
function FavoritesTab({ onFavoriteAction, favoriteZpids }) {
  const [favorites, setFavorites]       = useState({ saved: [], bought: [] });
  const [loading, setLoading]           = useState(true);
  const [addressInput, setAddressInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError]   = useState("");

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/favorites`);
      const data = await res.json();
      const saved  = data.filter(f => f.status === "saved").map(f => f.data);
      const bought = data.filter(f => f.status === "bought").map(f => f.data);
      setFavorites({ saved, bought });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFavorites(); }, [loadFavorites]);

  const handleLookup = async () => {
    if (!addressInput.trim()) return;
    setLookupLoading(true);
    setLookupError("");
    try {
      const res  = await fetch(`${API_BASE}/favorites/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addressInput }),
      });
      const data = await res.json();
      if (data.error) { setLookupError(data.error); return; }
      onFavoriteAction(data, "add", loadFavorites);
      setAddressInput("");
    } catch (e) {
      setLookupError("Failed to look up address");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleAction = (p, action) => {
    onFavoriteAction(p, action, loadFavorites);
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading favorites…</div>;

  const isEmpty = favorites.saved.length === 0 && favorites.bought.length === 0;

  // Group listings by state, sorted by ratio within each state
  const groupByState = (listings) => {
    const groups = {};
    listings.forEach(p => {
      const state = p.state || "Unknown";
      if (!groups[state]) groups[state] = [];
      groups[state].push(p);
    });
    // Sort within each state by ratio descending
    Object.keys(groups).forEach(state => {
      groups[state].sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));
    });
    // Sort states alphabetically
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  };

  const savedByState  = groupByState(favorites.saved);
  const boughtByState = groupByState(favorites.bought);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px" }}>

      {/* Add by address */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#111827" }}>➕ Add property by Zillow URL</h3>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Paste Zillow URL — e.g. https://www.zillow.com/homedetails/address/12345_zpid/"
            value={addressInput}
            onChange={e => setAddressInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLookup()}
          />
          <button onClick={handleLookup} disabled={lookupLoading || !addressInput.trim()} style={{
            padding: "9px 20px", borderRadius: 8, border: "none",
            background: lookupLoading ? "#94a3b8" : "#0f172a", color: "#fff",
            fontSize: 14, fontWeight: 600, cursor: lookupLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
          }}>{lookupLoading ? "Looking up…" : "Add"}</button>
        </div>
        {lookupError && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#dc2626" }}>{lookupError}</p>}
      </div>

      {isEmpty ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
          <p style={{ fontSize: 18, margin: "0 0 8px" }}>⭐</p>
          <p style={{ fontSize: 15, margin: 0 }}>No favorites yet</p>
          <p style={{ fontSize: 13, margin: "4px 0 0" }}>Star a listing from search results or add one by address above</p>
        </div>
      ) : (
        <>
          {/* ── Saved section ── */}
          {favorites.saved.length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
                ⭐ Saved
                <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>({favorites.saved.length} properties)</span>
              </h2>
              {savedByState.map(([state, props]) => (
                <div key={state} style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 10px" }}>
                      📍 {state}
                    </span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{props.length} {props.length === 1 ? "property" : "properties"} · sorted by ratio</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14 }}>
                    {props.map(p => (
                      <PropertyCard key={p.zpid} p={p} favoriteZpids={favoriteZpids}
                        onFavoriteAction={handleAction} showFavoriteControls favoriteStatus="saved" onSelect={() => {}} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Purchased section ── */}
          {favorites.bought.length > 0 && (
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
                🏠 Purchased
                <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>({favorites.bought.length} properties)</span>
              </h2>
              {boughtByState.map(([state, props]) => (
                <div key={state} style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 10px" }}>
                      📍 {state}
                    </span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{props.length} {props.length === 1 ? "property" : "properties"} · sorted by ratio</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14 }}>
                    {props.map(p => (
                      <PropertyCard key={p.zpid} p={p} favoriteZpids={favoriteZpids}
                        onFavoriteAction={handleAction} showFavoriteControls favoriteStatus="bought" onSelect={() => {}} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Lock Screen ──────────────────────────────────────────────
function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const handleSubmit = () => {
    if (pin.trim() === "lovemom") {
      onUnlock();
    } else {
      setError("Incorrect PIN");
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0f172a", fontFamily: "'Georgia', serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "40px 36px", width: 360,
        boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
        animation: shake ? "shake 0.4s ease" : "none",
      }}>
        <style>{`
          @keyframes shake {
            0%,100% { transform: translateX(0); }
            20% { transform: translateX(-8px); }
            40% { transform: translateX(8px); }
            60% { transform: translateX(-6px); }
            80% { transform: translateX(6px); }
          }
        `}</style>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏡</div>
          <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
            Zillow Investment Finder
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Enter your PIN to continue</p>
        </div>
        <input
          type="password"
          autoFocus
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10,
            border: `1.5px solid ${error ? "#fca5a5" : "#e2e8f0"}`,
            fontSize: 16, color: "#111827", background: "#fff",
            outline: "none", boxSizing: "border-box", marginBottom: 10,
            textAlign: "center", letterSpacing: "0.2em",
          }}
          placeholder="Enter PIN"
          value={pin}
          onChange={e => { setPin(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
        />
        {error && (
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#dc2626", textAlign: "center" }}>{error}</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={!pin.trim()}
          style={{
            width: "100%", padding: "12px", borderRadius: 10, border: "none",
            background: pin.trim() ? "#0f172a" : "#e2e8f0",
            color: pin.trim() ? "#fff" : "#94a3b8",
            fontSize: 15, fontWeight: 600,
            cursor: pin.trim() ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
        >Unlock</button>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState("search"); // "search" | "favorites"

  // Filter state
  const [location, setLocation]   = useState("");
  const [beds, setBeds]           = useState("");
  const [baths, setBaths]         = useState("");
  const [homeType, setHomeType]   = useState("");
  const [priceMin, setPriceMin]   = useState("");
  const [priceMax, setPriceMax]   = useState("");
  const [sqftMin, setSqftMin]     = useState("");
  const [sqftMax, setSqftMax]     = useState("");
  const [minLotSize, setMinLotSize] = useState("");
  const [hasPool, setHasPool]         = useState(false);
  const [hasGarage, setHasGarage]     = useState(false);
  const [hasBasement, setHasBasement] = useState(false);
  const [hasAC, setHasAC]             = useState(false);
  const [isWaterfront, setIsWaterfront] = useState(false);
  const [singleStory, setSingleStory]   = useState(false);
  const [parking, setParking]           = useState("");
  const [isNewConstruction, setIsNewConstruction]   = useState(false);
  const [isComingSoon, setIsComingSoon]             = useState(false);
  const [isForeclosure, setIsForeclosure]           = useState(false);
  const [isFSBO, setIsFSBO]                         = useState(false);
  const [is55Plus, setIs55Plus]                     = useState(false);
  const [hasOpenHouse, setHasOpenHouse]             = useState(false);
  const [has3DTour, setHas3DTour]                   = useState(false);
  const [onlyPriceReduction, setOnlyPriceReduction] = useState(false);
  const [yearBuiltMin, setYearBuiltMin]   = useState("");
  const [yearBuiltMax, setYearBuiltMax]   = useState("");
  const [maxHOA, setMaxHOA]               = useState("");
  const [minSchoolRating, setMinSchoolRating] = useState("");
  const [daysOnZillow, setDaysOnZillow]   = useState("");
  const [keywords, setKeywords]           = useState("");
  const [showFilters, setShowFilters]     = useState(false);

  // Results state
  const [sortBy, setSortBy]             = useState("ratio");
  const [onlyWithRent, setOnlyWithRent] = useState(true);
  const [showMap, setShowMap]           = useState(true);
  const [selectedZpid, setSelectedZpid] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [results, setResults]           = useState(null);
  const [allListings, setAllListings]   = useState([]);
  const [currentPage, setCurrentPage]   = useState(1);
  const [error, setError]               = useState(null);
  const lastPayloadRef                  = useRef({});

  // Favorites state
  const [favoriteZpids, setFavoriteZpids] = useState(new Set());
  const [pinModal, setPinModal]           = useState(null); // { action, property, callback }

  // Load favorite zpids on mount
  useEffect(() => {
    fetch(`${API_BASE}/favorites`)
      .then(r => r.json())
      .then(data => setFavoriteZpids(new Set(data.map(f => f.zpid))))
      .catch(() => {});
  }, []);

  // ── Favorite action handler ───────────────────────────────
  // All write operations show PIN modal first.
  const handleFavoriteAction = (property, action, onSuccess) => {
    if (action === "add") {
      setPinModal({ action, property, onSuccess });
    } else if (action === "remove") {
      setPinModal({ action: "delete", property, onSuccess });
    } else if (action === "bought") {
      setPinModal({ action: "bought", property, onSuccess });
    } else if (action === "unsave") {
      setPinModal({ action: "unsave", property, onSuccess });
    } else if (action === "delete") {
      setPinModal({ action: "delete", property, onSuccess });
    }
  };

  const executeWithPin = async (pin) => {
    const { action, property, onSuccess } = pinModal;
    setPinModal(null);

    try {
      let res;
      if (action === "add") {
        res = await fetch(`${API_BASE}/favorites`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, property }),
        });
      } else if (action === "bought") {
        res = await fetch(`${API_BASE}/favorites/${property.zpid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, status: "bought" }),
        });
      } else if (action === "unsave") {
        res = await fetch(`${API_BASE}/favorites/${property.zpid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, status: "saved" }),
        });
      } else if (action === "delete") {
        res = await fetch(`${API_BASE}/favorites/${property.zpid}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin }),
        });
      }

      const data = await res.json();
      if (data.error) { alert(data.error); return; }

      // Refresh favorite zpids
      const favRes = await fetch(`${API_BASE}/favorites`);
      const favData = await favRes.json();
      setFavoriteZpids(new Set(favData.map(f => f.zpid)));

      if (onSuccess) onSuccess();
    } catch (e) {
      alert("Something went wrong");
    }
  };

  // ── Search ────────────────────────────────────────────────
  const buildPayload = (page = 1) => {
    const p = { location, page };
    if (beds && beds !== "Any")   p.min_beds  = parseInt(beds);
    if (baths && baths !== "Any") p.min_baths = parseFloat(baths);
    if (homeType)    p.home_type      = homeType;
    if (priceMin)    p.min_price      = parseInt(priceMin);
    if (priceMax)    p.max_price      = parseInt(priceMax);
    if (sqftMin)     p.min_sqft       = parseInt(sqftMin);
    if (sqftMax)     p.max_sqft       = parseInt(sqftMax);
    if (minLotSize)  p.min_lot_size   = parseInt(minLotSize);
    if (parking && parking !== "Any") p.parking_spots = parseInt(parking);
    if (yearBuiltMin) p.year_built_min = parseInt(yearBuiltMin);
    if (yearBuiltMax) p.year_built_max = parseInt(yearBuiltMax);
    if (maxHOA)       p.max_hoa        = parseInt(maxHOA);
    if (minSchoolRating) p.min_school_rating = parseInt(minSchoolRating);
    if (daysOnZillow) p.days_on_zillow = daysOnZillow;
    if (keywords)     p.keywords       = keywords;
    if (hasPool)            p.has_pool             = true;
    if (hasGarage)          p.has_garage            = true;
    if (hasBasement)        p.has_basement          = true;
    if (hasAC)              p.has_ac                = true;
    if (isWaterfront)       p.is_waterfront         = true;
    if (singleStory)        p.single_story          = true;
    if (isNewConstruction)  p.is_new_construction   = true;
    if (isComingSoon)       p.is_coming_soon        = true;
    if (isForeclosure)      p.is_foreclosure        = true;
    if (isFSBO)             p.is_fsbo               = true;
    if (is55Plus)           p.is_55_plus            = true;
    if (hasOpenHouse)       p.has_open_house        = true;
    if (has3DTour)          p.has_3d_tour           = true;
    if (onlyPriceReduction) p.only_price_reduction  = true;
    return p;
  };

  const fetchPage = async (payload) => {
    const res  = await fetch(`${API_BASE}/search`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  const handleSearch = async () => {
    if (!location.trim()) return;
    setLoading(true); setError(null); setResults(null);
    setAllListings([]); setCurrentPage(1); setSelectedZpid(null);
    const payload = buildPayload(1);
    lastPayloadRef.current = payload;
    try {
      const data = await fetchPage(payload);
      setResults(data); setAllListings(data.results || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resultsTopRef = useRef(null);

  const handleLoadMore = async () => {
    const nextPage = currentPage + 1;
    setLoadingMore(true);
    try {
      const data = await fetchPage({ ...lastPayloadRef.current, page: nextPage });
      setAllListings(prev => [...prev, ...(data.results || [])]);
      setResults(data); setCurrentPage(nextPage);
      // Scroll back to top of results after new ones load
      setTimeout(() => {
        resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (e) { setError(e.message); }
    finally { setLoadingMore(false); }
  };

  const visibleListings = onlyWithRent ? allListings.filter(p => p.rentZestimate != null) : allListings;
  const sorted = [...visibleListings].sort((a, b) => {
    if (sortBy === "ratio")      return (b.ratio ?? -1) - (a.ratio ?? -1);
    if (sortBy === "price_asc")  return (a.price ?? 0) - (b.price ?? 0);
    if (sortBy === "price_desc") return (b.price ?? 0) - (a.price ?? 0);
    if (sortBy === "rent_desc")  return (b.rentZestimate ?? 0) - (a.rentZestimate ?? 0);
    if (sortBy === "newest")     return (a.daysOnZillow ?? 999) - (b.daysOnZillow ?? 999);
    return 0;
  });

  const hasMore = results?.max_pages != null ? currentPage < results.max_pages : results?.has_more;
  const hasResults = sorted.length > 0;

  const activeFilterCount = [
    beds && beds !== "Any", baths && baths !== "Any", homeType,
    priceMin, priceMax, sqftMin, sqftMax, minLotSize,
    hasPool, hasGarage, hasBasement, hasAC, isWaterfront, singleStory, parking && parking !== "Any",
    isNewConstruction, isComingSoon, isForeclosure, isFSBO, is55Plus, hasOpenHouse, has3DTour, onlyPriceReduction,
    yearBuiltMin, yearBuiltMax, maxHOA, minSchoolRating, daysOnZillow, keywords,
  ].filter(Boolean).length;

  const tabStyle = (tab) => ({
    padding: "8px 20px", borderRadius: 8, border: "none",
    background: activeTab === tab ? "#fff" : "transparent",
    color: activeTab === tab ? "#0f172a" : "#94a3b8",
    fontSize: 14, fontWeight: 600, cursor: "pointer",
    boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.15)" : "none",
    transition: "all 0.15s",
  });

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f8fafc", fontFamily: "'Georgia', serif" }}>

      {/* PIN modal overlay */}
      {pinModal && (
        <PinModal
          title={
            pinModal.action === "add" ? "Add to Favorites" :
            pinModal.action === "delete" ? "Remove from Favorites" :
            pinModal.action === "bought" ? "Mark as Purchased" :
            "Move back to Saved"
          }
          onConfirm={executeWithPin}
          onCancel={() => setPinModal(null)}
        />
      )}

      {/* Header */}
      <div style={{ background: "#0f172a", padding: "14px 24px", flexShrink: 0 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#f1f5f9" }}>🏡 Zillow Investment Finder</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Find properties where monthly rent ≥ 1% of purchase price · US only (City, State format)</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Tab switcher */}
            <div style={{ background: "#1e293b", borderRadius: 10, padding: 4, display: "flex", gap: 2 }}>
              <button style={tabStyle("search")} onClick={() => setActiveTab("search")}>🔍 Search</button>
              <button style={tabStyle("favorites")} onClick={() => setActiveTab("favorites")}>⭐ Favorites</button>
            </div>
            {activeTab === "search" && hasResults && (
              <button onClick={() => setShowMap(!showMap)} style={{
                padding: "8px 14px", borderRadius: 8, border: "1.5px solid #334155",
                background: showMap ? "#334155" : "transparent",
                color: "#f1f5f9", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>{showMap ? "🗺 Hide Map" : "🗺 Show Map"}</button>
            )}
          </div>
        </div>
      </div>

      {/* Search tab content */}
      {activeTab === "search" && (
        <>
          {/* Search panel */}
          <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "14px 24px", flexShrink: 0 }}>
            <div style={{ maxWidth: 1400, margin: "0 auto" }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <input
                  style={{ ...inputStyle, fontSize: 15, padding: "10px 14px", flex: 1 }}
                  placeholder="City, State (e.g. Miami, FL · Austin, TX · Chicago, IL)"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
                <select style={{ ...selectStyle, width: 130 }} value={beds} onChange={e => setBeds(e.target.value)}>
                  {BEDS.map(b => <option key={b} value={b === "Any" ? "" : b}>{b} beds</option>)}
                </select>
                <select style={{ ...selectStyle, width: 130 }} value={baths} onChange={e => setBaths(e.target.value)}>
                  {BATHS.map(b => <option key={b} value={b === "Any" ? "" : b}>{b} baths</option>)}
                </select>
                <select style={{ ...selectStyle, width: 150 }} value={homeType} onChange={e => setHomeType(e.target.value)}>
                  {HOME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select style={{ ...selectStyle, width: 140 }} value={daysOnZillow} onChange={e => setDaysOnZillow(e.target.value)}>
                  {DAYS_ON_ZILLOW.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <button onClick={() => setShowFilters(!showFilters)} style={{
                  padding: "10px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0",
                  background: showFilters ? "#f1f5f9" : "#fff", color: "#374151",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                  Filters {activeFilterCount > 0 && <span style={{ background: "#0f172a", color: "#fff", fontSize: 10, borderRadius: 99, padding: "1px 6px", marginLeft: 4 }}>{activeFilterCount}</span>}
                </button>
                <button onClick={handleSearch} disabled={loading || !location.trim()} style={{
                  padding: "10px 28px", borderRadius: 8, border: "none",
                  background: loading ? "#94a3b8" : "#0f172a", color: "#fff",
                  fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                }}>{loading ? "Searching…" : "Search"}</button>
              </div>

              {showFilters && (
                <div style={{ paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                  <SectionLabel>Price & Size</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
                    {[
                      { label: "Min Price",      val: priceMin,   set: setPriceMin,   ph: "100000" },
                      { label: "Max Price",      val: priceMax,   set: setPriceMax,   ph: "800000" },
                      { label: "Min Sqft",       val: sqftMin,    set: setSqftMin,    ph: "800" },
                      { label: "Max Sqft",       val: sqftMax,    set: setSqftMax,    ph: "3000" },
                      { label: "Min Lot (sqft)", val: minLotSize, set: setMinLotSize, ph: "5000" },
                      { label: "Max HOA/mo",     val: maxHOA,     set: setMaxHOA,     ph: "300" },
                    ].map(({ label, val, set, ph }) => (
                      <div key={label}><label style={labelStyle}>{label}</label>
                        <input style={inputStyle} placeholder={ph} value={val} onChange={e => set(e.target.value)} type="number" />
                      </div>
                    ))}
                  </div>
                  <SectionLabel>Property Details</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
                    <div><label style={labelStyle}>Year Built Min</label><input style={inputStyle} placeholder="1990" value={yearBuiltMin} onChange={e => setYearBuiltMin(e.target.value)} type="number" /></div>
                    <div><label style={labelStyle}>Year Built Max</label><input style={inputStyle} placeholder="2024" value={yearBuiltMax} onChange={e => setYearBuiltMax(e.target.value)} type="number" /></div>
                    <div><label style={labelStyle}>Min School Rating</label>
                      <select style={selectStyle} value={minSchoolRating} onChange={e => setMinSchoolRating(e.target.value)}>
                        <option value="">Any</option>
                        {[5,6,7,8,9,10].map(r => <option key={r} value={r}>{r}+</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Min Parking</label>
                      <select style={selectStyle} value={parking} onChange={e => setParking(e.target.value)}>
                        {PARKING.map(p => <option key={p} value={p === "Any" ? "" : p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Keywords</label>
                    <input style={inputStyle} placeholder='e.g. "ocean view", "renovated kitchen"' value={keywords} onChange={e => setKeywords(e.target.value)} />
                  </div>
                  <SectionLabel>Must Have</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    <Toggle label="Pool"         value={hasPool}       onChange={setHasPool}       icon="🏊" />
                    <Toggle label="Garage"       value={hasGarage}     onChange={setHasGarage}     icon="🚗" />
                    <Toggle label="Basement"     value={hasBasement}   onChange={setHasBasement}   icon="🏚" />
                    <Toggle label="A/C"          value={hasAC}         onChange={setHasAC}         icon="❄️" />
                    <Toggle label="Waterfront"   value={isWaterfront}  onChange={setIsWaterfront}  icon="🌊" />
                    <Toggle label="Single Story" value={singleStory}   onChange={setSingleStory}   icon="🏠" />
                  </div>
                  <SectionLabel>Listing Type</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Toggle label="New Construction"  value={isNewConstruction}  onChange={setIsNewConstruction}  icon="🏗" />
                    <Toggle label="Coming Soon"       value={isComingSoon}       onChange={setIsComingSoon}       icon="🔜" />
                    <Toggle label="Foreclosure"       value={isForeclosure}      onChange={setIsForeclosure}      icon="⚠️" />
                    <Toggle label="For Sale By Owner" value={isFSBO}             onChange={setIsFSBO}             icon="🤝" />
                    <Toggle label="55+ Community"     value={is55Plus}           onChange={setIs55Plus}           icon="👴" />
                    <Toggle label="Open House"        value={hasOpenHouse}       onChange={setHasOpenHouse}       icon="🚪" />
                    <Toggle label="3D Tour"           value={has3DTour}          onChange={setHas3DTour}          icon="🎥" />
                    <Toggle label="Price Reduced"     value={onlyPriceReduction} onChange={setOnlyPriceReduction} icon="📉" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", padding: "12px 24px", color: "#991b1b", fontSize: 14 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Results area */}
          {hasResults ? (
            <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
              <div ref={resultsTopRef} style={{ width: showMap ? 420 : "100%", flexShrink: 0, padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
                      <strong>{sorted.length}</strong>{results?.total ? ` of ${results.total}` : ""} listings in <strong>{location}</strong>
                      {results?.from_cache && <span style={{ marginLeft: 6, fontSize: 10, background: "#f0fdf4", color: "#166534", border: "1px solid #86efac", borderRadius: 99, padding: "2px 7px" }}>⚡ cached</span>}
                    </p>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: "pointer", userSelect: "none" }}>
                      <input type="checkbox" checked={onlyWithRent} onChange={e => setOnlyWithRent(e.target.checked)} style={{ cursor: "pointer" }} />
                      Only with rent estimate
                      <span style={{ color: "#9ca3af" }}>({allListings.filter(p => p.rentZestimate != null).length}/{allListings.length})</span>
                    </label>
                  </div>
                  <select style={{ ...selectStyle, width: "auto", fontSize: 12 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    <option value="ratio">Best ratio</option>
                    <option value="newest">Newest</option>
                    <option value="price_asc">Price ↑</option>
                    <option value="price_desc">Price ↓</option>
                    <option value="rent_desc">Rent ↓</option>
                  </select>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(scoreConfig).map(([k, v]) => (
                    <span key={k} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: v.bg, color: v.color, border: `1px solid ${v.border}` }}>{v.label}</span>
                  ))}
                </div>

                {sorted.map(p => (
                  <PropertyCard
                    key={p.zpid || p.address} p={p}
                    isSelected={selectedZpid === p.zpid}
                    onSelect={setSelectedZpid}
                    favoriteZpids={favoriteZpids}
                    onFavoriteAction={handleFavoriteAction}
                  />
                ))}

                <div style={{ textAlign: "center", padding: "16px 0 32px" }}>
                  {hasMore ? (
                    <button onClick={handleLoadMore} disabled={loadingMore} style={{
                      padding: "10px 36px", borderRadius: 10, border: "2px solid #0f172a",
                      background: loadingMore ? "#f1f5f9" : "#fff", color: loadingMore ? "#94a3b8" : "#0f172a",
                      fontSize: 14, fontWeight: 600, cursor: loadingMore ? "not-allowed" : "pointer",
                    }}>
                      {loadingMore ? "Loading…" : `Load More (page ${currentPage + 1}${results?.max_pages ? ` of ${results.max_pages}` : ""})`}
                    </button>
                  ) : (
                    <p style={{ color: "#94a3b8", fontSize: 12 }}>✓ All {allListings.length} results loaded</p>
                  )}
                </div>
              </div>

              {showMap && (
                <div style={{ flex: 1, padding: "16px 16px 16px 0", minHeight: 500, position: "sticky", top: 0, height: "100vh" }}>
                  <PropertyMap listings={sorted} selectedZpid={selectedZpid} onSelectPin={setSelectedZpid} />
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", gap: 12 }}>
              {loading
                ? <p style={{ fontSize: 16 }}>Searching listings…</p>
                : <><p style={{ fontSize: 18, margin: 0 }}>🏡</p><p style={{ fontSize: 15, margin: 0 }}>Search a city to see listings and map</p><p style={{ fontSize: 13, margin: 0, background: "#eff6ff", color: "#1e40af", padding: "8px 16px", borderRadius: 8 }}><strong>The 1% Rule:</strong> Monthly rent ÷ price ≥ 1.0% = good investment</p></>
              }
            </div>
          )}
        </>
      )}

      {/* Favorites tab content */}
      {activeTab === "favorites" && (
        <FavoritesTab
          onFavoriteAction={handleFavoriteAction}
          favoriteZpids={favoriteZpids}
        />
      )}
    </div>
  );
}