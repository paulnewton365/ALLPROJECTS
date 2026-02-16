"use client";
import { useState, useEffect, useMemo, useCallback } from "react";

// ---------------------------------------------------------------------------
// Antenna Group Brand — Warm Cream Editorial
// ---------------------------------------------------------------------------
const APP_VERSION = "1.12.1";
const T = {
  bg: "#f2ece3", bgCard: "#ffffff", bgCardAlt: "#faf7f2", bgHover: "#f5f0e8",
  border: "#e0dbd2", borderDark: "#c8c2b8",
  text: "#1a1a1a", textMuted: "#6b6b6b", textDim: "#9a9a9a",
  accent: "#c8f549", accentDark: "#9ab82e",
  red: "#c93c3c", green: "#2a8f4e", yellow: "#c49a1a", blue: "#3b73c4",
  orange: "#d97a1a", purple: "#7c5cbf", pink: "#c4547a", teal: "#2a8f7a",
};

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: ${T.bg}; color: ${T.text}; -webkit-font-smoothing: antialiased; }
  ::selection { background: ${T.accent}; color: ${T.text}; }
  .treemap-cell:hover { filter: brightness(0.95) !important; }
  @media (max-width: 768px) {
    .chart-row { grid-template-columns: 1fr !important; }
    .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .exec-kpi-strip { grid-template-columns: repeat(2, 1fr) !important; }
    .tab-nav { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .tab-nav::-webkit-scrollbar { display: none; }
    .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .table-wrap table { min-width: 700px; }
    .mobile-container { padding: 12px 12px 32px !important; }
    .mobile-header-title { font-size: 22px !important; }
    .mobile-hide { display: none !important; }
    .pen-cards { flex-direction: column !important; }
    .pen-cards > div { width: 100% !important; }
    .util-role-row { flex-wrap: wrap !important; }
    .util-role-row > div:first-child { width: 100% !important; }
    .util-role-bars { flex-direction: column !important; gap: 4px !important; }
  }
  @media (min-width: 769px) and (max-width: 1100px) {
    .exec-kpi-strip { grid-template-columns: repeat(3, 1fr) !important; }
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (n) => "$" + Math.round(Number(n) || 0).toLocaleString();
const fmtK = (n) => { n = Number(n) || 0; const abs = Math.abs(n); const sign = n < 0 ? "-" : ""; return abs >= 1000000 ? sign + "$" + (abs / 1000000).toFixed(1) + "M" : abs >= 1000 ? sign + "$" + (abs / 1000).toFixed(0) + "K" : sign + "$" + Math.round(abs).toLocaleString(); };
const pct = (n) => n != null && !isNaN(n) ? `${Math.round(n)}%` : "-";

const RAG = {
  green: { bg: "#e8f5e9", text: "#2e7d32", dot: "#4caf50", label: "Green" },
  yellow: { bg: "#fff8e1", text: "#f57f17", dot: "#ffc107", label: "Yellow" },
  red: { bg: "#ffebee", text: "#c62828", dot: "#f44336", label: "Red" },
  blue: { bg: "#e3f2fd", text: "#1565c0", dot: "#2196f3", label: "Blue" },
  unknown: { bg: "#f5f5f5", text: "#9e9e9e", dot: "#bdbdbd", label: "Unset" },
};

const ECO_COLORS = { Climate: T.green, "Real Estate": T.blue, Health: T.pink, "Public Affairs": T.purple, HOWL: T.orange };
const STAGE_COLORS = { "In Qualification": "#9b59b6", Proposal: "#e67e22", "Waiting For Response": "#3498db", "Working On Contract": "#27ae60", "On Hold": "#95a5a6" };
const STAGE_ORDER_ARR = ["In Qualification", "Proposal", "Waiting For Response", "Working On Contract", "On Hold"];

function burnColor(rate) { return rate <= 50 ? T.green : rate <= 70 ? "#6a9e2a" : rate <= 85 ? T.yellow : rate <= 95 ? T.orange : T.red; }
function stageName(raw, dn) { return dn?.[raw] || raw; }
function billableOnly(arr, ecos, key = "name") { if (!ecos?.length) return arr; const l = ecos.map((e) => e.toLowerCase()); return arr.filter((i) => l.includes((i[key] || "").toLowerCase())); }

// ---------------------------------------------------------------------------
// Shared Components
// ---------------------------------------------------------------------------
function Section({ title, subtitle, children, style: sx }) {
  return (
    <div style={{ ...s.section, ...sx }}>
      {title && <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
        <h2 style={s.sectionTitle}>{title}</h2>
        {subtitle && <span style={{ fontSize: 11, color: T.textDim }}>{subtitle}</span>}
      </div>}
      {children}
    </div>
  );
}

function Badge({ color, label }) {
  const c = RAG[color] || RAG.unknown;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />{label}</span>;
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tab-nav" style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: `2px solid ${T.border}` }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: "12px 22px", border: "none", background: active === t.key ? T.bgCard : "transparent", cursor: "pointer",
          fontSize: 13, fontWeight: active === t.key ? 700 : 500, letterSpacing: 0.2,
          color: active === t.key ? T.text : T.textMuted, whiteSpace: "nowrap", flexShrink: 0,
          borderBottom: active === t.key ? `2px solid ${T.text}` : "2px solid transparent",
          borderRadius: active === t.key ? "8px 8px 0 0" : 0, marginBottom: -2,
        }}>{t.label}{t.count != null ? ` (${t.count})` : ""}</button>
      ))}
    </div>
  );
}

function RAGBar({ status, projects }) {
  const total = Object.values(status).reduce((a, b) => a + b, 0);
  const targetEcos = ["Climate", "Real Estate", "Health", "Public Affairs"];
  const redByEco = {};
  if (projects) {
    projects.filter((p) => p.rag_color === "red").forEach((p) => {
      const eco = p.ecosystem || "Other";
      if (targetEcos.includes(eco)) redByEco[eco] = (redByEco[eco] || 0) + 1;
    });
  }
  return (
    <div style={{ display: "flex", gap: 24, marginBottom: 20, background: T.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${T.border}`, flexWrap: "wrap", alignItems: "center" }}>
      {["green", "yellow", "red", "blue"].map((k) => !status[k] ? null : (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: RAG[k].dot, border: "2px solid #fff", boxShadow: `0 0 0 1px ${RAG[k].dot}` }} />
          <div><div style={{ fontSize: 22, fontWeight: 800 }}>{status[k]}</div><div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>{RAG[k].label}</div></div>
        </div>
      ))}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
        {targetEcos.map((eco) => {
          const count = redByEco[eco] || 0;
          return count > 0 ? (
            <div key={eco} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.red, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.textMuted }}>{eco}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.red }}>{count}</span>
            </div>
          ) : null;
        })}
        <div style={{ fontSize: 12, color: T.textDim, borderLeft: `1px solid ${T.border}`, paddingLeft: 12 }}>{total} projects</div>
      </div>
    </div>
  );
}

function KPI({ label, value, detail, color }) {
  return (
    <div style={s.kpiCard}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={{ ...s.kpiValue, color: color || T.text }}>{value}</div>
      {detail && <div style={s.kpiDetail}>{detail}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exec KPI Strip
// ---------------------------------------------------------------------------
function ExecKPIStrip({ live, newbiz, history }) {
  const net = live.financials.total_overage - live.financials.total_investment;
  const woc = newbiz.pipeline_funnel.find((s) => s.stage === "Working On Contract") || { forecast: 0, count: 0 };
  // Previous snapshot for trend arrows
  const prev = history?.length >= 2 ? history[history.length - 2] : null;
  const trendArrow = (current, prevVal, invertColor) => {
    if (prev == null || prevVal == null) return null;
    const diff = current - prevVal;
    if (Math.abs(diff) < 1) return null;
    const up = diff > 0;
    const color = invertColor ? (up ? T.red : T.green) : (up ? T.green : T.red);
    return <span style={{ fontSize: 10, fontWeight: 700, color, marginLeft: 4 }}>{up ? "▲" : "▼"} {fmtK(Math.abs(diff))}</span>;
  };
  return (
    <div className="exec-kpi-strip" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
      {[
        { label: "Live Revenue", value: fmtK(live.financials.total_budget), color: T.text, sub: `${live.count} projects`, trend: trendArrow(live.financials.total_budget, prev?.live_revenue, false) },
        { label: "Burn Rate", value: `${live.financials.burn_rate_pct}%`, color: burnColor(live.financials.burn_rate_pct), sub: `${fmtK(live.financials.total_actuals)} spent`, trend: prev ? (() => { const diff = live.financials.burn_rate_pct - prev.burn_rate; if (Math.abs(diff) < 0.1) return null; const up = diff > 0; return <span style={{ fontSize: 10, fontWeight: 700, color: up ? T.red : T.green, marginLeft: 4 }}>{up ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}%</span>; })() : null },
        { label: "Net Overservice", value: fmtK(net), color: net > 0 ? T.red : T.green, sub: `${live.financials.overserviced_count} projects (${fmtK(live.financials.total_investment)} invested)`, trend: trendArrow(net, prev?.net_overservice, true) },
        { label: "Weighted Pipeline", value: fmtK(newbiz.weighted_pipeline), color: T.orange, sub: `${fmtK(newbiz.total_forecast)} unweighted`, trend: trendArrow(newbiz.weighted_pipeline, prev?.weighted_pipeline, false) },
        { label: "Near Close", value: fmtK(woc.forecast), color: T.green, sub: `${woc.count} deals working on contract`, trend: null },
      ].map((kpi) => (
        <div key={kpi.label} style={s.execKpi}>
          <div style={s.execLabel}>{kpi.label}</div>
          <div style={{ ...s.execValue, color: kpi.color }}>{kpi.value}{kpi.trend}</div>
          <div style={s.execSub}>{kpi.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend Chart (SVG)
// ---------------------------------------------------------------------------
function TrendChart({ history }) {
  if (!history?.length) {
    return <div style={{ color: T.textDim, padding: 20, textAlign: "center", fontSize: 13 }}>Logging first data point...</div>;
  }

  const metrics = [
    { key: "live_revenue", label: "Live Revenue", color: T.text },
    { key: "net_overservice", label: "Net Overservice", color: "#c93c3c" },
    { key: "weighted_pipeline", label: "Wtd Pipeline", color: "#3b73c4" },
  ];

  // Single data point — show current snapshot as metric cards
  if (history.length === 1) {
    const snap = history[0];
    return (
      <div>
        <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
          {metrics.map((m) => {
            const val = snap[m.key] || 0;
            return (
              <div key={m.key} style={{ flex: 1, padding: "14px 16px", background: T.bgHover, borderRadius: 8, border: `1px solid ${T.border}`, borderLeft: `4px solid ${m.color}` }}>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: m.color }}>{fmtK(val)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: T.textDim, textAlign: "right" }}>Snapshot from {snap.date} · Next snapshot: Sunday 11pm EST</div>
      </div>
    );
  }

  // 2+ points — full-width line chart
  const H = 200, PX = 50, PY = 20;
  const allVals = history.flatMap((h) => metrics.map((m) => h[m.key] || 0));
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 1);
  const range = maxV - minV || 1;
  const yScale = (v) => PY + (H - PY * 2) * (1 - (v - minV) / range);

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <svg width="100%" viewBox={`0 0 900 ${H + 30}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
          {minV < 0 && maxV > 0 && <line x1={PX} x2={900 - PX} y1={yScale(0)} y2={yScale(0)} stroke={T.border} strokeDasharray="4,4" />}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = PY + (H - PY * 2) * (1 - f);
            const val = minV + range * f;
            return <g key={f}><line x1={PX} x2={900 - PX} y1={y} y2={y} stroke={T.border} strokeWidth={0.5} /><text x={PX - 6} y={y + 4} textAnchor="end" fontSize={9} fill={T.textDim}>{fmtK(val)}</text></g>;
          })}
          {(() => {
            const xStep = history.length > 1 ? (900 - PX * 2) / (history.length - 1) : 0;
            return (<>
              {metrics.map((m) => {
                const points = history.map((h, i) => `${PX + i * xStep},${yScale(h[m.key] || 0)}`).join(" ");
                return <polyline key={m.key} points={points} fill="none" stroke={m.color} strokeWidth={2.5} />;
              })}
              {metrics.map((m) => history.map((h, i) => (
                <circle key={`${m.key}-${i}`} cx={PX + i * xStep} cy={yScale(h[m.key] || 0)} r={4} fill={m.color} />
              )))}
              {history.map((h, i) => {
                if (history.length > 10 && i % Math.ceil(history.length / 10) !== 0 && i !== history.length - 1) return null;
                return <text key={i} x={PX + i * xStep} y={H + 12} textAnchor="middle" fontSize={9} fill={T.textDim}>{h.date.slice(5)}</text>;
              })}
            </>);
          })()}
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <div style={{ display: "flex", gap: 16 }}>
          {metrics.map((m) => <span key={m.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.textMuted }}><span style={{ width: 12, height: 3, background: m.color, borderRadius: 2 }} />{m.label}</span>)}
        </div>
        <div style={{ fontSize: 10, color: T.textDim }}>Next snapshot: Sunday 11pm EST</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Treemap
