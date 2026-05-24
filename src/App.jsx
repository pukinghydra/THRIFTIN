import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const SUPABASE_URL = "https://mpkazwsxjorocqajpkao.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wa2F6d3N4am9yb2NxYWpwa2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzA4MTksImV4cCI6MjA5MzY0NjgxOX0.IZjuxlv40iOLEdOXJrYl1QfRKmo_nMYJZEH4FHU5ZiI";
const sb = {
  h: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
  url: SUPABASE_URL + "/rest/v1",
  sto: SUPABASE_URL + "/storage/v1/object",
};

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
  "ysl": "Saint Laurent", "saint": "Saint Laurent", "laurent": "Saint Laurent",
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
  "levis": "Levi's", "levi's": "Levi's", "levi": "Levi's",
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
  post: async (table, body) => { const r = await fetch(sb.url + "/" + table, { method: "POST", headers: { ...sb.h, Prefer: "return=representation" }, body: JSON.stringify(body) }); return r.ok ? (await r.json())[0] : null; },
  patch: async (table, id, body) => { const r = await fetch(sb.url + "/" + table + "?id=eq." + id, { method: "PATCH", headers: { ...sb.h, Prefer: "return=representation" }, body: JSON.stringify(body) }); return r.ok ? (await r.json())[0] : null; },
  del: async (table, id) => { await fetch(sb.url + "/" + table + "?id=eq." + id, { method: "DELETE", headers: sb.h }); },
  upload: async (blob) => {
    const fn = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + ".jpg";
    const r = await fetch(sb.sto + "/photos/" + fn, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "image/jpeg" }, body: blob });
    return r.ok ? SUPABASE_URL + "/storage/v1/object/public/photos/" + fn : null;
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
export default function App() {
  const [users, setUsers] = useState([]);
  const [cats, setCats] = useState([]);
  const [sales, setSales] = useState([]);
  const [currentUser, setCU] = useState(null);
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem("thriftin_tab") || "log"; } catch { return "log"; }
  });
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(true);
  const [toast, setToast] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const logoTaps = useRef(0);
  const logoTimer = useRef(null);

  useEffect(() => { try { localStorage.setItem("thriftin_tab", tab); } catch {} }, [tab]);

  useEffect(() => {
    (async () => {
      try {
        const [u, c, s] = await Promise.all([api.get("users", "&order=name"), api.get("categories", "&order=name"), api.get("sales", "&order=created_at.desc")]);
        setUsers(u); setCats(c); setSales(s);
        const savedId = localStorage.getItem("thriftin_user");
        if (savedId) { const found = u.find(x => x.id === savedId); if (found) { setCU(found); setShowPicker(false); } }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const refresh = async () => {
    const [u, c, s] = await Promise.all([api.get("users", "&order=name"), api.get("categories", "&order=name"), api.get("sales", "&order=created_at.desc")]);
    setUsers(u); setCats(c); setSales(s);
  };

  const pickUser = (u) => { setCU(u); setShowPicker(false); try { localStorage.setItem("thriftin_user", u.id); } catch {} };

  const handleLogoTap = () => {
    logoTaps.current++;
    clearTimeout(logoTimer.current);
    logoTimer.current = setTimeout(() => { logoTaps.current = 0; }, 1500);
    if (logoTaps.current >= 5) { setShowAdmin(true); logoTaps.current = 0; }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

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
      {showAdmin && <AdminPanel users={users} cats={cats} onClose={() => setShowAdmin(false)} onChanged={refresh} />}

      <div style={{ padding: "16px 20px 12px", background: CARD, borderBottom: "1px solid " + BORDER, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div onClick={handleLogoTap} style={{ cursor: "default" }}><Logo size={24} /></div>
        <button onClick={() => setShowPicker(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: BG, border: "1px solid " + BORDER, borderRadius: 24, padding: "6px 14px 6px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#555" }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: currentUser.color || "#888" }} />
          {currentUser.name}
        </button>
      </div>

      <div style={{ padding: "0 0 80px" }}>
        <div style={{ display: tab === "log" ? "block" : "none" }}>
          <LogScreen cats={cats} currentUser={currentUser} onSaved={() => { refresh(); showToast("Sale logged"); }} onCatAdded={refresh} />
        </div>
        <div style={{ display: tab === "history" ? "block" : "none" }}>
          <HistoryScreen sales={sales} cats={cats} users={users} onChanged={refresh} onCatAdded={refresh} />
        </div>
      </div>

      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: CARD, borderTop: "1px solid " + BORDER, display: "flex", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {[["log", "Log sale", "\uD83D\uDCF7"], ["history", "History", "\uD83D\uDDC2"]].map(([id, lbl, icon]) => (
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

function AdminPanel({ users, cats, onClose, onChanged }) {
  const [confirm, setConfirm] = useState(null);

  const removeUser = async (id) => { await api.del("users", id); await onChanged(); setConfirm(null); };
  const removeCat = async (id) => { await api.del("categories", id); await onChanged(); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: CARD, borderRadius: "18px 18px 0 0", maxHeight: "85vh", overflowY: "auto", padding: "24px 20px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Admin</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: "#aaa", cursor: "pointer" }}>{"\u00d7"}</button>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Staff members</div>
        {users.map(u => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid " + BORDER }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: u.color }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{u.name}</span>
            </div>
            <button onClick={() => setConfirm(u)} style={{ padding: "6px 14px", background: BG, border: "1px solid #e0d0d0", borderRadius: 8, fontSize: 12, color: "#c33", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
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
      placeholder={focused ? "" : "Brand, colour, details..."}
      rows={2}
      style={{ ...S.field, resize: "none", lineHeight: 1.6 }}
    />
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
function LogScreen({ cats, currentUser, onSaved, onCatAdded }) {
  const [photo, setPhoto] = useState(null);
  const [catId, setCatId] = useState("");
  const [size, setSize] = useState("");
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

  const save = async () => {
    if (busy) return;
    setBusy(true);
    let photo_url = null;
    if (photo) photo_url = await api.upload(photo.blob);
    await api.post("sales", {
      user_id: currentUser.id, user_name: currentUser.name,
      category_id: catId || null, category_name: cat?.name || null,
      size: size || null, comment: comment.trim() || null,
      price: price ? parseFloat(price) : null, photo_url,
    });
    setBusy(false);
    setPhoto(null); setCatId(""); setSize(""); setComment(""); setPrice("");
    onSaved();
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

      <div style={S.card}>
        <label style={S.label}>Price <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#ccc" }}>(optional)</span></label>
        <input type="number" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} style={S.field} />
      </div>

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
  const startOfWeek = () => { const d = new Date(today); d.setDate(d.getDate() - d.getDay() + 1); return fmt(d); };
  const startOfLastWeek = () => { const d = new Date(today); d.setDate(d.getDate() - d.getDay() - 6); return fmt(d); };
  const endOfLastWeek = () => { const d = new Date(today); d.setDate(d.getDate() - d.getDay()); return fmt(d); };
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
function HistoryScreen({ sales, cats, users, onChanged, onCatAdded }) {
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

  const visible = sales.filter(s => {
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!(s.comment || "").toLowerCase().includes(q) && !(s.category_name || "").toLowerCase().includes(q) && !(s.user_name || "").toLowerCase().includes(q)) return false;
    }
    if (filterCat && s.category_id !== filterCat) return false;
    if (filterUser && s.user_id !== filterUser) return false;
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

  // Summary sales = sales from selected days
  const summarySalesRaw = useMemo(() => {
    if (!summaryMode || selectedDays.size === 0) return [];
    return visible.filter(s => {
      const d = s.sold_at || (s.created_at || "").slice(0, 10);
      return selectedDays.has(d);
    });
  }, [summaryMode, selectedDays, visible]);

  const summarySales = useMemo(() => {
    if (!summaryCatFilter) return summarySalesRaw;
    return summarySalesRaw.filter(s => s.category_id === summaryCatFilter);
  }, [summarySalesRaw, summaryCatFilter]);

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
    } else {
      setSummaryMode(true);
      setSelectedDays(new Set());
      setSummaryCatFilter("");
    }
  };

  const selectAllDays = () => setSelectedDays(new Set(days));

  // Auto-select all visible days when date filters change in summary mode
  const dateKey = dateFrom + "|" + dateTo;
  useEffect(() => {
    if (summaryMode && days.length > 0) {
      setSelectedDays(new Set(days));
    }
  }, [dateKey, summaryMode]);

  const fmtDay = (d) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (d === today) return "Today";
    if (d === yesterday) return "Yesterday";
    return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div>
      {editing && <EditModal sale={editing} cats={cats} users={users} onCatAdded={onCatAdded} onSave={async patch => { await api.patch("sales", editing.id, patch); await onChanged(); setEditing(null); }} onClose={() => setEditing(null)} />}
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

      {/* Actual items in summary mode */}
      {summaryMode && summarySales.length > 0 && (
        <div style={{ margin: "0 16px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginBottom: 8, padding: "0 2px" }}>
            {summaryCatFilter ? `${cats.find(c => c.id === summaryCatFilter)?.name?.toUpperCase() || "ITEMS"} — ` : ""}{summarySales.length} ITEM{summarySales.length !== 1 ? "S" : ""}
          </div>
          <div style={{ borderRadius: 14, border: "1px solid " + BORDER, overflow: "hidden" }}>
            {summarySales.map(s => (
              <SaleCard key={s.id} sale={s} cats={cats} users={users} onEdit={() => setEditing(s)} onDel={() => setConfirmDel(s)} />
            ))}
          </div>
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
              <SaleCard key={s.id} sale={s} cats={cats} users={users} onEdit={() => setEditing(s)} onDel={() => setConfirmDel(s)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SaleCard({ sale, cats, users, onEdit, onDel }) {
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
        <button onClick={onDel} style={{ padding: "6px 12px", background: BG, border: "1px solid " + BORDER, borderRadius: 8, fontSize: 11, color: "#bbb", cursor: "pointer", fontFamily: "inherit" }}>Del</button>
      </div>
    </div>
  );
}

// ── Edit Modal ──
function EditModal({ sale, cats, users, onSave, onClose, onCatAdded }) {
  const [photo, setPhoto] = useState(sale.photo_url ? { url: sale.photo_url } : null);
  const [photoChanged, setPC] = useState(false);
  const [confirmPhotoDel, setCPD] = useState(false);
  const [catId, setCatId] = useState(sale.category_id || "");
  const [size, setSize] = useState(sale.size || "");
  const [comment, setComment] = useState(sale.comment || "");
  const [price, setPrice] = useState(sale.price || "");
  const [userId, setUserId] = useState(sale.user_id || "");
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

  const save = async () => {
    setBusy(true);
    let photo_url = sale.photo_url;
    if (photoChanged) photo_url = photo?.blob ? await api.upload(photo.blob) : null;
    const u = users.find(x => x.id === userId);
    await onSave({ photo_url, category_id: catId || null, category_name: cat?.name || null, size: size || null, comment: comment.trim() || null, price: price ? parseFloat(price) : null, user_id: userId || null, user_name: u?.name || null });
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
