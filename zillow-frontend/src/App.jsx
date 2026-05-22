import { useState, useRef, useEffect } from "react";

// ─────────────────────────────────────────────────────────────
// API Base URL
// Points to the Flask backend hosted on Render.
// All search requests go here.
// ─────────────────────────────────────────────────────────────
const API_BASE = "https://zillow-backend-oikm.onrender.com";

// ─────────────────────────────────────────────────────────────
// Dropdown Options
// Static lists used to populate the filter dropdowns.
// ─────────────────────────────────────────────────────────────
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
  { value: "",    label: "Any time" },
  { value: "1",   label: "1 day" },
  { value: "7",   label: "7 days" },
  { value: "14",  label: "14 days" },
  { value: "30",  label: "30 days" },
  { value: "90",  label: "90 days" },
  { value: "6m",  label: "6 months" },
  { value: "12m", label: "12 months" },
];

const BEDS    = ["Any", "1+", "2+", "3+", "4+", "5+"];
const BATHS   = ["Any", "1+", "1.5+", "2+", "3+", "4+"];
const PARKING = ["Any", "1+", "2+", "3+"];

// ─────────────────────────────────────────────────────────────
// Score Config
// Maps each investment score to its display label, text color,
// background color, border color, and map pin color.
// Used by both the property cards and the map markers.
// ─────────────────────────────────────────────────────────────
const scoreConfig = {
  excellent: { label: "Excellent ≥1%", color: "#14532d", bg: "#dcfce7", border: "#86efac", pin: "#16a34a" },
  good:      { label: "Good ≥0.8%",    color: "#14532d", bg: "#f0fdf4", border: "#4ade80", pin: "#4ade80" },
  fair:      { label: "Fair ≥0.6%",    color: "#713f12", bg: "#fefce8", border: "#fde047", pin: "#eab308" },
  poor:      { label: "Poor <0.6%",    color: "#7f1d1d", bg: "#fef2f2", border: "#fca5a5", pin: "#ef4444" },
  unknown:   { label: "No Rent Data",  color: "#374151", bg: "#f3f4f6", border: "#d1d5db", pin: "#9ca3af" },
};

// ─────────────────────────────────────────────────────────────
// Formatter
// Converts a number to a dollar string like "$235,000".
// Returns "—" if the value is null or empty.
// ─────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null || n === "") return "—";
  return "$" + Number(n).toLocaleString();
}

// ─────────────────────────────────────────────────────────────
// Shared Styles
// Reusable style objects applied to inputs, selects, and labels
// throughout the app so they all look consistent.
// Explicit color values prevent dark mode from making text invisible.
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// SectionLabel Component
// A small gray uppercase heading used to separate sections
// inside the advanced filters panel.
// ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase",
      letterSpacing: "0.08em", margin: "20px 0 12px",
      borderBottom: "1px solid #f1f5f9", paddingBottom: 6,
    }}>{children}</div>
  );
}