// ---------------------------------------------------------------------------
function EcosystemRevenueBar({ ecosystems }) {
  if (!ecosystems?.length) return null;
  const total = ecosystems.reduce((a, e) => a + e.budget, 0) || 1;
  const sorted = [...ecosystems].sort((a, b) => b.budget - a.budget);
  return (
    <div>
      {/* Single bar with vertical slices */}
      <div style={{ display: "flex", height: 120, borderRadius: 12, overflow: "hidden", marginBottom: 12, border: `1px solid ${T.border}` }}>
        {sorted.map((eco) => {
          const pctW = (eco.budget / total) * 100;
          const color = ECO_COLORS[eco.name] || T.textDim;
          return (
            <div key={eco.name} title={`${eco.name}\nBudget: ${fmt(eco.budget)}\nBurn: ${eco.burn_rate}%\nOverage: ${fmt(eco.overage)}`} style={{
              width: `${pctW}%`, background: color, padding: "12px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between",
              borderRight: "2px solid rgba(255,255,255,0.4)", cursor: "default", minWidth: pctW > 3 ? 60 : 8, overflow: "hidden",
            }}>
              {pctW > 6 ? (<>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.3)", whiteSpace: "nowrap" }}>{eco.name}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>{fmtK(eco.budget)}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{eco.burn_rate}% burn</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{eco.projects}p</span>
                </div>
              </>) : null}
            </div>
          );
        })}
      </div>
      {/* Legend with details */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {sorted.map((eco) => (
          <div key={eco.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: ECO_COLORS[eco.name] || T.textDim, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: T.text }}>{eco.name}</span>
            <span style={{ color: T.textMuted }}>{fmtK(eco.budget)}</span>
            <span style={{ color: T.textDim }}>({Math.round((eco.budget / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked Pipeline
// ---------------------------------------------------------------------------
function StackedPipeline({ data, displayNames, ensureEcosystems }) {
  // Ensure all target ecosystems appear even with $0
  const ecoMap = {};
  (data || []).forEach((e) => { ecoMap[e.ecosystem] = e; });
  const allEcos = ensureEcosystems
    ? ensureEcosystems.map((eco) => ecoMap[eco] || { ecosystem: eco, total_weighted: 0, total_forecast: 0, stages: [] })
    : data || [];
  if (!allEcos.length) return <div style={{ color: T.textDim, padding: 20 }}>No pipeline data</div>;
  const maxW = Math.max(...allEcos.map((e) => e.total_weighted), 1);
  return (
    <div>
      {allEcos.map((eco) => (
        <div key={eco.ecosystem} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ width: 110, fontSize: 12, fontWeight: 600, color: ECO_COLORS[eco.ecosystem] || T.textMuted }}>{eco.ecosystem}</div>
          <div style={{ flex: 1, height: 48, background: T.bgHover, borderRadius: 6, overflow: "hidden", display: "flex" }}>
            {eco.stages.filter((st) => st.weighted > 0).map((st) => {
              const sn = stageName(st.stage, displayNames);
              return <div key={st.stage} title={`${sn}: ${st.count} deals, ${fmtK(st.weighted)} wtd`} style={{ width: `${(st.weighted / maxW) * 100}%`, background: STAGE_COLORS[sn] || T.textDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", minWidth: 4, borderRight: "1px solid rgba(255,255,255,0.3)" }}>{(st.weighted / maxW) * 100 > 8 ? st.count : ""}</div>;
            })}
            {eco.total_weighted === 0 && <div style={{ display: "flex", alignItems: "center", paddingLeft: 10, fontSize: 10, color: T.textDim }}>No active pipeline</div>}
          </div>
          <div style={{ textAlign: "right", minWidth: 80 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtK(eco.total_weighted)}</div>
            <div style={{ fontSize: 10, color: T.textDim }}>{fmtK(eco.total_forecast)} fcst</div>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 10, fontSize: 10, color: T.textDim, flexWrap: "wrap" }}>
        {STAGE_ORDER_ARR.map((stage) => <span key={stage} style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: STAGE_COLORS[stage] }} />{stage}</span>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diverging Overservice
// ---------------------------------------------------------------------------
function DivergingOverservice({ ecosystems }) {
  const data = (ecosystems || []).filter((e) => e.overage !== 0 || e.investment > 0).sort((a, b) => b.overage - a.overage);
  if (!data.length) return <div style={{ color: T.textDim, padding: 20 }}>No overservice data</div>;
  const maxAbs = Math.max(...data.map((e) => Math.max(Math.abs(e.overage), Math.abs(e.overage - e.investment))), 1);
  return (
    <div>
      {data.map((eco) => {
        const overPct = (eco.overage / maxAbs) * 45;
        return (
          <div key={eco.name} style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div style={{ width: 110, fontSize: 12, fontWeight: 600, textAlign: "right", paddingRight: 12, color: ECO_COLORS[eco.name] || T.textMuted }}>{eco.name}</div>
            <div style={{ flex: 1, height: 26, position: "relative" }}>
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: T.borderDark, zIndex: 2 }} />
              {eco.overage > 0 ? (<>
                <div style={{ position: "absolute", left: "50%", top: 2, bottom: 2, borderRadius: "0 4px 4px 0", width: `${Math.min(Math.abs(overPct), 48)}%`, background: T.red }} />
                {eco.investment > 0 && <div style={{ position: "absolute", left: `${50 + Math.abs(overPct) - (eco.investment / maxAbs) * 45}%`, top: 0, bottom: 0, width: `${(eco.investment / maxAbs) * 45}%`, borderRight: `2px dashed ${T.green}`, zIndex: 3 }} />}
              </>) : (<div style={{ position: "absolute", right: "50%", top: 2, bottom: 2, borderRadius: "4px 0 0 4px", width: `${Math.min(Math.abs(overPct), 48)}%`, background: T.green }} />)}
            </div>
            <div style={{ minWidth: 110, textAlign: "right" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: eco.overage > 0 ? T.red : T.green }}>{fmtK(eco.overage)}</span>
              {eco.investment > 0 && <span style={{ fontSize: 10, color: T.textDim, marginLeft: 4 }}>({fmtK(eco.investment)} inv)</span>}
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10, color: T.textDim }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: T.red }} />Overservice</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: T.green }} />Underage</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 0, borderTop: `2px dashed ${T.green}` }} />Investment</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bubble Matrix
// ---------------------------------------------------------------------------
function BubbleMatrix({ matrix, billable, totalProjects, revenueMode }) {
  if (!matrix?.ecosystems?.length) return <div style={{ color: T.textDim, padding: 20 }}>No data</div>;
  const lower = (billable || []).map((e) => e.toLowerCase());
  const ecoIdxs = matrix.ecosystems.map((e, i) => ({ name: e, idx: i })).filter((e) => lower.some((b) => e.name.toLowerCase().includes(b)));
  if (!ecoIdxs.length) return <div style={{ color: T.textDim, padding: 20 }}>No billable ecosystem data</div>;
  const rtTotals = matrix.requestTypes.map((rt, ci) => ({ name: rt, idx: ci, total: ecoIdxs.reduce((sum, e) => sum + matrix.cells[e.idx][ci].count, 0), budget: ecoIdxs.reduce((sum, e) => sum + (matrix.cells[e.idx][ci].budget || 0), 0) })).sort((a, b) => b.total - a.total);
  const topRT = rtTotals.filter((r) => r.total > 0).slice(0, 10);
  const maxCount = Math.max(...ecoIdxs.flatMap((e) => topRT.map((rt) => matrix.cells[e.idx][rt.idx].count)), 1);
  const maxBudget = Math.max(...ecoIdxs.flatMap((e) => topRT.map((rt) => matrix.cells[e.idx][rt.idx].budget)), 1);
  const projTotal = totalProjects || ecoIdxs.reduce((sum, e) => sum + topRT.reduce((s, rt) => s + matrix.cells[e.idx][rt.idx].count, 0), 0) || 1;
  const budgetTotal = ecoIdxs.reduce((sum, e) => sum + topRT.reduce((s, rt) => s + (matrix.cells[e.idx][rt.idx].budget || 0), 0), 0) || 1;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>
          <th style={{ ...s.matrixTh, textAlign: "left", width: 100 }}>Ecosystem</th>
          {topRT.map((rt) => <th key={rt.name} style={{ ...s.matrixTh, verticalAlign: "bottom", height: "auto", padding: "8px 4px" }} title={rt.name}><div style={{ whiteSpace: "nowrap", fontSize: 10, fontWeight: 600, color: T.textMuted }}>{rt.name.length > 18 ? rt.name.slice(0, 16) + "…" : rt.name}</div></th>)}
        </tr></thead>
        <tbody>
          {ecoIdxs.map((eco) => (
          <tr key={eco.name}>
            <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, borderBottom: `1px solid ${T.border}`, color: ECO_COLORS[eco.name] || T.textMuted }}>{eco.name}</td>
            {topRT.map((rt) => {
              const cell = matrix.cells[eco.idx][rt.idx];
              if (!cell?.count) return <td key={rt.name} style={{ padding: 4, textAlign: "center", borderBottom: `1px solid ${T.border}` }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: T.border, margin: "0 auto" }} /></td>;
              const r = 6 + (cell.count / maxCount) * 16;
              const op = 0.3 + (cell.budget / maxBudget) * 0.7;
              return <td key={rt.name} style={{ padding: 4, textAlign: "center", borderBottom: `1px solid ${T.border}` }}>
                <svg width={r * 2 + 4} height={r * 2 + 4} style={{ display: "block", margin: "0 auto" }}><circle cx={r + 2} cy={r + 2} r={r} fill={ECO_COLORS[eco.name] || T.blue} fillOpacity={op} />{cell.count > 1 && <text x={r + 2} y={r + 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{cell.count}</text>}</svg>
                <div style={{ fontSize: 9, color: T.textDim, marginTop: 1 }}>{fmtK(cell.budget)}</div>
              </td>;
            })}
          </tr>
          ))}
          <tr>
            <td style={{ padding: "8px 8px", fontSize: 10, fontWeight: 700, color: T.textDim, borderTop: `2px solid ${T.borderDark}` }}>{revenueMode ? "% of Revenue" : "% of Projects"}</td>
            {topRT.map((rt) => {
              const pctVal = revenueMode ? Math.round((rt.budget / budgetTotal) * 100) : Math.round((rt.total / projTotal) * 100);
              return <td key={rt.name} style={{ padding: "8px 4px", textAlign: "center", fontSize: 11, fontWeight: 700, color: pctVal >= 20 ? T.text : T.textMuted, borderTop: `2px solid ${T.borderDark}` }}>{pctVal}%</td>;
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eco Win + Services & Data Completeness & BarChart & Pill
// ---------------------------------------------------------------------------
function EcoWinServices({ data, billable }) {
  const filtered = billableOnly(data, billable, "ecosystem");
  if (!filtered.length) return <div style={{ color: T.textDim, padding: 20 }}>No data</div>;
  return (<div>{filtered.map((eco) => (
    <div key={eco.ecosystem} style={{ marginBottom: 14, padding: "12px 14px", background: T.bgHover, borderRadius: 8, border: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: ECO_COLORS[eco.ecosystem] || T.textMuted }}>{eco.ecosystem}</span>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <span style={{ fontSize: 11, color: T.textDim }}>{eco.deal_count} deals</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{fmtK(eco.weighted)}</span>
          <span style={{ fontSize: 10, color: T.textDim }}>{fmtK(eco.forecast)} fcst</span>
          {eco.avg_win_pct != null && <span style={{ fontSize: 14, fontWeight: 700, color: eco.avg_win_pct >= 50 ? T.green : eco.avg_win_pct >= 25 ? T.yellow : T.red }}>{eco.avg_win_pct}% Avg Win Potential</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {eco.services.slice(0, 8).map((svc) => <span key={svc.name} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: `${ECO_COLORS[eco.ecosystem] || T.blue}22`, color: ECO_COLORS[eco.ecosystem] || T.blue, fontWeight: 600, border: `1px solid ${ECO_COLORS[eco.ecosystem] || T.blue}44` }}>{svc.name} ({svc.count})</span>)}
      </div>
    </div>
  ))}</div>);
}

function DataCompleteness({ data }) {
  if (!data) return null;
  return (<div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{ fontSize: 38, fontWeight: 900, color: data.pct_complete >= 80 ? T.green : data.pct_complete >= 50 ? T.yellow : T.red }}>{data.pct_complete}%</div>
      <div><div style={{ fontSize: 12, fontWeight: 600 }}>Fully Complete</div><div style={{ fontSize: 11, color: T.textDim }}>{data.fully_complete} of {data.total} deals have all fields</div></div>
    </div>
    {data.by_field.map((f) => {
      const label = { budget_forecast: "Budget Forecast", win_probability: "Win Probability", recommendation: "Recommendation", request_type: "Request Type", ecosystem: "Ecosystem", project_manager: "PM/Lead" }[f.field] || f.field;
      return <div key={f.field} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ width: 110, fontSize: 11, fontWeight: 500, color: T.textMuted }}>{label}</div>
        <div style={{ flex: 1, height: 14, background: T.bgHover, borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 4, width: `${f.pct}%`, background: f.pct >= 80 ? T.green : f.pct >= 50 ? T.yellow : T.red }} /></div>
        <div style={{ fontSize: 11, fontWeight: 700, color: f.pct >= 80 ? T.green : f.pct >= 50 ? T.yellow : T.red, minWidth: 36, textAlign: "right" }}>{f.pct}%</div>
      </div>;
    })}
  </div>);
}

function BarChart({ data, labelKey, valueKey, color = T.blue, formatValue, limit = 12 }) {
  if (!data?.length) return <div style={{ color: T.textDim, padding: 12 }}>No data</div>;
  const sliced = data.slice(0, limit); const max = Math.max(...sliced.map((d) => Math.abs(Number(d[valueKey]) || 0)), 1);
  return (<div>{sliced.map((item, i) => { const val = Number(item[valueKey]) || 0; return (
    <div key={i} style={s.barRow}><div style={s.barLabel}>{item[labelKey]}</div><div style={s.barTrack}><div style={{ ...s.barFill, width: `${Math.min((Math.abs(val) / max) * 100, 100)}%`, background: typeof color === "function" ? color(item) : color }} /></div><div style={{ ...s.barValue, color: val < 0 ? T.green : val > 0 && item.overserviced > 0 ? T.red : T.text }}>{formatValue ? formatValue(val, item) : val}</div></div>); })}</div>);
}

function PillChart({ data, colorMap, order, labelMap }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  const cols = [T.blue, T.purple, T.pink, T.orange, T.green, T.textDim, T.red, T.teal];
  const entries = order
    ? order.map((k) => [k, data[k] || 0]).filter(([, c]) => c > 0)
    : Object.entries(data).sort((a, b) => b[1] - a[1]);
  const label = (k) => labelMap?.[k] || k;
  return (<div>
    <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>{entries.map(([k, c], i) => <div key={k} style={{ width: `${(c / total) * 100}%`, background: colorMap?.[k] || cols[i % cols.length], minWidth: c > 0 ? 3 : 0 }} title={`${label(k)}: ${c}`} />)}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>{entries.map(([k, c], i) => <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}><div style={{ width: 8, height: 8, borderRadius: 3, background: colorMap?.[k] || cols[i % cols.length] }} /><span style={{ color: T.textMuted }}>{label(k)}</span><span style={{ fontWeight: 600 }}>{c}</span></div>)}</div>
  </div>);
}

function PipelineFunnel({ funnel, displayNames }) {
  const maxCount = Math.max(...funnel.map((s) => s.count), 1);
  return (<div>{funnel.map((stage) => { const sn = stageName(stage.stage, displayNames); return (
    <div key={stage.stage} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, padding: "8px 0" }}>
      <div style={{ width: 150, fontSize: 12, fontWeight: 600, color: STAGE_COLORS[sn] || T.textDim }}>{sn}</div>
      <div style={{ flex: 1, height: 28, background: T.bgHover, borderRadius: 6, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 6, width: `${(stage.count / maxCount) * 100}%`, background: STAGE_COLORS[sn] || T.textDim, display: "flex", alignItems: "center", paddingLeft: 8 }}><span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{stage.count}</span></div></div>
      <div style={{ textAlign: "right", minWidth: 100 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{fmtK(stage.forecast)}</div><div style={{ fontSize: 10, color: T.textDim }}>{fmtK(stage.weighted)} wtd</div></div>
    </div>); })}</div>);
}

// ---------------------------------------------------------------------------
// AI Insights
// ---------------------------------------------------------------------------
function AIInsights() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const generate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/insights", { method: "POST" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAnalysis(json.analysis);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  return (
    <Section title="AI Executive Briefing" subtitle="Powered by Claude">
      {!analysis && !loading && !error && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <button onClick={generate} style={{ ...s.accentBtn, fontSize: 13, padding: "10px 24px" }}>Generate Insights →</button>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 8 }}>Analyses current data for trends, risks, and recommendations</div>
        </div>
      )}
      {loading && <div style={{ textAlign: "center", padding: 30, color: T.textMuted }}>Analysing portfolio data...</div>}
      {error && <div style={{ color: T.red, padding: 12, fontSize: 13 }}>Error: {error}<br/><span style={{ fontSize: 11, color: T.textDim }}>Ensure ANTHROPIC_API_KEY is set in environment variables.</span></div>}
      {analysis && (
        <div style={{ fontSize: 13, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap" }}>
          {analysis}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button onClick={generate} style={{ ...s.refreshBtn, fontSize: 11 }}>Regenerate</button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Data Table
// ---------------------------------------------------------------------------
function DataTable({ data, columns, emptyMsg = "No projects" }) {
  const [search, setSearch] = useState(""); const [filters, setFilters] = useState({}); const [sortCol, setSortCol] = useState(null); const [sortAsc, setSortAsc] = useState(true);
  const filterCols = useMemo(() => columns.filter((c) => c.filter), [columns]);
  const filtered = useMemo(() => {
    let r = [...data];
    if (search) { const q = search.toLowerCase(); r = r.filter((p) => columns.some((c) => String(p[c.key] || "").toLowerCase().includes(q))); }
    for (const [key, val] of Object.entries(filters)) { if (val) r = r.filter((p) => String(p[key]) === val); }
    if (sortCol) r.sort((a, b) => { let av = a[sortCol], bv = b[sortCol]; if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av; return sortAsc ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? "")); });
    return r;
  }, [data, search, filters, sortCol, sortAsc, columns]);
  return (<>
    <div style={s.filterBar}>
      <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...s.filterInput, minWidth: 180 }} />
      {filterCols.map((col) => { const opts = [...new Set(data.map((p) => String(p[col.key])))].sort(); return <select key={col.key} value={filters[col.key] || ""} onChange={(e) => setFilters({ ...filters, [col.key]: e.target.value })} style={s.filterInput}><option value="">All {col.label}</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>; })}
      <span style={{ marginLeft: "auto", fontSize: 12, color: T.textDim }}>{filtered.length} of {data.length}</span>
    </div>
    <div style={{ overflowX: "auto" }}>
      <table style={s.table}><thead><tr>
        {columns.map((col) => <th key={col.key} style={{ ...s.th, minWidth: col.w || 80 }} onClick={() => { if (sortCol === col.key) setSortAsc(!sortAsc); else { setSortCol(col.key); setSortAsc(true); } }}>{col.label} {sortCol === col.key ? (sortAsc ? "▲" : "▼") : ""}</th>)}
      </tr></thead><tbody>
        {filtered.map((p, i) => <tr key={i} style={i % 2 ? { background: T.bgCardAlt } : {}}>{columns.map((col) => <td key={col.key} style={{ ...s.td, ...(col.style || {}) }}>{col.render ? col.render(p[col.key], p) : (col.fmt ? col.fmt(p[col.key]) : (p[col.key] ?? "-"))}</td>)}</tr>)}
        {!filtered.length && <tr><td colSpan={columns.length} style={{ ...s.td, textAlign: "center", color: T.textDim, padding: 40 }}>{emptyMsg}</td></tr>}
      </tbody></table>
    </div>
  </>);
}

// ---------------------------------------------------------------------------
// Column Defs
// ---------------------------------------------------------------------------
const mkLiveCols = (dn) => [
  { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "top_priority", label: "⚑", w: 30, render: (v) => v ? <span style={{ color: T.red, fontWeight: 800, fontSize: 14 }}>●</span> : null },
  { key: "client_name", label: "Client", w: 120, filter: true, style: { fontWeight: 600 } },
  { key: "project_name", label: "Assignment", w: 200 },
  { key: "rag", label: "RAG", w: 70, filter: true, render: (v, p) => <Badge color={p.rag_color} label={v} /> },
  { key: "budget_forecast", label: "Budget", w: 90, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "actuals_display", label: "Actuals", w: 90, render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12, color: v === "No Tracking" ? T.textDim : T.text }}>{typeof v === "number" ? fmtK(v) : v}</span> },
  { key: "overage_display", label: "FTC", w: 90, render: (v, p) => { const n = p.overage; return <span style={{ fontFamily: "monospace", fontSize: 12, color: n > 0 ? T.red : n < 0 ? T.green : v === "No Tracking" ? T.textDim : T.text, fontWeight: n > 0 ? 700 : 400 }}>{typeof v === "number" ? fmtK(v) : v}</span>; } },
  { key: "percent_complete", label: "% Done", w: 55, render: (v) => <span style={{ fontSize: 12, color: T.textMuted }}>{pct(v)}</span> },
  { key: "project_manager", label: "PM/Prod", w: 110, filter: true },
  { key: "ecosystem", label: "Ecosystem", w: 85, filter: true, render: (v) => <span style={{ fontSize: 11, fontWeight: 600, color: ECO_COLORS[v] || T.textMuted }}>{v}</span> },
];

const mkNewbizCols = (dn) => [
  { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "client_name", label: "Client", w: 130, filter: true, style: { fontWeight: 600 } },
  { key: "project_name", label: "Opportunity", w: 200 },
  { key: "workflow_status", label: "Status", w: 130, filter: true, render: (v) => { const sn = stageName(v, dn); return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: `${STAGE_COLORS[sn] || T.textDim}22`, color: STAGE_COLORS[sn] || T.textDim, fontWeight: 600 }}>{sn}</span>; } },
  { key: "win_probability", label: "Win %", w: 65, render: (v) => <span style={{ fontSize: 12, fontWeight: 600, color: v >= 75 ? T.green : v >= 50 ? T.yellow : v > 0 ? T.orange : T.textDim }}>{pct(v)}</span> },
  { key: "budget_forecast", label: "Budget Forecast", w: 110, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "weighted_pipeline", label: "Weighted Forecast", w: 110, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "ecosystem", label: "Ecosystem", w: 85, filter: true, render: (v) => <span style={{ fontSize: 11, fontWeight: 600, color: ECO_COLORS[v] || T.textMuted }}>{v}</span> },
  { key: "project_manager", label: "Lead", w: 110, filter: true },
];

