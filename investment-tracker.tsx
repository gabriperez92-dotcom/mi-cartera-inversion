import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "investment-tracker-v1";

const fmt = (n) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n) => n.toFixed(2) + "%";

const emptyEntry = (fundId) => ({ id: Date.now(), fundId, date: new Date().toISOString().slice(0, 7), aportacion: "", valorActual: "" });

const defaultFunds = [
  { id: 1, name: "Fondo 1" },
  { id: 2, name: "Fondo 2" },
];

const defaultDistribution = { totalMensual: "", allocations: [] };

export default function App() {
  const [funds, setFunds] = useState(defaultFunds);
  const [entries, setEntries] = useState([]);
  const [distribution, setDistribution] = useState(defaultDistribution);
  const [newFundName, setNewFundName] = useState("");
  const [activeTab, setActiveTab] = useState("resumen");
  const [activeFund, setActiveFund] = useState(1);
  const [editingFund, setEditingFund] = useState(null);
  const [saved, setSaved] = useState(false);
  const [storageError, setStorageError] = useState(false);

  // Load from storage
  useEffect(() => {
    window.storage?.get(STORAGE_KEY).then(r => {
      if (r?.value) {
        try {
          const d = JSON.parse(r.value);
          if (d.funds) setFunds(d.funds);
          if (d.entries) setEntries(d.entries);
          if (d.distribution) setDistribution(d.distribution);
          if (d.funds?.length) setActiveFund(d.funds[0].id);
        } catch {}
      }
    }).catch(() => {}).finally(() => {
      // Comprobar si auth falló DESPUÉS de que storage-get complete
      window.storage?.status?.().then(s => {
        if (s?.authFailed) setStorageError(true);
      });
    });

    // Escuchar errores de guardado
    window.storage?.onSaveError?.(() => setStorageError(true));
  }, []);

  const save = useCallback(async (f, e, d) => {
    try {
      await window.storage?.set(STORAGE_KEY, JSON.stringify({ funds: f, entries: e, distribution: d }));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {}
  }, []);

  const persist = (f, e, d) => { setFunds(f); setEntries(e); setDistribution(d); save(f, e, d); };

  // Computed per fund
  const fundStats = (fid) => {
    const fe = entries.filter(e => e.fundId === fid && e.aportacion !== "" && e.valorActual !== "");
    const totalAportado = fe.reduce((s, e) => s + parseFloat(e.aportacion || 0), 0);
    const lastEntry = fe[fe.length - 1];
    const valorActual = lastEntry ? parseFloat(lastEntry.valorActual || 0) : 0;
    const beneficio = valorActual - totalAportado;
    const pct = totalAportado > 0 ? (beneficio / totalAportado) * 100 : 0;
    return { totalAportado, valorActual, beneficio, pct };
  };

  const totalCartera = funds.reduce((s, f) => s + fundStats(f.id).valorActual, 0);

  const addFund = () => {
    if (!newFundName.trim()) return;
    const nf = { id: Date.now(), name: newFundName.trim() };
    const nf2 = [...funds, nf];
    persist(nf2, entries, distribution);
    setNewFundName("");
    setActiveFund(nf.id);
    setActiveTab("aportaciones");
  };

  const removeFund = (fid) => {
    const nf = funds.filter(f => f.id !== fid);
    const ne = entries.filter(e => e.fundId !== fid);
    persist(nf, ne, distribution);
    if (activeFund === fid && nf.length) setActiveFund(nf[0].id);
  };

  const renameFund = (fid, name) => {
    const nf = funds.map(f => f.id === fid ? { ...f, name } : f);
    persist(nf, entries, distribution);
    setEditingFund(null);
  };

  const addEntry = (fid) => {
    const ne = [...entries, emptyEntry(fid)];
    persist(funds, ne, distribution);
  };

  const updateEntry = (eid, field, val) => {
    const ne = entries.map(e => e.id === eid ? { ...e, [field]: val } : e);
    persist(funds, ne, distribution);
  };

  const removeEntry = (eid) => {
    const ne = entries.filter(e => e.id !== eid);
    persist(funds, ne, distribution);
  };

  const updateDistribution = (next) => { setDistribution(next); save(funds, entries, next); };
  const addAllocation = () => updateDistribution({ ...distribution, allocations: [...distribution.allocations, { id: Date.now(), label: "", pct: "" }] });
  const updateAllocation = (aid, field, val) => updateDistribution({ ...distribution, allocations: distribution.allocations.map(a => a.id === aid ? { ...a, [field]: val } : a) });
  const removeAllocation = (aid) => updateDistribution({ ...distribution, allocations: distribution.allocations.filter(a => a.id !== aid) });

  const activeFundEntries = entries.filter(e => e.fundId === activeFund).sort((a, b) => a.date.localeCompare(b.date));

  // Running totals for the entries table
  let runningAportado = 0;

  // Month-over-month calculation
  const latestPerFundMonth = {};
  for (const e of entries) {
    if (e.valorActual === "") continue;
    const key = `${e.date}__${e.fundId}`;
    if (!latestPerFundMonth[key] || e.id > latestPerFundMonth[key].id) latestPerFundMonth[key] = e;
  }
  const monthTotals = {};
  for (const e of Object.values(latestPerFundMonth))
    monthTotals[e.date] = (monthTotals[e.date] || 0) + parseFloat(e.valorActual || 0);
  const sortedMonthKeys = Object.keys(monthTotals).sort();
  const momCurrent = sortedMonthKeys.at(-1) != null ? monthTotals[sortedMonthKeys.at(-1)] : null;
  const momPrev    = sortedMonthKeys.at(-2) != null ? monthTotals[sortedMonthKeys.at(-2)] : null;
  const momDiff    = momCurrent !== null && momPrev !== null ? momCurrent - momPrev : null;
  const momPctChg  = momPrev > 0 && momDiff !== null ? (momDiff / momPrev) * 100 : null;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#f0f4f8", minHeight: "100vh", padding: "16px" }}>
      <style>{`
        .inv-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
        .inv-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .inv-table-scroll::-webkit-scrollbar { height: 6px; }
        .inv-table-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
        .inv-table-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 3px; }
        @media (max-width: 640px) {
          .inv-cards { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
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

        {/* Banner de error de autenticación */}
        {storageError && (
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#c2410c", fontWeight: 600, fontSize: 13 }}>
              ⚠ No se pudo conectar con Google Drive. Los cambios no se guardarán.
            </span>
            <button
              onClick={async () => {
                const r = await window.storage?.reauth?.();
                if (r?.ok) {
                  setStorageError(false);
                  window.storage?.get(STORAGE_KEY).then(r2 => {
                    if (r2?.value) {
                      const d = JSON.parse(r2.value);
                      if (d.funds) { setFunds(d.funds); setActiveFund(d.funds[0]?.id ?? 1); }
                      if (d.entries) setEntries(d.entries);
                      if (d.distribution) setDistribution(d.distribution);
                    }
                  });
                }
              }}
              style={{ background: "#3b5bdb", color: "#fff", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Reconectar con Google
            </button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
          {[["resumen", "📋 Resumen"], ["aportaciones", "➕ Aportaciones"], ["fondos", "⚙️ Gestionar Fondos"], ["distribucion", "📐 Distribución"]].map(([k, l]) => (
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
              <div className="inv-cards">
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

          {/* Variación mensual */}
          {momDiff !== null && (() => {
            const pos = momDiff >= 0;
            return (
              <div style={{
                background: pos ? "#f0fdf4" : "#fff1f2", borderRadius: 12, padding: "12px 18px",
                marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                display: "flex", alignItems: "center", gap: 14
              }}>
                <span style={{ fontSize: 26 }}>{pos ? "📈" : "📉"}</span>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                    Variación mensual &nbsp;
                    <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                      ({sortedMonthKeys.at(-2)} → {sortedMonthKeys.at(-1)})
                    </span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: pos ? "#16a34a" : "#dc2626" }}>
                    {pos ? "+" : ""}{fmt(momDiff)} €
                    <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 8 }}>
                      ({pos ? "+" : ""}{fmtPct(momPctChg)})
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
            <div className="inv-table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
              <thead>
                <tr style={{ background: "#1a2744", color: "#fff" }}>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Fondo</th>
                  <th style={{ padding: "12px 10px", textAlign: "right", fontWeight: 600, fontSize: 12 }}>Aportado (€)</th>
                  <th style={{ padding: "12px 10px", textAlign: "right", fontWeight: 600, fontSize: 12 }}>Valor (€)</th>
                  <th style={{ padding: "12px 10px", textAlign: "right", fontWeight: 600, fontSize: 12 }}>Benef/Pérd. (€)</th>
                  <th style={{ padding: "12px 10px", textAlign: "right", fontWeight: 600, fontSize: 12 }}>Rentab.</th>
                  <th style={{ padding: "12px 10px", textAlign: "right", fontWeight: 600, fontSize: 12 }}>% Cartera</th>
                </tr>
              </thead>
              <tbody>
                {funds.map((f, i) => {
                  const s = fundStats(f.id);
                  const pctCartera = totalCartera > 0 ? (s.valorActual / totalCartera) * 100 : 0;
                  const pos = s.beneficio >= 0;
                  return (
                    <tr key={f.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "11px 10px", fontWeight: 600, color: "#1a2744" }}>{f.name}</td>
                      <td style={{ padding: "11px 10px", textAlign: "right" }}>{fmt(s.totalAportado)}</td>
                      <td style={{ padding: "11px 10px", textAlign: "right", fontWeight: 600 }}>{fmt(s.valorActual)}</td>
                      <td style={{ padding: "11px 10px", textAlign: "right", color: pos ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                        {pos ? "+" : ""}{fmt(s.beneficio)}
                      </td>
                      <td style={{ padding: "11px 10px", textAlign: "right", color: pos ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                        {pos ? "+" : ""}{fmtPct(s.pct)}
                      </td>
                      <td style={{ padding: "11px 10px", textAlign: "right" }}>
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
                  <td style={{ padding: "12px 10px" }}>TOTAL</td>
                  <td style={{ padding: "12px 10px", textAlign: "right" }}>{fmt(funds.reduce((s, f) => s + fundStats(f.id).totalAportado, 0))}</td>
                  <td style={{ padding: "12px 10px", textAlign: "right" }}>{fmt(totalCartera)}</td>
                  <td style={{ padding: "12px 10px", textAlign: "right" }}>
                    {(() => { const b = funds.reduce((s, f) => s + fundStats(f.id).beneficio, 0); return (b >= 0 ? "+" : "") + fmt(b); })()}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right" }}>
                    {(() => {
                      const ta = funds.reduce((s, f) => s + fundStats(f.id).totalAportado, 0);
                      const b = funds.reduce((s, f) => s + fundStats(f.id).beneficio, 0);
                      const p = ta > 0 ? (b / ta) * 100 : 0;
                      return (p >= 0 ? "+" : "") + fmtPct(p);
                    })()}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right" }}>100%</td>
                </tr>
              </tfoot>
            </table>
            </div>
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

            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "#1a2744", fontSize: 15 }}>
                  {funds.find(f => f.id === activeFund)?.name}
                </span>
                <button onClick={() => addEntry(activeFund)} style={{
                  background: "#3b5bdb", color: "#fff", border: "none", borderRadius: 7,
                  padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer"
                }}>+ Nueva Aportación</button>
              </div>

              <div className="inv-table-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 8px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: 12 }}>Mes/Año</th>
                    <th style={{ padding: "10px 8px", textAlign: "right", color: "#475569", fontWeight: 600, fontSize: 12 }}>Aportación (€)</th>
                    <th style={{ padding: "10px 8px", textAlign: "right", color: "#475569", fontWeight: 600, fontSize: 12 }}>Acum. (€)</th>
                    <th style={{ padding: "10px 8px", textAlign: "right", color: "#475569", fontWeight: 600, fontSize: 12 }}>Valor (€)</th>
                    <th style={{ padding: "10px 8px", textAlign: "right", color: "#475569", fontWeight: 600, fontSize: 12 }}>Benef/Pérd. (€)</th>
                    <th style={{ padding: "10px 8px", textAlign: "right", color: "#475569", fontWeight: 600, fontSize: 12 }}>Rentab.</th>
                    <th style={{ padding: "10px 8px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {activeFundEntries.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "#94a3b8", fontSize: 14 }}>
                      Haz clic en "+ Nueva Aportación" para registrar tu primera entrada.
                    </td></tr>
                  )}
                  {activeFundEntries.map((e, i) => {
                    const ap = parseFloat(e.aportacion || 0);
                    const va = parseFloat(e.valorActual || 0);
                    runningAportado = i === 0 ? ap : runningAportado + ap;
                    const ben = va - runningAportado;
                    const pct = runningAportado > 0 ? (ben / runningAportado) * 100 : 0;
                    const pos = ben >= 0;
                    const hasData = e.aportacion !== "" && e.valorActual !== "";
                    return (
                      <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                        <td style={{ padding: "8px 8px" }}>
                          <input type="month" value={e.date} onChange={ev => updateEntry(e.id, "date", ev.target.value)}
                            style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 6px", fontSize: 12, color: "#1a2744" }} />
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right" }}>
                          <input type="number" min="0" step="0.01" placeholder="0.00" value={e.aportacion}
                            onChange={ev => updateEntry(e.id, "aportacion", ev.target.value)}
                            style={{ width: 80, border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 6px", fontSize: 12, textAlign: "right" }} />
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", color: "#64748b", fontSize: 13 }}>
                          {hasData ? fmt(runningAportado) : "—"}
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right" }}>
                          <input type="number" min="0" step="0.01" placeholder="0.00" value={e.valorActual}
                            onChange={ev => updateEntry(e.id, "valorActual", ev.target.value)}
                            style={{ width: 80, border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 6px", fontSize: 12, textAlign: "right" }} />
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", color: hasData ? (pos ? "#16a34a" : "#dc2626") : "#94a3b8", fontWeight: hasData ? 600 : 400 }}>
                          {hasData ? (pos ? "+" : "") + fmt(ben) : "—"}
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", color: hasData ? (pos ? "#16a34a" : "#dc2626") : "#94a3b8", fontWeight: hasData ? 600 : 400 }}>
                          {hasData ? (pos ? "+" : "") + fmtPct(pct) : "—"}
                        </td>
                        <td style={{ padding: "8px 4px" }}>
                          <button onClick={() => removeEntry(e.id)} title="Eliminar" style={{
                            background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 16, padding: "2px 4px"
                          }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
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
                      onKeyDown={e => e.key === "Enter" && renameFund(f.id, e.target.value)}
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

        {/* DISTRIBUCIÓN TAB */}
        {activeTab === "distribucion" && (
          <div>
            {/* Importe total mensual */}
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 700, color: "#1a2744", fontSize: 15, marginBottom: 10 }}>Importe mensual a invertir</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={distribution.totalMensual}
                  onChange={e => updateDistribution({ ...distribution, totalMensual: e.target.value })}
                  style={{ width: 150, border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 18, fontWeight: 700, textAlign: "right", color: "#1a2744" }}
                />
                <span style={{ color: "#64748b", fontWeight: 600, fontSize: 16 }}>€</span>
              </div>
            </div>

            {/* Tabla de distribución */}
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "#1a2744", fontSize: 15 }}>Distribución por concepto</span>
                <button onClick={addAllocation} style={{
                  background: "#3b5bdb", color: "#fff", border: "none", borderRadius: 7,
                  padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer"
                }}>+ Añadir concepto</button>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: 12 }}>Concepto</th>
                    <th style={{ padding: "10px 14px", textAlign: "right", color: "#475569", fontWeight: 600, fontSize: 12 }}>%</th>
                    <th style={{ padding: "10px 14px", textAlign: "right", color: "#475569", fontWeight: 600, fontSize: 12 }}>Importe</th>
                    <th style={{ padding: "10px 14px", width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {distribution.allocations.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: "center", padding: 32, color: "#94a3b8", fontSize: 14 }}>
                      Haz clic en "+ Añadir concepto" para definir tu distribución.
                    </td></tr>
                  )}
                  {distribution.allocations.map((a, i) => {
                    const importe = parseFloat(distribution.totalMensual || 0) * parseFloat(a.pct || 0) / 100;
                    const hasTotal = distribution.totalMensual !== "" && parseFloat(distribution.totalMensual) > 0;
                    return (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                        <td style={{ padding: "8px 14px" }}>
                          <input
                            value={a.label}
                            onChange={e => updateAllocation(a.id, "label", e.target.value)}
                            placeholder="Ej: S&P500, Oro, Bonos..."
                            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 10px", fontSize: 13 }}
                          />
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                            <input
                              type="number" min="0" max="100" step="0.01"
                              value={a.pct}
                              onChange={e => updateAllocation(a.id, "pct", e.target.value)}
                              style={{ width: 70, border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 8px", fontSize: 13, textAlign: "right" }}
                            />
                            <span style={{ color: "#64748b" }}>%</span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: "#1a2744", fontSize: 14 }}>
                          {hasTotal && a.pct !== "" ? fmt(importe) + " €" : "—"}
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "center" }}>
                          <button onClick={() => removeAllocation(a.id)} style={{
                            background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 16, padding: "2px 6px"
                          }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {distribution.allocations.length > 0 && (() => {
                  const sumPct = distribution.allocations.reduce((s, a) => s + parseFloat(a.pct || 0), 0);
                  const totalImporte = parseFloat(distribution.totalMensual || 0);
                  return (
                    <tfoot>
                      <tr style={{ background: "#1a2744", color: "#fff", fontWeight: 700 }}>
                        <td style={{ padding: "12px 14px" }}>TOTAL</td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>{fmtPct(sumPct)}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          {distribution.totalMensual !== "" ? fmt(totalImporte) + " €" : "—"}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>

              {/* Banner de validación */}
              {distribution.allocations.length > 0 && (() => {
                const sumPct = distribution.allocations.reduce((s, a) => s + parseFloat(a.pct || 0), 0);
                const ok = Math.abs(sumPct - 100) < 0.01;
                return (
                  <div style={{
                    padding: "10px 16px", borderTop: "1px solid #e2e8f0",
                    background: ok ? "#f0fdf4" : "#fff7ed",
                    color: ok ? "#16a34a" : "#c2410c",
                    fontWeight: 600, fontSize: 13
                  }}>
                    {ok
                      ? "✓ Los porcentajes suman 100%"
                      : `⚠ Los porcentajes suman ${fmtPct(sumPct)} (deben sumar 100%)`
                    }
                  </div>
                );
              })()}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