// ─────────────────────────────────────────────────────────────
// Toggle Component
// A button that switches between active (dark) and inactive
// (white) states. Used for boolean filters like Pool, Garage,
// Waterfront, Foreclosure, etc.
// ─────────────────────────────────────────────────────────────
function Toggle({ label, value, onChange, icon }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${value ? "#0f172a" : "#e2e8f0"}`,
        background: value ? "#0f172a" : "#fff",
        color: value ? "#fff" : "#374151",
        fontSize: 13, fontWeight: 500, cursor: "pointer",
        transition: "all 0.15s", whiteSpace: "nowrap",
      }}
    >
      <span>{icon}</span> {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// PropertyMap Component
// Renders an interactive map using Leaflet.js (loaded dynamically
// from a CDN) with OpenStreetMap tiles (free, no API key needed).
//
// Three useEffects handle different phases:
//   1. Load the Leaflet CSS stylesheet once on mount
//   2. Initialize the map once Leaflet JS is loaded
//   3. Re-render all markers whenever the listings list changes
//   4. Highlight the selected marker when a card is clicked
// ─────────────────────────────────────────────────────────────
function PropertyMap({ listings, selectedZpid, onSelectPin }) {
  const mapRef = useRef(null);           // Reference to the map DOM element
  const mapInstanceRef = useRef(null);   // Reference to the Leaflet map instance
  const markersRef = useRef({});         // Dictionary of zpid → Leaflet marker

  // Load Leaflet CSS once so map tiles and controls render correctly
  useEffect(() => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
  }, []);

  // Initialize the map once — load Leaflet JS if not already loaded,
  // then create the map and add the OpenStreetMap tile layer
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;

    const initMap = () => {
      const L = window.L;
      if (!L || !mapRef.current) return;
      // Reset Leaflet's internal ID in case of double-mount (React dev mode)
      if (mapRef.current._leaflet_id) {
        mapRef.current._leaflet_id = null;
      }
      try {
        const map = L.map(mapRef.current, { zoomControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);
        mapInstanceRef.current = map;
      } catch(e) {
        console.warn("Map init error:", e);
      }
    };

    // If Leaflet is already loaded (e.g. from a previous render), init immediately
    if (window.L) {
      initMap();
    } else {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = initMap;
      document.head.appendChild(script);
    }
  }, []);

  // Re-render all map markers whenever the listings list changes.
  // Clears old markers first, then adds a colored circle pin
  // for each listing that has valid coordinates.
  // The pin color matches the investment score.
  // Each pin has a popup with price, rent, ratio, and a Zillow link.
  // Clicking a pin selects it and highlights the matching card.
  useEffect(() => {
    const L = window.L;
    if (!L || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Remove all existing markers before adding new ones
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    const valid = listings.filter(p => p.latitude && p.longitude);
    if (!valid.length) return;

    const bounds = [];

    valid.forEach(p => {
      const score = scoreConfig[p.score] || scoreConfig.unknown;
      const color = score.pin;

      // Custom circular div icon colored by investment score
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          background:${color};
          border: 2px solid white;
          border-radius: 50%;
          width: 14px; height: 14px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          cursor: pointer;
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const marker = L.marker([p.latitude, p.longitude], { icon });

      // Popup content shown when a pin is clicked
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

    // Zoom the map to fit all markers with some padding
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
  }, [listings]);

  // When a card is selected, make its map pin larger and open its popup.
  // All other pins return to their normal size.
  useEffect(() => {
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
        html: `<div style="
          background:${score.pin};
          border: ${isSelected ? "3px solid #0f172a" : "2px solid white"};
          border-radius: 50%;
          width: ${size}px; height: ${size}px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          cursor: pointer;
        "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      marker.setIcon(icon);
      if (isSelected) {
        marker.openPopup();
        mapInstanceRef.current.panTo(marker.getLatLng());
      }
    });
  }, [selectedZpid]);

  return (
    <div ref={mapRef} style={{ width: "100%", height: "100%", borderRadius: 12, zIndex: 0 }} />
  );
}