// ---------------------------------------------------------------------------
// MAIN DASHBOARD
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const VALID_TABS = ["overview", "live", "redlist", "newbiz", "internal", "dept"];
  const getTabFromHash = () => {
    if (typeof window === "undefined") return "overview";
    const h = window.location.hash.replace("#", "").toLowerCase();
    return VALID_TABS.includes(h) ? h : "overview";
  };
  const [tab, setTabRaw] = useState("overview");
  const setTab = (t) => {
    setTabRaw(t);
    if (typeof window !== "undefined") window.location.hash = t;
  };

  useEffect(() => {
    setTabRaw(getTabFromHash());
    const onHash = () => setTabRaw(getTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [history, setHistory] = useState([]);
  const [deptData, setDeptData] = useState(null);
  const [deptHistory, setDeptHistory] = useState([]);

  async function loadData() {
    setLoading(true);
    try {
      const [snapRes, histRes, deptRes, deptHistRes] = await Promise.all([
        fetch("/api/snapshot", { cache: "no-store" }),
        fetch("/api/history", { cache: "no-store" }).catch(() => ({ json: () => ({ history: [] }) })),
        fetch("/api/dept-health", { cache: "no-store" }).catch(() => ({ json: () => null })),
        fetch("/api/dept-health-history", { cache: "no-store" }).catch(() => ({ json: () => ({ history: [] }) })),
      ]);
      const snap = await snapRes.json();
      const hist = await histRes.json();
      const dept = await deptRes.json().catch(() => null);
      const deptHist = await deptHistRes.json().catch(() => ({ history: [] }));
      if (snap.error) throw new Error(snap.error);
      setData(snap); setHistory(hist.history || []); setDeptData(dept?.error ? null : dept); setDeptHistory(deptHist.history || []); setError(null);
      // Auto-seed: log first data point if history is empty
      if (!hist.history?.length) {
        fetch("/api/history", { method: "POST" })
          .then((r) => r.json())
          .then((res) => { if (res.logged) setHistory([res.logged]); })
          .catch(() => {});
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadData(); }, []);
  const d = data;

  const billable = d?.billable_ecosystems || [];
  const dn = d?.stage_display_names || {};
  const liveEcoBillable = useMemo(() => billableOnly(d?.live?.by_ecosystem || [], billable), [d, billable]);
  const nbEcoBillable = useMemo(() => billableOnly(d?.newbiz?.pipeline_by_ecosystem || [], billable, "ecosystem"), [d, billable]);
  const pipelineEcos = ["Climate", "Real Estate", "Health", "Public Affairs"];
  const nbEcoPipeline = useMemo(() => billableOnly(d?.newbiz?.pipeline_by_ecosystem || [], pipelineEcos, "ecosystem"), [d]);
  const liveProjectsBillable = useMemo(() => d ? d.live.projects.filter((p) => billable.some((b) => (p.ecosystem || "").toLowerCase().includes(b.toLowerCase()))).sort((a, b) => (b.overage || 0) - (a.overage || 0)) : [], [d, billable]);
  const nbProjectsSorted = useMemo(() => { if (!d) return []; const order = d.pipeline_stage_order || []; return [...d.newbiz.projects].sort((a, b) => (order.indexOf(a.workflow_status) === -1 ? 999 : order.indexOf(a.workflow_status)) - (order.indexOf(b.workflow_status) === -1 ? 999 : order.indexOf(b.workflow_status))); }, [d]);

  return (<>
    <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
    <div className="mobile-container" style={s.container}>
      <div style={s.header}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 4, color: T.textMuted, textTransform: "uppercase", marginBottom: 4 }}><img src="https://ktuyiikwhspwmzvyczit.supabase.co/storage/v1/object/public/assets/brand/antenna-new-logo.svg" alt="Antenna Group" style={{ height: 28, marginBottom: 4 }} /></div>
        <h1 className="mobile-header-title" style={s.title}>{d?.title || "Antenna Group — All Projects Dashboard"}</h1>
        <div style={s.subtitle}>
          <span>{d ? `${d.total_projects} active projects` : ""}</span>
          <span style={{ fontSize: 10, color: T.textDim, background: T.bgHover, padding: "2px 8px", borderRadius: 4, fontFamily: "monospace" }}>v{APP_VERSION}</span>
          <button onClick={loadData} disabled={loading} style={s.accentBtn}>{loading ? "Loading..." : "↻ Refresh"}</button>
        </div>
      </div>

      {error && <div style={s.errorBox}><strong>Error:</strong> {error}</div>}

      {d && (<>
        <Tabs tabs={[
          { key: "overview", label: "Executive Overview" },
          { key: "live", label: "Live Work", count: d.live.count },
          { key: "redlist", label: "Red List", count: d.live.projects.filter((p) => p.rag_color === "red").length },
          { key: "newbiz", label: "New Business", count: d.newbiz.count },
          { key: "internal", label: "Internal Projects", count: d.internal.projects.filter((p) => p.category !== "Internal Admin Time").length },
          { key: "dept", label: "Delivery & Experiences", count: deptData?.utilization_summary?.team_size || null },
        ]} active={tab} onChange={setTab} />

        {/* ============ EXECUTIVE OVERVIEW ============ */}
        {tab === "overview" && (<>
          <ExecKPIStrip live={d.live} newbiz={d.newbiz} history={history} />
          <Section title="Weekly Trends" subtitle="Live Revenue · Net Overservice · Weighted Pipeline"><TrendChart history={history} /></Section>
          <div style={{ height: 16 }} />
          <div className="chart-row" style={s.chartRow}>
            <Section title="Revenue by Ecosystem" subtitle="Proportional budget · Billable ecosystems"><EcosystemRevenueBar ecosystems={liveEcoBillable} /></Section>
            <Section title="Overservice Exposure" subtitle="FTC · Dashed = investment offset"><DivergingOverservice ecosystems={liveEcoBillable} /></Section>
          </div>
          <div className="chart-row" style={s.chartRow}>
            <Section title="Weighted Pipeline by Ecosystem" subtitle="Stacked by stage"><StackedPipeline data={nbEcoPipeline} displayNames={dn} ensureEcosystems={pipelineEcos} /></Section>
            <Section title="Service Mix by Ecosystem" subtitle="Size = projects · Opacity = budget · Values represent total project value containing each service, not the revenue split"><BubbleMatrix matrix={d.live.ecosystem_request_type} billable={billable} totalProjects={liveProjectsBillable.length} /></Section>
          </div>
          <div className="chart-row" style={s.chartRow}>
            <Section title="Top Priority Projects" subtitle="Ordered by budget">
              {(() => { const tp = d.live.projects.filter((p) => p.top_priority).sort((a, b) => b.budget_forecast - a.budget_forecast); return !tp.length ? <div style={{ color: T.textDim, padding: 12 }}>No top priority projects flagged</div> : tp.map((p) => (
                <div key={p.rid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ color: T.red, fontWeight: 800, fontSize: 14 }}>●</span>
                  <span style={{ fontFamily: "monospace", color: T.textDim, fontSize: 11 }}>{p.rid}</span>
                  <span style={{ fontWeight: 600 }}>{p.client_name}</span>
                  <span style={{ flex: 1, color: T.textMuted }}>{p.project_name}</span>
                  <Badge color={p.rag_color} label={p.rag} />
                  <span style={{ fontFamily: "monospace", fontWeight: 600, minWidth: 60, textAlign: "right" }}>{fmtK(p.budget_forecast)}</span>
                </div>)); })()}
            </Section>
            <Section title="Overservice Projects" subtitle="Ranked by forecast to complete">
              {(() => { const os = d.live.projects.filter((p) => p.overage > 0 && (p.rag_color === "red" || p.rag_color === "yellow")).sort((a, b) => b.overage - a.overage); return !os.length ? <div style={{ color: T.green, padding: 12 }}>✓ No overserviced projects at risk</div> : os.slice(0, 12).map((p) => (
                <div key={p.rid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <Badge color={p.rag_color} label={p.rag} />
                  <span style={{ fontFamily: "monospace", color: T.textDim, fontSize: 11 }}>{p.rid}</span>
                  <span style={{ fontWeight: 600 }}>{p.client_name}</span>
                  <span style={{ flex: 1, color: T.textMuted }}>{p.project_name}</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.red, minWidth: 60, textAlign: "right" }}>{fmtK(p.overage)}</span>
                </div>)); })()}
            </Section>
          </div>
          <Section title="Client Overservice Exposure" subtitle="Net overage consolidated across all live projects per client · Top 10">
            {(() => {
              const byClient = {};
              d.live.projects.filter((p) => p.category === "Active Live Projects").forEach((p) => {
                const c = p.client_name || "Unknown";
                if (!byClient[c]) byClient[c] = { overage: 0, investment: 0, budget: 0, projects: 0, rids: [], redCount: 0, yellowCount: 0 };
                byClient[c].overage += p.overage || 0;
                byClient[c].investment += p.approved_investment || 0;
                byClient[c].budget += p.budget_forecast || 0;
                byClient[c].projects++;
                if (p.overage > 0) byClient[c].rids.push(p.rid);
                if (p.rag_color === "red") byClient[c].redCount++;
                if (p.rag_color === "yellow") byClient[c].yellowCount++;
              });
              const sorted = Object.entries(byClient)
                .map(([name, v]) => ({ name, ...v, net: v.overage - v.investment }))
                .filter((c) => c.overage > 0)
                .sort((a, b) => b.net - a.net)
                .slice(0, 10);
              if (!sorted.length) return <div style={{ color: T.green, padding: 12 }}>✓ No clients with net overservice exposure</div>;
              const maxNet = Math.max(...sorted.map((c) => Math.abs(c.net)), 1);
              return (<div>
                {sorted.map((c) => (
                  <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 140, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
                        {c.projects} project{c.projects !== 1 ? "s" : ""} · {fmtK(c.budget)} budget
                        {c.redCount > 0 && <span style={{ color: T.red, fontWeight: 700, marginLeft: 4 }}>●{c.redCount}</span>}
                        {c.yellowCount > 0 && <span style={{ color: T.yellow, fontWeight: 700, marginLeft: 4 }}>●{c.yellowCount}</span>}
                      </div>
                    </div>
                    <div style={{ flex: 1, height: 20, background: T.bgHover, borderRadius: 4, overflow: "hidden", position: "relative" }}>
                      <div style={{ height: "100%", borderRadius: 4, width: `${(Math.abs(c.net) / maxNet) * 100}%`, background: c.net > 0 ? `linear-gradient(90deg, ${T.red}, ${T.red}cc)` : T.green }} />
                      {c.investment > 0 && <div style={{ position: "absolute", left: `${(c.investment / maxNet) * 100}%`, top: 0, bottom: 0, borderLeft: `2px dashed ${T.green}`, zIndex: 2 }} title={`${fmtK(c.investment)} invested`} />}
                    </div>
                    <div style={{ textAlign: "right", minWidth: 100, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: c.net > 0 ? T.red : T.green }}>{fmtK(c.net)}</div>
                      {c.investment > 0 && <div style={{ fontSize: 10, color: T.textDim }}>{fmtK(c.investment)} invested</div>}
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10, color: T.textDim }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: T.red }} />Net overservice</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 0, borderTop: `2px dashed ${T.green}` }} />Investment offset</span>
                </div>
              </div>);
            })()}
          </Section>
          <div style={{ height: 24 }} />
          <AIInsights />
        </>)}

        {/* ============ LIVE WORK ============ */}
        {tab === "live" && (<>
          <RAGBar status={d.live.status} projects={d.live.projects} />
          <div className="kpi-grid" style={s.kpiGrid}>
            <KPI label="Total Budget" value={fmtK(d.live.financials.total_budget)} />
            <KPI label="Actuals" value={fmtK(d.live.financials.total_actuals)} detail={`${d.live.financials.tracked_projects} tracked`} />
            <KPI label="Burn Rate" value={`${d.live.financials.burn_rate_pct}%`} color={burnColor(d.live.financials.burn_rate_pct)} />
            <KPI label="Forecast Overage" value={fmtK(d.live.financials.total_overage)} color={d.live.financials.total_overage > 0 ? T.red : T.green} />
            <KPI label="OOP" value={fmtK(d.live.financials.total_oop)} />
            <KPI label="Overserviced Projects" value={d.live.financials.overserviced_count} color={d.live.financials.overserviced_count > 0 ? T.red : T.green} />
            <KPI label="Investment" value={fmtK(d.live.financials.total_investment)} />
            <KPI label="Missing Time" value={fmtK(d.live.financials.missing_time_total)} color={d.live.financials.missing_time_total > 5000 ? T.yellow : T.green} />
          </div>
          <div className="chart-row" style={s.chartRow}>
            <Section title="Live Revenue" subtitle="Billable P&Ls"><BarChart data={liveEcoBillable} labelKey="name" valueKey="budget" color={T.text} formatValue={fmtK} /></Section>
            <Section title="Net Overage By Ecosystem" subtitle="Billable P&Ls"><BarChart data={liveEcoBillable.filter((e) => e.overage !== 0).sort((a,b) => b.overage - a.overage)} labelKey="name" valueKey="overage" color={(i) => i.overage > 0 ? T.red : T.green} formatValue={fmtK} /></Section>
          </div>
          <div className="chart-row" style={s.chartRow}>
            <Section title="Top Underservice" subtitle="Greatest underservice first">{(() => {
              const under = d.live.projects.filter((p) => p.overage != null && p.overage < 0).sort((a, b) => a.overage - b.overage);
              return under.length > 0 ? (<div>
                {under.slice(0, 12).map((p) => (
                  <div key={p.rid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                    <span style={{ fontFamily: "monospace", color: T.textDim, width: 55 }}>{p.rid}</span>
                    <span style={{ fontWeight: 600, flex: 1 }}>{p.client_name}</span>
                    <span style={{ color: T.textMuted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.project_name}</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.blue, minWidth: 70, textAlign: "right" }}>{fmtK(Math.abs(p.overage))}</span>
                    <span style={{ fontSize: 11, color: ECO_COLORS[p.ecosystem] || T.textMuted }}>{p.ecosystem}</span>
                  </div>))}
              </div>) : <div style={{ color: T.textDim }}>No underservice accounts</div>; })()}</Section>
            <Section title="Budget by Client (Top 12)"><BarChart data={d.live.by_client} labelKey="name" valueKey="budget" color={T.blue} formatValue={fmtK} /></Section>
          </div>
          <Section title="Aggregate Project Progress View" subtitle="How far through the work are we"><PillChart data={d.live.work_progress} order={["Empty", "Quarter", "Half", "Three Quarter", "Full"]} labelMap={{ "Full": "Complete" }} /></Section>
          <div style={{ height: 16 }} />
          <Section title="Client Archetypes by Ecosystem" subtitle="FIT classification across Climate · Real Estate · Public Affairs · Health">
              {(() => {
                const fitData = d.live.fit_by_ecosystem || {};
                const targetEcos = ["Climate", "Real Estate", "Public Affairs", "Health"];
                const FIT_COLORS = { "Builder": "#2a8f4e", "Storyteller": "#3b73c4", "Amplifier": "#c49a1a", "Transformer": "#7c5cbf", "Unclassified": "#c8c2b8" };
                const allFitTypes = new Set();
                targetEcos.forEach((eco) => { if (fitData[eco]) Object.keys(fitData[eco]).forEach((f) => allFitTypes.add(f)); });
                const fitColors = {};
                const defaultCols = [T.green, T.blue, T.yellow, T.purple, T.orange, T.pink, T.teal, T.red, T.textDim];
                let ci = 0;
                [...allFitTypes].forEach((f) => { fitColors[f] = FIT_COLORS[f] || defaultCols[ci++ % defaultCols.length]; });

                return (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                      {targetEcos.map((eco) => {
                        const data = fitData[eco] || {};
                        const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
                        const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
                        // Mini donut SVG
                        let cumAngle = -90;
                        const slices = entries.map(([name, count]) => {
                          const pctVal = count / total;
                          const angle = Math.min(pctVal * 360, 359.9);
                          const startRad = (cumAngle * Math.PI) / 180;
                          const endRad = ((cumAngle + angle) * Math.PI) / 180;
                          cumAngle += pctVal * 360;
                          const large = angle > 180 ? 1 : 0;
                          const r = 44, cx = 50, cy = 50;
                          const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad);
                          const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad);
                          return { name, count, pctVal, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z` };
                        });
                        return (
                          <div key={eco} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: ECO_COLORS[eco] || T.text, marginBottom: 8 }}>{eco}</div>
                            <svg width={100} height={100} viewBox="0 0 100 100" style={{ display: "block", margin: "0 auto" }}>
                              {slices.length > 0 ? slices.map((sl) => (
                                <path key={sl.name} d={sl.path} fill={fitColors[sl.name] || T.textDim} opacity={0.85}>
                                  <title>{sl.name}: {sl.count} ({Math.round(sl.pctVal * 100)}%)</title>
                                </path>
                              )) : <circle cx={50} cy={50} r={44} fill={T.border} />}
                              <circle cx={50} cy={50} r={24} fill={T.bgCard} />
                              <text x={50} y={53} textAnchor="middle" fontSize="14" fontWeight="900" fill={T.text}>{total}</text>
                            </svg>
                            <div style={{ marginTop: 6 }}>
                              {entries.slice(0, 4).map(([name, count]) => (
                                <div key={name} style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center", marginBottom: 2 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: fitColors[name] || T.textDim, flexShrink: 0 }} />
                                  <span style={{ fontSize: 10, color: T.textMuted }}>{name}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: T.text }}>{count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Legend */}
                    <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                      {[...allFitTypes].map((f) => (
                        <span key={f} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.textMuted }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: fitColors[f] }} />{f}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </Section>
          <div style={{ height: 16 }} />
          <Section title="Live Projects" subtitle="Billable ecosystems · Sorted by overage"><DataTable data={liveProjectsBillable} columns={mkLiveCols(dn)} /></Section>
        </>)}

        {/* ============ RED LIST ============ */}
        {tab === "redlist" && (<>
          {(() => {
            const reds = d.live.projects.filter((p) => p.rag_color === "red").sort((a, b) => (b.overage || 0) - (a.overage || 0));
            const coreReds = reds.filter((p) => p.category === "Active Live Projects");
            const supportReds = reds.filter((p) => p.category === "Active Support" || p.category === "Active Web Warranty");
            const totalOverage = reds.reduce((sum, p) => sum + (p.overage || 0), 0);
            const totalBudget = reds.reduce((sum, p) => sum + (p.budget_forecast || 0), 0);
            const totalActuals = reds.reduce((sum, p) => sum + (typeof p.actuals_display === "number" ? p.actuals_display : 0), 0);

            // By ecosystem (core projects only)
            const byEco = {}; coreReds.forEach((p) => { const e = p.ecosystem || "Unassigned"; byEco[e] = byEco[e] || { count: 0, overage: 0, budget: 0 }; byEco[e].count++; byEco[e].overage += p.overage || 0; byEco[e].budget += p.budget_forecast || 0; });
            const ecoEntries = Object.entries(byEco).sort((a, b) => b[1].overage - a[1].overage);

            // By client (all reds)
            const byClient = {}; reds.forEach((p) => { const c = p.client_name || "Unknown"; byClient[c] = byClient[c] || { count: 0, overage: 0 }; byClient[c].count++; byClient[c].overage += p.overage || 0; });
            const clientEntries = Object.entries(byClient).sort((a, b) => b[1].overage - a[1].overage);

            // By service type (all reds)
            const bySvc = {}; reds.forEach((p) => { const svc = p.request_type || "Unspecified"; svc.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => { bySvc[s] = (bySvc[s] || 0) + 1; }); });
            const svcEntries = Object.entries(bySvc).sort((a, b) => b[1] - a[1]);

            const maxClientOv = Math.max(...clientEntries.map(([, v]) => v.overage), 1);
            const maxEcoOv = Math.max(...ecoEntries.map(([, v]) => v.overage), 1);

            if (!reds.length) return <div style={{ textAlign: "center", padding: 60, color: T.green, fontSize: 18, fontWeight: 700 }}>✓ No projects on the Red List</div>;

            return (<>
              {/* KPI Strip */}
              <div className="exec-kpi-strip" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
                <div style={s.execKpi}><div style={s.execLabel}>Red Projects</div><div style={{ ...s.execValue, color: T.red }}>{reds.length}</div><div style={s.execSub}>of {d.live.count} live projects ({Math.round((reds.length / d.live.count) * 100)}%)</div></div>
                <div style={s.execKpi}><div style={s.execLabel}>Total Overage</div><div style={{ ...s.execValue, color: T.red }}>{(() => { const n = Math.abs(totalOverage); const sign = totalOverage < 0 ? "-" : ""; return n >= 1000000 ? sign + "$" + (n / 1000000).toFixed(2) + "M" : fmtK(totalOverage); })()}</div><div style={s.execSub}>forecast overservice</div></div>
                <div style={s.execKpi}><div style={s.execLabel}>Budget at Risk</div><div style={{ ...s.execValue, color: T.text }}>{fmtK(totalBudget)}</div><div style={s.execSub}>{fmtK(totalActuals)} spent to date</div></div>
                <div style={s.execKpi}><div style={s.execLabel}>Avg Overage</div><div style={{ ...s.execValue, color: T.red }}>{fmtK(totalOverage / reds.length)}</div><div style={s.execSub}>per red project</div></div>
              </div>

              <div className="chart-row" style={s.chartRow}>
                {/* Ecosystem Concentration (core only) */}
                <Section title="Distribution of Red Projects" subtitle="Core ecosystem projects only">
                  <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                    {/* Donut */}
                    <svg width={180} height={180} viewBox="0 0 180 180" style={{ flexShrink: 0 }}>
                      {(() => {
                        const total = ecoEntries.reduce((s, [, v]) => s + v.overage, 0) || 1;
                        let cumAngle = -90;
                        return ecoEntries.map(([name, v], i) => {
                          const pctVal = v.overage / total;
                          const angle = Math.min(pctVal * 360, 359.9);
                          const startRad = (cumAngle * Math.PI) / 180;
                          const endRad = ((cumAngle + angle) * Math.PI) / 180;
                          cumAngle += pctVal * 360;
                          const large = angle > 180 ? 1 : 0;
                          const r = 75, cx = 90, cy = 90;
                          const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad);
                          const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad);
                          return <path key={name} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`} fill={ECO_COLORS[name] || [T.teal, T.orange, T.purple, T.textDim][i % 4]} opacity={0.85}><title>{name}: {fmtK(v.overage)} ({Math.round(pctVal * 100)}%)</title></path>;
                        });
                      })()}
                      <circle cx={90} cy={90} r={40} fill={T.bgCard} />
                      <text x={90} y={86} textAnchor="middle" fontSize="22" fontWeight="900" fill={T.red}>{coreReds.length}</text>
                      <text x={90} y={104} textAnchor="middle" fontSize="10" fill={T.textDim}>projects</text>
                    </svg>
                    {/* Legend + detail */}
                    <div style={{ flex: 1 }}>
                      {ecoEntries.map(([name, v]) => (
                        <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                          <div style={{ width: 12, height: 12, borderRadius: "50%", background: ECO_COLORS[name] || T.textDim, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: ECO_COLORS[name] || T.textMuted, marginBottom: 4 }}>{name}</div>
                            <div style={{ height: 14, background: T.bgHover, borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 4, background: T.red, width: `${(v.overage / maxEcoOv) * 100}%` }} /></div>
                          </div>
                          <div style={{ textAlign: "right", minWidth: 80 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: T.red }}>{fmtK(v.overage)}</div>
                            <div style={{ fontSize: 11, color: T.textDim }}>{v.count} project{v.count !== 1 ? "s" : ""}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>

                {/* Client Exposure */}
                <Section title="Client Exposure" subtitle="Which clients carry the most red overage">
                  {clientEntries.slice(0, 10).map(([name, v]) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 120, fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                      <div style={{ flex: 1, height: 18, background: T.bgHover, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${T.red}, ${T.red}cc)`, width: `${(v.overage / maxClientOv) * 100}%` }} />
                      </div>
                      <div style={{ minWidth: 60, textAlign: "right", fontSize: 12, fontWeight: 700, color: T.red }}>{fmtK(v.overage)}</div>
                      <div style={{ minWidth: 20, fontSize: 10, color: T.textDim }}>{v.count}p</div>
                    </div>
                  ))}
                </Section>
              </div>

              <div className="chart-row" style={s.chartRow}>
                {/* Service Type Breakdown */}
                <Section title="Service Type Breakdown" subtitle="What kind of work is going red">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {svcEntries.slice(0, 15).map(([name, count], i) => {
                      const maxSvc = svcEntries[0][1];
                      const intensity = 0.3 + (count / maxSvc) * 0.7;
                      return <div key={name} style={{ padding: "6px 14px", borderRadius: 8, background: `rgba(201, 60, 60, ${intensity * 0.15})`, border: `1px solid rgba(201, 60, 60, ${intensity * 0.4})`, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{name}</span>
                        <span style={{ fontSize: 18, fontWeight: 900, color: T.red, opacity: intensity }}>{count}</span>
                      </div>;
                    })}
                  </div>
                  {supportReds.length > 0 && (
                    <div style={{ marginTop: 14, padding: "14px 18px", background: "#fff8e1", borderRadius: 10, border: `1px solid #ffe082`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Support & Web Warranty</div>
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                          {supportReds.length} red project{supportReds.length !== 1 ? "s" : ""} outside core ecosystems — {supportReds.filter((p) => p.category === "Active Support").length} Support, {supportReds.filter((p) => p.category === "Active Web Warranty").length} Web Warranty
                        </div>
                        <div style={{ fontSize: 10, color: T.textDim, marginTop: 3, fontStyle: "italic" }}>These projects went red before entering support & warranty</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: T.red }}>{fmtK(supportReds.reduce((sum, p) => sum + (p.overage || 0), 0))}</div>
                        <div style={{ fontSize: 10, color: T.textDim }}>combined overage</div>
                      </div>
                    </div>
                  )}
                </Section>
                <Section title="Overage Severity" subtitle="Distribution of overservice amounts">
                  {(() => {
                    const brackets = [
                      { label: "$50K+", min: 50000, color: "#8b0000" },
                      { label: "$25K–50K", min: 25000, max: 50000, color: T.red },
                      { label: "$10K–25K", min: 10000, max: 25000, color: "#e06060" },
                      { label: "<$10K", min: 0, max: 10000, color: "#e8a0a0" },
                    ];
                    const counts = brackets.map((b) => ({
                      ...b,
                      count: reds.filter((p) => (p.overage || 0) >= b.min && (!b.max || (p.overage || 0) < b.max)).length,
                    }));
                    const maxC = Math.max(...counts.map((c) => c.count), 1);
                    return counts.map((b) => (
                      <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 80, fontSize: 12, fontWeight: 600, color: T.textMuted }}>{b.label}</div>
                        <div style={{ flex: 1, height: 26, background: T.bgHover, borderRadius: 6, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 6, width: `${(b.count / maxC) * 100}%`, background: b.color, display: "flex", alignItems: "center", paddingLeft: 8 }}>
                            {b.count > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{b.count}</span>}
                          </div>
                        </div>
                        <div style={{ minWidth: 30, fontSize: 12, fontWeight: 700, color: T.text, textAlign: "right" }}>{b.count}</div>
                      </div>
                    ));
                  })()}
                </Section>
              </div>

              {/* Core Ecosystem Red Projects Table */}
              <Section title="Red List Projects" subtitle="Core ecosystem projects · Sorted by overage">
                <DataTable data={coreReds} columns={[
                  { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
                  { key: "client_name", label: "Client", w: 130, filter: true, style: { fontWeight: 600 } },
                  { key: "project_name", label: "Assignment", w: 220 },
                  { key: "ecosystem", label: "Ecosystem", w: 90, filter: true, render: (v) => <span style={{ fontSize: 11, fontWeight: 600, color: ECO_COLORS[v] || T.textMuted }}>{v}</span> },
                  { key: "budget_forecast", label: "Budget", w: 90, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
                  { key: "actuals_display", label: "Actuals", w: 90, render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12, color: v === "No Tracking" ? T.textDim : T.text }}>{typeof v === "number" ? fmtK(v) : v}</span> },
                  { key: "overage", label: "FTC Overage", w: 100, render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: T.red }}>{fmtK(v)}</span> },
                  { key: "percent_complete", label: "% Done", w: 60, render: (v) => <span style={{ fontSize: 12, color: T.textMuted }}>{pct(v)}</span> },
                  { key: "request_type", label: "Services", w: 180 },
                  { key: "project_manager", label: "PM/Prod", w: 110, filter: true },
                ]} />
              </Section>
            </>);
          })()}
        </>)}

        {/* ============ NEW BUSINESS ============ */}
        {tab === "newbiz" && (<>
          <div className="kpi-grid" style={s.kpiGrid}>
            <KPI label="Opportunities" value={d.newbiz.count} />
            <KPI label="Total Forecast" value={fmtK(d.newbiz.total_forecast)} detail="Unweighted" />
            <KPI label="Weighted Pipeline" value={fmtK(d.newbiz.weighted_pipeline)} color={T.orange} />
            <KPI label="Near Close" value={fmtK(d.newbiz.pipeline_funnel.find((s) => s.stage === "Working On Contract")?.forecast || 0)} detail={`${d.newbiz.pipeline_funnel.find((s) => s.stage === "Working On Contract")?.count || 0} deals`} color={T.green} />
          </div>
          <div className="chart-row" style={s.chartRow}>
            <Section title="Pipeline by Stage"><PipelineFunnel funnel={d.newbiz.pipeline_funnel} displayNames={dn} /></Section>
            <Section title="Weighted Pipeline by Ecosystem" subtitle="Climate · Health · Real Estate · Public Affairs"><StackedPipeline data={nbEcoPipeline} displayNames={dn} ensureEcosystems={pipelineEcos} /></Section>
          </div>
          <div className="chart-row" style={s.chartRow}>
            <Section title="Qualification Recommendation" subtitle="% of pipeline">{(() => { const total = Object.values(d.newbiz.by_recommendation).reduce((a, b) => a + b, 0) || 1; return (<>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>{Object.entries(d.newbiz.by_recommendation).sort((a, b) => b[1] - a[1]).map(([key, count]) => {
                const pctVal = Math.round((count / total) * 100); const color = key === "PROCEED" ? T.green : key === "DECLINE" ? T.red : T.textDim;
                return <div key={key} style={{ textAlign: "center", padding: "14px 20px", borderRadius: 10, background: T.bgHover, border: `1px solid ${T.border}`, flex: 1, minWidth: 90 }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color }}>{pctVal}%</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2 }}>{key}</div>
                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{count} deals</div>
                </div>; })}</div>
              <div style={{ marginTop: 14, padding: "10px 14px", background: T.bgHover, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 11, color: T.textMuted, lineHeight: 1.6 }}>
                <strong style={{ color: T.text }}>Not Qualified</strong> means live new business opportunities that did not go through formal qualification before being activated as a proposal. Qualification is our way of assuring opportunities are viable before investing in them.
                <br /><br />
                <strong style={{ color: T.text }}>Decline</strong> represents a bid that we are actively working on despite the recommendation to decline the opportunity (from the qualifier).
              </div></>); })()}</Section>
            <Section title="Data Completeness" subtitle="Pipeline data quality">
              <DataCompleteness data={d.newbiz.data_completeness} />
              {(() => {
                const nbProjects = d.newbiz.projects;
                const untracked = nbProjects.filter((p) => p.actuals_display === "No Tracking" || p.actuals_display == null || p.actuals_display === 0);
                const pctUntracked = nbProjects.length ? Math.round((untracked.length / nbProjects.length) * 100) : 0;
                return (
                  <div style={{ marginTop: 16, padding: "12px 14px", background: pctUntracked > 50 ? "#ffebee" : T.bgHover, borderRadius: 8, border: `1px solid ${pctUntracked > 50 ? "#ef9a9a" : T.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Pursuit Effort Not Tracked</div>
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{untracked.length} of {nbProjects.length} opportunities have no actuals logged</div>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: pctUntracked > 50 ? T.red : pctUntracked > 25 ? T.yellow : T.green }}>{pctUntracked}%</div>
                    </div>
                  </div>
                );
              })()}
            </Section>
          </div>
          <Section title="Win Probability & Services by Ecosystem" subtitle="Billable P&Ls"><EcoWinServices data={d.newbiz.eco_win_services} billable={billable} /></Section>
          <div style={{ height: 16 }} />
          <Section title="Services Being Pursued" subtitle="What kind of work is in the pipeline">
            {(() => {
              const bySvc = {};
              d.newbiz.projects.forEach((p) => {
                const svc = p.request_type || "Unspecified";
                svc.split(",").map((s) => s.trim()).filter((s) => s && s !== "-").forEach((s) => { bySvc[s] = (bySvc[s] || 0) + 1; });
              });
              const svcEntries = Object.entries(bySvc).sort((a, b) => b[1] - a[1]);
              if (!svcEntries.length) return <div style={{ color: T.textDim }}>No service data</div>;
              const maxSvc = svcEntries[0][1];
              return (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {svcEntries.slice(0, 20).map(([name, count]) => {
                    const intensity = 0.3 + (count / maxSvc) * 0.7;
                    return <div key={name} style={{ padding: "6px 14px", borderRadius: 8, background: `rgba(217, 122, 26, ${intensity * 0.15})`, border: `1px solid rgba(217, 122, 26, ${intensity * 0.4})`, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{name}</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: T.orange, opacity: intensity }}>{count}</span>
                    </div>;
                  })}
                </div>
              );
            })()}
          </Section>
          <div style={{ height: 16 }} />
          <Section title="Pipeline Deals" subtitle="Proposal → Waiting → Contract → Qualification → On Hold"><DataTable data={nbProjectsSorted} columns={mkNewbizCols(dn)} /></Section>
        </>)}

        {/* ============ INTERNAL ============ */}
        {tab === "internal" && (<>
          {(() => {
            const intProjects = d.internal.projects.filter((p) => p.category !== "Internal Admin Time");
            const intCategories = d.internal.by_category.filter((c) => c.name !== "Internal Admin Time");
            const intInvestment = intProjects.reduce((sum, p) => sum + (p.approved_investment || 0), 0);
            const intActuals = intProjects.reduce((sum, p) => sum + (typeof p.actuals_display === "number" ? p.actuals_display : 0), 0);
            return (<>
          <div className="kpi-grid" style={{ ...s.kpiGrid, gridTemplateColumns: "repeat(3, 1fr)" }}>
            <KPI label="Internal Projects" value={intProjects.length} />
            <KPI label="Approved Investment" value={fmtK(intInvestment)} color={T.purple} />
            <KPI label="Actuals" value={fmtK(intActuals)} />
          </div>
          {intCategories.length > 0 && <Section title="By Category">{intCategories.map((cat) => (
            <div key={cat.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{cat.name}</div>
              <div style={{ fontSize: 12, color: T.textMuted }}>{cat.projects} projects</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.purple, minWidth: 80, textAlign: "right" }}>{fmtK(cat.investment)}</div>
            </div>))}</Section>}
          <div style={{ height: 16 }} />
          <Section title="Internal Projects"><DataTable data={intProjects} columns={[
            { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
            { key: "client_name", label: "Client", w: 140, style: { fontWeight: 600 } },
            { key: "project_name", label: "Assignment", w: 250 },
            { key: "category", label: "Category", w: 160, filter: true },
            { key: "approved_investment", label: "Approved Investment", w: 120, fmt: fmtK, style: { fontFamily: "monospace" } },
            { key: "actuals_display", label: "Actuals", w: 90, render: (v, p) => {
              const over = typeof v === "number" && p.approved_investment > 0 && v > p.approved_investment;
              return <span style={{ fontFamily: "monospace", fontSize: 12, color: v === "No Tracking" ? T.textDim : over ? T.red : T.text, fontWeight: over ? 700 : 400 }}>{typeof v === "number" ? fmtK(v) : v}{over ? " ⚠" : ""}</span>;
            } },
            { key: "percent_complete", label: "% Done", w: 70, render: (v) => <span style={{ fontSize: 12, color: T.textMuted }}>{pct(v)}</span> },
            { key: "project_manager", label: "PM/Prod", w: 120, filter: true },
          ]} /></Section>
        </>); })()}
        </>)}

        {/* ============ DELIVERY & EXPERIENCES ============ */}
        {tab === "dept" && (<>
          {!deptData ? (
            <div style={{ textAlign: "center", padding: 60, color: T.textDim }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Loading department data...</div>
              <div style={{ fontSize: 12 }}>If this persists, the dept-health API endpoint may not be deployed yet.</div>
            </div>
          ) : (() => {
            const us = deptData.utilization_summary || {};
            const rs = deptData.revenue_summary || {};
            const ps = deptData.pivot_summary || {};
            const effort = deptData.revenue_sections?.["TOTAL EFFORT"] || [];
            const deviation = deptData.revenue_sections?.["DEVIATION"] || [];
            const util = deptData.utilization || [];
            const UTIL_TARGETS = { "Kirk Dammeier": 70, "Heather Corrie": 50, "JJ Zakheim": 75, "Monica Watson": 75, "Sarah Clark": 75, "Bobbie Maciuch": 75, "Hannah Deaton": 75, "Andrew McNamara": 75, "Arrabelle Stavroff": 75, "Chad Krulicki": 60, "Sarah Miller": 80, "Rebecca Zak": 40, "Richard Pisarski": 80 };
            util.forEach((t) => { if (!t.utilization_target && UTIL_TARGETS[t.name]) t.utilization_target = UTIL_TARGETS[t.name]; });
            const integ = deptData.integrated_projects || [];
            const is_ = deptData.integrated_summary || {};
            const pen = deptData.penetration || {};
            const smm = deptData.service_mix_matrix || { ecosystems: [], requestTypes: [], cells: [] };

            // Build penetration trend data: history + live "last month" point
            const penTrend = (() => {
              const hist = [...(deptHistory || [])];
              // Append live "last month" values as current data point if available
              if (pen.last_month?.experiences != null) {
                const now = new Date();
                const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const lmLabel = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, "0")}`;
                if (!hist.find((h) => h.month === lmLabel)) {
                  hist.push({ month: lmLabel, experiences: pen.last_month.experiences, delivery: pen.last_month.delivery, combined: pen.last_month.combined || (pen.last_month.experiences + pen.last_month.delivery) });
                }
              }
              hist.sort((a, b) => a.month.localeCompare(b.month));
              return hist;
            })();

            // Chart dimensions
            const chartW = 900, chartH = 220, padL = 60, padR = 20, padT = 20, padB = 40;
            const plotW = chartW - padL - padR, plotH = chartH - padT - padB;

            // Color helpers
            const utilColor = (v) => v >= 80 ? T.red : v >= 60 ? T.yellow : v >= 40 ? T.green : T.blue;
            const billableColor = (v) => v >= 50 ? T.green : v >= 30 ? T.yellow : T.red;

            // Penetration trend line chart
            const penetrationTrendChart = (() => {
              if (penTrend.length < 2) return null;
              const ptW = 900, ptH = 220, ptPadL = 50, ptPadR = 30, ptPadT = 30, ptPadB = 30;
              const ptPlotW = ptW - ptPadL - ptPadR, ptPlotH = ptH - ptPadT - ptPadB;
              const maxPct = Math.max(...penTrend.map((m) => Math.max(m.experiences || 0, m.delivery || 0, m.combined || 0)), 20);
              const yS = (v) => ptPadT + ptPlotH - (v / maxPct) * ptPlotH;
              const xS = (i) => ptPadL + (i / (penTrend.length - 1)) * ptPlotW;
              const mkLine = (key) => penTrend.map((m, i) => `${i === 0 ? "M" : "L"}${xS(i).toFixed(1)},${yS(m[key] || 0).toFixed(1)}`).join(" ");
              const yTicks = Array.from({ length: 5 }, (_, i) => (maxPct / 4) * i);
              const last = penTrend[penTrend.length - 1];
              return (
                <svg viewBox={`0 0 ${ptW} ${ptH}`} style={{ width: "100%", height: "auto" }}>
                  {yTicks.map((v, i) => (
                    <g key={i}>
                      <line x1={ptPadL} y1={yS(v)} x2={ptW - ptPadR} y2={yS(v)} stroke={T.border} strokeWidth={0.5} strokeDasharray={i === 0 ? "0" : "3,3"} />
                      <text x={ptPadL - 8} y={yS(v) + 4} textAnchor="end" fontSize={9} fill={T.textDim}>{Math.round(v)}%</text>
                    </g>
                  ))}
                  <path d={mkLine("combined")} fill="none" stroke={T.pink} strokeWidth={2.5} strokeLinejoin="round" />
                  <path d={mkLine("experiences")} fill="none" stroke={T.purple} strokeWidth={2} strokeLinejoin="round" />
                  <path d={mkLine("delivery")} fill="none" stroke={T.blue} strokeWidth={2} strokeLinejoin="round" />
                  {penTrend.map((m, i) => (
                    <text key={i} x={xS(i)} y={ptH - 4} textAnchor="middle" fontSize={9} fill={T.textDim}>{(() => { const p = m.month.split("-"); if (p.length === 3) { const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(p[1],10)-1]; return `${mn} ${parseInt(p[2],10)}`; } return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(p[1],10)-1] || p[1]; })()}</text>
                  ))}
                  {[
                    { key: "combined", color: T.pink, label: `${last.combined || 0}%` },
                    { key: "experiences", color: T.purple, label: `${last.experiences || 0}%` },
                    { key: "delivery", color: T.blue, label: `${last.delivery || 0}%` },
                  ].map(({ key, color, label }) => (
                    <g key={key}>
                      <circle cx={xS(penTrend.length - 1)} cy={yS(last[key] || 0)} r={5} fill={color} />
                      <text x={xS(penTrend.length - 1) + 10} y={yS(last[key] || 0) + 4} fontSize={11} fontWeight={700} fill={color}>{label}</text>
                    </g>
                  ))}
                  {[{ label: "Delivery", color: T.blue, x: ptPadL }, { label: "Experiences", color: T.purple, x: ptPadL + 100 }, { label: "Combined", color: T.pink, x: ptPadL + 230 }].map((l) => (
                    <g key={l.label}>
                      <line x1={l.x} y1={12} x2={l.x + 20} y2={12} stroke={l.color} strokeWidth={2.5} />
                      <text x={l.x + 24} y={15} fontSize={10} fontWeight={600} fill={l.color}>{l.label}</text>
                    </g>
                  ))}
                </svg>
              );
            })();

            // Deviation grouped bar chart
            const deviationChart = (() => {
              if (deviation.length < 1) return null;
              const dvW = 900, dvH = 220;
              const maxVal = Math.max(...deviation.map((m) => Math.max(Math.abs(m.delivery), Math.abs(m.experiences), Math.abs(m.total))), 1);
              const barGroupW = Math.min(60, (plotW / deviation.length) * 0.85);
              const barW = barGroupW / 3.5;
              const xScale = (i) => padL + (i + 0.5) * (plotW / deviation.length);
              const yZero = padT + plotH;
              const yScale = (v) => v >= 0 ? yZero - (v / maxVal) * (plotH * 0.85) : yZero + (Math.abs(v) / maxVal) * (plotH * 0.1);
              return (
                <svg viewBox={`0 0 ${dvW} ${dvH}`} style={{ width: "100%", height: "auto" }}>
                  <line x1={padL} y1={yZero} x2={dvW - padR} y2={yZero} stroke={T.borderDark} strokeWidth={1} />
                  {[0.25, 0.5, 0.75, 1].map((f, i) => (
                    <g key={i}>
                      <line x1={padL} y1={yZero - f * plotH * 0.85} x2={dvW - padR} y2={yZero - f * plotH * 0.85} stroke={T.border} strokeWidth={0.5} strokeDasharray="3,3" />
                      <text x={padL - 8} y={yZero - f * plotH * 0.85 + 4} textAnchor="end" fontSize={9} fill={T.textDim}>${(maxVal * f / 1000).toFixed(0)}K</text>
                    </g>
                  ))}
                  {deviation.map((m, i) => {
                    const cx = xScale(i);
                    const bars = [
                      { key: "delivery", color: T.blue, offset: -barW * 1.1 },
                      { key: "experiences", color: T.purple, offset: 0 },
                      { key: "total", color: T.pink, offset: barW * 1.1 },
                    ];
                    return (
                      <g key={i}>
                        {bars.map((b) => {
                          const val = m[b.key];
                          const h = Math.abs(val) / maxVal * plotH * 0.85;
                          const y = val >= 0 ? yZero - h : yZero;
                          return h > 0.5 ? (
                            <rect key={b.key} x={cx + b.offset - barW / 2} y={y} width={barW} height={Math.max(h, 1)} fill={b.color} rx={1} opacity={0.85} />
                          ) : null;
                        })}
                        {m.total !== 0 && (
                          <text x={cx + barW * 1.1} y={yScale(m.total) - 6} textAnchor="middle" fontSize={8} fill={T.textDim}>{fmtK(m.total)}</text>
                        )}
                        <text x={cx} y={dvH - 4} textAnchor="middle" fontSize={9} fill={T.textDim}>{m.month.replace(/^\d{4}-/, "")}</text>
                      </g>
                    );
                  })}
                  {[{ label: "Delivery", color: T.blue, x: padL }, { label: "Experiences", color: T.purple, x: padL + 100 }, { label: "Total", color: T.pink, x: padL + 220 }].map((l) => (
                    <g key={l.label}>
                      <rect x={l.x} y={2} width={14} height={10} fill={l.color} rx={2} />
                      <text x={l.x + 18} y={11} fontSize={10} fontWeight={600} fill={l.color}>{l.label}</text>
                    </g>
                  ))}
                </svg>
              );
            })();

            const integSorted = [...integ].sort((a, b) => (b.overage || 0) - (a.overage || 0));

            return (<>
              {/* KPI Strip */}
              <div className="exec-kpi-strip" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, marginBottom: 24 }}>
                {[
                  { label: "Team Size", value: us.team_size || 0, sub: `${us.high_utilization || 0} at ≥80% utilization` },
                  { label: "Avg Utilization", value: `${us.avg_utilization || 0}%`, color: utilColor(us.avg_utilization || 0), sub: "Last 30 days" },
                  { label: "Avg Billable", value: `${us.avg_billable || 0}%`, color: billableColor(us.avg_billable || 0), sub: `${us.low_billable || 0} below 30%` },
                  { label: "Avg Admin", value: `${us.avg_admin || 0}%`, color: T.textMuted, sub: "Of total time" },
                  { label: "D&E Revenue", value: fmtK(rs.this_month_total || 0), color: T.text, sub: "Actuals + Forecast" },
                  { label: "Net Overservice", value: fmtK(is_.total_overage || 0), color: (is_.total_overage || 0) > 0 ? T.red : T.green, sub: `${integ.filter(p => p.overage > 0).length} over · ${integ.filter(p => p.overage < 0).length} under · ${is_.total_projects || 0} total` },
                ].map((kpi) => (
                  <div key={kpi.label} style={s.execKpi}>
                    <div style={s.execLabel}>{kpi.label}</div>
                    <div style={{ ...s.execValue, color: kpi.color || T.text, fontSize: 24 }}>{kpi.value}</div>
                    <div style={s.execSub}>{kpi.sub}</div>
                  </div>
                ))}
              </div>

              {/* Penetration */}
              {(pen.this_month?.experiences != null || pen.this_month?.delivery != null || pen.last_month?.experiences != null) ? (
                <div className="chart-row" style={{ ...s.chartRow, marginBottom: 16 }}>
                  <Section title="Penetration — So Far This Month">
                    <div style={{ display: "flex", justifyContent: "center", gap: 40, padding: "16px 0" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 48, fontWeight: 900, color: T.purple }}>{pen.this_month?.experiences != null ? `${pen.this_month.experiences}%` : "—"}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>Experiences</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 48, fontWeight: 900, color: T.blue }}>{pen.this_month?.delivery != null ? `${pen.this_month.delivery}%` : "—"}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>Delivery</div>
                      </div>
                    </div>
                  </Section>
                  <Section title="Penetration — Last Month">
                    <div style={{ display: "flex", justifyContent: "center", gap: 40, padding: "16px 0" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 48, fontWeight: 900, color: T.purple, opacity: 0.6 }}>{pen.last_month?.experiences != null ? `${pen.last_month.experiences}%` : "—"}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>Experiences</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 48, fontWeight: 900, color: T.blue, opacity: 0.6 }}>{pen.last_month?.delivery != null ? `${pen.last_month.delivery}%` : "—"}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>Delivery</div>
                      </div>
                    </div>
                  </Section>
                </div>
              ) : (
                <div style={{ background: "#fff8e1", border: `1px solid ${T.yellow}`, borderRadius: 10, padding: "12px 18px", marginBottom: 16, fontSize: 12, color: "#8d6e00" }}>
                  <strong>Penetration data:</strong> Could not extract percentages from the source sheets. Check <code>/api/dept-health</code> for debug info.
                </div>
              )}

              {/* Penetration Trend */}
              <Section title="Penetration Trend" subtitle={`D&E share of total incurred revenue · ${penTrend.length} data points (weekly) · Baseline: Dec 2025 (Exp 10%, Del 6%)`}>
                {penetrationTrendChart || <div style={{ color: T.textDim, fontSize: 12, padding: 20 }}>Insufficient data for chart (need ≥2 months). Penetration history will accumulate automatically.</div>}
              </Section>
              <div style={{ height: 16 }} />

              {/* Deviation */}
              {deviation.length > 0 && (
                <>
                  <Section title="Deviation" subtitle="Monthly overservice by subteam · Delivery (navy) · Experiences (purple) · Total (pink)">
                    {deviationChart}
                  </Section>
                  <div style={{ height: 16 }} />
                </>
              )}

              {/* Worked vs Booked Delta */}
              {(() => {
                const bookedSection = deptData.revenue_sections?.["BOOKED REVENUE"] || deptData.revenue_sections?.["BOOKED"] || [];
                if (effort.length < 2 && bookedSection.length < 2) return null;
                const hasBooked = bookedSection.length > 0;
                const deltaData = effort.map((w) => {
                  const b = bookedSection.find((bk) => bk.month === w.month);
                  return { month: w.month, worked: w.total, booked: b ? b.total : null };
                });
                const validDelta = deltaData.filter((d) => d.worked > 0 || (d.booked != null && d.booked > 0));
                if (validDelta.length < 2) return null;
                const maxVal = Math.max(...validDelta.map((d) => Math.max(d.worked, d.booked || 0)), 1);
                const wbH = 200;
                const xS = (i) => padL + (i / (validDelta.length - 1)) * plotW;
                const yS = (v) => padT + (wbH - padT - padB) - (v / maxVal) * (wbH - padT - padB);
                const mkPath = (key) => validDelta.map((d, i) => `${i === 0 ? "M" : "L"}${xS(i).toFixed(1)},${yS(d[key] || 0).toFixed(1)}`).join(" ");
                const mkArea = (key) => `${mkPath(key)} L${xS(validDelta.length - 1).toFixed(1)},${yS(0).toFixed(1)} L${xS(0).toFixed(1)},${yS(0).toFixed(1)} Z`;
                return (
                  <>
                    <Section title="Worked vs Booked Delta" subtitle={hasBooked ? "Area between curves = delta" : "Worked revenue only (no booked data found)"}>
                      <svg viewBox={`0 0 ${chartW} ${wbH}`} style={{ width: "100%", height: "auto" }}>
                        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
                          <g key={i}>
                            <line x1={padL} y1={yS(maxVal * f)} x2={chartW - padR} y2={yS(maxVal * f)} stroke={T.border} strokeWidth={0.5} strokeDasharray={i === 0 ? "0" : "3,3"} />
                            <text x={padL - 8} y={yS(maxVal * f) + 4} textAnchor="end" fontSize={9} fill={T.textDim}>${(maxVal * f / 1000).toFixed(0)}K</text>
                          </g>
                        ))}
                        <path d={mkArea("worked")} fill={T.blue} opacity={0.15} />
                        <path d={mkPath("worked")} fill="none" stroke={T.blue} strokeWidth={2.5} strokeLinejoin="round" />
                        {hasBooked && <>
                          <path d={mkArea("booked")} fill={T.purple} opacity={0.12} />
                          <path d={mkPath("booked")} fill="none" stroke={T.purple} strokeWidth={2} strokeLinejoin="round" />
                        </>}
                        {validDelta.length > 0 && (
                          <>
                            <text x={xS(validDelta.length - 1) + 6} y={yS(validDelta[validDelta.length - 1].worked) + 4} fontSize={9} fontWeight={700} fill={T.blue}>{fmtK(validDelta[validDelta.length - 1].worked)}</text>
                            {hasBooked && validDelta[validDelta.length - 1].booked != null && (
                              <text x={xS(validDelta.length - 1) + 6} y={yS(validDelta[validDelta.length - 1].booked) + 4} fontSize={9} fontWeight={700} fill={T.purple}>{fmtK(validDelta[validDelta.length - 1].booked)}</text>
                            )}
                          </>
                        )}
                        {validDelta.map((m, i) => (
                          (i % Math.max(1, Math.floor(validDelta.length / 10)) === 0 || i === validDelta.length - 1) && (
                            <text key={i} x={xS(i)} y={wbH - 4} textAnchor="middle" fontSize={9} fill={T.textDim}>{m.month}</text>
                          )
                        ))}
                        <circle cx={padL + 6} cy={8} r={4} fill={T.blue} />
                        <text x={padL + 14} y={11} fontSize={10} fontWeight={600} fill={T.blue}>WORKED</text>
                        {hasBooked && <>
                          <circle cx={padL + 96} cy={8} r={4} fill={T.purple} />
                          <text x={padL + 104} y={11} fontSize={10} fontWeight={600} fill={T.purple}>BOOKED</text>
                        </>}
                      </svg>
                    </Section>
                    <div style={{ height: 16 }} />
                  </>
                );
              })()}

              {/* Utilization Heatmap */}
              <Section title="Team Utilization — Last 30 Days" subtitle={`${util.length} team members · Ordered by billable %`}>
                <div style={{ overflowX: "auto" }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={{ ...s.th, width: 160 }}>Team Member</th>
                        <th style={{ ...s.th, width: 140 }}>Role</th>
                        <th style={{ ...s.th, width: 80, textAlign: "center" }}>Utilization</th>
                        <th style={{ ...s.th, width: 70, textAlign: "center" }}>Target</th>
                        <th style={{ ...s.th, width: 80, textAlign: "center" }}>Billable</th>
                        <th style={{ ...s.th, width: 80, textAlign: "center" }}>Admin</th>
                        <th style={{ ...s.th, flex: 1 }}>Breakdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...util].sort((a, b) => (b.billable || 0) - (a.billable || 0)).map((t, i) => {
                        const utilPct = t.utilization || 0;
                        const billPct = t.billable || 0;
                        const adminPct = t.admin_time || 0;
                        const clientablePct = Math.max(0, utilPct - billPct);
                        const bW = `${billPct}%`;
                        const nbW = `${clientablePct}%`;
                        const aW = `${adminPct}%`;
                        const tgt = t.utilization_target || 0;
                        const diff = (t.utilization || 0) - tgt;
                        const utilClr = !tgt ? utilColor(t.utilization || 0) : diff >= -2 ? T.green : diff >= -5 ? T.yellow : T.red;
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? T.bgCard : T.bgCardAlt }}>
                            <td style={{ ...s.td, fontWeight: 600, fontSize: 12 }}>{t.name}</td>
                            <td style={{ ...s.td, fontSize: 11, color: T.textMuted }}>{t.role}</td>
                            <td style={{ ...s.td, textAlign: "center", fontWeight: 700, fontSize: 13, color: utilClr }}>{pct(t.utilization)}</td>
                            <td style={{ ...s.td, textAlign: "center", fontSize: 12, color: T.textMuted }}>{t.utilization_target ? pct(t.utilization_target) : "—"}</td>
                            <td style={{ ...s.td, textAlign: "center", fontWeight: 700, fontSize: 13, color: billableColor(t.billable || 0) }}>{pct(t.billable)}</td>
                            <td style={{ ...s.td, textAlign: "center", fontSize: 12, color: T.textMuted }}>{pct(t.admin_time)}</td>
                            <td style={s.td}>
                              <div style={{ display: "flex", height: 14, borderRadius: 3, overflow: "hidden", flex: 1, background: T.bgHover, position: "relative" }}>
                                <div style={{ width: bW, background: T.green }} title={`Billable: ${pct(t.billable)}`} />
                                <div style={{ width: nbW, background: T.blue, opacity: 0.4 }} title={`Clientable: ${pct(clientablePct)}`} />
                                <div style={{ width: aW, background: T.yellow, opacity: 0.6 }} title={`Admin: ${pct(t.admin_time)}`} />
                                {tgt > 0 && <div style={{ position: "absolute", left: `${tgt}%`, top: 0, bottom: 0, width: 2, background: T.red, zIndex: 2 }} title={`Target: ${tgt}%`} />}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 10, color: T.textDim }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: T.green, display: "inline-block" }} /> Billable</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: T.blue, opacity: 0.4, display: "inline-block" }} /> Clientable</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: T.yellow, opacity: 0.6, display: "inline-block" }} /> Admin</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 2, height: 10, background: T.red, display: "inline-block" }} /> Target</span>
                  </div>
                </div>
              </Section>
              <div style={{ height: 16 }} />

              {/* Utilization by Role */}
              {(us.by_role || []).length > 0 && (
                <>
                  <Section title="Utilization by Role" subtitle="Averaged across team members">
                    {us.by_role.map((r) => {
                      const clientable = Math.max(0, r.avg_utilization - r.avg_billable);
                      return (
                      <div key={r.role} className="util-role-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ width: 140, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{r.role} <span style={{ fontSize: 10, color: T.textDim }}>({r.count})</span></div>
                        <div className="util-role-bars" style={{ flex: 1, display: "flex", gap: 6, alignItems: "center" }}>
                          <div style={{ flex: 3, display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 10, color: T.textDim, width: 40, flexShrink: 0 }}>Billable</span>
                            <div style={{ flex: 1, height: 14, background: T.bgHover, borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${r.avg_billable}%`, height: "100%", background: billableColor(r.avg_billable), borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: billableColor(r.avg_billable), width: 36, textAlign: "right", flexShrink: 0 }}>{r.avg_billable}%</span>
                          </div>
                          <div style={{ flex: 2, display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 10, color: T.textDim, width: 52, flexShrink: 0 }}>Clientable</span>
                            <div style={{ flex: 1, height: 14, background: T.bgHover, borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${clientable}%`, height: "100%", background: T.blue, opacity: 0.4, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, width: 36, textAlign: "right", flexShrink: 0 }}>{clientable}%</span>
                          </div>
                          <div style={{ flex: 2, display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 10, color: T.textDim, width: 40, flexShrink: 0 }}>Admin</span>
                            <div style={{ flex: 1, height: 14, background: T.bgHover, borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${r.avg_admin}%`, height: "100%", background: T.yellow, opacity: 0.7, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, width: 36, textAlign: "right", flexShrink: 0 }}>{r.avg_admin}%</span>
                          </div>
                        </div>
                      </div>
                    );})}
                  </Section>
                  <div style={{ height: 16 }} />
                </>
              )}

              {/* Integrated RAG + Weekly Deviation */}
              <div className="chart-row" style={{ ...s.chartRow, marginBottom: 16 }}>
                <Section title="Integrated RAG Status" subtitle={`${is_.total_projects || 0} integrated projects`}>
                  <div style={{ display: "flex", gap: 16, justifyContent: "center", padding: "24px 0" }}>
                    {["green", "yellow", "red", "blue"].map((color) => {
                      const count = (is_.rag || {})[color] || 0;
                      const r = RAG[color];
                      return (
                        <div key={color} style={{ textAlign: "center", padding: "20px 24px", borderRadius: 10, background: r.bg, minWidth: 90, flex: 1 }}>
                          <div style={{ fontSize: 36, fontWeight: 900, color: r.text }}>{count}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: r.text, marginTop: 4 }}>{r.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
                <Section title="D&E Live Revenue per Ecosystem" subtitle={`Active projects only (excludes archived/completed) · Budget: ${fmtK(is_.total_budget || 0)} · Actuals: ${fmtK(is_.total_actuals || 0)}`}>
                  <div style={{ padding: "4px 0" }}>
                    {Object.entries(is_.by_ecosystem || {}).filter(([eco]) => eco !== "-").sort((a, b) => b[1].actuals - a[1].actuals).map(([eco, ecoData]) => {
                      const maxBudget = Math.max(...Object.values(is_.by_ecosystem || {}).map((d) => d.budget), 1);
                      return (
                        <div key={eco} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                          <div style={{ width: 100, fontSize: 12, fontWeight: 600, color: ECO_COLORS[eco] || T.textMuted }}>{eco}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 2, height: 28, borderRadius: 5, overflow: "hidden", background: T.bgHover }}>
                              <div style={{ width: `${(ecoData.actuals / maxBudget) * 100}%`, background: ECO_COLORS[eco] || T.blue, borderRadius: "5px 0 0 5px", minWidth: ecoData.actuals > 0 ? 2 : 0 }} title={`Actuals: ${fmtK(ecoData.actuals)}`} />
                              <div style={{ width: `${(Math.max(0, ecoData.budget - ecoData.actuals) / maxBudget) * 100}%`, background: ECO_COLORS[eco] || T.blue, opacity: 0.25, borderRadius: "0 5px 5px 0", minWidth: ecoData.budget > ecoData.actuals ? 1 : 0 }} title={`Remaining: ${fmtK(ecoData.budget - ecoData.actuals)}`} />
                            </div>
                          </div>
                          <div style={{ width: 70, textAlign: "right", fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{fmtK(ecoData.actuals)}</div>
                          <div style={{ width: 60, textAlign: "right", fontSize: 10, color: T.textDim }}>{ecoData.count} proj</div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              </div>

              {/* Client Archetypes — D&E Projects */}
              {(() => {
                const liveByRid = {};
                (d.live.projects || []).forEach((p) => { if (p.rid) liveByRid[p.rid] = p; });
                const fitByEco = {};
                integ.forEach((p) => {
                  const eco = p.ecosystem || "-";
                  if (eco === "-") return;
                  const match = liveByRid[p.rid];
                  const fit = (match?.fit && match.fit !== "-") ? match.fit.trim() : "Unclassified";
                  if (!fitByEco[eco]) fitByEco[eco] = {};
                  fitByEco[eco][fit] = (fitByEco[eco][fit] || 0) + 1;
                });
                const ecos = Object.keys(fitByEco).sort();
                if (!ecos.length) return null;
                const FIT_COLORS = { "Builder": "#2a8f4e", "Storyteller": "#3b73c4", "Amplifier": "#c49a1a", "Transformer": "#7c5cbf", "Unclassified": "#c8c2b8" };
                const allFitTypes = new Set();
                ecos.forEach((eco) => Object.keys(fitByEco[eco]).forEach((f) => allFitTypes.add(f)));
                const fitColors = {};
                const defaultCols = [T.green, T.blue, T.yellow, T.purple, T.orange, T.pink, T.teal, T.red, T.textDim];
                let ci = 0;
                [...allFitTypes].forEach((f) => { fitColors[f] = FIT_COLORS[f] || defaultCols[ci++ % defaultCols.length]; });

                return (<>
                  <Section title="Client Archetypes by Ecosystem" subtitle={`FIT classification across ${integ.length} D&E integrated projects`}>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(ecos.length, 4)}, 1fr)`, gap: 16 }}>
                      {ecos.map((eco) => {
                        const data = fitByEco[eco];
                        const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
                        const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
                        let cumAngle = -90;
                        const slices = entries.map(([name, count]) => {
                          const pctVal = count / total;
                          const angle = Math.min(pctVal * 360, 359.9);
                          const startRad = (cumAngle * Math.PI) / 180;
                          const endRad = ((cumAngle + angle) * Math.PI) / 180;
                          cumAngle += pctVal * 360;
                          const large = angle > 180 ? 1 : 0;
                          const r = 44, cx = 50, cy = 50;
                          const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad);
                          const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad);
                          return { name, count, pctVal, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z` };
                        });
                        return (
                          <div key={eco} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: ECO_COLORS[eco] || T.text, marginBottom: 8 }}>{eco}</div>
                            <svg width={100} height={100} viewBox="0 0 100 100" style={{ display: "block", margin: "0 auto" }}>
                              {slices.length > 0 ? slices.map((sl) => (
                                <path key={sl.name} d={sl.path} fill={fitColors[sl.name] || T.textDim} opacity={0.85}>
                                  <title>{sl.name}: {sl.count} ({Math.round(sl.pctVal * 100)}%)</title>
                                </path>
                              )) : <circle cx={50} cy={50} r={44} fill={T.border} />}
                              <circle cx={50} cy={50} r={24} fill={T.bgCard} />
                              <text x={50} y={53} textAnchor="middle" fontSize="14" fontWeight="900" fill={T.text}>{total}</text>
                            </svg>
                            <div style={{ marginTop: 6 }}>
                              {entries.slice(0, 4).map(([name, count]) => (
                                <div key={name} style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center", marginBottom: 2 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: fitColors[name] || T.textDim, flexShrink: 0 }} />
                                  <span style={{ fontSize: 10, color: T.textMuted }}>{name}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: T.text }}>{count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                      {[...allFitTypes].map((f) => (
                        <span key={f} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.textMuted }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: fitColors[f] }} />{f}
                        </span>
                      ))}
                    </div>
                  </Section>
                  <div style={{ height: 16 }} />
                </>);
              })()}

              {/* Service Mix by Ecosystem — D&E Projects */}
              {smm.ecosystems.length > 0 && smm.requestTypes.length > 0 && (
                <>
                  <Section title="Service Mix by Ecosystem" subtitle={`D&E integrated projects · Revenue as proportion of total ${fmtK(is_.total_budget || 0)} budget`}>
                    <BubbleMatrix matrix={smm} billable={smm.ecosystems} totalProjects={is_.total_projects || integ.length} revenueMode={true} />
                  </Section>
                  <div style={{ height: 16 }} />
                </>
              )}

              {/* Integrated Projects Table */}
              <Section title="Integrated Project Status" subtitle={`${integ.length} projects · Sorted by overage`}>
                <DataTable data={integSorted} columns={[
                  { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
                  { key: "client", label: "Client", w: 120, style: { fontWeight: 600 }, filter: true },
                  { key: "project_name", label: "Assignment", w: 200 },
                  { key: "ecosystem", label: "Ecosystem", w: 100, filter: true, render: (v) => <span style={{ color: ECO_COLORS[v] || T.text, fontWeight: 600, fontSize: 12 }}>{v}</span> },
                  { key: "rag", label: "RAG", w: 60, render: (v) => <Badge color={v} label={RAG[v]?.label || v} /> },
                  { key: "budget_forecast", label: "Budget", w: 90, fmt: fmtK, style: { fontFamily: "monospace" } },
                  { key: "actuals", label: "Actuals", w: 90, fmt: fmtK, style: { fontFamily: "monospace" } },
                  { key: "overage", label: "Overage", w: 90, render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: v > 0 ? T.red : v < 0 ? T.green : T.text }}>{fmtK(v)}</span> },
                  { key: "last_weeks_deviation", label: "Wk Deviation", w: 90, render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12, color: v > 0 ? T.red : v < 0 ? T.green : T.textDim }}>{v !== 0 ? fmtK(v) : "—"}</span> },
                  { key: "top_priority", label: "Priority", w: 70, render: (v) => v ? <span style={{ fontSize: 10, fontWeight: 700, color: T.red, background: "#ffebee", padding: "2px 8px", borderRadius: 4 }}>{v}</span> : <span style={{ color: T.textDim }}>—</span> },
                  { key: "pm", label: "PM/Prod", w: 110, filter: true },
                  { key: "percent_complete", label: "% Done", w: 65, render: (v) => <span style={{ fontSize: 12, color: T.textMuted }}>{pct(v)}</span> },
                ]} />
              </Section>
            </>);
          })()}
        </>)}

        <div style={s.footer}>Generated {new Date(d.generated_at).toLocaleString()} · v{APP_VERSION}</div>
      </>)}

      {loading && !data && <div style={{ textAlign: "center", padding: "140px 20px", color: T.textMuted }}>
        <div style={{ width: 56, height: 56, border: `4px solid ${T.border}`, borderTop: `4px solid ${T.blue}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 24px" }} />
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>One mo. Just having a look at the data on Smartsheet.</div>
        <div style={{ fontSize: 13, color: T.textDim }}>This usually takes a few seconds…</div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>}
    </div>
  </>);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = {
  container: { maxWidth: 1440, margin: "0 auto", padding: "28px 28px 48px" },
  header: { textAlign: "center", marginBottom: 28 },
  title: { fontSize: 32, fontWeight: 800, color: T.text, letterSpacing: -0.5 },
  subtitle: { color: T.textMuted, fontSize: 13, marginTop: 6, display: "flex", justifyContent: "center", alignItems: "center", gap: 12 },
  accentBtn: { background: T.accent, color: T.text, border: "none", borderRadius: 6, padding: "6px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3 },
  refreshBtn: { background: T.bgHover, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  errorBox: { background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 10, padding: 20, marginBottom: 24, color: T.red, fontSize: 14 },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 },
  kpiCard: { background: T.bgCard, borderRadius: 10, padding: 16, border: `1px solid ${T.border}` },
  kpiLabel: { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: T.textDim, marginBottom: 4 },
  kpiValue: { fontSize: 26, fontWeight: 900 },
  kpiDetail: { fontSize: 11, color: T.textDim, marginTop: 2 },
  execKpi: { background: T.bgCard, borderRadius: 10, padding: "18px 14px 14px", border: `1px solid ${T.border}`, textAlign: "center" },
  execLabel: { fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2, color: T.textDim, marginBottom: 8 },
  execValue: { fontSize: 28, fontWeight: 900, lineHeight: 1 },
  execSub: { fontSize: 10, color: T.textDim, marginTop: 8 },
  chartRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  section: { background: T.bgCard, borderRadius: 10, padding: 22, border: `1px solid ${T.border}` },
  sectionTitle: { fontSize: 15, fontWeight: 800, color: T.text, margin: 0, letterSpacing: -0.3 },
  barRow: { display: "flex", alignItems: "center", marginBottom: 6 },
  barLabel: { width: 120, fontSize: 12, fontWeight: 500, color: T.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  barTrack: { flex: 1, height: 18, background: T.bgHover, borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4, transition: "width 0.5s ease" },
  barValue: { width: 80, textAlign: "right", fontSize: 12, fontWeight: 600, paddingLeft: 8 },
  filterBar: { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" },
  filterInput: { padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, background: T.bgCard, color: T.text },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", padding: "8px 8px", fontWeight: 700, color: T.textDim, borderBottom: `2px solid ${T.borderDark}`, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" },
  td: { padding: "7px 8px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", fontSize: 12 },
  matrixTh: { padding: "4px 4px 20px", fontSize: 10, fontWeight: 600, color: T.textDim, textAlign: "center", borderBottom: `2px solid ${T.borderDark}`, verticalAlign: "bottom", height: 60 },
  footer: { textAlign: "center", color: T.textDim, fontSize: 11, marginTop: 32, letterSpacing: 0.3 },
};
