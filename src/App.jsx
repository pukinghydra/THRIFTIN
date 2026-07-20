import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { BrowserMultiFormatReader } from "@zxing/browser";

const SUPABASE_URL = "https://mpkazwsxjorocqajpkao.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wa2F6d3N4am9yb2NxYWpwa2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzA4MTksImV4cCI6MjA5MzY0NjgxOX0.IZjuxlv40iOLEdOXJrYl1QfRKmo_nMYJZEH4FHU5ZiI";
// ── App lock (PIN) ──────────────────────────────────────────────────────────
// Staff type a shared PIN to unlock the app. The PIN is the password to ONE
// hidden Supabase login (STAFF_EMAIL) — that login is what actually authenticates
// the app to the database, so the lock holds even though the anon key is public.
// The staff name picker (Vic / Richie / Charlie) is unchanged; this is separate.
const REQUIRE_PIN = true;                  // master switch — set to false to turn the lock off entirely
const STAFF_EMAIL = "staff@thriftin.se";   // hidden shared login; never shown to staff
const UNLOCK_DAYS = 30;                     // re-ask for the PIN on a device after this many days

let ACCESS_TOKEN = null;                    // current logged-in session token (null = fall back to anon key)

const sb = {
  // Dynamic: once unlocked, every request uses the logged-in session token;
  // before unlock (or if REQUIRE_PIN is off) it falls back to the public anon key.
  get h() { return { apikey: SUPABASE_KEY, Authorization: "Bearer " + (ACCESS_TOKEN || SUPABASE_KEY), "Content-Type": "application/json" }; },
  url: SUPABASE_URL + "/rest/v1",
  sto: SUPABASE_URL + "/storage/v1/object",
};

const auth = {
  // Restore a remembered unlock on app open (no PIN needed if still within the window).
  async restore() {
    try {
      const raw = localStorage.getItem("thriftin_session");
      const until = parseInt(localStorage.getItem("thriftin_unlock_until") || "0", 10);
      if (!raw || !until || Date.now() > until) return false;        // never unlocked, or 30-day window passed
      const s = JSON.parse(raw);
      if (s.access_token && s.expires_at && s.expires_at * 1000 > Date.now() + 120000) { ACCESS_TOKEN = s.access_token; return true; }
      if (s.refresh_token) return await auth._refresh(s.refresh_token);
      return false;
    } catch { return false; }
  },
  // Exchange the typed PIN for a real session.
  async signIn(pin) {
    try {
      const r = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: STAFF_EMAIL, password: pin }) });
      if (!r.ok) return false;
      auth._save(await r.json());
      try { localStorage.setItem("thriftin_unlock_until", String(Date.now() + UNLOCK_DAYS * 86400000)); } catch {}
      return true;
    } catch { return false; }
  },
  async _refresh(rt) {
    try {
      const r = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }) });
      if (!r.ok) { auth.signOut(); return false; }
      auth._save(await r.json());
      return true;
    } catch { return false; }
  },
  _save(d) {
    ACCESS_TOKEN = d.access_token || null;
    const expires_at = d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600));
    try { localStorage.setItem("thriftin_session", JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at })); } catch {}
  },
  signOut() {
    ACCESS_TOKEN = null;
    try { localStorage.removeItem("thriftin_session"); localStorage.removeItem("thriftin_unlock_until"); } catch {}
  },
};

// ── Auto-update ───────────────────────────────────────────────────────────────
// iOS home-screen web-apps cache aggressively and keep running OLD code after a
// deploy. We record the JS bundle this app booted with, then check the live page
// for a newer one and refresh — so the icon never runs stale code.
const BOOT_ASSETS = (() => {
  try { return (document.documentElement.innerHTML.match(/assets\/[A-Za-z0-9._-]+\.js/g) || []).sort().join(","); }
  catch { return ""; }
})();
async function isStale() {
  try {
    const r = await fetch((location.pathname || "/") + "?_v=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return false;
    const sig = ((await r.text()).match(/assets\/[A-Za-z0-9._-]+\.js/g) || []).sort().join(",");
    return !!sig && !!BOOT_ASSETS && sig !== BOOT_ASSETS;
  } catch { return false; }
}
// Reload, but never more than once a minute — hard guard against any reload loop.
function safeReload() {
  try {
    const last = +sessionStorage.getItem("thriftin_reloaded_at") || 0;
    if (Date.now() - last < 60000) return;
    sessionStorage.setItem("thriftin_reloaded_at", String(Date.now()));
  } catch {}
  location.reload();
}

const SZ_CLOTH = ["XS","S","M","L","XL","XXL"];
const SZ_FOOT  = ["34","35","36","37","38","39","40","41","42","43","44","45","46","47"];
const SZ_ONE   = ["One Size"];
const SZ_DENIM_W = ["26","27","28","29","30","31","32","33","34","35","36","37","38"];
const SZ_DENIM_L = ["29","30","31","32","33","34","35","36"];
const CCOLORS  = ["#6B7B6E","#9B7B5A","#7A6882","#5A8070","#8B705F","#5E7580","#7B6650","#5C7B65","#887060","#607B85","#806868","#508070","#6E5880","#806B55","#558068","#706080"];
const UCOLORS  = ["#D64550","#1D3557","#06A77D","#E8973A","#8E44AD","#2C6E49","#C77A30","#5B4A8A"];

const BG = "#F9F8F6";
const CARD = "#FFFFFF";
const BORDER = "#E8E4DF";
const MUTED = "#9E9A94";
const DARK = "#1A1A1A";

// ── Brand aliases for normalization ──
const BRAND_ALIASES = {
  "rl": "Ralph Lauren", "ralph": "Ralph Lauren", "polo": "Ralph Lauren",
  "ysl": "YSL", "saint": "YSL", "laurent": "YSL", "yves": "YSL",
  "acne": "Acne Studios", "studios": "Acne Studios",
  "ck": "Calvin Klein", "calvin": "Calvin Klein",
  "th": "Tommy Hilfiger", "tommy": "Tommy Hilfiger", "hilfiger": "Tommy Hilfiger",
  "lv": "Louis Vuitton", "louis": "Louis Vuitton", "vuitton": "Louis Vuitton",
  "gucci": "Gucci",
  "prada": "Prada",
  "versace": "Versace",
  "burberry": "Burberry",
  "nike": "Nike",
  "adidas": "Adidas",
  "levis": "Levis", "levi's": "Levis", "levi": "Levis",
  "carhartt": "Carhartt",
  "dickies": "Dickies",
  "lacoste": "Lacoste",
  "gant": "Gant",
  "hm": "H&M", "h&m": "H&M",
  "zara": "Zara",
  "gap": "Gap",
  "north": "The North Face", "tnf": "The North Face",
  "patagonia": "Patagonia",
  "stussy": "Stüssy", "stüssy": "Stüssy",
  "supreme": "Supreme",
  "champion": "Champion",
  "fila": "Fila",
  "converse": "Converse",
  "vans": "Vans",
  "jordan": "Jordan",
  "nb": "New Balance", "new": "New Balance",
  "dior": "Dior",
  "balenciaga": "Balenciaga",
  "kenzo": "Kenzo",
  "hugo": "Hugo Boss", "boss": "Hugo Boss",
  "armani": "Armani",
  "diesel": "Diesel",
  "wrangler": "Wrangler",
  "lee": "Lee",
  "nudie": "Nudie Jeans",
};
const STOP_WORDS = new Set(["the","a","an","and","or","in","on","of","for","with","to","is","it","this","that","from","by","at","as","was","are","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","can","shall","must","need","used","very","really","just","only","also","so","but","not","no","if","then","than","too","own","same","other","each","every","all","any","few","more","most","such","into","through","during","before","after","above","below","between","out","off","over","under","again","further","once","here","there","when","where","why","how","what","which","who","whom","short","long","sleeved","sleeve","striped","checked","plain","solid","colored","colour","color","vintage","retro","classic","small","medium","large","extra","size","sized","brand","new","old","good","great","nice","cool","warm","light","dark","bright","men","women","mens","womens","man","woman","unisex","shirt","pants","jeans","jacket","coat","dress","skirt","top","bottom","shoe","shoes","boot","boots","sneaker","sneakers","hat","cap","bag","belt","scarf","tie","socks","underwear","sweater","hoodie","blazer","vest","cardigan","shorts","tee","polo","henley","button","zip","zipper","pockets","pocket","collar","crew","neck","round","vneck","v-neck","fitted","slim","regular","loose","oversized","cropped","high","low","mid","waist","rise","leg","straight","skinny","wide","flared","bootcut","tapered","relaxed","blue","red","green","black","white","grey","gray","brown","navy","beige","cream","pink","purple","orange","yellow","khaki","olive","tan","maroon","burgundy","teal","coral","mint","gold","silver","denim","cotton","linen","wool","silk","polyester","nylon","leather","suede","velvet","fleece","knit","woven","print","printed","pattern","patterned","floral","plaid","camo","camouflage","graphic","logo","embroidered","distressed","washed","faded","raw","selvedge"]);

function extractBrands(comments) {
  const brandCounts = {};
  comments.forEach(comment => {
    if (!comment) return;
    const words = comment.toLowerCase().replace(/[^\w\s&'-åäöÅÄÖüÜ]/g, " ").split(/\s+/).filter(Boolean);
    let matched = false;
    // Try 2-word combos first (e.g. "ralph lauren", "calvin klein")
    for (let i = 0; i < Math.min(words.length - 1, 4); i++) {
      const twoWord = words[i] + " " + words[i + 1];
      const alias = BRAND_ALIASES[words[i]];
      if (alias) {
        brandCounts[alias] = (brandCounts[alias] || 0) + 1;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Try single first word
      for (let i = 0; i < Math.min(words.length, 3); i++) {
        const alias = BRAND_ALIASES[words[i]];
        if (alias) {
          brandCounts[alias] = (brandCounts[alias] || 0) + 1;
          matched = true;
          break;
        }
      }
    }
    if (!matched && words.length > 0) {
      // Take first word that isn't a stop word or color as potential unknown brand
      for (let i = 0; i < Math.min(words.length, 3); i++) {
        if (!STOP_WORDS.has(words[i]) && words[i].length > 2) {
          const cap = words[i].charAt(0).toUpperCase() + words[i].slice(1);
          brandCounts[cap] = (brandCounts[cap] || 0) + 1;
          break;
        }
      }
    }
  });
  return Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);
}

function findTopSellers(sales) {
  // Group by category + normalized description keywords
  const groups = {};
  sales.forEach(s => {
    if (!s.comment && !s.category_name) return;
    const cat = s.category_name || "Uncategorized";
    const words = (s.comment || "").toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => !STOP_WORDS.has(w) && w.length > 2).sort().join(" ");
    const key = cat + "||" + words;
    if (!groups[key]) groups[key] = { category: cat, items: [], label: s.comment || cat };
    groups[key].items.push(s);
  });
  return Object.values(groups)
    .filter(g => g.items.length >= 2)
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 10);
}

function Logo({ size = 24 }) {
  return <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: size, fontWeight: 900, letterSpacing: -1, color: DARK }}>thriftin{"\u2019"}</span>;
}

async function compressPhoto(file, maxW = 1200, q = 0.8) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxW / img.width);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(blob => res(blob), "image/jpeg", q);
      };
      img.onerror = rej;
      img.src = e.target.result;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

const api = {
  get: async (table, params = "") => { const r = await fetch(sb.url + "/" + table + "?select=*" + params, { headers: sb.h }); return r.ok ? r.json() : []; },
  post: async (table, body) => { const r = await fetch(sb.url + "/" + table, { method: "POST", headers: { ...sb.h, Prefer: "return=representation" }, body: JSON.stringify(body) }); if (!r.ok) { const txt = await r.text().catch(() => ""); throw new Error("Save failed (" + r.status + "): " + txt.slice(0, 200)); } return (await r.json())[0]; },
  patch: async (table, id, body) => { const r = await fetch(sb.url + "/" + table + "?id=eq." + id, { method: "PATCH", headers: { ...sb.h, Prefer: "return=representation" }, body: JSON.stringify(body) }); if (!r.ok) { const txt = await r.text().catch(() => ""); throw new Error("Update failed (" + r.status + "): " + txt.slice(0, 200)); } return (await r.json())[0]; },
  del: async (table, id) => { const r = await fetch(sb.url + "/" + table + "?id=eq." + id, { method: "DELETE", headers: sb.h }); if (!r.ok) { const txt = await r.text().catch(() => ""); throw new Error("Delete failed (" + r.status + "): " + txt.slice(0, 200)); } },
  upload: async (blob) => {
    const fn = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + ".jpg";
    const r = await fetch(sb.sto + "/photos/" + fn, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + (ACCESS_TOKEN || SUPABASE_KEY), "Content-Type": "image/jpeg" }, body: blob });
    if (!r.ok) { const txt = await r.text().catch(() => ""); throw new Error("Photo upload failed (" + r.status + "): " + txt.slice(0, 200)); }
    return SUPABASE_URL + "/storage/v1/object/public/photos/" + fn;
  },
  // Generate next unique barcode by counting existing inventory rows + finding max
  nextBarcode: async () => {
    const r = await fetch(sb.url + "/inventory?select=barcode&order=barcode.desc&limit=1", { headers: sb.h });
    if (!r.ok) { const txt = await r.text().catch(() => ""); throw new Error("Could not generate barcode (" + r.status + "): " + txt.slice(0, 200)); }
    let next = 1;
    const rows = await r.json();
    if (rows.length && rows[0].barcode) {
      const m = rows[0].barcode.match(/THR-(\d+)/);
      if (m) next = parseInt(m[1], 10) + 1;
    }
    return "THR-" + String(next).padStart(6, "0");
  },
};

const S = {
  page: { background: BG, minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: DARK, overflowX: "hidden", position: "relative" },
  card: { background: CARD, borderRadius: 14, border: "1px solid " + BORDER, padding: "16px 18px", marginBottom: 12 },
  field: { width: "100%", padding: "14px 16px", boxSizing: "border-box", border: "2px solid " + BORDER, borderRadius: 12, fontSize: 15, fontFamily: "inherit", background: CARD, color: DARK, outline: "none", transition: "border-color 0.2s" },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 8 },
  chip: (active, color) => ({
    padding: "10px 16px", borderRadius: 10,
    background: active ? (color || DARK) : CARD,
    border: "2px solid " + (active ? (color || DARK) : (color || BORDER)),
    color: active ? "#fff" : (color || "#555"),
    fontSize: 14, fontWeight: active ? 700 : 600,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
    transition: "all 0.15s",
  }),
  btn: (active = true) => ({
    width: "100%", padding: "16px",
    background: active ? DARK : "#ddd",
    border: "none", borderRadius: 12,
    color: active ? "#fff" : "#aaa",
    fontSize: 15, fontWeight: 700,
    cursor: active ? "pointer" : "default",
    fontFamily: "inherit", letterSpacing: 0.3,
    transition: "opacity 0.2s",
  }),
};

// ── Size helpers ──
function isShirtCat(cat) {
  // Show sleeve option for "Shirt" categories, but not T-Shirts
  return !!cat && /shirt/i.test(cat.name || "") && !/t-?shirt/i.test(cat.name || "");
}
function getSizeOpts(cat) {
  if (!cat) return { type: "none" };
  switch (cat.size_type) {
    case "footwear": return { type: "single", opts: SZ_FOOT };
    case "onesize": return { type: "single", opts: SZ_ONE };
    case "denim_full": return { type: "denim_full" };
    case "denim_waist": return { type: "denim_waist" };
    default: return { type: "single", opts: SZ_CLOTH };
  }
}

function parseDenimSize(sizeStr) {
  if (!sizeStr) return { w: "", l: "" };
  const wm = sizeStr.match(/W(\d+)/);
  const lm = sizeStr.match(/L(\d+)/);
  return { w: wm ? wm[1] : "", l: lm ? lm[1] : "" };
}

function formatDenimSize(w, l) {
  if (w && l) return "W" + w + "/L" + l;
  if (w) return "W" + w;
  return "";
}

// ── Root ──
// ── Brand aliasing: YSL/Saint Laurent → "YSL"; Levi's/Levis (any apostrophe) → "Levis" ──
function normalizeBrand(name) {
  if (!name) return name;
  const k = name.trim().toLowerCase();
  if (["ysl", "saint laurent", "saint-laurent", "yves saint laurent", "yves saint-laurent"].includes(k)) return "YSL";
  if (["levi's", "levis", "levi’s", "levi´s", "levi", "levi strauss", "levi strauss & co", "levi strauss & co."].includes(k)) return "Levis";
  return name.trim();
}

// ── Best brand guess for one sale: explicit brand field, else from the description ──
function saleBrand(s) {
  const b = (s.brand || "").trim();
  if (b) return normalizeBrand(b);
  const e = extractBrands([s.comment]);
  return e.length ? normalizeBrand(e[0][0]) : null;
}

// Period options for the Sell-through report: the History advanced-stats calendar
// presets (Today … Last month) plus the longer rolling trend windows.
function getReportPeriods() {
  const cal = getTimePresets().map(p => ({ key: p.label, label: p.label, kind: "cal", from: p.from, to: p.to }));
  const trend = [["30", "30 days", 30], ["90", "3 months", 90], ["180", "6 months", 180], ["all", "All time", 100000]]
    .map(([key, label, days]) => ({ key, label, kind: "trend", days }));
  return [...cal, ...trend];
}

// Resolve a period key to {start, end, prevStart, prevEnd} Date boundaries.
// prev* is the equal-length window immediately before, for the ▲/▼ delta.
function resolveReportRange(key) {
  const DAY = 86400000;
  const all = getReportPeriods();
  const p = all.find(x => x.key === key) || all[0];
  if (p.kind === "cal") {
    const start = strToDate(p.from); start.setHours(0, 0, 0, 0);
    const endMid = strToDate(p.to); endMid.setHours(0, 0, 0, 0);
    const lenDays = Math.round((endMid - start) / DAY) + 1;
    const end = new Date(endMid); end.setHours(23, 59, 59, 999);
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - lenDays); prevStart.setHours(0, 0, 0, 0);
    return { start, end, prevStart, prevEnd };
  }
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - p.days + 1);
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - p.days);
  return { start, end, prevStart, prevEnd };
}