// ─────────────────────────────────────────────────────────────
// PropertyCard Component
// Renders one listing as a card with photo, score badge, ratio,
// address, price/zestimate/rent boxes, and property details.
//
// Clicking a card selects it (highlights its map pin) and opens
// the Zillow listing in a new tab.
//
// If the card is selected, it gets a dark border and auto-scrolls
// into view when the matching map pin is clicked.
// ─────────────────────────────────────────────────────────────
function PropertyCard({ p, isSelected, onSelect }) {
  const score = scoreConfig[p.score] || scoreConfig.unknown;
  const ratioDisplay = p.ratio != null ? p.ratio.toFixed(3) + "%" : "—";
  const cardRef = useRef(null);

  // Auto-scroll this card into view when it becomes selected
  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isSelected]);

  return (
    <div
      ref={cardRef}
      style={{
        background: "#fff",
        border: isSelected ? "2px solid #0f172a" : "1px solid #e5e7eb",
        borderRadius: 14, overflow: "hidden",
        display: "flex", flexDirection: "column",
        transition: "box-shadow 0.2s, transform 0.2s",
        cursor: "pointer",
        boxShadow: isSelected ? "0 4px 20px rgba(0,0,0,0.15)" : "none",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = isSelected ? "0 4px 20px rgba(0,0,0,0.15)" : "none"; e.currentTarget.style.transform = "none"; }}
      onClick={() => { onSelect(p.zpid); window.open(p.detailUrl, "_blank"); }}
    >
      {/* Property photo or placeholder */}
      {p.imgSrc
        ? <img src={p.imgSrc} alt={p.address} style={{ width: "100%", height: 160, objectFit: "cover" }} />
        : <div style={{ width: "100%", height: 160, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>No image</div>
      }
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Score badge and ratio percentage */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            padding: "3px 8px", borderRadius: 99,
            background: score.bg, color: score.color, border: `1px solid ${score.border}`
          }}>{score.label}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: score.color }}>{ratioDisplay}</span>
        </div>

        {/* Address */}
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", lineHeight: 1.4 }}>{p.address}</p>

        {/* Price, Zestimate, and Rent estimate boxes */}
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

        {/* Property details row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "#6b7280" }}>
          {p.bedrooms   && <span>🛏 {p.bedrooms} bd</span>}
          {p.bathrooms  && <span>🚿 {p.bathrooms} ba</span>}
          {p.livingArea && <span>📐 {Number(p.livingArea).toLocaleString()} sqft</span>}
          {p.daysOnZillow != null && <span>📅 {p.daysOnZillow}d listed</span>}
        </div>

        {/* Open house banner — only shown if listing has an upcoming open house */}
        {p.hasOpenHouse && (
          <div style={{ background: "#eff6ff", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "#1d4ed8", fontWeight: 500 }}>
            🚪 Open House: {p.openHouseStartDate}
          </div>
        )}

        {/* Listing status (e.g. "House for sale", "New construction", "Foreclosure") */}
        {p.statusText && <div style={{ fontSize: 10, color: "#6b7280" }}>{p.statusText}</div>}

        {/* Price change indicator — green if price dropped, red if it increased */}
        {p.priceChange && (
          <div style={{ fontSize: 11, color: p.priceChange < 0 ? "#15803d" : "#b91c1c", fontWeight: 600 }}>
            {p.priceChange < 0 ? "▼" : "▲"} Price changed {fmt(Math.abs(p.priceChange))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main App Component
// The root of the application. Manages all state and renders
// the header, search panel, results, and map.
// ─────────────────────────────────────────────────────────────
export default function App() {

  // ── Filter state ──────────────────────────────────────────
  // Each piece of state corresponds to a search filter.
  // All start empty/false (no filter applied).
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

  // ── UI state ──────────────────────────────────────────────
  const [showFilters, setShowFilters]     = useState(false);   // Toggle advanced filter panel
  const [sortBy, setSortBy]               = useState("ratio"); // Current sort option
  const [onlyWithRent, setOnlyWithRent]   = useState(true);    // Filter to listings with rent data
  const [showMap, setShowMap]             = useState(true);    // Toggle map visibility
  const [selectedZpid, setSelectedZpid]   = useState(null);   // Currently selected listing

  // ── Fetch state ───────────────────────────────────────────
  const [loading, setLoading]         = useState(false);  // Initial search loading
  const [loadingMore, setLoadingMore] = useState(false);  // Load More button loading
  const [results, setResults]         = useState(null);   // Latest API response metadata
  const [allListings, setAllListings] = useState([]);     // All listings accumulated across pages
  const [currentPage, setCurrentPage] = useState(1);      // Current page number
  const [error, setError]             = useState(null);   // Error message if request fails
  const lastPayloadRef                = useRef({});       // Stores last search payload for Load More

  // ── buildPayload ──────────────────────────────────────────
  // Assembles the search request body from all active filter
  // states. Only includes filters that have a value set —
  // empty/false filters are omitted so the API ignores them.
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

  // ── fetchPage ─────────────────────────────────────────────
  // Makes a POST request to the Flask backend with the given
  // payload and returns the parsed JSON response.
  // Throws an error if the backend returns an error message.
  const fetchPage = async (payload) => {
    const res  = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  // ── handleSearch ──────────────────────────────────────────
  // Triggered when the user clicks Search or presses Enter.
  // Resets all previous results and fetches page 1.
  const handleSearch = async () => {
    if (!location.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setAllListings([]);
    setCurrentPage(1);
    setSelectedZpid(null);
    const payload = buildPayload(1);
    lastPayloadRef.current = payload;
    try {
      const data = await fetchPage(payload);
      setResults(data);
      setAllListings(data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── handleLoadMore ────────────────────────────────────────
  // Fetches the next page using the same filters as the original
  // search and appends the new listings to the existing list.
  const handleLoadMore = async () => {
    const nextPage = currentPage + 1;
    setLoadingMore(true);
    const payload = { ...lastPayloadRef.current, page: nextPage };
    try {
      const data = await fetchPage(payload);
      setAllListings(prev => [...prev, ...(data.results || [])]);
      setResults(data);
      setCurrentPage(nextPage);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Filtering & Sorting ───────────────────────────────────
  // visibleListings filters out listings without rent data if
  // the "Only with rent estimate" checkbox is checked.
  // sorted then applies the selected sort order on top of that.
  const visibleListings = onlyWithRent
    ? allListings.filter(p => p.rentZestimate != null)
    : allListings;

  const sorted = [...visibleListings].sort((a, b) => {
    if (sortBy === "ratio")      return (b.ratio ?? -1) - (a.ratio ?? -1);
    if (sortBy === "price_asc")  return (a.price ?? 0) - (b.price ?? 0);
    if (sortBy === "price_desc") return (b.price ?? 0) - (a.price ?? 0);
    if (sortBy === "rent_desc")  return (b.rentZestimate ?? 0) - (a.rentZestimate ?? 0);
    if (sortBy === "newest")     return (a.daysOnZillow ?? 999) - (b.daysOnZillow ?? 999);
    return 0;
  });

  // Show Load More if the API says there are more pages
  const hasMore = results?.has_more && (results?.max_pages == null || currentPage < results.max_pages);

  // Count how many filters are currently active for the badge on the Filters button
  const activeFilterCount = [
    beds && beds !== "Any", baths && baths !== "Any", homeType,
    priceMin, priceMax, sqftMin, sqftMax, minLotSize,
    hasPool, hasGarage, hasBasement, hasAC, isWaterfront, singleStory, parking && parking !== "Any",
    isNewConstruction, isComingSoon, isForeclosure, isFSBO, is55Plus, hasOpenHouse, has3DTour, onlyPriceReduction,
    yearBuiltMin, yearBuiltMax, maxHOA, minSchoolRating, daysOnZillow, keywords,
  ].filter(Boolean).length;

  const hasResults = sorted.length > 0;

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f8fafc", fontFamily: "'Georgia', serif" }}>

      {/* ── Header ── Dark top bar with title and Hide/Show Map button */}
      <div style={{ background: "#0f172a", padding: "16px 24px", flexShrink: 0 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>🏡 Zillow Investment Finder</h1>
            <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>Find properties where monthly rent ≥ 1% of purchase price</p>
          </div>
          {hasResults && (
            <button
              onClick={() => setShowMap(!showMap)}
              style={{
                padding: "8px 16px", borderRadius: 8,
                border: "1.5px solid #334155",
                background: showMap ? "#334155" : "transparent",
                color: "#f1f5f9", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >{showMap ? "🗺 Hide Map" : "🗺 Show Map"}</button>
          )}
        </div>
      </div>

      {/* ── Search Panel ── White bar with location input, quick filters, and advanced filter drawer */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "16px 24px", flexShrink: 0 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>

          {/* Main search row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <input
              style={{ ...inputStyle, fontSize: 15, padding: "10px 14px", flex: 1 }}
              placeholder="City and state (e.g. Miami, FL or Austin, TX)"
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
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                padding: "10px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0",
                background: showFilters ? "#f1f5f9" : "#fff", color: "#374151",
                fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Filters {activeFilterCount > 0 && <span style={{ background: "#0f172a", color: "#fff", fontSize: 10, borderRadius: 99, padding: "1px 6px", marginLeft: 4 }}>{activeFilterCount}</span>}
            </button>
            <button
              onClick={handleSearch}
              disabled={loading || !location.trim()}
              style={{
                padding: "10px 28px", borderRadius: 8, border: "none",
                background: loading ? "#94a3b8" : "#0f172a", color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
              }}
            >{loading ? "Searching…" : "Search"}</button>
          </div>

          {/* Advanced filter drawer — shown/hidden by the Filters button */}
          {showFilters && (
            <div style={{ paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
              <SectionLabel>Price & Size</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
                {[
                  { label: "Min Price",     val: priceMin,   set: setPriceMin,   ph: "100000" },
                  { label: "Max Price",     val: priceMax,   set: setPriceMax,   ph: "800000" },
                  { label: "Min Sqft",      val: sqftMin,    set: setSqftMin,    ph: "800" },
                  { label: "Max Sqft",      val: sqftMax,    set: setSqftMax,    ph: "3000" },
                  { label: "Min Lot (sqft)",val: minLotSize, set: setMinLotSize, ph: "5000" },
                  { label: "Max HOA/mo",    val: maxHOA,     set: setMaxHOA,     ph: "300" },
                ].map(({ label, val, set, ph }) => (
                  <div key={label}>
                    <label style={labelStyle}>{label}</label>
                    <input style={inputStyle} placeholder={ph} value={val} onChange={e => set(e.target.value)} type="number" />
                  </div>
                ))}
              </div>
              <SectionLabel>Property Details</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
                <div><label style={labelStyle}>Year Built Min</label><input style={inputStyle} placeholder="1990" value={yearBuiltMin} onChange={e => setYearBuiltMin(e.target.value)} type="number" /></div>
                <div><label style={labelStyle}>Year Built Max</label><input style={inputStyle} placeholder="2024" value={yearBuiltMax} onChange={e => setYearBuiltMax(e.target.value)} type="number" /></div>
                <div>
                  <label style={labelStyle}>Min School Rating</label>
                  <select style={selectStyle} value={minSchoolRating} onChange={e => setMinSchoolRating(e.target.value)}>
                    <option value="">Any</option>
                    {[5,6,7,8,9,10].map(r => <option key={r} value={r}>{r}+</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Min Parking</label>
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

      {/* ── Error Banner ── Shown if the API request fails */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", padding: "12px 24px", color: "#991b1b", fontSize: 14, flexShrink: 0 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Main Content ── Split layout: cards on left, map on right */}
      {hasResults ? (
        <div style={{ display: "flex", minHeight: 0, flex: 1 }}>

          {/* Left panel — scrollable list of property cards */}
          <div style={{ width: showMap ? 420 : "100%", flexShrink: 0, padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Results bar with count, rent filter checkbox, and sort dropdown */}
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

            {/* Score legend */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(scoreConfig).map(([k, v]) => (
                <span key={k} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: v.bg, color: v.color, border: `1px solid ${v.border}` }}>{v.label}</span>
              ))}
            </div>

            {/* Property cards list */}
            {sorted.map(p => (
              <PropertyCard
                key={p.zpid || p.address}
                p={p}
                isSelected={selectedZpid === p.zpid}
                onSelect={setSelectedZpid}
              />
            ))}

            {/* Load More button — fetches the next page of results */}
            <div style={{ textAlign: "center", padding: "16px 0 32px" }}>
              {hasMore ? (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{
                    padding: "10px 36px", borderRadius: 10,
                    border: "2px solid #0f172a",
                    background: loadingMore ? "#f1f5f9" : "#fff",
                    color: loadingMore ? "#94a3b8" : "#0f172a",
                    fontSize: 14, fontWeight: 600,
                    cursor: loadingMore ? "not-allowed" : "pointer",
                  }}
                >
                  {loadingMore ? "Loading…" : `Load More (page ${currentPage + 1}${results?.max_pages ? ` of ${results.max_pages}` : ""})`}
                </button>
              ) : (
                <p style={{ color: "#94a3b8", fontSize: 12 }}>✓ All {allListings.length} results loaded</p>
              )}
            </div>
          </div>

          {/* Right panel — sticky map that stays in view as you scroll cards */}
          {showMap && (
            <div style={{ flex: 1, padding: "16px 16px 16px 0", minHeight: 500, position: "sticky", top: 0, height: "100vh" }}>
              <PropertyMap
                listings={sorted}
                selectedZpid={selectedZpid}
                onSelectPin={setSelectedZpid}
              />
            </div>
          )}
        </div>
      ) : (
        // ── Empty state ── Shown before any search is run or if no results
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", gap: 12 }}>
          {loading
            ? <p style={{ fontSize: 16 }}>Searching listings…</p>
            : <><p style={{ fontSize: 18, margin: 0 }}>🏡</p><p style={{ fontSize: 15, margin: 0 }}>Search a city to see listings and map</p><p style={{ fontSize: 13, margin: 0, background: "#eff6ff", color: "#1e40af", padding: "8px 16px", borderRadius: 8 }}><strong>The 1% Rule:</strong> Monthly rent ÷ price ≥ 1.0% = good investment</p></>
          }
        </div>
      )}
    </div>
  );
}