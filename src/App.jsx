import { useState, useRef, useEffect } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://mpkazwsxjorocqajpkao.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wa2F6d3N4am9yb2NxYWpwa2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzA4MTksImV4cCI6MjA5MzY0NjgxOX0.IZjuxlv40iOLEdOXJrYl1QfRKmo_nMYJZEH4FHU5ZiI";

const sb = {
  headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
  url: SUPABASE_URL + "/rest/v1",
  storage: SUPABASE_URL + "/storage/v1/object",
};

const SIZES_CLOTHING = ["XS", "S", "M", "L", "XL", "XXL"];
const SIZES_FOOTWEAR = ["34","35","36","37","38","39","40","41","42","43","44","45","46","47"];
const ONE_SIZE = ["One Size"];

const USER_COLORS = ["#E63946","#1D3557","#06A77D","#F4A261","#9D4EDD","#264653","#E9C46A","#A23B72"];

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo({ size = 24 }) {
  return (
    <span style={{ fontFamily: "Georgia, serif", fontSize: size, fontWeight: 900, letterSpacing: -1, color: "#111", lineHeight: 1 }}>
      thriftin{"\u2019"}
    </span>
  );
}

// ─── Photo compression ────────────────────────────────────────────────────────
async function compressPhoto(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        c.toBlob(blob => resolve(blob), "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function fetchUsers() {
  const r = await fetch(sb.url + "/users?select=*&order=name", { headers: sb.headers });
  return r.ok ? await r.json() : [];
}
async function createUser(name) {
  const color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  const r = await fetch(sb.url + "/users", {
    method: "POST",
    headers: { ...sb.headers, Prefer: "return=representation" },
    body: JSON.stringify({ name, color }),
  });
  return r.ok ? (await r.json())[0] : null;
}
async function fetchCategories() {
  const r = await fetch(sb.url + "/categories?select=*&order=name", { headers: sb.headers });
  return r.ok ? await r.json() : [];
}
async function createCategory(name, sizeType) {
  const r = await fetch(sb.url + "/categories", {
    method: "POST",
    headers: { ...sb.headers, Prefer: "return=representation" },
    body: JSON.stringify({ name, size_type: sizeType }),
  });
  return r.ok ? (await r.json())[0] : null;
}
async function fetchSales() {
  const r = await fetch(sb.url + "/sales?select=*&order=created_at.desc", { headers: sb.headers });
  return r.ok ? await r.json() : [];
}
async function createSale(sale) {
  const r = await fetch(sb.url + "/sales", {
    method: "POST",
    headers: { ...sb.headers, Prefer: "return=representation" },
    body: JSON.stringify(sale),
  });
  return r.ok ? (await r.json())[0] : null;
}
async function updateSale(id, patch) {
  const r = await fetch(sb.url + "/sales?id=eq." + id, {
    method: "PATCH",
    headers: { ...sb.headers, Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return r.ok ? (await r.json())[0] : null;
}
async function deleteSale(id) {
  await fetch(sb.url + "/sales?id=eq." + id, { method: "DELETE", headers: sb.headers });
}
async function uploadPhoto(blob) {
  const filename = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2,8) + ".jpg";
  const r = await fetch(sb.storage + "/photos/" + filename, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!r.ok) return null;
  return SUPABASE_URL + "/storage/v1/object/public/photos/" + filename;
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [users, setUsers]           = useState([]);
  const [cats, setCats]             = useState([]);
  const [sales, setSales]           = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab]               = useState("log");
  const [loading, setLoading]       = useState(true);
  const [showPicker, setShowPicker] = useState(true);
  const [error, setError]           = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [u, c, s] = await Promise.all([fetchUsers(), fetchCategories(), fetchSales()]);
        setUsers(u); setCats(c); setSales(s);
      } catch (e) {
        setError("Connection issue: " + e.message);
      }
      setLoading(false);
    })();
  }, []);

  const refreshSales  = async () => setSales(await fetchSales());
  const refreshCats   = async () => setCats(await fetchCategories());
  const refreshUsers  = async () => setUsers(await fetchUsers());

  if (loading) return <Splash text="Loading\u2026" />;
  if (error)   return <Splash text={error} />;

  if (showPicker || !currentUser) {
    return <UserPicker users={users} onPick={u => { setCurrentUser(u); setShowPicker(false); }} onAddUser={async name => {
      const u = await createUser(name);
      if (u) { await refreshUsers(); setCurrentUser(u); setShowPicker(false); }
    }} />;
  }

  return (
    <div style={{ background: "#fff", minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#111" }}>
      <Header currentUser={currentUser} onSwap={() => setShowPicker(true)} />
      <div style={{ paddingBottom: 76 }}>
        {tab === "log"     && <LogScreen     users={users} cats={cats} currentUser={currentUser} onSaved={refreshSales} onCatAdded={refreshCats} />}
        {tab === "history" && <HistoryScreen sales={sales} cats={cats} users={users} onChanged={refreshSales} onCatAdded={refreshCats} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

function Splash({ text }) {
  return (
    <div style={{ background: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <Logo size={32} />
      <div style={{ color: "#888", fontSize: 13 }}>{text}</div>
    </div>
  );
}

// ─── User Picker ──────────────────────────────────────────────────────────────
function UserPicker({ users, onPick, onAddUser }) {
  const [adding, setAdding] = useState(users.length === 0);
  const [name, setName]     = useState("");
  const [busy, setBusy]     = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await onAddUser(name.trim());
    setBusy(false); setName(""); setAdding(false);
  };

  return (
    <div style={{ background: "#fff", minHeight: "100vh", maxWidth: 480, margin: "0 auto", padding: "60px 24px", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#111" }}>
      <div style={{ marginBottom: 50, textAlign: "center" }}>
        <Logo size={36} />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px", textAlign: "center" }}>Who is logging?</h2>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 32px", textAlign: "center", lineHeight: 1.5 }}>
        Pick yourself, or add a new staff member.
      </p>

      {users.map(u => (
        <button key={u.id} onClick={() => onPick(u)} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "16px 18px", marginBottom: 10, background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 500, color: "#111" }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: u.color || "#888" }} />
          {u.name}
        </button>
      ))}

      {adding ? (
        <div style={{ marginTop: 16 }}>
          <input
            autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="Your name"
            style={{ width: "100%", padding: "14px 16px", boxSizing: "border-box", border: "1px solid #ccc", borderRadius: 10, fontSize: 15, fontFamily: "inherit", marginBottom: 8, outline: "none" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setAdding(false); setName(""); }} style={{ flex: 1, padding: "13px", background: "#fff", border: "1px solid #ddd", borderRadius: 10, fontSize: 14, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button onClick={handleAdd} disabled={busy || !name.trim()} style={{ flex: 1, padding: "13px", background: name.trim() ? "#111" : "#e8e8e8", border: "none", borderRadius: 10, fontSize: 14, color: name.trim() ? "#fff" : "#aaa", fontWeight: 600, cursor: name.trim() ? "pointer" : "default", fontFamily: "inherit" }}>{busy ? "\u2026" : "Add"}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ display: "block", width: "100%", padding: "14px", marginTop: 12, background: "#fff", border: "1.5px dashed #ccc", borderRadius: 10, fontSize: 14, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>
          + New staff member
        </button>
      )}
    </div>
  );
}

// ─── Header & Nav ─────────────────────────────────────────────────────────────
function Header({ currentUser, onSwap }) {
  return (
    <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #ebebeb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Logo size={22} />
      <button onClick={onSwap} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fafafa", border: "1px solid #ebebeb", borderRadius: 20, padding: "5px 12px 5px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: "#555" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: currentUser.color || "#888" }} />
        {currentUser.name}
      </button>
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  return (
    <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #ebebeb", display: "flex", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)" }}>
      {[["log","Log sale","\uD83D\uDCF7"],["history","History","\uD83D\uDDC2"]].map(([id, label, icon]) => (
        <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "10px 0 8px", background: "none", border: "none", borderTop: "2px solid " + (tab === id ? "#111" : "transparent"), color: tab === id ? "#111" : "#bbb", cursor: "pointer", fontFamily: "inherit", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
          <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>{label}
        </button>
      ))}
    </nav>
  );
}

// ─── Log Screen ───────────────────────────────────────────────────────────────
function LogScreen({ users, cats, currentUser, onSaved, onCatAdded }) {
  const [photo, setPhoto]       = useState(null); // {blob, preview}
  const [catId, setCatId]       = useState("");
  const [size, setSize]         = useState("");
  const [comment, setComment]   = useState("");
  const [price, setPrice]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [saved, setSaved]       = useState(null); // saved sale data for confirmation
  const [showAddCat, setShowAddCat] = useState(false);
  const fileRef = useRef();

  const cat = cats.find(c => c.id === catId);
  const sizeOptions = !cat ? [] : cat.size_type === "footwear" ? SIZES_FOOTWEAR : cat.size_type === "onesize" ? ONE_SIZE : SIZES_CLOTHING;

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const blob = await compressPhoto(f);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch {}
    setBusy(false);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    let photo_url = null;
    if (photo) {
      photo_url = await uploadPhoto(photo.blob);
    }
    const sale = {
      user_id: currentUser.id,
      user_name: currentUser.name,
      category_id: catId || null,
      category_name: cat ? cat.name : null,
      size: size || null,
      comment: comment.trim() || null,
      price: price ? parseFloat(price) : null,
      photo_url,
    };
    const created = await createSale(sale);
    setBusy(false);
    if (created) {
      const missing = [];
      if (!photo_url) missing.push("photo");
      if (!sale.comment) missing.push("description");
      if (!sale.category_name) missing.push("category");
      setSaved({ ...created, missing });
      // Reset
      setPhoto(null); setCatId(""); setSize(""); setComment(""); setPrice("");
      onSaved();
    }
  };

  const handleAddCat = async (name, sizeType) => {
    const c = await createCategory(name, sizeType);
    if (c) {
      await onCatAdded();
      setCatId(c.id); setSize(""); setShowAddCat(false);
    }
  };

  if (saved) return <SavedConfirmation saved={saved} onNew={() => setSaved(null)} onEdit={() => setSaved(null)} />;

  const f = {
    field: { width: "100%", padding: "13px 14px", boxSizing: "border-box", border: "1px solid #e0e0e0", borderRadius: 10, fontSize: 15, fontFamily: "inherit", outline: "none", background: "#fff", color: "#111" },
    label: { display: "block", fontSize: 11, color: "#888", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 7, fontWeight: 600 },
    chip: (active) => ({ padding: "9px 14px", borderRadius: 8, background: active ? "#111" : "#fff", border: "1px solid " + (active ? "#111" : "#e0e0e0"), color: active ? "#fff" : "#444", fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }),
  };

  return (
    <div style={{ padding: "20px 18px" }}>
      {/* Photo */}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
      {photo ? (
        <div style={{ position: "relative", marginBottom: 18 }}>
          <img src={photo.preview} alt="" style={{ width: "100%", height: 240, objectFit: "cover", borderRadius: 12, display: "block" }} />
          <button onClick={() => setPhoto(null)} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 20, padding: "5px 13px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} style={{ width: "100%", height: 180, background: "#fafafa", border: "1.5px dashed #ddd", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 18 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{"\uD83D\uDCF7"}</div>
          <div style={{ fontSize: 14, color: "#666", fontWeight: 500 }}>Add photo</div>
          <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>Camera roll or take new</div>
        </button>
      )}

      {/* Description */}
      <label style={f.label}>Description</label>
      <textarea
        value={comment} onChange={e => setComment(e.target.value)}
        placeholder="Ralph Lauren short sleeve striped shirt blue M"
        rows={2}
        style={{ ...f.field, resize: "none", lineHeight: 1.5, marginBottom: 18 }}
      />

      {/* Category */}
      <label style={f.label}>Category</label>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: showAddCat ? 10 : 18 }}>
        {cats.map(c => (
          <button key={c.id} onClick={() => { setCatId(c.id); setSize(""); setShowAddCat(false); }} style={f.chip(catId === c.id)}>
            {c.name}
          </button>
        ))}
        <button onClick={() => setShowAddCat(s => !s)} style={{ ...f.chip(showAddCat), borderStyle: "dashed" }}>+ New</button>
      </div>
      {showAddCat && <AddCategoryStrip onAdd={handleAddCat} onCancel={() => setShowAddCat(false)} />}

      {/* Size — only show if category picked */}
      {cat && (
        <>
          <label style={f.label}>Size</label>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
            {sizeOptions.map(s => (
              <button key={s} onClick={() => setSize(s)} style={f.chip(size === s)}>{s}</button>
            ))}
          </div>
        </>
      )}

      {/* Price */}
      <label style={f.label}>Price <span style={{ color: "#bbb", textTransform: "none", letterSpacing: 0, fontWeight: 400, fontStyle: "italic" }}>optional</span></label>
      <input
        type="number" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)}
        placeholder="450"
        style={{ ...f.field, marginBottom: 22 }}
      />

      {/* Save */}
      <button onClick={handleSave} disabled={busy} style={{ width: "100%", padding: "16px", background: busy ? "#888" : "#111", border: "none", borderRadius: 11, color: "#fff", fontSize: 15, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
        {busy ? "Saving\u2026" : "Log sale"}
      </button>
    </div>
  );
}

function AddCategoryStrip({ onAdd, onCancel }) {
  const [name, setName]         = useState("");
  const [sizeType, setSizeType] = useState("clothing");
  const submit = () => { if (name.trim()) onAdd(name.trim(), sizeType); };

  return (
    <div style={{ background: "#fafafa", border: "1px solid #ebebeb", borderRadius: 10, padding: "12px", marginBottom: 18 }}>
      <input
        autoFocus value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="Category name"
        style={{ width: "100%", padding: "11px 12px", boxSizing: "border-box", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, marginBottom: 10, outline: "none", fontFamily: "inherit" }}
      />
      <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Size type:</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[["clothing","Clothing (XS–XXL)"],["footwear","Footwear (34–47)"],["onesize","One size"]].map(([k, l]) => (
          <button key={k} onClick={() => setSizeType(k)} style={{ padding: "7px 10px", background: sizeType === k ? "#111" : "#fff", border: "1px solid " + (sizeType === k ? "#111" : "#ddd"), borderRadius: 7, fontSize: 11, color: sizeType === k ? "#fff" : "#555", cursor: "pointer", fontFamily: "inherit", flex: 1 }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "11px", background: "#fff", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={submit} disabled={!name.trim()} style={{ flex: 1, padding: "11px", background: name.trim() ? "#111" : "#e8e8e8", border: "none", borderRadius: 8, fontSize: 13, color: name.trim() ? "#fff" : "#aaa", fontWeight: 600, cursor: name.trim() ? "pointer" : "default", fontFamily: "inherit" }}>Add</button>
      </div>
    </div>
  );
}

// ─── Saved Confirmation ───────────────────────────────────────────────────────
function SavedConfirmation({ saved, onNew, onEdit }) {
  return (
    <div style={{ padding: "60px 22px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", minHeight: "60vh", justifyContent: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{"\u2713"}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 24 }}>Saved</div>
      {saved.missing.length > 0 && (
        <div style={{ fontSize: 13, color: "#888", lineHeight: 1.7, marginBottom: 28 }}>
          Missing: {saved.missing.join(", ")}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 320 }}>
        <button onClick={onEdit} style={{ flex: 1, padding: "13px", background: "#fff", border: "1px solid #ccc", borderRadius: 10, fontSize: 14, color: "#111", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>Edit</button>
        <button onClick={onNew} style={{ flex: 1, padding: "13px", background: "#111", border: "none", borderRadius: 10, fontSize: 14, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>New sale</button>
      </div>
    </div>
  );
}

// ─── History Screen ───────────────────────────────────────────────────────────
function HistoryScreen({ sales, cats, users, onChanged, onCatAdded }) {
  const [query, setQuery]       = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [editing, setEditing]   = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const userById = u => users.find(x => x.id === u);

  const visible = sales.filter(s => {
    if (query.trim()) {
      const q = query.toLowerCase();
      const hay = (s.comment || "") + " " + (s.category_name || "") + " " + (s.user_name || "");
      if (!hay.toLowerCase().includes(q)) return false;
    }
    if (filterCat && s.category_id !== filterCat) return false;
    if (filterUser && s.user_id !== filterUser) return false;
    return true;
  });

  return (
    <div>
      {editing && (
        <EditSaleModal sale={editing} cats={cats} users={users} onCatAdded={onCatAdded}
          onSave={async patch => { await updateSale(editing.id, patch); await onChanged(); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
      {confirmDel && (
        <ConfirmDeleteModal sale={confirmDel}
          onConfirm={async () => { await deleteSale(confirmDel.id); await onChanged(); setConfirmDel(null); }}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      <div style={{ padding: "16px 18px 0" }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search description, category, user\u2026"
          style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", border: "1px solid #e0e0e0", borderRadius: 10, fontSize: 14, marginBottom: 12, outline: "none", fontFamily: "inherit" }}
        />

        {/* Category filter */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 6 }}>
          <button onClick={() => setFilterCat("")} style={chipStyle(!filterCat)}>All</button>
          {cats.map(c => <button key={c.id} onClick={() => setFilterCat(filterCat === c.id ? "" : c.id)} style={{ ...chipStyle(filterCat === c.id), flexShrink: 0 }}>{c.name}</button>)}
        </div>

        {/* User filter */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, alignItems: "center", borderBottom: "1px solid #f0f0f0" }}>
          <span style={{ fontSize: 10, color: "#bbb", letterSpacing: 1.5, textTransform: "uppercase", marginRight: 4 }}>Filter:</span>
          <button onClick={() => setFilterUser("")} style={chipStyle(!filterUser, "small")}>All staff</button>
          {users.map(u => (
            <button key={u.id} onClick={() => setFilterUser(filterUser === u.id ? "" : u.id)} style={{ ...chipStyle(filterUser === u.id, "small"), display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: u.color || "#888" }} />
              {u.name}
            </button>
          ))}
        </div>
      </div>

      {!visible.length && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb", fontSize: 14 }}>
          {sales.length === 0 ? "No sales logged yet" : "No matches"}
        </div>
      )}

      {visible.map(s => (
        <SaleCard key={s.id} sale={s} userById={userById} onEdit={() => setEditing(s)} onDelete={() => setConfirmDel(s)} />
      ))}
    </div>
  );
}

function chipStyle(active, size) {
  const small = size === "small";
  return {
    padding: small ? "5px 10px" : "8px 13px",
    borderRadius: small ? 6 : 8,
    background: active ? "#111" : "#fff",
    border: "1px solid " + (active ? "#111" : "#e0e0e0"),
    color: active ? "#fff" : "#444",
    fontSize: small ? 12 : 13,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };
}

function SaleCard({ sale, userById, onEdit, onDelete }) {
  const u = userById(sale.user_id);
  const date = sale.sold_at ? sale.sold_at : (sale.created_at || "").slice(0,10);
  return (
    <div style={{ display: "flex", gap: 12, padding: "14px 18px", borderBottom: "1px solid #f0f0f0" }}>
      <div style={{ width: 60, height: 60, borderRadius: 10, background: "#f4f4f4", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {sale.photo_url
          ? <img src={sale.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 18, color: "#ccc" }}>{"\uD83D\uDCF7"}</span>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sale.comment || <span style={{ color: "#bbb", fontWeight: 400, fontStyle: "italic" }}>No description</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {sale.category_name && <span style={{ fontSize: 11, color: "#666", background: "#f4f4f4", padding: "2px 8px", borderRadius: 4 }}>{sale.category_name}</span>}
          {sale.size && <span style={{ fontSize: 11, color: "#666", background: "#f4f4f4", padding: "2px 8px", borderRadius: 4 }}>{sale.size}</span>}
          {sale.price && <span style={{ fontSize: 12, color: "#333", fontWeight: 500 }}>{sale.price} kr</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          {u && <span style={{ width: 8, height: 8, borderRadius: "50%", background: u.color || "#888" }} title={u.name} />}
          <span style={{ fontSize: 11, color: "#aaa" }}>{u?.name || sale.user_name || "—"} · {date}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, justifyContent: "center", flexShrink: 0 }}>
        <button onClick={onEdit} style={{ padding: "5px 11px", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 7, fontSize: 11, color: "#555", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
        <button onClick={onDelete} style={{ padding: "5px 11px", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 7, fontSize: 11, color: "#bbb", cursor: "pointer", fontFamily: "inherit" }}>Del</button>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditSaleModal({ sale, cats, users, onSave, onClose, onCatAdded }) {
  const [photo, setPhoto]     = useState(sale.photo_url ? { url: sale.photo_url } : null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [confirmPhotoDel, setConfirmPhotoDel] = useState(false);
  const [catId, setCatId]     = useState(sale.category_id || "");
  const [size, setSize]       = useState(sale.size || "");
  const [comment, setComment] = useState(sale.comment || "");
  const [price, setPrice]     = useState(sale.price || "");
  const [userId, setUserId]   = useState(sale.user_id || "");
  const [busy, setBusy]       = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const fileRef = useRef();

  const cat = cats.find(c => c.id === catId);
  const sizeOptions = !cat ? [] : cat.size_type === "footwear" ? SIZES_FOOTWEAR : cat.size_type === "onesize" ? ONE_SIZE : SIZES_CLOTHING;

  const handleFile = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try {
      const blob = await compressPhoto(f);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
      setPhotoChanged(true);
    } catch {}
    setBusy(false);
    e.target.value = "";
  };

  const removePhoto = () => {
    if (sale.photo_url && !photoChanged) {
      setConfirmPhotoDel(true);
    } else {
      setPhoto(null); setPhotoChanged(true);
    }
  };

  const save = async () => {
    setBusy(true);
    let photo_url = sale.photo_url;
    if (photoChanged) {
      photo_url = photo?.blob ? await uploadPhoto(photo.blob) : null;
    }
    const u = users.find(x => x.id === userId);
    await onSave({
      photo_url,
      category_id: catId || null,
      category_name: cat?.name || null,
      size: size || null,
      comment: comment.trim() || null,
      price: price ? parseFloat(price) : null,
      user_id: userId || null,
      user_name: u?.name || sale.user_name || null,
    });
  };

  const handleAddCat = async (name, sizeType) => {
    const c = await createCategory(name, sizeType);
    if (c) { await onCatAdded(); setCatId(c.id); setSize(""); setShowAddCat(false); }
  };

  const f = {
    field: { width: "100%", padding: "12px 14px", boxSizing: "border-box", border: "1px solid #e0e0e0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", background: "#fff" },
    label: { display: "block", fontSize: 11, color: "#888", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 7, fontWeight: 600 },
    chip: a => ({ padding: "8px 13px", borderRadius: 7, background: a ? "#111" : "#fff", border: "1px solid " + (a ? "#111" : "#e0e0e0"), color: a ? "#fff" : "#444", fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }),
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: "16px 16px 0 0", maxHeight: "92vh", overflowY: "auto", padding: "20px 18px 36px" }}>
        {confirmPhotoDel && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 22, maxWidth: 320 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Remove this photo?</div>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 22, lineHeight: 1.5 }}>If you save without adding a new one, this photo is gone forever.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmPhotoDel(false)} style={{ flex: 1, padding: "12px", background: "#fff", border: "1px solid #ddd", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={() => { setPhoto(null); setPhotoChanged(true); setConfirmPhotoDel(false); }} style={{ flex: 1, padding: "12px", background: "#111", border: "none", borderRadius: 9, fontSize: 13, color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Edit sale</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: "#bbb", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        {(photo?.url || photo?.preview) ? (
          <div style={{ position: "relative", marginBottom: 16 }}>
            <img src={photo.preview || photo.url} alt="" style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 10, display: "block" }} />
            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
              <button onClick={() => fileRef.current?.click()} style={{ background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 18, color: "#fff", padding: "5px 11px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Replace</button>
              <button onClick={removePhoto} style={{ background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 18, color: "#fff", padding: "5px 11px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
            </div>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} style={{ width: "100%", height: 110, background: "#fafafa", border: "1.5px dashed #ddd", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", fontSize: 13, color: "#888" }}>
            <span style={{ fontSize: 22 }}>{"\uD83D\uDCF7"}</span> Add photo
          </button>
        )}

        <label style={f.label}>Description</label>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} style={{ ...f.field, resize: "none", lineHeight: 1.5, marginBottom: 16 }} />

        <label style={f.label}>Category</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: showAddCat ? 10 : 16 }}>
          {cats.map(c => <button key={c.id} onClick={() => { setCatId(c.id); setSize(""); setShowAddCat(false); }} style={f.chip(catId === c.id)}>{c.name}</button>)}
          <button onClick={() => setShowAddCat(s => !s)} style={{ ...f.chip(showAddCat), borderStyle: "dashed" }}>+ New</button>
        </div>
        {showAddCat && <AddCategoryStrip onAdd={handleAddCat} onCancel={() => setShowAddCat(false)} />}

        {cat && (
          <>
            <label style={f.label}>Size</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {sizeOptions.map(s => <button key={s} onClick={() => setSize(s)} style={f.chip(size === s)}>{s}</button>)}
            </div>
          </>
        )}

        <label style={f.label}>Price</label>
        <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={{ ...f.field, marginBottom: 16 }} />

        <label style={f.label}>Logged by</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 22 }}>
          {users.map(u => (
            <button key={u.id} onClick={() => setUserId(u.id)} style={{ ...f.chip(userId === u.id), display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: u.color || "#888" }} />
              {u.name}
            </button>
          ))}
        </div>

        <button onClick={save} disabled={busy} style={{ width: "100%", padding: "14px", background: busy ? "#888" : "#111", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>{busy ? "Saving\u2026" : "Save changes"}</button>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ sale, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: "16px 16px 0 0", padding: "24px 20px 36px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Delete this sale?</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 24, lineHeight: 1.5 }}>{sale.comment || sale.category_name || "Untitled"}</div>
        <button onClick={onConfirm} style={{ width: "100%", padding: "14px", background: "#111", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>Yes, delete</button>
        <button onClick={onCancel} style={{ width: "100%", padding: "14px", background: "#fff", border: "1px solid #ddd", borderRadius: 10, fontSize: 14, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
}
