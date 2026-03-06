import { useState, useEffect, useCallback } from "react";

declare global {
  interface Window {
    storage?: {
      get: (key: string) => Promise<{ value?: string } | null>;
      set: (key: string, value: string) => Promise<void>;
    };
  }
}

const STORAGE_KEY = "investment-tracker-v1";

interface Fund {
  id: number;
  name: string;
}

interface Entry {
  id: number;
  fundId: number;
  date: string;
  aportacion: string;
  valorActual: string;
}

interface StorageData {
  funds: Fund[];
  entries: Entry[];
}

const fmt = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => n.toFixed(2) + "%";

const emptyEntry = (fundId: number): Entry => ({ id: Date.now(), fundId, date: new Date().toISOString().slice(0, 7), aportacion: "", valorActual: "" });

const defaultFunds: Fund[] = [
  { id: 1, name: "Fondo 1" },
  { id: 2, name: "Fondo 2" },
];

export default function App() {
  const [funds, setFunds] = useState<Fund[]>(defaultFunds);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [newFundName, setNewFundName] = useState("");
  const [activeTab, setActiveTab] = useState("resumen");
  const [activeFund, setActiveFund] = useState(1);
  const [editingFund, setEditingFund] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  // Load from storage
  useEffect(() => {
    window.storage?.get(STORAGE_KEY).then((r: { value?: string } | null) => {
      if (r?.value) {
        try {
          const d: StorageData = JSON.parse(r.value);
          if (d.funds) setFunds(d.funds);
          if (d.entries) setEntries(d.entries);
          if (d.funds?.length) setActiveFund(d.funds[0].id);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  const save = useCallback((f: Fund[], e: Entry[]) => {
    window.storage?.set(STORAGE_KEY, JSON.stringify({ funds: f, entries: e })).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  const persist = (f: Fund[], e: Entry[]) => { setFunds(f); setEntries(e); save(f, e); };

  // Computed per fund
  const fundStats = (fid: number) => {
    const fe = entries.filter(e => e.fundId === fid && e.aportacion !== "" && e.valorActual !== "");
    const totalAportado = fe.reduce((s, e) => s + parseFloat(e.aportacion || "0"), 0);
    const lastEntry = fe[fe.length - 1];
    const valorActual = lastEntry ? parseFloat(lastEntry.valorActual || "0") : 0;
    const beneficio = valorActual - totalAportado;
    const pct = totalAportado > 0 ? (beneficio / totalAportado) * 100 : 0;
    return { totalAportado, valorActual, beneficio, pct };
  };

  const totalCartera = funds.reduce((s, f) => s + fundStats(f.id).valorActual, 0);

  const addFund = () => {
    if (!newFundName.trim()) return;
    const nf: Fund = { id: Date.now(), name: newFundName.trim() };
    const nf2 = [...funds, nf];
    persist(nf2, entries);
    setNewFundName("");
    setActiveFund(nf.id);
    setActiveTab("aportaciones");
  };

  const removeFund = (fid: number) => {
    const nf = funds.filter(f => f.id !== fid);
    const ne = entries.filter(e => e.fundId !== fid);
    persist(nf, ne);
    if (activeFund === fid && nf.length) setActiveFund(nf[0].id);
  };

  const renameFund = (fid: number, name: string) => {
    const nf = funds.map(f => f.id === fid ? { ...f, name } : f);
    persist(nf, entries);
    setEditingFund(null);
  };

  const addEntry = (fid: number) => {
    const ne = [...entries, emptyEntry(fid)];
    persist(funds, ne);
  };

  const updateEntry = (eid: number, field: keyof Entry, val: string) => {
    const ne = entries.map(e => e.id === eid ? { ...e, [field]: val } : e);
    persist(funds, ne);
  };

  const removeEntry = (eid: number) => {
    const ne = entries.filter(e => e.id !== eid);
    persist(funds, ne);
  };

  const activeFundEntries = entries.filter(e => e.fundId === activeFund).sort((a, b) => a.date.localeCompare(b.date));

  // Running totals for the entries table
  let runningAportado = 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#f0f4f8", minHeight: "100vh", padding: "16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: "#1a2744", fontWeight: 700 }}>📊 Mi Cartera de Inversión</h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b" }}>Seguimiento de fondos y aportaciones mensuales</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {saved && <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>✓ Guardado</span>}
            <div style={{ background: "#1a2744", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600 }}>
              Total: {fmt(totalCartera)} €
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {([["resumen", "📋 Resumen"], ["aportaciones", "➕ Aportaciones"], ["fondos", "⚙️ Gestionar Fondos"]] as [string, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k)} style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: activeTab === k ? "#3b5bdb" : "#fff", color: activeTab === k ? "#fff" : "#374151",
              boxShadow: activeTab === k ? "0 2px 8px rgba(59,91,219,0.3)" : "0 1px 3px rgba(0,0,0,0.1)"
            }}>{l}</button>
          ))}
        </div>

        {/* RESUMEN TAB */}
        {activeTab === "resumen" && (
          <div>
          {/* Summary Cards */}
          {(() => {
            const totalInvertido = funds.reduce((s, f) => s + fundStats(f.id).totalAportado, 0);
            const totalValor = totalCartera;
            const totalBen = totalValor - totalInvertido;
            const totalPct = totalInvertido > 0 ? (totalBen / totalInvertido) * 100 : 0;
            const pos = totalBen >= 0;
            const cards = [
              { label: "Dinero Invertido", value: fmt(totalInvertido) + " €", color: "#3b5bdb", bg: "#eff3ff", icon: "💰" },
              { label: "Valor Actual", value: fmt(totalValor) + " €", color: "#0891b2", bg: "#e0f2fe", icon: "📈" },
              { label: "Beneficio / Pérdida", value: (pos ? "+" : "") + fmt(totalBen) + " €", color: pos ? "#16a34a" : "#dc2626", bg: pos ? "#f0fdf4" : "#fff1f2", icon: pos ? "🟢" : "🔴" },
              { label: "Rentabilidad Total", value: (pos ? "+" : "") + fmtPct(totalPct), color: pos ? "#16a34a" : "#dc2626", bg: pos ? "#f0fdf4" : "#fff1f2", icon: "📊" },
            ];
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                {cards.map(c => (
                  <div key={c.label} style={{ background: c.bg, borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{c.icon}</div>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{c.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#1a2744", color: "#fff" }}>
                  {["Fondo", "Total Aportado (€)", "Valor Actual (€)", "Beneficio/Pérdida (€)", "Rentabilidad", "% Cartera"].map(h => (
                    <th key={h} style={{ padding: "12px 14px", textAlign: h === "Fondo" ? "left" : "right", fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {funds.map((f, i) => {
                  const s = fundStats(f.id);
                  const pctCartera = totalCartera > 0 ? (s.valorActual / totalCartera) * 100 : 0;
                  const pos = s.beneficio >= 0;
                  return (
                    <tr key={f.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "11px 14px", fontWeight: 600, color: "#1a2744" }}>{f.name}</td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>{fmt(s.totalAportado)}</td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 600 }}>{fmt(s.valorActual)}</td>
                      <td style={{ padding: "11px 14px", textAlign: "right", color: pos ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                        {pos ? "+" : ""}{fmt(s.beneficio)}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", color: pos ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                        {pos ? "+" : ""}{fmtPct(s.pct)}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                          <div style={{ width: 60, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(pctCartera, 100)}%`, height: "100%", background: "#3b5bdb", borderRadius: 3 }} />
                          </div>
                          {fmtPct(pctCartera)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#1a2744", color: "#fff", fontWeight: 700 }}>
                  <td style={{ padding: "12px 14px" }}>TOTAL</td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>{fmt(funds.reduce((s, f) => s + fundStats(f.id).totalAportado, 0))}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>{fmt(totalCartera)}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    {(() => { const b = funds.reduce((s, f) => s + fundStats(f.id).beneficio, 0); return (b >= 0 ? "+" : "") + fmt(b); })()}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    {(() => {
                      const ta = funds.reduce((s, f) => s + fundStats(f.id).totalAportado, 0);
                      const b = funds.reduce((s, f) => s + fundStats(f.id).beneficio, 0);
                      const p = ta > 0 ? (b / ta) * 100 : 0;
                      return (p >= 0 ? "+" : "") + fmtPct(p);
                    })()}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>100%</td>
                </tr>
              </tfoot>
            </table>
            {funds.every(f => fundStats(f.id).totalAportado === 0) && (
              <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: 14 }}>
                Aún no hay datos. Ve a <strong>Aportaciones</strong> para empezar a registrar.
              </div>
            )}
          </div>
          </div>
        )}

        {/* APORTACIONES TAB */}
        {activeTab === "aportaciones" && (
          <div>
            {/* Fund selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {funds.map(f => (
                <button key={f.id} onClick={() => setActiveFund(f.id)} style={{
                  padding: "7px 14px", borderRadius: 8, border: "2px solid",
                  borderColor: activeFund === f.id ? "#3b5bdb" : "#e2e8f0",
                  background: activeFund === f.id ? "#eff3ff" : "#fff",
                  color: activeFund === f.id ? "#3b5bdb" : "#374151",
                  fontWeight: 600, fontSize: 13, cursor: "pointer"
                }}>{f.name}</button>
              ))}
            </div>

            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "#1a2744", fontSize: 15 }}>
                  {funds.find(f => f.id === activeFund)?.name}
                </span>
                <button onClick={() => addEntry(activeFund)} style={{
                  background: "#3b5bdb", color: "#fff", border: "none", borderRadius: 7,
                  padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer"
                }}>+ Nueva Aportación</button>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    {["Mes/Año", "Aportación (€)", "Aportado Acum. (€)", "Valor Actual (€)", "Benef./Pérd. (€)", "Rentab.", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: h === "Mes/Año" || h === "" ? "left" : "right", color: "#475569", fontWeight: 600, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeFundEntries.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "#94a3b8", fontSize: 14 }}>
                      Haz clic en "+ Nueva Aportación" para registrar tu primera entrada.
                    </td></tr>
                  )}
                  {activeFundEntries.map((e, i) => {
                    const ap = parseFloat(e.aportacion || "0");
                    const va = parseFloat(e.valorActual || "0");
                    runningAportado = i === 0 ? ap : runningAportado + ap;
                    const ben = va - runningAportado;
                    const pct = runningAportado > 0 ? (ben / runningAportado) * 100 : 0;
                    const pos = ben >= 0;
                    const hasData = e.aportacion !== "" && e.valorActual !== "";
                    return (
                      <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                        <td style={{ padding: "8px 12px" }}>
                          <input type="month" value={e.date} onChange={ev => updateEntry(e.id, "date", ev.target.value)}
                            style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "#1a2744" }} />
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          <input type="number" min="0" step="0.01" placeholder="0.00" value={e.aportacion}
                            onChange={ev => updateEntry(e.id, "aportacion", ev.target.value)}
                            style={{ width: 90, border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 13, textAlign: "right" }} />
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "#64748b", fontSize: 13 }}>
                          {hasData ? fmt(runningAportado) : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          <input type="number" min="0" step="0.01" placeholder="0.00" value={e.valorActual}
                            onChange={ev => updateEntry(e.id, "valorActual", ev.target.value)}
                            style={{ width: 90, border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 13, textAlign: "right" }} />
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: hasData ? (pos ? "#16a34a" : "#dc2626") : "#94a3b8", fontWeight: hasData ? 600 : 400 }}>
                          {hasData ? (pos ? "+" : "") + fmt(ben) : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: hasData ? (pos ? "#16a34a" : "#dc2626") : "#94a3b8", fontWeight: hasData ? 600 : 400 }}>
                          {hasData ? (pos ? "+" : "") + fmtPct(pct) : "—"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <button onClick={() => removeEntry(e.id)} title="Eliminar" style={{
                            background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 16, padding: "2px 6px"
                          }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FONDOS TAB */}
        {activeTab === "fondos" && (
          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", color: "#1a2744", fontSize: 15 }}>Mis Fondos</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {funds.map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  {editingFund === f.id ? (
                    <input autoFocus defaultValue={f.name}
                      onBlur={e => renameFund(f.id, e.target.value)}
                      onKeyDown={e => e.key === "Enter" && renameFund(f.id, (e.target as HTMLInputElement).value)}
                      style={{ flex: 1, border: "1px solid #3b5bdb", borderRadius: 6, padding: "4px 10px", fontSize: 14 }} />
                  ) : (
                    <span style={{ flex: 1, fontWeight: 600, color: "#1a2744" }}>{f.name}</span>
                  )}
                  <button onClick={() => setEditingFund(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 13, padding: "4px 8px" }}>✏️ Renombrar</button>
                  <button onClick={() => removeFund(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, padding: "4px 8px" }}>🗑️ Eliminar</button>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
              <h4 style={{ margin: "0 0 10px", color: "#475569", fontSize: 14 }}>Añadir nuevo fondo</h4>
              <div style={{ display: "flex", gap: 10 }}>
                <input value={newFundName} onChange={e => setNewFundName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addFund()}
                  placeholder="Nombre del fondo (ej: Vanguard Global, Fidelity...)"
                  style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 14px", fontSize: 14 }} />
                <button onClick={addFund} style={{
                  background: "#3b5bdb", color: "#fff", border: "none", borderRadius: 8,
                  padding: "9px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer"
                }}>+ Añadir</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