// ── Admin-only sell-through report: what sold, by category & brand, with thumbnails ──
function ReportScreen({ sales, cats, onClose, initialPeriod }) {
  const [period, setPeriod] = useState(initialPeriod || "This week");
  const [openCat, setOpenCat] = useState(null);
  const [zoom, setZoom] = useState("");

  const PERIODS = getReportPeriods();
  const kr = n => Math.round(n).toLocaleString("sv-SE") + " kr";

  const stats = useMemo(() => {
    const { start, end, prevStart, prevEnd } = resolveReportRange(period);
    const dateOf = s => { const d = new Date((s.sold_at || "").slice(0, 10)); return isNaN(d) ? null : d; };
    const num = x => { const n = parseFloat(x); return isNaN(n) ? 0 : n; };
    const rev = arr => arr.reduce((t, s) => t + num(s.price), 0);

    const cur = sales.filter(s => { const d = dateOf(s); return d && d >= start && d <= end; });
    const prev = sales.filter(s => { const d = dateOf(s); return d && d >= prevStart && d <= prevEnd; });
    const curRev = rev(cur), prevRev = rev(prev);

    const byCat = {};
    cur.forEach(s => { const c = (s.category_name || "Uncategorised"); (byCat[c] = byCat[c] || []).push(s); });
    const catRows = Object.entries(byCat).map(([name, items]) => {
      const bm = {};
      items.forEach(s => { const b = saleBrand(s) || "Unbranded"; (bm[b] = bm[b] || []).push(s); });
      const brands = Object.entries(bm).map(([b, its]) => ({ brand: b, count: its.length, avg: rev(its) / its.length })).sort((a, b) => b.count - a.count);
      return { name, items, count: items.length, revenue: rev(items), avg: rev(items) / items.length, brands };
    }).sort((a, b) => b.count - a.count);

    const bAll = {};
    cur.forEach(s => { const b = saleBrand(s); if (!b) return; (bAll[b] = bAll[b] || []).push(s); });
    const topBrands = Object.entries(bAll).map(([b, its]) => ({ brand: b, count: its.length, total: rev(its), avg: rev(its) / its.length })).sort((a, b) => b.count - a.count).slice(0, 10);

    return { cur, curRev, prevRev, avg: cur.length ? curRev / cur.length : 0, delta: prevRev ? Math.round((curRev - prevRev) / prevRev * 100) : null, catRows, topBrands };
  }, [sales, period]);

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, zIndex: 600, overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Sell-through</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 26, color: "#aaa", cursor: "pointer" }}>{"×"}</button>
        </div>

        <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 16, paddingBottom: 2 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => { setPeriod(p.key); setOpenCat(null); }} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 20, border: "1px solid " + (period === p.key ? DARK : BORDER), background: period === p.key ? DARK : CARD, color: period === p.key ? "#fff" : DARK, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{p.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: stats.delta !== null ? 6 : 22 }}>
          {[["Items sold", String(stats.cur.length)], ["Revenue", kr(stats.curRev)], ["Avg / item", stats.cur.length ? kr(stats.avg) : "—"]].map(([l, v]) => (
            <div key={l} style={{ flex: 1, background: CARD, border: "1px solid " + BORDER, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
        {stats.delta !== null && (
          <div style={{ fontSize: 13, color: stats.delta >= 0 ? "#06A77D" : "#c33", fontWeight: 600, marginBottom: 22 }}>
            {stats.delta >= 0 ? "▲" : "▼"} {Math.abs(stats.delta)}% revenue vs the previous period
          </div>
        )}

        {stats.topBrands.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Top sellers</div>
            <div style={{ background: CARD, border: "1px solid " + BORDER, borderRadius: 12, padding: "2px 14px", marginBottom: 26 }}>
              {stats.topBrands.map((b, i) => (
                <div key={b.brand} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < stats.topBrands.length - 1 ? "1px solid " + BG : "none", fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{i + 1}. {b.brand}</span>
                  <span style={{ color: MUTED, fontSize: 13 }}>{b.count} sold · <span style={{ color: DARK, fontWeight: 700 }}>{kr(b.total)}</span> · {kr(b.avg)} avg</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Top types of items — tap for brands</div>
        {stats.catRows.length === 0 && <div style={{ color: MUTED, fontSize: 13, marginBottom: 20 }}>Nothing sold in this period.</div>}
        {stats.catRows.map(c => (
          <div key={c.name} style={{ background: CARD, border: "1px solid " + BORDER, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
            <button onClick={() => setOpenCat(openCat === c.name ? null : c.name)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{c.count} sold · {kr(c.revenue)} · {kr(c.avg)} avg</div>
              </div>
              <span style={{ fontSize: 18, color: "#bbb", transform: openCat === c.name ? "rotate(90deg)" : "none", transition: "transform .15s" }}>{"›"}</span>
            </button>
            {openCat === c.name && (
              <div style={{ padding: "0 14px 14px" }}>
                {c.brands.map(b => (
                  <div key={b.brand} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid " + BG, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{b.brand}</span>
                    <span style={{ color: MUTED }}>{b.count} sold · {kr(b.avg)} avg</span>
                  </div>
                ))}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {c.items.filter(s => s.photo_url).map(s => (
                    <img key={s.id} src={s.photo_url} alt="" onClick={() => setZoom(s.photo_url)} style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, cursor: "pointer", background: "#eee" }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {stats.cur.some(s => s.photo_url) && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", margin: "26px 0 10px" }}>Everything sold ({stats.cur.length})</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {stats.cur.filter(s => s.photo_url).map(s => (
                <img key={s.id} src={s.photo_url} alt="" onClick={() => setZoom(s.photo_url)} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, cursor: "pointer", background: "#eee" }} />
              ))}
            </div>
          </>
        )}
      </div>
      {zoom && <PhotoZoom url={zoom} onClose={() => setZoom("")} />}
    </div>
  );
}

// ── PIN unlock screen ──
function PinGate({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    if (busy || !pin) return;
    setBusy(true); setErr("");
    const ok = await onUnlock(pin);
    if (!ok) { setErr("Wrong PIN — try again."); setPin(""); setBusy(false); }
    // on success the app re-renders past this gate, so no reset needed
  };
  return (
    <div style={{ ...S.page, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, boxSizing: "border-box" }}>
      <Logo size={42} />
      <div style={{ fontSize: 15, fontWeight: 600, color: MUTED, margin: "20px 0 24px" }}>Enter staff PIN to unlock</div>
      <input
        type="password" inputMode="numeric" autoFocus value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
        placeholder="••••••"
        style={{ ...S.field, maxWidth: 240, textAlign: "center", fontSize: 24, letterSpacing: 8, marginBottom: 14 }}
      />
      {err && <div style={{ color: "#c33", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{err}</div>}
      <button onClick={submit} disabled={busy || !pin} style={{ ...S.btn(!!pin && !busy), maxWidth: 240, opacity: (busy || !pin) ? 0.6 : 1 }}>{busy ? "Checking…" : "Unlock"}</button>
    </div>
  );
}

export default function App() {
  const [users, setUsers] = useState([]);
  const [cats, setCats] = useState([]);
  const [sales, setSales] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [brands, setBrands] = useState([]);
  const [currentUser, setCU] = useState(null);
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem("thriftin_tab") || "log"; } catch { return "log"; }
  });
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(true);
  const [toast, setToast] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportPeriod, setReportPeriod] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [authed, setAuthed] = useState(!REQUIRE_PIN);
  const [authReady, setAuthReady] = useState(!REQUIRE_PIN);
  const logoTaps = useRef(0);
  const logoTimer = useRef(null);

  useEffect(() => { try { localStorage.setItem("thriftin_tab", tab); } catch {} }, [tab]);

  // Auto-update: refresh if a newer version has been deployed (on open + periodically).
  useEffect(() => {
    let stop = false;
    isStale().then(s => { if (s && !stop) safeReload(); });
    const onShow = async () => { if (document.visibilityState === "visible" && !stop && await isStale()) safeReload(); };
    document.addEventListener("visibilitychange", onShow);
    const id = setInterval(async () => { if (!stop && await isStale()) setUpdateReady(true); }, 600000);
    return () => { stop = true; document.removeEventListener("visibilitychange", onShow); clearInterval(id); };
  }, []);

  // On open: try to restore a remembered unlock (no PIN if still within the window).
  useEffect(() => {
    if (!REQUIRE_PIN) return;
    (async () => { const ok = await auth.restore(); setAuthed(ok); setAuthReady(true); })();
  }, []);

  // Keep the session alive while unlocked (refresh every 45 min).
  useEffect(() => {
    if (!REQUIRE_PIN || !authed) return;
    const id = setInterval(() => { try { const raw = localStorage.getItem("thriftin_session"); if (raw) { const s = JSON.parse(raw); if (s.refresh_token) auth._refresh(s.refresh_token); } } catch {} }, 2700000);
    return () => clearInterval(id);
  }, [authed]);

  useEffect(() => {
    if (REQUIRE_PIN && !authed) return;
    (async () => {
      try {
        const [u, c, s, inv, br] = await Promise.all([api.get("users", "&order=name"), api.get("categories", "&order=name"), api.get("sales", "&order=created_at.desc"), api.get("inventory", "&order=added_at.desc"), api.get("brands", "&order=name")]);
        setUsers(u); setCats(c); setSales(s); setInventory(inv); setBrands(br);
        const savedId = localStorage.getItem("thriftin_user");
        if (savedId) { const found = u.find(x => x.id === savedId); if (found) { setCU(found); setShowPicker(false); } }
      } catch {}
      setLoading(false);
    })();
  }, [authed]);

  const refresh = async () => {
    const [u, c, s, inv, br] = await Promise.all([api.get("users", "&order=name"), api.get("categories", "&order=name"), api.get("sales", "&order=created_at.desc"), api.get("inventory", "&order=added_at.desc"), api.get("brands", "&order=name")]);
    setUsers(u); setCats(c); setSales(s); setInventory(inv); setBrands(br);
  };

  // Monday-morning: auto-open the Sell-through report once per Monday, per device
  // (defaults to "Last week"). Only fires once the app is fully unlocked and ready.
  useEffect(() => {
    if (loading || !currentUser) return;
    if (REQUIRE_PIN && !authed) return;
    try {
      const now = new Date();
      if (now.getDay() !== 1) return; // 1 = Monday
      const key = now.toISOString().slice(0, 10);
      if (localStorage.getItem("thriftin_report_monday") === key) return;
      localStorage.setItem("thriftin_report_monday", key);
      setReportPeriod("Last week");
      setShowReport(true);
    } catch {}
  }, [loading, currentUser, authed]);

  const pickUser = (u) => { setCU(u); setShowPicker(false); try { localStorage.setItem("thriftin_user", u.id); } catch {} };

  const handleLogoTap = () => {
    logoTaps.current++;
    clearTimeout(logoTimer.current);
    logoTimer.current = setTimeout(() => { logoTaps.current = 0; }, 1500);
    if (logoTaps.current >= 5) { setAdminMode(true); setShowAdmin(true); logoTaps.current = 0; }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  if (REQUIRE_PIN && !authReady) return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><Logo size={36} /></div>;
  if (REQUIRE_PIN && !authed) return <PinGate onUnlock={async (pin) => { const ok = await auth.signIn(pin); if (ok) setAuthed(true); return ok; }} />;

  if (loading) return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><Logo size={36} /><div style={{ color: MUTED, fontSize: 13, marginTop: 12 }}>Loading...</div></div>;

  if (showPicker || !currentUser) {
    return <UserPicker users={users} onPick={pickUser} onAdd={async name => {
      const color = UCOLORS[users.length % UCOLORS.length];
      const u = await api.post("users", { name, color });
      if (u) { await refresh(); pickUser(u); }
    }} />;
  }

  return (
    <div style={S.page}>
      {toast && <Toast msg={toast} />}
      {updateReady && <div onClick={() => location.reload()} style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 78, zIndex: 9000, background: DARK, color: "#fff", borderRadius: 20, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.25)" }}>{"↻"} Update available — tap to refresh</div>}
      {showAdmin && <AdminPanel users={users} cats={cats} adminMode={adminMode} onToggleAdmin={() => setAdminMode(a => !a)} onClose={() => setShowAdmin(false)} onChanged={refresh} onOpenReport={() => { setShowAdmin(false); setReportPeriod(null); setShowReport(true); }} />}
      {showReport && <ReportScreen key={reportPeriod || "manual"} sales={sales} cats={cats} initialPeriod={reportPeriod} onClose={() => { setShowReport(false); setReportPeriod(null); }} />}

      <div style={{ padding: "16px 20px 12px", background: CARD, borderBottom: "1px solid " + BORDER, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div onClick={handleLogoTap} style={{ cursor: "default", display: "flex", alignItems: "baseline", gap: 6 }}><Logo size={24} /><span style={{ fontSize: 9, color: "#ccc" }}>v2</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {adminMode && <button onClick={() => setShowAdmin(true)} style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "#c33", border: "none", borderRadius: 20, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5 }}>ADMIN</button>}
          <button onClick={() => setShowPicker(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: BG, border: "1px solid " + BORDER, borderRadius: 24, padding: "6px 14px 6px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#555" }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: currentUser.color || "#888" }} />
            {currentUser.name}
          </button>
        </div>
      </div>

      <div style={{ padding: "0 0 80px" }}>
        <div style={{ display: tab === "log" ? "block" : "none" }}>
          <LogScreen cats={cats} brands={brands} currentUser={currentUser} onSaved={() => { refresh(); showToast("Sale logged"); }} onCatAdded={refresh} onBrandAdded={refresh} />
        </div>
        <div style={{ display: tab === "history" ? "block" : "none" }}>
          <HistoryScreen sales={sales} cats={cats} users={users} adminMode={adminMode} onChanged={refresh} onCatAdded={refresh} />
        </div>
        <div style={{ display: tab === "shifts" ? "block" : "none" }}>
          <ShiftsScreen users={users} currentUser={currentUser} adminMode={adminMode} active={tab === "shifts"} />
        </div>
        <div style={{ display: tab === "stock" ? "block" : "none" }}>
          <StockScreen inventory={inventory} cats={cats} brands={brands} currentUser={currentUser} adminMode={adminMode} onChanged={refresh} onCatAdded={refresh} onBrandAdded={refresh} showToast={showToast} />
        </div>
      </div>

      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: CARD, borderTop: "1px solid " + BORDER, display: "flex", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {[["log", "Log sale", "\uD83D\uDCF7"], ["stock", "Stock", "\uD83C\uDFF7\uFE0F"], ["history", "History", "\uD83D\uDDC2"], ["shifts", "Schedule", "\uD83D\uDCC5"]].map(([id, lbl, icon]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "11px 0 9px", background: "none", border: "none", borderTop: "3px solid " + (tab === id ? DARK : "transparent"), color: tab === id ? DARK : "#bbb", cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
            <div style={{ fontSize: 20, marginBottom: 2 }}>{icon}</div>{lbl}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", background: DARK, color: "#fff", padding: "12px 28px", borderRadius: 12, fontSize: 14, fontWeight: 600, zIndex: 999, animation: "fadeToast 2.2s ease-in-out", pointerEvents: "none", fontFamily: "inherit" }}>
      {msg}
      <style>{`@keyframes fadeToast { 0%{opacity:0;transform:translateX(-50%) translateY(-10px)} 10%{opacity:1;transform:translateX(-50%) translateY(0)} 80%{opacity:1} 100%{opacity:0} }`}</style>
    </div>
  );
}

function UserPicker({ users, onPick, onAdd }) {
  const [adding, setAdding] = useState(users.length === 0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => { if (!name.trim()) return; setBusy(true); await onAdd(name.trim()); setBusy(false); setName(""); setAdding(false); };

  return (
    <div style={{ background: BG, minHeight: "100vh", maxWidth: 480, margin: "0 auto", padding: "80px 28px", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: DARK }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}><Logo size={40} /></div>
      <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px", textAlign: "center" }}>Who is logging?</h2>
      <p style={{ fontSize: 14, color: MUTED, margin: "0 0 36px", textAlign: "center" }}>Pick yourself or add new staff.</p>

      {users.map(u => (
        <button key={u.id} onClick={() => onPick(u)} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "18px 20px", marginBottom: 10, background: CARD, border: "2px solid " + BORDER, borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 16, fontWeight: 600, color: DARK }}>
          <span style={{ width: 16, height: 16, borderRadius: "50%", background: u.color || "#888", flexShrink: 0 }} />
          {u.name}
        </button>
      ))}

      {adding ? (
        <div style={{ marginTop: 16 }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} placeholder="Your name" style={{ ...S.field, marginBottom: 10, fontSize: 16 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setAdding(false); setName(""); }} style={{ flex: 1, padding: "14px", background: CARD, border: "2px solid " + BORDER, borderRadius: 12, fontSize: 14, fontWeight: 600, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button onClick={go} disabled={busy || !name.trim()} style={S.btn(!!name.trim())}>{busy ? "..." : "Add"}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ display: "block", width: "100%", padding: "16px", marginTop: 14, background: CARD, border: "2px dashed " + BORDER, borderRadius: 14, fontSize: 15, fontWeight: 600, color: MUTED, cursor: "pointer", fontFamily: "inherit" }}>+ New staff member</button>
      )}
    </div>
  );
}

// ── Schedule / shifts / hours ──────────────────────────────
const WD_KEYS  = ["sun","mon","tue","wed","thu","fri","sat"];
const WD_LABEL = { mon:"Mon", tue:"Tue", wed:"Wed", thu:"Thu", fri:"Fri", sat:"Sat", sun:"Sun" };
const MO_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MO_LONG  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function dateToStr(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),da=String(d.getDate()).padStart(2,"0");return y+"-"+m+"-"+da;}
function strToDate(s){return new Date(s+"T12:00:00");}
function weekdayKey(s){return WD_KEYS[strToDate(s).getDay()];}
function templateHours(u,s){const t=u&&u.hours_template;if(!t)return"";const v=t[weekdayKey(s)];return(v===0||v)?v:"";}
function fmtDay(s){const d=strToDate(s);return WD_LABEL[WD_KEYS[d.getDay()]]+" "+d.getDate()+" "+MO_SHORT[d.getMonth()];}
function hoursNum(v){const n=parseFloat(v);return isNaN(n)?0:n;}

const stepBtn = { width:38, height:38, borderRadius:10, border:"2px solid "+BORDER, background:CARD, fontSize:20, fontWeight:700, color:DARK, cursor:"pointer", fontFamily:"inherit", lineHeight:1 };

function HoursStepper({ value, onChange }) {
  const v = (value === "" || value == null) ? "" : value;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <button onClick={() => onChange(Math.max(0, hoursNum(v) - 0.5))} style={stepBtn}>{"\u2212"}</button>
      <input type="number" inputMode="decimal" step="0.5" value={v}
        onChange={e => onChange(e.target.value === "" ? "" : parseFloat(e.target.value))}
        style={{ width:72, textAlign:"center", padding:"9px 6px", border:"2px solid "+BORDER, borderRadius:10, fontSize:17, fontWeight:700, fontFamily:"inherit", color:DARK, background:CARD, outline:"none" }} />
      <span style={{ fontSize:14, color:MUTED }}>h</span>
      <button onClick={() => onChange(hoursNum(v) + 0.5)} style={stepBtn}>+</button>
    </div>
  );
}

function ShiftsScreen({ users, currentUser, adminMode, active }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjHours, setAdjHours] = useState("");
  const [adminUserId, setAdminUserId] = useState(null);
  const [monthOff, setMonthOff] = useState(0);
  const [editDay, setEditDay] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [moveSource, setMoveSource] = useState(null);
  const [payOff, setPayOff] = useState(0);
  const [payCopied, setPayCopied] = useState(false);

  const load = useCallback(async () => {
    try { const s = await api.get("shifts", "&order=date.desc"); setShifts(s); }
    catch (e) { setErr(e.message || "Could not load schedule"); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);

  // Keep the schedule fresh: reload when the tab is opened or the app regains focus,
  // so two devices/views don't drift out of sync (there's no live sync otherwise).
  useEffect(() => { if (active) load(); }, [active, load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  const today = dateToStr(new Date());
  const me = users.find(u => u.id === currentUser.id) || currentUser;
  const findShift = (uid, dstr) => shifts.find(s => s.user_id === uid && s.date === dstr);

  const upsert = async (u, dstr, patch) => {
    setErr("");
    try {
      const ex = findShift(u.id, dstr);
      if (ex) await api.patch("shifts", ex.id, patch);
      else await api.post("shifts", { user_id: u.id, user_name: u.name, date: dstr, ...patch });
      await load();
    } catch (e) { setErr(e.message || "Save failed"); }
  };
  const clearShift = async (id) => { setErr(""); try { await api.del("shifts", id); await load(); } catch (e) { setErr(e.message || "Delete failed"); } };

  const doMove = async (destDs) => {
    const src = moveSource;
    if (!src) return;
    if (destDs === src.ds) { setMoveSource(null); return; }
    setErr("");
    try {
      const destSh = shifts.find(s => s.user_id === src.userId && s.date === destDs);
      if (destSh) {
        await api.patch("shifts", src.sh.id, { status: destSh.status, hours: destSh.hours });
        await api.patch("shifts", destSh.id, { status: src.sh.status, hours: src.sh.hours });
      } else {
        await api.post("shifts", { user_id: src.userId, user_name: src.userName, date: destDs, status: src.sh.status, hours: src.sh.hours });
        await api.del("shifts", src.sh.id);
      }
      await load();
    } catch (e) { setErr(e.message || "Move failed"); }
    setMoveSource(null);
  };

  const reassign = async (srcShift, srcDs, targetUser) => {
    setErr("");
    if (!srcShift) return;
    if (shifts.find(s => s.user_id === targetUser.id && s.date === srcDs)) { setErr(targetUser.name + " already has a shift on " + fmtDay(srcDs) + "."); return; }
    try {
      const newHours = targetUser.tracks_hours ? srcShift.hours : null;
      await api.patch("shifts", srcShift.id, { user_id: targetUser.id, user_name: targetUser.name, hours: newHours, status: srcShift.status });
      await load();
    } catch (e) { setErr(e.message || "Reassign failed"); }
  };

  if (loading) return <div style={{ padding:40, textAlign:"center", color:MUTED, fontSize:13 }}>Loading schedule...</div>;

  const myToday = findShift(me.id, today);
  const myHourly = !!me.tracks_hours;
  const labelToday = <div style={{ fontSize:11, fontWeight:700, color:MUTED, letterSpacing:1.5, textTransform:"uppercase", marginBottom:6 }}>Today {"\u00b7"} {fmtDay(today)}</div>;

  const adjustBlock = (onSave) => (
    <div style={{ display:"flex", flexDirection:"column", gap:12, alignItems:"flex-start", marginTop:12 }}>
      <HoursStepper value={adjHours} onChange={setAdjHours} />
      <div style={{ display:"flex", gap:8, width:"100%" }}>
        <button onClick={() => setAdjusting(false)} style={{ flex:1, padding:"12px", background:CARD, border:"2px solid "+BORDER, borderRadius:10, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
        <button onClick={async () => { await onSave(); setAdjusting(false); }} style={{ flex:2, ...S.btn(hoursNum(adjHours) > 0), padding:"12px" }}>Save {hoursNum(adjHours)}h</button>
      </div>
    </div>
  );

  const TodayCard = () => {
    if (myHourly) {
      if (myToday && myToday.status === "scheduled") {
        return (
          <div style={S.card}>
            {labelToday}
            <div style={{ fontSize:16, fontWeight:700, marginBottom:14 }}>Scheduled: {myToday.hours}h</div>
            {!adjusting ? (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <button onClick={() => upsert(me, today, { status:"worked", hours: myToday.hours })} style={S.btn(true)}>Confirm worked {"\u2014"} {myToday.hours}h</button>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => { setAdjHours(myToday.hours); setAdjusting(true); }} style={{ flex:1, padding:"12px", background:CARD, border:"2px solid "+BORDER, borderRadius:10, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Different hours</button>
                  <button onClick={() => upsert(me, today, { status:"off", hours:null })} style={{ flex:1, padding:"12px", background:CARD, border:"2px solid "+BORDER, borderRadius:10, fontSize:13, fontWeight:600, color:"#c33", cursor:"pointer", fontFamily:"inherit" }}>Didn{"\u2019"}t work</button>
                </div>
              </div>
            ) : adjustBlock(() => upsert(me, today, { status:"worked", hours: hoursNum(adjHours) }))}
          </div>
        );
      }
      if (myToday && myToday.status === "worked") {
        return (
          <div style={{ ...S.card, borderColor:"#bfe3cf", background:"#F2FAF5" }}>
            {labelToday}
            <div style={{ fontSize:16, fontWeight:700, color:"#2C6E49" }}>{"\u2713"} Logged {myToday.hours}h</div>
            {!adjusting
              ? <button onClick={() => { setAdjHours(myToday.hours); setAdjusting(true); }} style={{ marginTop:10, padding:"8px 14px", background:CARD, border:"2px solid "+BORDER, borderRadius:10, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Edit</button>
              : adjustBlock(() => upsert(me, today, { status:"worked", hours: hoursNum(adjHours) }))}
          </div>
        );
      }
      if (myToday && myToday.status === "off") {
        return (
          <div style={S.card}>
            {labelToday}
            <div style={{ fontSize:15, fontWeight:600, color:MUTED }}>Marked as not worked</div>
            <button onClick={() => clearShift(myToday.id)} style={{ marginTop:10, padding:"8px 14px", background:CARD, border:"2px solid "+BORDER, borderRadius:10, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Undo</button>
          </div>
        );
      }
      const pre = templateHours(me, today) || "";
      return (
        <div style={S.card}>
          {labelToday}
          <div style={{ fontSize:15, fontWeight:600, color:MUTED, marginBottom:14 }}>Not scheduled today</div>
          {!adjusting
            ? <button onClick={() => { setAdjHours(pre); setAdjusting(true); }} style={S.btn(true)}>Log a day worked</button>
            : adjustBlock(() => upsert(me, today, { status:"worked", hours: hoursNum(adjHours) }))}
        </div>
      );
    }
    return (
      <div style={S.card}>
        {labelToday}
        <div style={{ fontSize:15, fontWeight:600, color: myToday ? DARK : MUTED }}>{myToday ? "You\u2019re on the schedule today" : "Not on the schedule today"}</div>
      </div>
    );
  };

  const upcoming = shifts.filter(s => s.date >= today && s.status !== "off");
  const byDate = {};
  upcoming.forEach(s => { (byDate[s.date] = byDate[s.date] || []).push(s); });
  const upcomingDates = Object.keys(byDate).sort().slice(0, 10);
  const ucolor = (uid) => { const u = users.find(x => x.id === uid); return u ? (u.color || "#888") : "#888"; };

  const adminUser = users.find(u => u.id === adminUserId) || users.find(u => u.tracks_hours) || users[0];
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + monthOff);
  const yr = base.getFullYear(), mo = base.getMonth();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const monthDays = [];
  for (let d = 1; d <= daysInMonth; d++) monthDays.push(dateToStr(new Date(yr, mo, d)));
  const monthShifts = adminUser ? monthDays.map(ds => ({ ds, sh: findShift(adminUser.id, ds) })) : [];
  const workedHours = monthShifts.reduce((sum, x) => sum + (x.sh && x.sh.status === "worked" ? hoursNum(x.sh.hours) : 0), 0);
  const workedDays = monthShifts.filter(x => x.sh && x.sh.status === "worked").length;
  const pendingPast = monthShifts.filter(x => x.sh && x.sh.status === "scheduled" && x.ds < today);

  // ── Payroll / accountant export: the 25th cycle, ALL hours-tracking staff, planned hours included ──
  // Cycle ends on the 25th (paid that day); the next begins the 26th — no day counted twice.
  const payNow = new Date();
  let _pm = payNow.getMonth(), _py = payNow.getFullYear();
  if (payNow.getDate() > 25) _pm += 1;                 // default to the upcoming payday
  _pm += payOff;
  const payEnd = new Date(_py, _pm, 25);               // payday — the 25th
  const payStart = new Date(_py, _pm - 1, 26);         // day after the previous payday
  const payStartStr = dateToStr(payStart), payEndStr = dateToStr(payEnd);
  const fmtShort = d => d.getDate() + " " + MO_SHORT[d.getMonth()];
  const payStaff = users.filter(u => u.tracks_hours).map(u => {
    const us = shifts.filter(s => s.user_id === u.id && s.date >= payStartStr && s.date <= payEndStr && s.status !== "off" && s.hours != null)
      .sort((a, b) => a.date < b.date ? -1 : 1);
    return { u, us, total: us.reduce((t, s) => t + hoursNum(s.hours), 0), planned: us.filter(s => s.status !== "worked").length };
  });
  const copyPayroll = async () => {
    let out = "Hours — paid " + fmtShort(payEnd) + " " + payEnd.getFullYear() + "  (" + fmtShort(payStart) + " – " + fmtShort(payEnd) + ")\n";
    payStaff.forEach(({ u, us, total }) => {
      out += "\n" + u.name + " — " + total + " h\n";
      us.forEach(s => { out += "  " + fmtDay(s.date) + "  " + s.hours + "h" + (s.status !== "worked" ? " (planned)" : "") + "\n"; });
    });
    try { await navigator.clipboard.writeText(out); setPayCopied(true); setTimeout(() => setPayCopied(false), 1500); } catch {}
  };

  // Per-person accountant copy: SAME 25th pay cycle as above, one staff member.
  const buildOne = (u) => {
    const row = payStaff.find(p => p.u.id === u.id);
    const us = row ? row.us : [];
    let out = u.name + " \u2014 paid " + fmtShort(payEnd) + " " + payEnd.getFullYear() + "  (" + fmtShort(payStart) + " \u2013 " + fmtShort(payEnd) + ")\n";
    us.forEach(x => { out += "  " + fmtDay(x.date) + "  " + x.hours + "h" + (x.status !== "worked" ? " (planned)" : "") + "\n"; });
    out += "\nTotal: " + (row ? row.total : 0) + " h  (" + us.length + " days)";
    return out;
  };
  const copyOne = async (u) => { try { await navigator.clipboard.writeText(buildOne(u)); setCopiedId(u.id); setTimeout(() => setCopiedId(null), 1500); } catch {} };

  const applyBaseline = async () => {
    if (!adminUser || !adminUser.hours_template) { setErr("No baseline set. Set " + (adminUser ? adminUser.name : "this person") + "'s weekly hours in Admin first."); return; }
    setErr("");
    try {
      const tpl = adminUser.hours_template;
      for (const { ds, sh } of monthShifts) {
        if (sh) continue;
        const v = tpl[weekdayKey(ds)];
        if (v === 0 || v) await api.post("shifts", { user_id: adminUser.id, user_name: adminUser.name, date: ds, status: "scheduled", hours: v });
      }
      await load();
    } catch (e) { setErr(e.message || "Could not apply baseline"); }
  };

  return (
    <div style={{ padding:"16px 16px 0" }}>
      {err && <div style={{ background:"#FDECEC", border:"1px solid #F0C0C0", color:"#A33", borderRadius:10, padding:"10px 12px", fontSize:13, marginBottom:12 }}>{err}</div>}

      <TodayCard />

      <div style={{ fontSize:12, fontWeight:700, color:MUTED, letterSpacing:1.5, textTransform:"uppercase", margin:"22px 0 10px" }}>Upcoming</div>
      {upcomingDates.length === 0 && <div style={{ color:MUTED, fontSize:13, paddingBottom:8 }}>Nothing scheduled yet.</div>}
      {upcomingDates.map(ds => (
        <div key={ds} style={{ ...S.card, padding:"12px 16px" }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>{fmtDay(ds)}{ds === today ? "  \u00b7 today" : ""}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {byDate[ds].map(s => (
              <div key={s.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:BG, borderRadius:20, fontSize:13 }}>
                <span style={{ width:9, height:9, borderRadius:"50%", background:ucolor(s.user_id) }} />
                {s.user_name}
                {s.hours != null && <span style={{ color:MUTED }}>{s.hours}h</span>}
                {s.status === "worked" && <span style={{ color:"#2C6E49", fontSize:11 }}>{"\u2713"}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {adminMode && adminUser && (
        <div style={{ marginTop:28, marginBottom:24 }}>
          <div style={{ fontSize:10, fontWeight:800, color:"#c33", letterSpacing:1.2, marginBottom:12 }}>ADMIN {"\u2014"} SCHEDULE</div>

          {/* Payroll / accountant export \u2014 all hours-tracking staff, 25th cycle, planned hours included */}
          <div style={{ ...S.card, marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <button onClick={() => setPayOff(payOff - 1)} style={{ ...stepBtn, width:40 }}>{"\u2039"}</button>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:14, fontWeight:800 }}>Payroll {"\u2014"} paid {fmtShort(payEnd)} {payEnd.getFullYear()}</div>
                <div style={{ fontSize:11, color:MUTED }}>{fmtShort(payStart)} {"\u2013"} {fmtShort(payEnd)} {"\u00b7"} incl. planned</div>
              </div>
              <button onClick={() => setPayOff(payOff + 1)} style={{ ...stepBtn, width:40 }}>{"\u203a"}</button>
            </div>
            {payStaff.every(p => p.us.length === 0) && <div style={{ fontSize:13, color:MUTED, padding:"6px 0" }}>No hours in this period yet.</div>}
            {payStaff.map(({ u, us, total, planned }) => (
              <div key={u.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, padding:"8px 0", borderTop:"1px solid "+BG, fontSize:14 }}>
                <span style={{ fontWeight:600, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name}</span>
                <span style={{ fontWeight:700 }}>{total}h{planned > 0 ? <span style={{ color:"#C58A1F", fontSize:11, fontWeight:600 }}>{"  \u00b7 "}{planned} planned</span> : null}</span>
                <button onClick={() => copyOne(u)} disabled={us.length === 0} style={{ flexShrink:0, padding:"5px 10px", background: us.length ? CARD : BG, border:"1px solid "+BORDER, borderRadius:8, fontSize:12, fontWeight:600, color: us.length ? DARK : MUTED, cursor: us.length ? "pointer" : "default", fontFamily:"inherit" }}>{copiedId === u.id ? "Copied \u2713" : "Copy"}</button>
              </div>
            ))}
            <button onClick={copyPayroll} style={{ width:"100%", marginTop:12, padding:"12px", background:DARK, border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{payCopied ? "Copied \u2713" : "Copy all staff"}</button>
          </div>

          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:8, marginBottom:14 }}>
            {users.map(u => (
              <button key={u.id} onClick={() => { setAdminUserId(u.id); setMoveSource(null); }} style={{ ...S.chip(adminUser.id === u.id, u.color), flexShrink:0 }}>
                {u.name}{u.tracks_hours ? "" : " \u00b7 owner"}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <button onClick={() => { setMonthOff(monthOff - 1); setMoveSource(null); }} style={{ ...stepBtn, width:44 }}>{"\u2039"}</button>
            <div style={{ fontSize:15, fontWeight:700 }}>{MO_LONG[mo]} {yr}</div>
            <button onClick={() => { setMonthOff(monthOff + 1); setMoveSource(null); }} style={{ ...stepBtn, width:44 }}>{"\u203a"}</button>
          </div>

          {adminUser.tracks_hours && (
            <div style={{ ...S.card }}>
              <div style={{ fontSize:22, fontWeight:800 }}>{workedHours}h</div>
              <div style={{ fontSize:12, color:MUTED }}>{workedDays} days confirmed {"\u00b7"} {MO_LONG[mo]} (scheduling view)</div>
            </div>
          )}

          {adminUser.tracks_hours && pendingPast.length > 0 && (
            <div style={{ background:"#FFF6E5", border:"1px solid #F0DCB0", borderRadius:10, padding:"10px 12px", fontSize:13, color:"#8A6D2F", marginBottom:12 }}>
              {pendingPast.length} past day{pendingPast.length > 1 ? "s" : ""} scheduled but not confirmed {"\u2014"} won{"\u2019"}t count until you resolve them below.
            </div>
          )}

          {!moveSource && (
            <button onClick={applyBaseline} style={{ width:"100%", padding:"11px", background:CARD, border:"2px dashed "+BORDER, borderRadius:10, fontSize:13, fontWeight:600, color:"#555", cursor:"pointer", fontFamily:"inherit", marginBottom:12 }}>
              Apply {adminUser.name}{"\u2019"}s baseline to this month
            </button>
          )}

          {moveSource && (
            <div style={{ background:"#EAF2FB", border:"1px solid #BBD4F0", borderRadius:10, padding:"10px 12px", marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
              <span style={{ fontSize:13, color:"#1D3557" }}>Moving {fmtDay(moveSource.ds)} {"\u2014"} tap a day to place it</span>
              <button onClick={() => setMoveSource(null)} style={{ padding:"6px 12px", background:CARD, border:"1px solid #BBD4F0", borderRadius:8, fontSize:12, fontWeight:600, color:"#1D3557", cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>Cancel</button>
            </div>
          )}

          {monthShifts.map(({ ds, sh }) => {
            const past = ds < today, isToday = ds === today;
            const isMoveSrc = moveSource && moveSource.ds === ds;
            let right = <span style={{ color:"#ccc", fontSize:13 }}>{"\u2014"}</span>;
            if (sh) {
              if (sh.status === "worked") right = <span style={{ color:"#2C6E49", fontWeight:700, fontSize:14 }}>{sh.hours != null ? sh.hours + "h" : "in"} {"\u2713"}</span>;
              else if (sh.status === "scheduled") right = <span style={{ color: past ? "#C58A1F" : "#555", fontWeight:600, fontSize:14 }}>{sh.hours != null ? sh.hours + "h" : "in"} {past ? "needs confirm" : "planned"}</span>;
              else right = <span style={{ color:MUTED, fontSize:13 }}>off</span>;
            }
            const border = isMoveSrc ? "2px solid #1D3557" : (moveSource ? "2px dashed #BBD4F0" : "1px solid "+BORDER);
            return (
              <button key={ds} onClick={() => moveSource ? doMove(ds) : setEditDay({ ds, user: adminUser })} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px", background: isMoveSrc ? "#EAF2FB" : (isToday ? "#F2F0EB" : CARD), border, borderRadius:10, marginBottom:6, cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                <span style={{ fontSize:14, fontWeight: isToday ? 700 : 500 }}>{fmtDay(ds)}{isMoveSrc ? "  (moving)" : ""}</span>
                {right}
              </button>
            );
          })}
        </div>
      )}

      {editDay && (
        <DayEditorSheet
          ds={editDay.ds} user={editDay.user} shift={findShift(editDay.user.id, editDay.ds)} users={users}
          onClose={() => setEditDay(null)}
          onMove={() => { const sh = findShift(editDay.user.id, editDay.ds); if (sh) { setMoveSource({ ds: editDay.ds, sh, userId: editDay.user.id, userName: editDay.user.name }); } setEditDay(null); }}
          onReassign={async (tu) => { await reassign(findShift(editDay.user.id, editDay.ds), editDay.ds, tu); setEditDay(null); }}
          onApply={async (patch) => { await upsert(editDay.user, editDay.ds, patch); setEditDay(null); }}
          onClear={async (id) => { await clearShift(id); setEditDay(null); }}
        />
      )}
    </div>
  );
}

function DayEditorSheet({ ds, user, shift, users, onClose, onApply, onClear, onMove, onReassign }) {
  const hourly = !!user.tracks_hours;
  const others = (users || []).filter(u => u.id !== user.id);
  const [hours, setHours] = useState(() => {
    if (shift && shift.hours != null) return shift.hours;
    const t = templateHours(user, ds);
    return t === "" ? "" : t;
  });
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:650, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={onClose}>
      <div style={{ width:"100%", maxWidth:480, background:CARD, borderRadius:"18px 18px 0 0", maxHeight:"88vh", overflowY:"auto", padding:"22px 20px 36px" }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <div style={{ fontSize:17, fontWeight:800 }}>{user.name}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:24, color:"#aaa", cursor:"pointer" }}>{"\u00d7"}</button>
        </div>
        <div style={{ fontSize:13, color:MUTED, marginBottom:18 }}>{fmtDay(ds)}</div>

        {hourly && (
          <div style={{ marginBottom:18 }}>
            <div style={S.label}>Hours</div>
            <HoursStepper value={hours} onChange={setHours} />
          </div>
        )}

        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {hourly ? (
            <>
              <button onClick={() => onApply({ status:"scheduled", hours: hoursNum(hours) })} style={{ padding:"13px", background:CARD, border:"2px solid "+BORDER, borderRadius:10, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Schedule {hoursNum(hours)}h</button>
              <button onClick={() => onApply({ status:"worked", hours: hoursNum(hours) })} style={S.btn(true)}>Mark worked {hoursNum(hours)}h</button>
              <button onClick={() => onApply({ status:"off", hours:null })} style={{ padding:"13px", background:CARD, border:"2px solid "+BORDER, borderRadius:10, fontSize:14, fontWeight:600, color:"#c33", cursor:"pointer", fontFamily:"inherit" }}>Mark off</button>
            </>
          ) : (
            <button onClick={() => onApply({ status:"scheduled", hours:null })} style={S.btn(true)}>Add to schedule</button>
          )}
          {shift && onMove && <button onClick={onMove} style={{ padding:"13px", background:CARD, border:"2px solid "+BORDER, borderRadius:10, fontSize:14, fontWeight:600, color:"#1D3557", cursor:"pointer", fontFamily:"inherit" }}>Move to another day (same person)</button>}
        </div>

        {shift && onReassign && others.length > 0 && (
          <div style={{ marginTop:20 }}>
            <div style={{ ...S.label, marginBottom:8 }}>Give this day to</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {others.map(u => (
                <button key={u.id} onClick={() => onReassign(u)} style={{ ...S.chip(false, u.color), padding:"8px 14px", fontSize:13 }}>{u.name}</button>
              ))}
            </div>
          </div>
        )}

        {shift && (
          <button onClick={() => onClear(shift.id)} style={{ width:"100%", marginTop:20, padding:"13px", background:"#FDECEC", border:"1px solid #F0C0C0", borderRadius:10, fontSize:14, fontWeight:700, color:"#c33", cursor:"pointer", fontFamily:"inherit" }}>Delete this shift</button>
        )}
      </div>
    </div>
  );
}

function UserHoursConfig({ user, onChanged }) {
  const init = { mon:"", tue:"", wed:"", thu:"", fri:"", sat:"", sun:"" };
  const [tracks, setTracks] = useState(!!user.tracks_hours);
  const [tpl, setTpl] = useState({ ...init, ...(user.hours_template || {}) });
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);

  const persist = async (nextTracks, nextTpl) => {
    const clean = {};
    Object.keys(nextTpl).forEach(k => { if (nextTpl[k] !== "" && nextTpl[k] != null) clean[k] = parseFloat(nextTpl[k]); });
    await api.patch("users", user.id, { tracks_hours: nextTracks, hours_template: Object.keys(clean).length ? clean : null });
    await onChanged();
    setSaved(true); setTimeout(() => setSaved(false), 1200);
  };
  const toggle = async () => { const n = !tracks; setTracks(n); await persist(n, tpl); };
  const saveTpl = async () => { await persist(tracks, tpl); setOpen(false); };

  return (
    <div style={{ marginTop:8 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:12, color:MUTED }}>{tracks ? "Hourly \u00b7 tracks hours" : "Owner / no hours"}</span>
        <button onClick={toggle} style={{ padding:"5px 12px", background: tracks ? DARK : CARD, border:"2px solid "+(tracks ? DARK : BORDER), borderRadius:8, fontSize:11, fontWeight:700, color: tracks ? "#fff" : "#555", cursor:"pointer", fontFamily:"inherit" }}>{tracks ? "ON" : "OFF"}</button>
      </div>
      {tracks && (
        <div style={{ marginTop:8 }}>
          <button onClick={() => setOpen(o => !o)} style={{ fontSize:12, color:DARK, background:"none", border:"none", textDecoration:"underline", cursor:"pointer", fontFamily:"inherit", padding:0 }}>{open ? "Hide" : "Edit"} weekly hours{saved ? "  \u2713 saved" : ""}</button>
          {open && (
            <div style={{ marginTop:10 }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:5 }}>
                {["mon","tue","wed","thu","fri","sat","sun"].map(k => (
                  <div key={k} style={{ textAlign:"center" }}>
                    <div style={{ fontSize:10, color:MUTED, marginBottom:3 }}>{WD_LABEL[k]}</div>
                    <input type="number" inputMode="decimal" step="0.5" value={tpl[k]} onChange={e => setTpl({ ...tpl, [k]: e.target.value })}
                      style={{ width:"100%", textAlign:"center", padding:"7px 2px", border:"2px solid "+BORDER, borderRadius:8, fontSize:13, fontFamily:"inherit", outline:"none", color:DARK, boxSizing:"border-box" }} />
                  </div>
                ))}
              </div>
              <button onClick={saveTpl} style={{ marginTop:10, padding:"9px 14px", background:DARK, border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Save hours</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminPanel({ users, cats, adminMode, onToggleAdmin, onClose, onChanged, onOpenReport }) {
  const [confirm, setConfirm] = useState(null);

  const removeUser = async (id) => { await api.del("users", id); await onChanged(); setConfirm(null); };
  const removeCat = async (id) => { await api.del("categories", id); await onChanged(); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: CARD, borderRadius: "18px 18px 0 0", maxHeight: "85vh", overflowY: "auto", padding: "24px 20px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Admin</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: "#aaa", cursor: "pointer" }}>{"\u00d7"}</button>
        </div>

        {/* Admin mode toggle */}
        <div style={{ background: adminMode ? "#FDECEC" : BG, border: "1px solid " + (adminMode ? "#F0C0C0" : BORDER), borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: adminMode ? "#A33" : DARK }}>Admin mode {adminMode ? "ON" : "OFF"}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>When on, you can edit photos and permanently delete sales and stock items.</div>
            </div>
            <button onClick={onToggleAdmin} style={{ padding: "10px 16px", background: adminMode ? "#c33" : DARK, border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, marginLeft: 12 }}>
              {adminMode ? "Turn off" : "Turn on"}
            </button>
          </div>
        </div>

        <button onClick={onOpenReport} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: DARK, border: "none", borderRadius: 12, marginBottom: 22, cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{"📊"} Sell-through report</span>
          <span style={{ color: "#fff", fontSize: 18 }}>{"›"}</span>
        </button>

        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Staff members</div>
        {users.map(u => (
          <div key={u.id} style={{ padding: "12px 0", borderBottom: "1px solid " + BORDER }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: u.color }} />
                <span style={{ fontSize: 15, fontWeight: 600 }}>{u.name}</span>
              </div>
              <button onClick={() => setConfirm(u)} style={{ padding: "6px 14px", background: BG, border: "1px solid #e0d0d0", borderRadius: 8, fontSize: 12, color: "#c33", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
            </div>
            <UserHoursConfig user={u} onChanged={onChanged} />
          </div>
        ))}

        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10, marginTop: 28 }}>Categories</div>
        {cats.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid " + BORDER }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: getCatColor(c, cats), flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontSize: 11, color: MUTED }}>({c.size_type})</span>
            </div>
            <button onClick={() => removeCat(c.id)} style={{ padding: "5px 12px", background: BG, border: "1px solid #e0d0d0", borderRadius: 8, fontSize: 11, color: "#c33", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
          </div>
        ))}

        {confirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: CARD, borderRadius: 16, padding: 24, maxWidth: 320 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Remove {confirm.name}?</div>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>Their logged sales will remain but won't be linked to a user.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: "12px", background: CARD, border: "2px solid " + BORDER, borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={() => removeUser(confirm.id)} style={{ flex: 1, padding: "12px", background: "#c33", border: "none", borderRadius: 10, fontSize: 13, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getCatColor(cat, allCats) {
  if (cat.color) return cat.color;
  const idx = allCats.findIndex(c => c.id === cat.id);
  return CCOLORS[idx % CCOLORS.length];
}

function DescField({ value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={focused ? "" : "Colour, details..."}
      rows={2}
      style={{ ...S.field, resize: "none", lineHeight: 1.6 }}
    />
  );
}

// ── Fullscreen photo viewer with pinch/double-tap zoom ──
function PhotoZoom({ url, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const lastDist = useRef(null);
  const lastPan = useRef(null);

  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist.current != null) {
        const next = Math.min(5, Math.max(1, scale * (dist / lastDist.current)));
        setScale(next);
        if (next === 1) setPos({ x: 0, y: 0 });
      }
      lastDist.current = dist;
    } else if (e.touches.length === 1 && scale > 1) {
      const t = e.touches[0];
      if (lastPan.current) {
        setPos(p => ({ x: p.x + (t.clientX - lastPan.current.x), y: p.y + (t.clientY - lastPan.current.y) }));
      }
      lastPan.current = { x: t.clientX, y: t.clientY };
    }
  };
  const onTouchEnd = () => { lastDist.current = null; lastPan.current = null; };
  const onDouble = () => { if (scale > 1) { setScale(1); setPos({ x: 0, y: 0 }); } else setScale(2.5); };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 24, color: "#fff", fontSize: 22, width: 44, height: 44, cursor: "pointer", zIndex: 2 }}>{"\u00d7"}</button>
      <img
        src={url}
        alt=""
        onClick={e => e.stopPropagation()}
        onDoubleClick={onDouble}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: lastDist.current ? "none" : "transform 0.15s", touchAction: "none" }}
      />
      <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Double-tap or pinch to zoom</div>
    </div>
  );
}

// ── Brand type-ahead picker ──
function BrandPicker({ brands, value, onChange, onBrandAdded }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  // If a brand is selected, show it as a pill with a clear button
  if (value) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...S.chip(true, null), display: "inline-flex", alignItems: "center", gap: 8 }}>
          {value}
          <span onClick={() => { onChange(""); setQ(""); }} style={{ cursor: "pointer", fontWeight: 800, fontSize: 16, lineHeight: 1 }}>{"\u00d7"}</span>
        </span>
      </div>
    );
  }

  const ql = q.trim().toLowerCase();
  const matches = ql ? brands.filter(b => b.name.toLowerCase().includes(ql)) : brands;
  const exact = brands.some(b => b.name.toLowerCase() === ql);

  const pick = (name) => { onChange(normalizeBrand(name)); setQ(""); setOpen(false); };

  const addNew = async () => {
    const name = normalizeBrand(q.trim());
    if (!name) return;
    setAdding(true);
    try {
      const b = await api.post("brands", { name });
      if (b) { await onBrandAdded(); pick(b.name); }
    } catch (e) {
      // if it already exists (unique conflict), just pick the typed value
      pick(name);
    }
    setAdding(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Type to find brand..."
        style={S.field}
      />
      {open && (
        <div style={{ marginTop: 8, maxHeight: 200, overflowY: "auto", border: "1px solid " + BORDER, borderRadius: 10, background: CARD }}>
          {matches.map(b => (
            <button key={b.id} onClick={() => pick(b.name)} style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", borderBottom: "1px solid " + BG, fontSize: 14, fontWeight: 600, color: DARK, cursor: "pointer", fontFamily: "inherit" }}>{b.name}</button>
          ))}
          {ql && !exact && (
            <button onClick={addNew} disabled={adding} style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", background: BG, border: "none", fontSize: 14, fontWeight: 700, color: "#06A77D", cursor: "pointer", fontFamily: "inherit" }}>
              {adding ? "Adding..." : `+ Add "${q.trim()}"`}
            </button>
          )}
          {!matches.length && !ql && <div style={{ padding: "11px 14px", fontSize: 13, color: MUTED }}>Start typing a brand</div>}
        </div>
      )}
    </div>
  );
}

// ── Denim Size Picker ──
function DenimSizePicker({ type, value, onChange, catColor }) {
  const parsed = parseDenimSize(value);
  const [waist, setWaist] = useState(parsed.w);
  const [length, setLength] = useState(parsed.l);

  useEffect(() => {
    const p = parseDenimSize(value);
    setWaist(p.w);
    setLength(p.l);
  }, [value]);

  const updateSize = (w, l) => {
    setWaist(w);
    setLength(l);
    if (type === "denim_waist") {
      onChange(w ? "W" + w : "");
    } else {
      onChange(formatDenimSize(w, l));
    }
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.2, marginBottom: 6 }}>WAIST</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: type === "denim_full" ? 12 : 0 }}>
        {SZ_DENIM_W.map(s => (
          <button key={s} onClick={() => updateSize(waist === s ? "" : s, length)}
            style={{ ...S.chip(waist === s, catColor), padding: "8px 12px", fontSize: 13, minWidth: 42, textAlign: "center" }}>
            {s}
          </button>
        ))}
      </div>
      {type === "denim_full" && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.2, marginBottom: 6 }}>LENGTH</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SZ_DENIM_L.map(s => (
              <button key={s} onClick={() => updateSize(waist, length === s ? "" : s)}
                style={{ ...S.chip(length === s, catColor), padding: "8px 12px", fontSize: 13, minWidth: 42, textAlign: "center" }}>
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Log Screen ──
function LogScreen({ cats, brands, currentUser, onSaved, onCatAdded, onBrandAdded }) {
  const [photo, setPhoto] = useState(null);
  const [catId, setCatId] = useState("");
  const [size, setSize] = useState("");
  const [brand, setBrand] = useState("");
  const [sleeve, setSleeve] = useState("");
  const [comment, setComment] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const fileRef = useRef();

  const cat = cats.find(c => c.id === catId);
  const sizeInfo = getSizeOpts(cat);
  const catColor = cat ? getCatColor(cat, cats) : null;

  const handleFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const blob = await compressPhoto(f);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch {}
    e.target.value = "";
  };

  const [err, setErr] = useState("");

  const save = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      let photo_url = null;
      if (photo) photo_url = await api.upload(photo.blob);
      await api.post("sales", {
        user_id: currentUser.id, user_name: currentUser.name,
        category_id: catId || null, category_name: cat?.name || null,
        size: size || null, comment: comment.trim() || null, brand: brand || null,
        sleeve: isShirtCat(cat) ? (sleeve || null) : null,
        price: price ? parseFloat(price) : null, photo_url,
      });
      setPhoto(null); setCatId(""); setSize(""); setComment(""); setPrice(""); setBrand(""); setSleeve("");
      onSaved();
    } catch (e) {
      setErr(e.message || "Could not log the sale. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const addCat = async (name, sizeType) => {
    const c = await api.post("categories", { name, size_type: sizeType, color: CCOLORS[Math.floor(Math.random() * CCOLORS.length)] });
    if (c) { await onCatAdded(); setCatId(c.id); setSize(""); setShowAddCat(false); }
  };

  return (
    <div style={{ padding: "16px 16px 0" }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />

      {photo ? (
        <div style={{ position: "relative", marginBottom: 14, borderRadius: 14, overflow: "hidden", background: "#f0ede8", border: "1px solid " + BORDER }}>
          <img src={photo.preview} alt="" style={{ width: "100%", maxHeight: 420, objectFit: "contain", display: "block", background: "#f0ede8" }} />
          <button onClick={() => setPhoto(null)} style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 24, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} style={{ width: "100%", aspectRatio: "3/4", maxHeight: 340, background: CARD, border: "2px dashed " + BORDER, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 14 }}>
          <div style={{ fontSize: 44, marginBottom: 10, opacity: 0.4 }}>{"\uD83D\uDCF7"}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#888" }}>Add photo</div>
          <div style={{ fontSize: 12, color: "#bbb", marginTop: 4 }}>Camera roll or take new</div>
        </button>
      )}

      <div style={S.card}>
        <label style={S.label}>Description</label>
        <DescField value={comment} onChange={setComment} />
      </div>

      <div style={S.card}>
        <label style={S.label}>Brand</label>
        <BrandPicker brands={brands} value={brand} onChange={setBrand} onBrandAdded={onBrandAdded} />
      </div>

      <div style={S.card}>
        <label style={S.label}>Category</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {cats.map(c => {
            const cc = getCatColor(c, cats);
            return <button key={c.id} onClick={() => { setCatId(c.id); setSize(""); setShowAddCat(false); }} style={S.chip(catId === c.id, cc)}>{c.name}</button>;
          })}
          <button onClick={() => setShowAddCat(s => !s)} style={{ ...S.chip(showAddCat, null), borderStyle: "dashed" }}>+ New</button>
        </div>
        {showAddCat && <AddCatStrip onAdd={addCat} onCancel={() => setShowAddCat(false)} />}
      </div>

      {cat && (
        <div style={S.card}>
          <label style={S.label}>Size</label>
          {(sizeInfo.type === "denim_full" || sizeInfo.type === "denim_waist") ? (
            <DenimSizePicker type={sizeInfo.type} value={size} onChange={setSize} catColor={catColor} />
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sizeInfo.opts.map(s => <button key={s} onClick={() => setSize(s)} style={S.chip(size === s, catColor)}>{s}</button>)}
            </div>
          )}
        </div>
      )}

      {isShirtCat(cat) && (
        <div style={S.card}>
          <label style={S.label}>Sleeve</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[["long", "Long sleeve"], ["short", "Short sleeve"]].map(([k, l]) => (
              <button key={k} onClick={() => setSleeve(sleeve === k ? "" : k)} style={{ ...S.chip(sleeve === k, null), flex: 1, textAlign: "center" }}>{l}</button>
            ))}
          </div>
        </div>
      )}

      <div style={S.card}>
        <label style={S.label}>Price <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#ccc" }}>(optional)</span></label>
        <input type="number" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} style={S.field} />
      </div>

      {err && <div style={{ background: "#FDECEC", border: "1px solid #F0C0C0", color: "#A33", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <button onClick={save} disabled={busy} style={{ ...S.btn(!busy), marginBottom: 16, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving..." : "Log sale"}
      </button>
    </div>
  );
}

function AddCatStrip({ onAdd, onCancel }) {
  const [n, setN] = useState("");
  const [t, setT] = useState("clothing");
  const types = [
    ["clothing", "Clothing"],
    ["footwear", "Footwear"],
    ["onesize", "One size"],
    ["denim_full", "Denim (W+L)"],
    ["denim_waist", "Denim (W)"],
  ];
  return (
    <div style={{ marginTop: 12, background: BG, borderRadius: 12, padding: 14 }}>
      <input autoFocus value={n} onChange={e => setN(e.target.value)} onKeyDown={e => e.key === "Enter" && n.trim() && onAdd(n.trim(), t)} placeholder="Category name" style={{ ...S.field, marginBottom: 10 }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>SIZE TYPE:</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {types.map(([k, l]) => (
          <button key={k} onClick={() => setT(k)} style={{ ...S.chip(t === k, null), fontSize: 12, padding: "8px 10px" }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "12px", background: CARD, border: "2px solid " + BORDER, borderRadius: 10, fontSize: 13, fontWeight: 600, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={() => n.trim() && onAdd(n.trim(), t)} style={{ flex: 1, padding: "12px", background: n.trim() ? DARK : "#ddd", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, color: n.trim() ? "#fff" : "#aaa", cursor: n.trim() ? "pointer" : "default", fontFamily: "inherit" }}>Add</button>
      </div>
    </div>
  );
}

function getTimePresets() {
  const today = new Date();
  const fmt = d => d.toISOString().slice(0, 10);
  const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d); };
  // Monday-start weeks: treat Sunday (0) as 7
  const dow = d => d.getDay() || 7;
  const startOfWeek = () => { const d = new Date(today); d.setDate(d.getDate() - dow(d) + 1); return fmt(d); };
  const startOfLastWeek = () => { const d = new Date(today); d.setDate(d.getDate() - dow(d) - 6); return fmt(d); };
  const endOfLastWeek = () => { const d = new Date(today); d.setDate(d.getDate() - dow(d)); return fmt(d); };
  const startOfMonth = () => fmt(new Date(today.getFullYear(), today.getMonth(), 1));
  const startOfLastMonth = () => fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const endOfLastMonth = () => fmt(new Date(today.getFullYear(), today.getMonth(), 0));
  return [
    { label: "Today", from: fmt(today), to: fmt(today) },
    { label: "Yesterday", from: daysAgo(1), to: daysAgo(1) },
    { label: "This week", from: startOfWeek(), to: fmt(today) },
    { label: "Last week", from: startOfLastWeek(), to: endOfLastWeek() },
    { label: "This month", from: startOfMonth(), to: fmt(today) },
    { label: "Last month", from: startOfLastMonth(), to: endOfLastMonth() },
  ];
}

// ── Summary Panel ──
function SummaryPanel({ sales, cats, onClose, onFullPage }) {
  const [expandedCats, setExpandedCats] = useState({});

  const totalItems = sales.length;
  const totalRevenue = sales.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);

  // Category breakdown
  const byCat = {};
  sales.forEach(s => {
    const cn = s.category_name || "Uncategorized";
    if (!byCat[cn]) byCat[cn] = { count: 0, sizes: {}, catId: s.category_id, revenue: 0 };
    byCat[cn].count++;
    byCat[cn].revenue += parseFloat(s.price) || 0;
    if (s.size) {
      byCat[cn].sizes[s.size] = (byCat[cn].sizes[s.size] || 0) + 1;
    }
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1].count - a[1].count);

  const toggleCat = (cn) => setExpandedCats(prev => ({ ...prev, [cn]: !prev[cn] }));

  const brands = extractBrands(sales.map(s => s.comment));
  const topSellers = findTopSellers(sales);

  return (
    <div style={{ background: CARD, border: "1px solid " + BORDER, borderRadius: 14, margin: "0 16px 12px", padding: "16px 18px", animation: "slideUp 0.2s ease-out" }}>
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Summary</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onFullPage} style={{ padding: "5px 12px", background: BG, border: "1px solid " + BORDER, borderRadius: 8, fontSize: 11, fontWeight: 600, color: "#555", cursor: "pointer", fontFamily: "inherit" }}>Full view</button>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#bbb", cursor: "pointer" }}>{"\u00d7"}</button>
        </div>
      </div>

      {/* Totals */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1, background: BG, borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{totalItems}</div>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>items sold</div>
        </div>
        <div style={{ flex: 1, background: BG, borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{totalRevenue.toLocaleString("sv-SE")}</div>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>kr total</div>
        </div>
      </div>

      {/* Category breakdown */}
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 8 }}>BY CATEGORY</div>
      {catEntries.map(([cn, data]) => {
        const cat = cats.find(c => c.id === data.catId);
        const color = cat ? getCatColor(cat, cats) : "#888";
        const expanded = expandedCats[cn];
        const sizeEntries = Object.entries(data.sizes).sort((a, b) => b[1] - a[1]);
        return (
          <div key={cn} style={{ marginBottom: 4 }}>
            <button onClick={() => toggleCat(cn)} style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: expanded ? BG : "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{cn}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: DARK }}>{"\u00d7"}{data.count}</span>
                {data.revenue > 0 && <span style={{ fontSize: 11, color: MUTED }}>{data.revenue.toLocaleString("sv-SE")} kr</span>}
                <span style={{ fontSize: 12, color: "#bbb", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>{"\u203a"}</span>
              </div>
            </button>
            {expanded && sizeEntries.length > 0 && (
              <div style={{ padding: "4px 10px 8px 28px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {sizeEntries.map(([sz, ct]) => (
                  <span key={sz} style={{ fontSize: 12, background: BG, border: "1px solid " + BORDER, borderRadius: 6, padding: "3px 10px", fontWeight: 600, color: "#555" }}>
                    {sz} {"\u00d7"}{ct}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Brands */}
      {brands.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 8, marginTop: 14 }}>TOP BRANDS</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            {brands.slice(0, 8).map(([name, count]) => (
              <span key={name} style={{ fontSize: 12, background: BG, border: "1px solid " + BORDER, borderRadius: 6, padding: "4px 10px", fontWeight: 600, color: "#555" }}>
                {name} {"\u00d7"}{count}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Top sellers */}
      {topSellers.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 8, marginTop: 14 }}>TOP SELLERS</div>
          {topSellers.slice(0, 5).map((g, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: i < topSellers.length - 1 ? "1px solid " + BORDER : "none" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                {g.label}
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: DARK }}>{"\u00d7"}{g.items.length}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Full Page Summary ──
function FullSummary({ sales, cats, onClose }) {
  const totalItems = sales.length;
  const totalRevenue = sales.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
  const [copied, setCopied] = useState(false);

  const byCat = {};
  sales.forEach(s => {
    const cn = s.category_name || "Uncategorized";
    if (!byCat[cn]) byCat[cn] = { count: 0, sizes: {}, catId: s.category_id, revenue: 0 };
    byCat[cn].count++;
    byCat[cn].revenue += parseFloat(s.price) || 0;
    if (s.size) byCat[cn].sizes[s.size] = (byCat[cn].sizes[s.size] || 0) + 1;
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1].count - a[1].count);
  const brands = extractBrands(sales.map(s => s.comment));
  const topSellers = findTopSellers(sales);

  // Build dates range text
  const dates = [...new Set(sales.map(s => s.sold_at || (s.created_at || "").slice(0, 10)))].sort();
  const dateRange = dates.length === 1 ? dates[0] : dates[0] + " to " + dates[dates.length - 1];

  const buildExportText = () => {
    let txt = `THRIFTIN' SUMMARY\n${dateRange}\n${"─".repeat(30)}\n`;
    txt += `Total: ${totalItems} items · ${totalRevenue.toLocaleString("sv-SE")} kr\n\n`;
    txt += "CATEGORIES\n";
    catEntries.forEach(([cn, data]) => {
      txt += `  ${cn} × ${data.count}`;
      if (data.revenue > 0) txt += ` (${data.revenue.toLocaleString("sv-SE")} kr)`;
      txt += "\n";
      const sizeEntries = Object.entries(data.sizes).sort((a, b) => b[1] - a[1]);
      if (sizeEntries.length) {
        txt += "    " + sizeEntries.map(([sz, ct]) => `${sz} ×${ct}`).join(", ") + "\n";
      }
    });
    if (brands.length) {
      txt += "\nBRANDS\n";
      brands.forEach(([name, count]) => { txt += `  ${name} × ${count}\n`; });
    }
    if (topSellers.length) {
      txt += "\nTOP SELLERS\n";
      topSellers.forEach(g => { txt += `  ${g.label} × ${g.items.length}\n`; });
    }
    return txt;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(buildExportText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, zIndex: 500, overflowY: "auto", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ padding: "16px 20px 12px", background: CARD, borderBottom: "1px solid " + BORDER, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 51 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Sales Summary</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={copyToClipboard} style={{ padding: "6px 14px", background: copied ? "#06A77D" : BG, border: "1px solid " + BORDER, borderRadius: 8, fontSize: 12, fontWeight: 600, color: copied ? "#fff" : "#555", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}>
            {copied ? "Copied!" : "Copy"}
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: "#aaa", cursor: "pointer" }}>{"\u00d7"}</button>
        </div>
      </div>

      <div style={{ padding: "16px 20px 40px" }}>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>{dateRange}</div>

        {/* Totals */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, background: CARD, borderRadius: 14, border: "1px solid " + BORDER, padding: "16px 18px" }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{totalItems}</div>
            <div style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>items sold</div>
          </div>
          <div style={{ flex: 1, background: CARD, borderRadius: 14, border: "1px solid " + BORDER, padding: "16px 18px" }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{totalRevenue.toLocaleString("sv-SE")}</div>
            <div style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>kr total</div>
          </div>
        </div>

        {/* Categories */}
        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 12 }}>CATEGORIES</div>
        {catEntries.map(([cn, data]) => {
          const cat = cats.find(c => c.id === data.catId);
          const color = cat ? getCatColor(cat, cats) : "#888";
          const sizeEntries = Object.entries(data.sizes).sort((a, b) => b[1] - a[1]);
          return (
            <div key={cn} style={{ background: CARD, borderRadius: 12, border: "1px solid " + BORDER, padding: "14px 16px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sizeEntries.length ? 10 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{cn}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{"\u00d7"}{data.count}</span>
                  {data.revenue > 0 && <div style={{ fontSize: 12, color: MUTED }}>{data.revenue.toLocaleString("sv-SE")} kr</div>}
                </div>
              </div>
              {sizeEntries.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {sizeEntries.map(([sz, ct]) => (
                    <span key={sz} style={{ fontSize: 12, background: BG, border: "1px solid " + BORDER, borderRadius: 6, padding: "4px 10px", fontWeight: 600, color: "#555" }}>
                      {sz} {"\u00d7"}{ct}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Brands */}
        {brands.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 12 }}>BRANDS</div>
            <div style={{ background: CARD, borderRadius: 12, border: "1px solid " + BORDER, padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {brands.map(([name, count]) => (
                  <span key={name} style={{ fontSize: 13, background: BG, border: "1px solid " + BORDER, borderRadius: 8, padding: "6px 12px", fontWeight: 600, color: "#444" }}>
                    {name} {"\u00d7"}{count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top Sellers */}
        {topSellers.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 12 }}>TOP SELLERS</div>
            <div style={{ background: CARD, borderRadius: 12, border: "1px solid " + BORDER, overflow: "hidden" }}>
              {topSellers.map((g, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: i < topSellers.length - 1 ? "1px solid " + BORDER : "none" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{g.label}</div>
                    <div style={{ fontSize: 11, color: MUTED }}>{g.category}</div>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: DARK }}>{"\u00d7"}{g.items.length}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── History Screen ──
function HistoryScreen({ sales, cats, users, adminMode, onChanged, onCatAdded }) {
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  // Summary mode
  const [summaryMode, setSummaryMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState(new Set());
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [summaryCatFilter, setSummaryCatFilter] = useState("");
  const [showItems, setShowItems] = useState(false);

  // Base filter: query, category, user (NO date filter)
  const visibleBase = sales.filter(s => {
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!(s.comment || "").toLowerCase().includes(q) && !(s.category_name || "").toLowerCase().includes(q) && !(s.user_name || "").toLowerCase().includes(q)) return false;
    }
    if (filterCat && s.category_id !== filterCat) return false;
    if (filterUser && s.user_id !== filterUser) return false;
    return true;
  });

  // In normal mode, also apply date filter. In summary mode, show ALL days.
  const visible = summaryMode ? visibleBase : visibleBase.filter(s => {
    const d = s.sold_at || (s.created_at || "").slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  const byDay = {};
  visible.forEach(s => {
    const d = s.sold_at || (s.created_at || "").slice(0, 10);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(s);
  });
  const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  useEffect(() => { if (days.length && !expandedDay) setExpandedDay(days[0]); }, [days.length]);

  // Which days fall in the selected date range
  const daysInDateRange = useMemo(() => {
    if (!dateFrom && !dateTo) return new Set(days);
    return new Set(days.filter(d => {
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    }));
  }, [days, dateFrom, dateTo]);

  // Auto-select days matching date range when presets change in summary mode
  const dateKey = dateFrom + "|" + dateTo;
  useEffect(() => {
    if (summaryMode) {
      setSelectedDays(new Set(daysInDateRange));
    }
  }, [dateKey, summaryMode]);

  // Summary sales = sales from selected days (from full base, not date-filtered)
  const summarySalesRaw = useMemo(() => {
    if (!summaryMode || selectedDays.size === 0) return [];
    return visibleBase.filter(s => {
      const d = s.sold_at || (s.created_at || "").slice(0, 10);
      return selectedDays.has(d);
    });
  }, [summaryMode, selectedDays, visibleBase]);

  const summarySales = useMemo(() => {
    if (!summaryCatFilter) return summarySalesRaw;
    return summarySalesRaw.filter(s => s.category_id === summaryCatFilter);
  }, [summarySalesRaw, summaryCatFilter]);

  // Auto-open items list when category filter is selected, close when cleared
  useEffect(() => {
    if (summaryCatFilter) setShowItems(true);
    else setShowItems(false);
  }, [summaryCatFilter]);

  const toggleDay = (day) => {
    if (!summaryMode) {
      setExpandedDay(expandedDay === day ? null : day);
      return;
    }
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const toggleSummaryMode = () => {
    if (summaryMode) {
      setSummaryMode(false);
      setSelectedDays(new Set());
      setSummaryCatFilter("");
      setShowItems(false);
    } else {
      setSummaryMode(true);
      setSelectedDays(new Set(daysInDateRange));
      setSummaryCatFilter("");
      setShowItems(false);
    }
  };

  const selectAllDays = () => setSelectedDays(new Set(days));

  const fmtDay = (d) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (d === today) return "Today";
    if (d === yesterday) return "Yesterday";
    return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div>
      {editing && <EditModal sale={editing} cats={cats} users={users} adminMode={adminMode} onCatAdded={onCatAdded} onSave={async patch => { await api.patch("sales", editing.id, patch); await onChanged(); setEditing(null); }} onClose={() => setEditing(null)} />}
      {confirmDel && <ConfirmDel sale={confirmDel} onYes={async () => { await api.del("sales", confirmDel.id); await onChanged(); setConfirmDel(null); }} onNo={() => setConfirmDel(null)} />}
      {showFullSummary && <FullSummary sales={summarySales} cats={cats} onClose={() => setShowFullSummary(false)} />}

      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search..." style={{ ...S.field, paddingRight: 90 }} />
          <button onClick={() => setShowAdvanced(v => !v)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: showAdvanced ? DARK : BG, border: "1px solid " + BORDER, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: showAdvanced ? "#fff" : MUTED, cursor: "pointer", fontFamily: "inherit" }}>
            {showAdvanced ? "Simple" : "Advanced"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 10, marginBottom: 6 }}>
          <button onClick={() => setFilterCat("")} style={{ ...S.chip(!filterCat, null), padding: "6px 12px", fontSize: 12, borderRadius: 8 }}>All</button>
          {cats.map(c => <button key={c.id} onClick={() => setFilterCat(filterCat === c.id ? "" : c.id)} style={{ ...S.chip(filterCat === c.id, getCatColor(c, cats)), padding: "6px 12px", fontSize: 12, borderRadius: 8, flexShrink: 0 }}>{c.name}</button>)}
        </div>

        {showAdvanced && (
          <div style={{ ...S.card, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 8 }}>QUICK SELECT</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {getTimePresets().map(p => (
                <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to); }} style={{ padding: "7px 12px", background: (dateFrom === p.from && dateTo === p.to) ? DARK : BG, border: "1px solid " + BORDER, borderRadius: 8, fontSize: 12, fontWeight: 600, color: (dateFrom === p.from && dateTo === p.to) ? "#fff" : "#555", cursor: "pointer", fontFamily: "inherit" }}>{p.label}</button>
              ))}
              <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ padding: "7px 12px", background: (!dateFrom && !dateTo) ? DARK : BG, border: "1px solid " + BORDER, borderRadius: 8, fontSize: 12, fontWeight: 600, color: (!dateFrom && !dateTo) ? "#fff" : "#555", cursor: "pointer", fontFamily: "inherit" }}>All time</button>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 8 }}>DATE RANGE</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...S.field, fontSize: 13, padding: "10px 12px" }} />
              </div>
              <div style={{ flex: 1 }}>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...S.field, fontSize: 13, padding: "10px 12px" }} />
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 8 }}>STAFF</div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 14 }}>
              <button onClick={() => setFilterUser("")} style={S.chip(!filterUser, null)}>All</button>
              {users.map(u => (
                <button key={u.id} onClick={() => setFilterUser(filterUser === u.id ? "" : u.id)} style={{ ...S.chip(filterUser === u.id, u.color), display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: filterUser === u.id ? "#fff" : (u.color || "#888") }} />
                  {u.name}
                </button>
              ))}
            </div>

            {/* Summary mode toggle */}
            <div style={{ borderTop: "1px solid " + BORDER, paddingTop: 14 }}>
              <button onClick={toggleSummaryMode} style={{
                width: "100%", padding: "12px 16px",
                background: summaryMode ? DARK : BG,
                border: summaryMode ? "none" : "1px solid " + BORDER,
                borderRadius: 10, fontSize: 13, fontWeight: 700,
                color: summaryMode ? "#fff" : "#555",
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {"\uD83D\uDCCA"} {summaryMode ? "Exit Summary Mode" : "Summary Mode"}
              </button>
              {summaryMode && days.length > 0 && (
                <button onClick={selectAllDays} style={{ width: "100%", padding: "8px", background: "transparent", border: "none", fontSize: 12, fontWeight: 600, color: MUTED, cursor: "pointer", fontFamily: "inherit", marginTop: 6 }}>
                  Select all {days.length} days
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Summary category filter */}
      {summaryMode && summarySalesRaw.length > 0 && (
        <div style={{ padding: "0 16px 8px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 8 }}>FILTER BY CATEGORY</div>
          <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 4 }}>
            <button onClick={() => setSummaryCatFilter("")} style={{ ...S.chip(!summaryCatFilter, null), padding: "6px 12px", fontSize: 12, borderRadius: 8 }}>All</button>
            {cats.filter(c => summarySalesRaw.some(s => s.category_id === c.id)).map(c => (
              <button key={c.id} onClick={() => setSummaryCatFilter(summaryCatFilter === c.id ? "" : c.id)} style={{ ...S.chip(summaryCatFilter === c.id, getCatColor(c, cats)), padding: "6px 12px", fontSize: 12, borderRadius: 8, flexShrink: 0 }}>{c.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* Summary panel */}
      {summaryMode && summarySales.length > 0 && (
        <SummaryPanel sales={summarySales} cats={cats} onClose={toggleSummaryMode} onFullPage={() => setShowFullSummary(true)} />
      )}

      {/* Actual items in summary mode — toggleable */}
      {summaryMode && summarySales.length > 0 && (
        <div style={{ margin: "0 16px 12px" }}>
          <button onClick={() => setShowItems(v => !v)} style={{
            display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px", background: CARD, border: "1px solid " + BORDER, borderRadius: showItems ? "10px 10px 0 0" : 10,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1.2 }}>
              {summaryCatFilter ? `${cats.find(c => c.id === summaryCatFilter)?.name?.toUpperCase() || "ITEMS"} — ` : ""}{summarySales.length} ITEM{summarySales.length !== 1 ? "S" : ""}
            </span>
            <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{showItems ? "Hide" : "Show"} {"\u203a"}</span>
          </button>
          {showItems && (
            <div style={{ borderRadius: "0 0 14px 14px", border: "1px solid " + BORDER, borderTop: "none", overflow: "hidden" }}>
              {summarySales.map(s => (
                <SaleCard key={s.id} sale={s} cats={cats} users={users} adminMode={adminMode} onEdit={() => setEditing(s)} onDel={() => setConfirmDel(s)} />
              ))}
            </div>
          )}
        </div>
      )}

      {summaryMode && selectedDays.size === 0 && (
        <div style={{ textAlign: "center", padding: "20px 16px", color: MUTED, fontSize: 13 }}>
          Tap days below to build a summary
        </div>
      )}

      {/* Day groups */}
      {!days.length && <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb", fontSize: 14 }}>No sales found</div>}

      {days.map(day => {
        const items = byDay[day];
        const isSelected = selectedDays.has(day);
        const open = !summaryMode && expandedDay === day;
        const dayTotal = items.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
        return (
          <div key={day}>
            <button onClick={() => toggleDay(day)} style={{
              display: "flex", width: "100%", padding: "14px 20px",
              background: summaryMode ? (isSelected ? DARK : CARD) : (open ? CARD : BG),
              border: "none", borderBottom: "1px solid " + BORDER, cursor: "pointer", fontFamily: "inherit",
              alignItems: "center", justifyContent: "space-between",
              transition: "background 0.15s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {summaryMode && (
                  <span style={{
                    width: 20, height: 20, borderRadius: 6,
                    border: isSelected ? "none" : "2px solid " + BORDER,
                    background: isSelected ? "#06A77D" : CARD,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: "#fff", fontWeight: 800,
                    flexShrink: 0,
                  }}>
                    {isSelected ? "\u2713" : ""}
                  </span>
                )}
                <span style={{ fontSize: 14, fontWeight: 800, color: summaryMode && isSelected ? "#fff" : DARK }}>{fmtDay(day)}</span>
                <span style={{ fontSize: 12, color: summaryMode && isSelected ? "rgba(255,255,255,0.7)" : MUTED }}>{items.length} item{items.length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {dayTotal > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: summaryMode && isSelected ? "rgba(255,255,255,0.8)" : "#666" }}>{dayTotal.toLocaleString("sv-SE")} kr</span>}
                {!summaryMode && <span style={{ fontSize: 16, color: "#bbb", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>{"\u203a"}</span>}
              </div>
            </button>
            {open && items.map(s => (
              <SaleCard key={s.id} sale={s} cats={cats} users={users} adminMode={adminMode} onEdit={() => setEditing(s)} onDel={() => setConfirmDel(s)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SaleCard({ sale, cats, users, adminMode, onEdit, onDel }) {
  const u = users.find(x => x.id === sale.user_id);
  const cat = cats.find(c => c.id === sale.category_id);
  const catColor = cat ? getCatColor(cat, cats) : null;

  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px", background: CARD, borderBottom: "1px solid " + BORDER }}>
      <div style={{ width: 56, height: 72, borderRadius: 10, background: "#f0ede8", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {sale.photo_url
          ? <img src={sale.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 20, opacity: 0.2 }}>{"\uD83D\uDCF7"}</span>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sale.comment || <span style={{ color: "#bbb", fontWeight: 400, fontStyle: "italic" }}>No description</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
          {sale.category_name && (
            <span style={{ fontSize: 12, fontWeight: 700, color: catColor || "#666", background: catColor ? catColor + "18" : "#f4f4f4", padding: "2px 10px", borderRadius: 6 }}>{sale.category_name}</span>
          )}
          {sale.size && <span style={{ fontSize: 11, color: "#888", background: BG, padding: "2px 8px", borderRadius: 5 }}>{sale.size}</span>}
          {sale.price && <span style={{ fontSize: 13, fontWeight: 600, color: "#444" }}>{sale.price} kr</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {u && <span style={{ width: 8, height: 8, borderRadius: "50%", background: u.color || "#888" }} />}
          <span style={{ fontSize: 11, color: MUTED }}>{u?.name || sale.user_name || ""}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, justifyContent: "center", flexShrink: 0 }}>
        <button onClick={onEdit} style={{ padding: "6px 12px", background: BG, border: "1px solid " + BORDER, borderRadius: 8, fontSize: 11, fontWeight: 600, color: "#555", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
        {adminMode && <button onClick={onDel} style={{ padding: "6px 12px", background: BG, border: "1px solid " + BORDER, borderRadius: 8, fontSize: 11, color: "#bbb", cursor: "pointer", fontFamily: "inherit" }}>Del</button>}
      </div>
    </div>
  );
}

// ── Edit Modal ──
function EditModal({ sale, cats, users, adminMode, onSave, onClose, onCatAdded }) {
  const [photo, setPhoto] = useState(sale.photo_url ? { url: sale.photo_url } : null);
  const [photoChanged, setPC] = useState(false);
  const [confirmPhotoDel, setCPD] = useState(false);
  const [catId, setCatId] = useState(sale.category_id || "");
  const [size, setSize] = useState(sale.size || "");
  const [comment, setComment] = useState(sale.comment || "");
  const [price, setPrice] = useState(sale.price || "");
  const [userId, setUserId] = useState(sale.user_id || "");
  const [soldDate, setSoldDate] = useState(sale.sold_at || (sale.created_at || "").slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const fileRef = useRef();

  const cat = cats.find(c => c.id === catId);
  const sizeInfo = getSizeOpts(cat);
  const catColor = cat ? getCatColor(cat, cats) : null;

  const handleFile = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const blob = await compressPhoto(f);
      setPhoto({ blob, preview: URL.createObjectURL(blob) }); setPC(true);
    } catch {}
    e.target.value = "";
  };

  const removePhoto = () => { if (sale.photo_url && !photoChanged) setCPD(true); else { setPhoto(null); setPC(true); } };

  const [err, setErr] = useState("");

  const save = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      let photo_url = sale.photo_url;
      if (photoChanged) photo_url = photo?.blob ? await api.upload(photo.blob) : null;
      const u = users.find(x => x.id === userId);
      const patch = { photo_url, category_id: catId || null, category_name: cat?.name || null, size: size || null, comment: comment.trim() || null, price: price ? parseFloat(price) : null, user_id: userId || null, user_name: u?.name || null };
      if (adminMode && soldDate) patch.sold_at = soldDate;
      await onSave(patch);
    } catch (e) {
      setBusy(false);
      setErr(e.message || "Could not save changes. Check your connection and try again.");
    }
  };

  const addCat = async (name, sizeType) => {
    const c = await api.post("categories", { name, size_type: sizeType, color: CCOLORS[Math.floor(Math.random() * CCOLORS.length)] });
    if (c) { await onCatAdded(); setCatId(c.id); setSize(""); setShowAddCat(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      {confirmPhotoDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: CARD, borderRadius: 16, padding: 24, maxWidth: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Remove photo?</div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 20, lineHeight: 1.5 }}>If saved without adding a new one, this photo is gone forever.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setCPD(false)} style={{ flex: 1, padding: "12px", background: CARD, border: "2px solid " + BORDER, borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Keep</button>
              <button onClick={() => { setPhoto(null); setPC(true); setCPD(false); }} style={{ flex: 1, padding: "12px", background: "#c33", border: "none", borderRadius: 10, fontSize: 13, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 480, background: CARD, borderRadius: "18px 18px 0 0", maxHeight: "92vh", overflowY: "auto", padding: "20px 18px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Edit sale</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: "#bbb", cursor: "pointer" }}>{"\u00d7"}</button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        {(photo?.url || photo?.preview) ? (
          <div style={{ position: "relative", marginBottom: 16, borderRadius: 12, overflow: "hidden", background: "#f0ede8" }}>
            <img src={photo.preview || photo.url} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "contain", display: "block" }} />
            <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6 }}>
              <button onClick={() => fileRef.current?.click()} style={{ background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 20, color: "#fff", padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Replace</button>
              <button onClick={removePhoto} style={{ background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 20, color: "#fff", padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
            </div>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} style={{ width: "100%", height: 100, background: BG, border: "2px dashed " + BORDER, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", fontSize: 14, color: MUTED }}>
            {"\uD83D\uDCF7"} Add photo
          </button>
        )}

        <label style={S.label}>Description</label>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} style={{ ...S.field, resize: "none", lineHeight: 1.6, marginBottom: 14 }} />

        <label style={S.label}>Category</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: showAddCat ? 0 : 14 }}>
          {cats.map(c => <button key={c.id} onClick={() => { setCatId(c.id); setSize(""); setShowAddCat(false); }} style={S.chip(catId === c.id, getCatColor(c, cats))}>{c.name}</button>)}
          <button onClick={() => setShowAddCat(s => !s)} style={{ ...S.chip(showAddCat), borderStyle: "dashed" }}>+ New</button>
        </div>
        {showAddCat && <AddCatStrip onAdd={addCat} onCancel={() => setShowAddCat(false)} />}

        {cat && (
          <>
            <label style={{ ...S.label, marginTop: 14 }}>Size</label>
            {(sizeInfo.type === "denim_full" || sizeInfo.type === "denim_waist") ? (
              <div style={{ marginBottom: 14 }}>
                <DenimSizePicker type={sizeInfo.type} value={size} onChange={setSize} catColor={catColor} />
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {sizeInfo.opts.map(s => <button key={s} onClick={() => setSize(s)} style={S.chip(size === s, catColor)}>{s}</button>)}
              </div>
            )}
          </>
        )}

        <label style={S.label}>Price</label>
        <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={{ ...S.field, marginBottom: 14 }} />

        <label style={S.label}>Logged by</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {users.map(u => (
            <button key={u.id} onClick={() => setUserId(u.id)} style={{ ...S.chip(userId === u.id, u.color), display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: userId === u.id ? "#fff" : (u.color || "#888") }} />
              {u.name}
            </button>
          ))}
        </div>

        {adminMode && (
          <>
            <label style={{ ...S.label, color: "#c33" }}>Sale date (admin)</label>
            <input type="date" value={soldDate} onChange={e => setSoldDate(e.target.value)} style={{ ...S.field, marginBottom: 20 }} />
          </>
        )}

        {err && <div style={{ background: "#FDECEC", border: "1px solid #F0C0C0", color: "#A33", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>{err}</div>}

        <button onClick={save} disabled={busy} style={{ ...S.btn(!busy), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving..." : "Save changes"}</button>
      </div>
    </div>
  );
}

function ConfirmDel({ sale, onYes, onNo }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: CARD, borderRadius: "18px 18px 0 0", padding: "24px 20px 36px" }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Delete this sale?</div>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 24, lineHeight: 1.5 }}>{sale.comment || sale.category_name || "Untitled"}</div>
        <button onClick={onYes} style={{ width: "100%", padding: "14px", background: "#c33", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>Delete</button>
        <button onClick={onNo} style={{ width: "100%", padding: "14px", background: CARD, border: "2px solid " + BORDER, borderRadius: 12, fontSize: 14, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// INVENTORY / STOCK SYSTEM
// ══════════════════════════════════════════

// ── QR code generator (uses qrcode lib) ──

function BarcodeSVG({ value, height = 90 }) {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 320, errorCorrectionLevel: "H" })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [value]);
  if (!dataUrl) return <div style={{ width: height, height, background: "#f0f0f0" }} />;
  return <img src={dataUrl} alt={value} width={height} height={height} style={{ display: "block" }} />;
}

// ── Stock Screen ──
function StockScreen({ inventory, cats, brands, currentUser, adminMode, onChanged, onCatAdded, onBrandAdded, showToast }) {
  const [view, setView] = useState("list"); // 'list' | 'add'
  const [statusFilter, setStatusFilter] = useState("in_stock");
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [printItem, setPrintItem] = useState(null);   // single item to print
  const [printBatch, setPrintBatch] = useState(null);  // array of items to print
  const [queue, setQueue] = useState([]);              // ids queued for batch printing
  const [queueSel, setQueueSel] = useState([]);        // ids selected within the queue to print
  const [detailItem, setDetailItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [confirmDelItem, setConfirmDelItem] = useState(null);
  const [zoomPhoto, setZoomPhoto] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  const inStock = inventory.filter(i => i.status === "in_stock");
  const sold = inventory.filter(i => i.status === "sold");
  const queuedItems = queue.map(id => inventory.find(i => i.id === id)).filter(Boolean);

  const base = (statusFilter === "in_stock" ? inStock : sold);

  const shown = base.filter(i => {
    if (catFilter && i.category_id !== catFilter) return false;
    if (brandFilter && (i.brand || "") !== brandFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (i.comment || "").toLowerCase().includes(q) ||
           (i.category_name || "").toLowerCase().includes(q) ||
           (i.brand || "").toLowerCase().includes(q) ||
           (i.barcode || "").toLowerCase().includes(q) ||
           (i.size || "").toLowerCase().includes(q);
  });

  // Brand breakdown within the active category (for the "14 x YSL shirts" view)
  const brandBreakdown = useMemo(() => {
    if (!catFilter) return [];
    const inCat = base.filter(i => i.category_id === catFilter);
    const counts = {};
    inCat.forEach(i => { const b = i.brand || "(no brand)"; counts[b] = (counts[b] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [base, catFilter]);

  const totalStockValue = inStock.reduce((s, i) => s + (parseFloat(i.sell_price) || 0), 0);

  // Mark as sold: also creates a sale entry so it flows into History
  const markSold = async (item) => {
    let sale = null;
    try {
      sale = await api.post("sales", {
        user_id: currentUser.id, user_name: currentUser.name,
        category_id: item.category_id, category_name: item.category_name,
        size: item.size, comment: item.comment, gender: item.gender || null, brand: item.brand || null,
        price: item.sell_price, photo_url: item.photo_url,
      });
      await api.patch("inventory", item.id, {
        status: "sold", sold_at: new Date().toISOString(),
        sold_sale_id: sale?.id || null,
      });
      await onChanged();
      showToast("Marked sold");
    } catch (e) {
      // Compensating undo: if the sale row was created but flipping the item to
      // "sold" failed, delete that sale so we never leave a recorded sale on an
      // item that is still in stock (which could then be sold a second time).
      if (sale?.id) { try { await api.del("sales", sale.id); } catch {} }
      await onChanged();
      showToast("Could not mark sold — nothing saved: " + (e.message || "error"));
    }
  };

  // Revert sold → in_stock, and remove the linked sale entry
  const revertSold = async (item) => {
    try {
      if (item.sold_sale_id) { await api.del("sales", item.sold_sale_id); }
      await api.patch("inventory", item.id, { status: "in_stock", sold_at: null, sold_sale_id: null });
      await onChanged();
      showToast("Back in stock");
    } catch (e) {
      await onChanged();
      showToast("Revert failed — check the item: " + (e.message || "error"));
    }
  };

  // Admin: permanently delete an inventory item (and its linked sale if any)
  const deleteItem = async (item) => {
    try {
      if (item.sold_sale_id) { await api.del("sales", item.sold_sale_id); }
      await api.del("inventory", item.id);
      await onChanged();
      showToast("Item deleted");
    } catch (e) {
      showToast("Could not delete: " + (e.message || "error"));
    }
  };

  // Admin: save edits to an inventory item (incl. photo)
  const saveItemEdit = async (item, patch) => {
    try {
      await api.patch("inventory", item.id, patch);
      await onChanged();
      showToast("Item updated");
    } catch (e) {
      showToast("Could not update: " + (e.message || "error"));
    }
  };

  const handleScan = async (code) => {
    // continuous mode: don't close scanner, find + mark sold inline
    const item = inventory.find(i => i.barcode === code);
    if (!item) { showToast("Not found: " + code); return null; }
    if (item.status === "sold") { showToast("Already sold: " + (item.comment || item.barcode)); return item; }
    return item;
  };

  if (view === "add") {
    return <AddStock cats={cats} brands={brands} currentUser={currentUser} onCatAdded={onCatAdded} onBrandAdded={onBrandAdded}
      onDone={async (newItem, mode) => {
        await onChanged();
        if (mode === "queue") {
          if (newItem) { setQueue(q => [...q, newItem.id]); setQueueSel(s => [...s, newItem.id]); }
          // stay in add view for next item (AddStock resets its own form)
        } else if (mode === "print") {
          setView("list");
          if (newItem) setPrintItem(newItem);
        } else {
          setView("list");
        }
      }}
      onCancel={() => setView("list")} showToast={showToast} />;
  }

  return (
    <div style={{ padding: "16px 16px 0" }}>
      {scanning && <ContinuousScanner inventory={inventory} onLookup={handleScan} onSell={markSold} onClose={() => setScanning(false)} />}
      {printItem && <PrintLabel items={[printItem]} onClose={() => setPrintItem(null)} />}
      {printBatch && <PrintLabel items={printBatch} onClose={() => { const ids = printBatch.map(i => i.id); setQueue(q => q.filter(id => !ids.includes(id))); setQueueSel(s => s.filter(id => !ids.includes(id))); setPrintBatch(null); }} />}
      {zoomPhoto && <PhotoZoom url={zoomPhoto} onClose={() => setZoomPhoto("")} />}
      {detailItem && <StockDetail item={detailItem} cats={cats} adminMode={adminMode} onZoom={(u) => setZoomPhoto(u)} onClose={() => setDetailItem(null)} onSold={async () => { await markSold(detailItem); setDetailItem(null); }} onRevert={async () => { await revertSold(detailItem); setDetailItem(null); }} onPrint={() => { setPrintItem(detailItem); setDetailItem(null); }} onEdit={() => { setEditItem(detailItem); setDetailItem(null); }} onDelete={() => { setConfirmDelItem(detailItem); setDetailItem(null); }} />}
      {editItem && <EditStock item={editItem} cats={cats} brands={brands} adminMode={adminMode} onCatAdded={onCatAdded} onBrandAdded={onBrandAdded} onSave={async (patch) => { await saveItemEdit(editItem, patch); setEditItem(null); }} onClose={() => setEditItem(null)} />}
      {confirmDelItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: CARD, borderRadius: 16, padding: 24, maxWidth: 330 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Delete this item permanently?</div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 6, lineHeight: 1.5 }}>{confirmDelItem.comment || confirmDelItem.category_name || confirmDelItem.barcode}</div>
            <div style={{ fontSize: 12, color: "#c33", marginBottom: 20 }}>This removes it from inventory{confirmDelItem.sold_sale_id ? " and deletes the linked sale from History" : ""}. Cannot be undone.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmDelItem(null)} style={{ flex: 1, padding: "13px", background: CARD, border: "2px solid " + BORDER, borderRadius: 10, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={async () => { await deleteItem(confirmDelItem); setConfirmDelItem(null); }} style={{ flex: 1, padding: "13px", background: "#c33", border: "none", borderRadius: 10, fontSize: 14, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setView("add")} style={{ flex: 1, padding: "14px", background: DARK, border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Add item</button>
        <button onClick={() => setScanning(true)} style={{ flex: 1, padding: "14px", background: "#06A77D", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{"\uD83D\uDCF7"} Scan</button>
      </div>

      {/* Print queue tray */}
      {queuedItems.length > 0 && (
        <div style={{ background: "#FFF8EC", border: "1px solid #F0D9A8", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#8A6D3B" }}>Print queue · {queueSel.length}/{queuedItems.length} selected</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setQueueSel(queuedItems.map(i => i.id))} style={{ background: "none", border: "none", fontSize: 12, color: "#A98B5B", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>All</button>
              <button onClick={() => setQueueSel([])} style={{ background: "none", border: "none", fontSize: 12, color: "#A98B5B", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>None</button>
              <button onClick={() => { setQueue([]); setQueueSel([]); }} style={{ background: "none", border: "none", fontSize: 12, color: "#A98B5B", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>Clear</button>
            </div>
          </div>

          {/* Selectable queued items */}
          <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
            {queuedItems.map(item => {
              const sel = queueSel.includes(item.id);
              return (
                <div key={item.id} onClick={() => setQueueSel(s => sel ? s.filter(x => x !== item.id) : [...s, item.id])} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", borderBottom: "1px solid #F0E4C8", cursor: "pointer" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: sel ? "none" : "2px solid #D8C49A", background: sel ? "#E8973A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800 }}>{sel ? "\u2713" : ""}</span>
                  <div style={{ width: 30, height: 38, borderRadius: 5, background: "#f0ede8", overflow: "hidden", flexShrink: 0 }}>
                    {item.photo_url ? <img src={item.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#5C4A2A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.comment || item.category_name || "Item"}</div>
                    <div style={{ fontSize: 10, color: "#A98B5B", fontFamily: "monospace" }}>{item.barcode}{item.size ? " · " + item.size : ""}{item.sell_price ? " · " + item.sell_price + " kr" : ""}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => { const sel = queuedItems.filter(i => queueSel.includes(i.id)); if (sel.length) setPrintBatch(sel); }}
            disabled={queueSel.length === 0}
            style={{ width: "100%", padding: "12px", background: queueSel.length ? "#E8973A" : "#E8D5B0", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: queueSel.length ? "pointer" : "default", fontFamily: "inherit" }}>
            {"\uD83D\uDDA8\uFE0F"} Print {queueSel.length} selected label{queueSel.length !== 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, background: CARD, borderRadius: 12, border: "1px solid " + BORDER, padding: "10px 14px" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{inStock.length}</div>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>in stock</div>
        </div>
        <div style={{ flex: 1, background: CARD, borderRadius: 12, border: "1px solid " + BORDER, padding: "10px 14px" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{totalStockValue.toLocaleString("sv-SE")}</div>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>kr value</div>
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button onClick={() => setStatusFilter("in_stock")} style={{ flex: 1, padding: "8px", background: statusFilter === "in_stock" ? DARK : CARD, border: "1px solid " + (statusFilter === "in_stock" ? DARK : BORDER), borderRadius: 8, fontSize: 12, fontWeight: 700, color: statusFilter === "in_stock" ? "#fff" : "#555", cursor: "pointer", fontFamily: "inherit" }}>In stock ({inStock.length})</button>
        <button onClick={() => setStatusFilter("sold")} style={{ flex: 1, padding: "8px", background: statusFilter === "sold" ? DARK : CARD, border: "1px solid " + (statusFilter === "sold" ? DARK : BORDER), borderRadius: 8, fontSize: 12, fontWeight: 700, color: statusFilter === "sold" ? "#fff" : "#555", cursor: "pointer", fontFamily: "inherit" }}>Sold ({sold.length})</button>
      </div>

      {/* Category filter chips */}
      <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 8, marginBottom: 6 }}>
        <button onClick={() => { setCatFilter(""); setBrandFilter(""); }} style={{ ...S.chip(!catFilter, null), padding: "6px 12px", fontSize: 12, borderRadius: 8, flexShrink: 0 }}>All</button>
        {cats.map(c => {
          const n = base.filter(i => i.category_id === c.id).length;
          if (!n) return null;
          return <button key={c.id} onClick={() => { setCatFilter(catFilter === c.id ? "" : c.id); setBrandFilter(""); }} style={{ ...S.chip(catFilter === c.id, getCatColor(c, cats)), padding: "6px 12px", fontSize: 12, borderRadius: 8, flexShrink: 0 }}>{c.name} {n}</button>;
        })}
      </div>

      {/* Brand breakdown within selected category */}
      {catFilter && brandBreakdown.length > 0 && (
        <div style={{ background: CARD, border: "1px solid " + BORDER, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.2, marginBottom: 8 }}>BRANDS IN {(cats.find(c => c.id === catFilter)?.name || "").toUpperCase()}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {brandBreakdown.map(([b, n]) => (
              <button key={b} onClick={() => setBrandFilter(brandFilter === b ? "" : (b === "(no brand)" ? "" : b))} style={{ ...S.chip(brandFilter === b, null), padding: "6px 12px", fontSize: 13, borderRadius: 8 }}>
                {b} <span style={{ fontWeight: 800 }}>{n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stock..." style={{ ...S.field, marginBottom: 14 }} />

      {/* Items */}
      {!shown.length && <div style={{ textAlign: "center", padding: "50px 0", color: "#bbb", fontSize: 14 }}>No items</div>}
      {shown.map(item => (
        <StockCard key={item.id} item={item} cats={cats} onClick={() => setDetailItem(item)} onZoom={(u) => setZoomPhoto(u)} />
      ))}
      <div style={{ height: 20 }} />
    </div>
  );
}

function StockCard({ item, cats, onClick, onZoom }) {
  const cat = cats.find(c => c.id === item.category_id);
  const catColor = cat ? getCatColor(cat, cats) : null;
  return (
    <div onClick={onClick} style={{ display: "flex", gap: 12, padding: "12px 14px", background: CARD, border: "1px solid " + BORDER, borderRadius: 12, marginBottom: 8, cursor: "pointer" }}>
      <div onClick={(e) => { if (item.photo_url && onZoom) { e.stopPropagation(); onZoom(item.photo_url); } }} style={{ width: 52, height: 66, borderRadius: 8, background: "#f0ede8", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: item.photo_url ? "zoom-in" : "default" }}>
        {item.photo_url ? <img src={item.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 18, opacity: 0.2 }}>{"\uD83D\uDC55"}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {item.brand && <div style={{ fontSize: 12, fontWeight: 800, color: DARK, marginBottom: 1 }}>{item.brand}</div>}
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.comment || <span style={{ color: "#bbb", fontStyle: "italic", fontWeight: 400 }}>No description</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          {item.category_name && <span style={{ fontSize: 11, fontWeight: 700, color: catColor || "#666", background: catColor ? catColor + "18" : "#f4f4f4", padding: "2px 8px", borderRadius: 5 }}>{item.category_name}</span>}
          {item.size && <span style={{ fontSize: 11, color: "#888", background: BG, padding: "2px 7px", borderRadius: 5 }}>{item.size}</span>}
          {item.sleeve && <span style={{ fontSize: 11, color: "#888", background: BG, padding: "2px 7px", borderRadius: 5 }}>{item.sleeve === "long" ? "Long sl." : "Short sl."}</span>}
          {item.gender && <span style={{ fontSize: 11, color: "#888", background: BG, padding: "2px 7px", borderRadius: 5 }}>{genderLabel(item.gender)}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>{item.barcode}</span>
          {item.sell_price && <span style={{ fontSize: 13, fontWeight: 700, color: "#444" }}>{item.sell_price} kr</span>}
          {item.status === "in_stock" && <span style={{ fontSize: 10, color: daysInStock(item) >= 90 ? "#c33" : MUTED, fontWeight: daysInStock(item) >= 90 ? 700 : 400 }}>{daysInStock(item)}d in stock</span>}
        </div>
      </div>
      {item.status === "sold" && <div style={{ alignSelf: "center", fontSize: 10, fontWeight: 700, color: "#c33", background: "#fdecec", padding: "3px 8px", borderRadius: 5 }}>SOLD</div>}
    </div>
  );
}

// ── Add Stock form ──
function AddStock({ cats, brands, currentUser, onCatAdded, onBrandAdded, onDone, onCancel, showToast }) {
  const [photo, setPhoto] = useState(null);
  const [catId, setCatId] = useState("");
  const [size, setSize] = useState("");
  const [gender, setGender] = useState("");
  const [brand, setBrand] = useState("");
  const [sleeve, setSleeve] = useState("");
  const [comment, setComment] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  const cat = cats.find(c => c.id === catId);
  const sizeInfo = getSizeOpts(cat);
  const catColor = cat ? getCatColor(cat, cats) : null;

  const handleFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const blob = await compressPhoto(f); setPhoto({ blob, preview: URL.createObjectURL(blob) }); } catch {}
    e.target.value = "";
  };

  const resetForm = (keepCat) => {
    setPhoto(null); setComment(""); setSellPrice(""); setBrand(""); setSleeve("");
    if (!keepCat) { setCatId(""); setSize(""); setGender(""); }
    else { setSize(""); } // keep category (and gender) for next item
  };

  const save = async (mode) => {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      let photo_url = null;
      if (photo) photo_url = await api.upload(photo.blob);
      const barcode = await api.nextBarcode();
      const item = await api.post("inventory", {
        barcode, comment: comment.trim() || null,
        category_id: catId || null, category_name: cat?.name || null,
        size: size || null,
        gender: gender || null,
        brand: brand || null,
        sleeve: isShirtCat(cat) ? (sleeve || null) : null,
        sell_price: sellPrice ? parseFloat(sellPrice) : null,
        photo_url, status: "in_stock",
        user_id: currentUser.id, user_name: currentUser.name,
        added_at: new Date().toISOString(),
      });
      setBusy(false);
      if (mode === "queue") {
        resetForm(true); // keep category for fast haul entry
        showToast("Added + queued \u2192 next item");
      }
      onDone(item, mode);
    } catch (e) {
      setBusy(false);
      setErr(e.message || "Could not save. Check connection and that the inventory table exists.");
    }
  };

  const addCat = async (name, sizeType) => {
    try {
      const c = await api.post("categories", { name, size_type: sizeType, color: CCOLORS[Math.floor(Math.random() * CCOLORS.length)] });
      if (c) { await onCatAdded(); setCatId(c.id); setSize(""); setShowAddCat(false); }
    } catch (e) { setErr(e.message || "Could not add category."); }
  };

  return (
    <div style={{ padding: "16px 16px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Add to stock</div>
        <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 24, color: "#bbb", cursor: "pointer" }}>{"\u00d7"}</button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
      {photo ? (
        <div style={{ position: "relative", marginBottom: 14, borderRadius: 14, overflow: "hidden", background: "#f0ede8", border: "1px solid " + BORDER }}>
          <img src={photo.preview} alt="" style={{ width: "100%", maxHeight: 360, objectFit: "contain", display: "block" }} />
          <button onClick={() => setPhoto(null)} style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 24, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} style={{ width: "100%", aspectRatio: "3/4", maxHeight: 300, background: CARD, border: "2px dashed " + BORDER, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.4 }}>{"\uD83D\uDCF7"}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#888" }}>Add photo</div>
        </button>
      )}

      <div style={S.card}>
        <label style={S.label}>Description</label>
        <DescField value={comment} onChange={setComment} />
      </div>

      <div style={S.card}>
        <label style={S.label}>Brand</label>
        <BrandPicker brands={brands} value={brand} onChange={setBrand} onBrandAdded={onBrandAdded} />
      </div>

      <div style={S.card}>
        <label style={S.label}>Category</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {cats.map(c => { const cc = getCatColor(c, cats); return <button key={c.id} onClick={() => { setCatId(c.id); setSize(""); setShowAddCat(false); }} style={S.chip(catId === c.id, cc)}>{c.name}</button>; })}
          <button onClick={() => setShowAddCat(s => !s)} style={{ ...S.chip(showAddCat, null), borderStyle: "dashed" }}>+ New</button>
        </div>
        {showAddCat && <AddCatStrip onAdd={addCat} onCancel={() => setShowAddCat(false)} />}
      </div>

      {cat && (
        <div style={S.card}>
          <label style={S.label}>Size</label>
          {(sizeInfo.type === "denim_full" || sizeInfo.type === "denim_waist") ? (
            <DenimSizePicker type={sizeInfo.type} value={size} onChange={setSize} catColor={catColor} />
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sizeInfo.opts.map(s => <button key={s} onClick={() => setSize(s)} style={S.chip(size === s, catColor)}>{s}</button>)}
            </div>
          )}
        </div>
      )}

      {isShirtCat(cat) && (
        <div style={S.card}>
          <label style={S.label}>Sleeve</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[["long", "Long sleeve"], ["short", "Short sleeve"]].map(([k, l]) => (
              <button key={k} onClick={() => setSleeve(sleeve === k ? "" : k)} style={{ ...S.chip(sleeve === k, null), flex: 1, textAlign: "center" }}>{l}</button>
            ))}
          </div>
        </div>
      )}

      <div style={S.card}>
        <label style={S.label}>Department</label>
        <div style={{ display: "flex", gap: 8 }}>
          {[["mens", "Men's"], ["womens", "Women's"], ["unisex", "Unisex"]].map(([k, l]) => (
            <button key={k} onClick={() => setGender(gender === k ? "" : k)} style={{ ...S.chip(gender === k, null), flex: 1, textAlign: "center" }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ ...S.card, marginBottom: 12 }}>
        <label style={S.label}>Sell price</label>
        <input type="number" inputMode="numeric" value={sellPrice} onChange={e => setSellPrice(e.target.value)} style={S.field} />
      </div>

      {err && (
        <div style={{ background: "#FDECEC", border: "1px solid #F0C0C0", borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 13, color: "#A33", lineHeight: 1.4 }}>
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => save("queue")} disabled={busy} style={{ flex: 1, padding: "16px", background: "#E8973A", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
          {busy ? "..." : "Add + queue label"}
        </button>
        <button onClick={() => save("print")} disabled={busy} style={{ flex: 1, padding: "16px", background: DARK, border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
          {busy ? "..." : "Add + print now"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: MUTED, textAlign: "center", marginBottom: 16, lineHeight: 1.4 }}>
        Queue = keep adding (category stays), print all at the end. Print now = print this one label immediately.
      </div>
    </div>
  );
}

// ── Stock item detail (sold/revert/print) ──
function StockDetail({ item, cats, adminMode, onZoom, onClose, onSold, onRevert, onPrint, onEdit, onDelete }) {
  const cat = cats.find(c => c.id === item.category_id);
  const catColor = cat ? getCatColor(cat, cats) : null;
  const [confirmRevert, setConfirmRevert] = useState(false);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: CARD, borderRadius: "18px 18px 0 0", maxHeight: "92vh", overflowY: "auto", padding: "20px 18px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{item.status === "sold" ? "Sold item" : "In stock"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: "#bbb", cursor: "pointer" }}>{"\u00d7"}</button>
        </div>

        {item.photo_url && (
          <div onClick={() => onZoom && onZoom(item.photo_url)} style={{ marginBottom: 16, borderRadius: 12, overflow: "hidden", background: "#f0ede8", cursor: "zoom-in", position: "relative" }}>
            <img src={item.photo_url} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "contain", display: "block" }} />
            <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: 16, padding: "4px 10px", fontSize: 11, fontWeight: 600 }}>Tap to zoom</div>
          </div>
        )}

        {item.brand && <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>{item.brand}</div>}
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{item.comment || "No description"}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {item.category_name && <span style={{ fontSize: 12, fontWeight: 700, color: catColor || "#666", background: catColor ? catColor + "18" : "#f4f4f4", padding: "3px 10px", borderRadius: 6 }}>{item.category_name}</span>}
          {item.size && <span style={{ fontSize: 12, color: "#888", background: BG, padding: "3px 10px", borderRadius: 6 }}>{item.size}</span>}
          {item.sleeve && <span style={{ fontSize: 12, color: "#888", background: BG, padding: "3px 10px", borderRadius: 6 }}>{item.sleeve === "long" ? "Long sleeve" : "Short sleeve"}</span>}
          {item.gender && <span style={{ fontSize: 12, color: "#888", background: BG, padding: "3px 10px", borderRadius: 6 }}>{genderLabel(item.gender)}</span>}
          {item.sell_price && <span style={{ fontSize: 14, fontWeight: 700 }}>{item.sell_price} kr</span>}
        </div>

        <div style={{ background: BG, borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontFamily: "monospace", color: "#555" }}>{item.barcode}</span>
        </div>
        <div style={{ fontSize: 12, color: daysInStock(item) >= 90 && item.status === "in_stock" ? "#c33" : MUTED, marginBottom: 16, fontWeight: daysInStock(item) >= 90 && item.status === "in_stock" ? 700 : 400 }}>
          {item.status === "sold" ? `Sold after ${daysInStock(item)} days in stock` : `${daysInStock(item)} days in stock`}
        </div>

        <button onClick={onPrint} style={{ width: "100%", padding: "14px", background: CARD, border: "2px solid " + DARK, borderRadius: 12, fontSize: 14, fontWeight: 700, color: DARK, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>{"\uD83D\uDDA8\uFE0F"} Print barcode</button>

        {item.status === "in_stock" ? (
          <button onClick={onSold} style={{ width: "100%", padding: "16px", background: "#06A77D", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Mark as SOLD</button>
        ) : (
          <>
            {!confirmRevert ? (
              <button onClick={() => setConfirmRevert(true)} style={{ width: "100%", padding: "14px", background: CARD, border: "2px solid " + BORDER, borderRadius: 12, fontSize: 14, fontWeight: 600, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>Revert to in stock</button>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: MUTED, marginBottom: 10, textAlign: "center" }}>This removes the linked sale from History.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setConfirmRevert(false)} style={{ flex: 1, padding: "14px", background: CARD, border: "2px solid " + BORDER, borderRadius: 12, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  <button onClick={onRevert} style={{ flex: 1, padding: "14px", background: "#E8973A", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Confirm revert</button>
                </div>
              </div>
            )}
          </>
        )}

        <button onClick={onEdit} style={{ width: "100%", padding: "13px", background: CARD, border: "2px solid " + BORDER, borderRadius: 12, fontSize: 14, fontWeight: 700, color: DARK, cursor: "pointer", fontFamily: "inherit", marginTop: 10 }}>Edit / change photo</button>

        {adminMode && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid " + BORDER }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#c33", letterSpacing: 1.2, marginBottom: 10 }}>ADMIN</div>
            <button onClick={onDelete} style={{ width: "100%", padding: "13px", background: "#FDECEC", border: "1px solid #F0C0C0", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "#c33", cursor: "pointer", fontFamily: "inherit" }}>Delete item</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit Stock item (admin): all fields incl. photo ──
function EditStock({ item, cats, brands, adminMode, onSave, onClose, onCatAdded, onBrandAdded }) {
  const [photo, setPhoto] = useState(item.photo_url ? { url: item.photo_url } : null);
  const [photoChanged, setPC] = useState(false);
  const [catId, setCatId] = useState(item.category_id || "");
  const [size, setSize] = useState(item.size || "");
  const [gender, setGender] = useState(item.gender || "");
  const [brand, setBrand] = useState(item.brand || "");
  const [sleeve, setSleeve] = useState(item.sleeve || "");
  const [comment, setComment] = useState(item.comment || "");
  const [sellPrice, setSellPrice] = useState(item.sell_price ?? "");
  const [addedDate, setAddedDate] = useState((item.added_at || item.created_at || "").slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  const cat = cats.find(c => c.id === catId);
  const sizeInfo = getSizeOpts(cat);
  const catColor = cat ? getCatColor(cat, cats) : null;

  const handleFile = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const blob = await compressPhoto(f); setPhoto({ blob, preview: URL.createObjectURL(blob) }); setPC(true); } catch {}
    e.target.value = "";
  };

  const save = async () => {
    setBusy(true); setErr("");
    try {
      let photo_url = item.photo_url;
      if (photoChanged) photo_url = photo?.blob ? await api.upload(photo.blob) : null;
      await onSave({
        photo_url, category_id: catId || null, category_name: cat?.name || null,
        size: size || null, gender: gender || null, comment: comment.trim() || null,
        brand: brand || null,
        sleeve: isShirtCat(cat) ? (sleeve || null) : null,
        sell_price: sellPrice !== "" ? parseFloat(sellPrice) : null,
        ...(adminMode && addedDate ? { added_at: new Date(addedDate + "T12:00:00").toISOString() } : {}),
      });
    } catch (e) { setBusy(false); setErr(e.message || "Could not save"); }
  };

  const addCat = async (name, sizeType) => {
    try {
      const c = await api.post("categories", { name, size_type: sizeType, color: CCOLORS[Math.floor(Math.random() * CCOLORS.length)] });
      if (c) { await onCatAdded(); setCatId(c.id); setSize(""); setShowAddCat(false); }
    } catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 550, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: CARD, borderRadius: "18px 18px 0 0", maxHeight: "92vh", overflowY: "auto", padding: "20px 18px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Edit item</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: "#bbb", cursor: "pointer" }}>{"\u00d7"}</button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        {(photo?.url || photo?.preview) ? (
          <div style={{ position: "relative", marginBottom: 16, borderRadius: 12, overflow: "hidden", background: "#f0ede8" }}>
            <img src={photo.preview || photo.url} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "contain", display: "block" }} />
            <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6 }}>
              <button onClick={() => fileRef.current?.click()} style={{ background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 20, color: "#fff", padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Replace</button>
              <button onClick={() => { setPhoto(null); setPC(true); }} style={{ background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 20, color: "#fff", padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
            </div>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} style={{ width: "100%", height: 100, background: BG, border: "2px dashed " + BORDER, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", fontSize: 14, color: MUTED }}>{"\uD83D\uDCF7"} Add photo</button>
        )}

        <label style={S.label}>Description</label>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} style={{ ...S.field, resize: "none", lineHeight: 1.6, marginBottom: 14 }} />

        <label style={S.label}>Category</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: showAddCat ? 0 : 14 }}>
          {cats.map(c => <button key={c.id} onClick={() => { setCatId(c.id); setSize(""); setShowAddCat(false); }} style={S.chip(catId === c.id, getCatColor(c, cats))}>{c.name}</button>)}
          <button onClick={() => setShowAddCat(s => !s)} style={{ ...S.chip(showAddCat), borderStyle: "dashed" }}>+ New</button>
        </div>
        {showAddCat && <AddCatStrip onAdd={addCat} onCancel={() => setShowAddCat(false)} />}

        <label style={{ ...S.label, marginTop: 14 }}>Brand</label>
        <div style={{ marginBottom: 4 }}>
          <BrandPicker brands={brands} value={brand} onChange={setBrand} onBrandAdded={onBrandAdded} />
        </div>

        {cat && (
          <>
            <label style={{ ...S.label, marginTop: 14 }}>Size</label>
            {(sizeInfo.type === "denim_full" || sizeInfo.type === "denim_waist") ? (
              <div style={{ marginBottom: 14 }}><DenimSizePicker type={sizeInfo.type} value={size} onChange={setSize} catColor={catColor} /></div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {sizeInfo.opts.map(s => <button key={s} onClick={() => setSize(s)} style={S.chip(size === s, catColor)}>{s}</button>)}
              </div>
            )}
          </>
        )}

        {isShirtCat(cat) && (
          <>
            <label style={S.label}>Sleeve</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[["long", "Long sleeve"], ["short", "Short sleeve"]].map(([k, l]) => (
                <button key={k} onClick={() => setSleeve(sleeve === k ? "" : k)} style={{ ...S.chip(sleeve === k, null), flex: 1, textAlign: "center" }}>{l}</button>
              ))}
            </div>
          </>
        )}

        <label style={S.label}>Department</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["mens", "Men's"], ["womens", "Women's"], ["unisex", "Unisex"]].map(([k, l]) => (
            <button key={k} onClick={() => setGender(gender === k ? "" : k)} style={{ ...S.chip(gender === k, null), flex: 1, textAlign: "center" }}>{l}</button>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Sell price</label>
          <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} style={S.field} />
        </div>

        {adminMode && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ ...S.label, color: "#c33" }}>Date added (admin)</label>
            <input type="date" value={addedDate} onChange={e => setAddedDate(e.target.value)} style={S.field} />
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Changes the days-in-stock count.</div>
          </div>
        )}

        {err && <div style={{ background: "#FDECEC", border: "1px solid #F0C0C0", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: "#A33" }}>{err}</div>}

        <button onClick={save} disabled={busy} style={{ ...S.btn(!busy), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving..." : "Save changes"}</button>
      </div>
    </div>
  );
}

// ── Print Label (barcode + description + price) ──
function PrintLabel({ items, onClose }) {
  const list = Array.isArray(items) ? items : [items];
  const [building, setBuilding] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [err, setErr] = useState("");

  // Build a PDF: one 38x50mm page per label, size baked in so iOS prints it correctly
  const buildPdf = async () => {
    setBuilding(true); setErr("");
    try {
      const W = 38, H = 50; // mm
      const doc = new jsPDF({ unit: "mm", format: [W, H], orientation: "portrait" });
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (i > 0) doc.addPage([W, H], "portrait");
        const cx = W / 2;

        // Top text: brand (bold), description, then category·size
        let y = 4;
        if (item.brand) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text(item.brand.toString(), cx, y, { align: "center" });
          y += 3.2;
        }
        doc.setFont("helvetica", item.brand ? "normal" : "bold");
        doc.setFontSize(item.brand ? 7 : 8);
        const desc = (item.comment || item.category_name || "Item").toString();
        const descLines = doc.splitTextToSize(desc, W - 4).slice(0, item.brand ? 1 : 2);
        descLines.forEach(line => { doc.text(line, cx, y, { align: "center" }); y += 3; });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        const meta = [item.category_name, item.size].filter(Boolean).join("  ·  ");
        if (meta) { doc.text(meta, cx, y + 0.5, { align: "center" }); }

        // QR in the middle
        const qrDataUrl = await QRCode.toDataURL(item.barcode, { margin: 0, width: 300, errorCorrectionLevel: "H" });
        const qrSize = 22; // mm
        doc.addImage(qrDataUrl, "PNG", cx - qrSize / 2, 11, qrSize, qrSize);

        // Barcode text + price at bottom
        doc.setFont("courier", "normal");
        doc.setFontSize(7);
        doc.text(item.barcode, cx, 37, { align: "center" });
        if (item.sell_price != null && item.sell_price !== "") {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          doc.text(item.sell_price + " kr", cx, 45, { align: "center" });
        }
      }
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setBuilding(false);
      // Auto-open the iOS print/share sheet
      window.open(url, "_blank");
    } catch (e) {
      setBuilding(false);
      setErr(e.message || "Could not build PDF");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: CARD, borderRadius: 16, padding: 20, maxWidth: 360, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{list.length > 1 ? `Print ${list.length} labels` : "Print label"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: "#bbb", cursor: "pointer" }}>{"\u00d7"}</button>
        </div>

        {/* On-screen preview (what each label contains) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 16, maxHeight: 260, overflowY: "auto" }}>
          {list.map((item, idx) => (
            <div key={item.id || idx} style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 6, padding: "8px 6px", textAlign: "center", width: 114, minHeight: 150, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                {item.brand && <div style={{ fontSize: 11, fontWeight: 800, color: "#000" }}>{item.brand}</div>}
                <div style={{ fontSize: 10, fontWeight: item.brand ? 500 : 700, color: "#000", lineHeight: 1.2 }}>{item.comment || item.category_name || "Item"}</div>
                <div style={{ fontSize: 8, color: "#444", marginTop: 1 }}>{[item.category_name, item.size].filter(Boolean).join(" · ")}</div>
              </div>
              <BarcodeSVG value={item.barcode} height={66} />
              <div>
                <div style={{ fontSize: 8, fontFamily: "monospace", color: "#000" }}>{item.barcode}</div>
                {item.sell_price != null && item.sell_price !== "" && <div style={{ fontSize: 14, fontWeight: 800, color: "#000" }}>{item.sell_price} kr</div>}
              </div>
            </div>
          ))}
        </div>

        {err && <div style={{ background: "#FDECEC", border: "1px solid #F0C0C0", borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12, color: "#A33" }}>{err}</div>}

        <button onClick={buildPdf} disabled={building} style={{ width: "100%", padding: "14px", background: DARK, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "#fff", cursor: building ? "default" : "pointer", fontFamily: "inherit", marginBottom: 8, opacity: building ? 0.6 : 1 }}>
          {building ? "Building..." : `Create label PDF${list.length > 1 ? ` (${list.length})` : ""}`}
        </button>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", fontSize: 13, color: "#06A77D", fontWeight: 600, marginBottom: 8 }}>Tap here if the PDF didn't open</a>
        )}
        <div style={{ fontSize: 11, color: MUTED, textAlign: "center", lineHeight: 1.4 }}>
          Opens a 38×50mm PDF. In the iOS print sheet pick the Brother and print — size is fixed in the file, so it prints correct. Set copies = 1.
        </div>
      </div>
    </div>
  );
}

// ── Days in stock helper ──
function genderLabel(g) {
  if (g === "mens") return "Men's";
  if (g === "womens") return "Women's";
  if (g === "unisex") return "Unisex";
  return "";
}
function daysInStock(item) {
  const start = new Date(item.added_at || item.created_at);
  const end = item.status === "sold" && item.sold_at ? new Date(item.sold_at) : new Date();
  return Math.max(0, Math.floor((end - start) / 86400000));
}

// ── Continuous Scanner: scan → confirm sold → keep scanning (zxing camera + Bluetooth input) ──
function ContinuousScanner({ inventory, onLookup, onSell, onClose }) {
  const videoRef = useRef();
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null); // item awaiting sold confirm
  const [cleared, setCleared] = useState([]);    // running tally of cleared items this session
  const controlsRef = useRef(null);
  const lastScanRef = useRef({ code: "", t: 0 });

  const handleCode = async (code) => {
    // debounce duplicate reads of the same code within 2.5s
    const now = Date.now();
    if (code === lastScanRef.current.code && now - lastScanRef.current.t < 2500) return;
    lastScanRef.current = { code, t: now };
    if (pending) return; // already confirming one
    const item = await onLookup(code);
    if (item && item.status === "in_stock") setPending(item);
  };

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader();
    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!active || !result) return;
          handleCode(result.getText());
        });
        controlsRef.current = controls;
      } catch (e) {
        setError("Couldn't access camera. Type/scan the code in the box below.");
      }
    })();
    return () => { active = false; try { controlsRef.current && controlsRef.current.stop(); } catch {} };
  }, [pending]);

  const confirmSold = async () => {
    const item = pending;
    setPending(null);
    await onSell(item);
    setCleared(c => [...c, item]);
    setManual("");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Scan to sell</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 26, color: "#fff", cursor: "pointer" }}>{"\u00d7"}</button>
        </div>

        {cleared.length > 0 && (
          <div style={{ background: "#06A77D", color: "#fff", borderRadius: 10, padding: "8px 14px", marginBottom: 12, fontSize: 13, fontWeight: 700, textAlign: "center" }}>
            {cleared.length} item{cleared.length !== 1 ? "s" : ""} marked sold this session
          </div>
        )}

        {pending ? (
          <div style={{ background: "#fff", borderRadius: 14, padding: 18, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 56, height: 72, borderRadius: 8, background: "#f0ede8", overflow: "hidden", flexShrink: 0 }}>
                {pending.photo_url ? <img src={pending.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{pending.comment || "No description"}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{[pending.category_name, pending.size].filter(Boolean).join(" \u00b7 ")}</div>
                {pending.sell_price && <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{pending.sell_price} kr</div>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPending(null)} style={{ flex: 1, padding: "14px", background: CARD, border: "2px solid " + BORDER, borderRadius: 10, fontSize: 14, fontWeight: 600, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={confirmSold} style={{ flex: 2, padding: "14px", background: "#06A77D", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Mark SOLD &amp; continue</button>
            </div>
          </div>
        ) : !error ? (
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#000", marginBottom: 14 }}>
            <video ref={videoRef} playsInline muted style={{ width: "100%", display: "block" }} />
            <div style={{ position: "absolute", inset: "18%", border: "2px solid #06A77D", borderRadius: 12, boxShadow: "0 0 12px rgba(6,167,125,0.6)" }} />
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 14, fontSize: 13, color: "#555", lineHeight: 1.5 }}>{error}</div>
        )}

        {!pending && (
          <>
            <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && manual.trim()) { handleCode(manual.trim()); setManual(""); } }} placeholder="Or tap here to type / use Bluetooth scanner" style={{ ...S.field, marginBottom: 10 }} />
            <button onClick={() => { if (manual.trim()) { handleCode(manual.trim()); setManual(""); } }} style={{ width: "100%", padding: "14px", background: "#06A77D", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Find item</button>
          </>
        )}

        <button onClick={onClose} style={{ width: "100%", padding: "12px", background: "transparent", border: "none", color: "#aaa", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginTop: 10 }}>Done</button>
      </div>
    </div>
  );
}
