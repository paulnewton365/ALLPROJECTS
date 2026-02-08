"use client";
import { useState, useEffect, useMemo, useCallback } from "react";

// ---------------------------------------------------------------------------
// Antenna Group Brand — Warm Cream Editorial
// ---------------------------------------------------------------------------
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
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (n) => "$" + Math.round(Number(n) || 0).toLocaleString();
const fmtK = (n) => { n = Number(n) || 0; return n >= 1000000 ? "$" + (n / 1000000).toFixed(1) + "M" : n >= 1000 ? "$" + (n / 1000).toFixed(0) + "K" : fmt(n); };
const pct = (n) => n != null && !isNaN(n) ? `${Math.round(n)}%` : "-";

const RAG = {
  green: { bg: "#e8f5e9", text: "#2e7d32", dot: "#4caf50", label: "Green" },
  yellow: { bg: "#fff8e1", text: "#f57f17", dot: "#ffc107", label: "Yellow" },
  red: { bg: "#ffebee", text: "#c62828", dot: "#f44336", label: "Red" },
  blue: { bg: "#e3f2fd", text: "#1565c0", dot: "#2196f3", label: "Blue" },
  unknown: { bg: "#f5f5f5", text: "#9e9e9e", dot: "#bdbdbd", label: "Unset" },
};

const ECO_COLORS = { Climate: T.green, "Real Estate": T.blue, Health: T.pink, "Public Affairs": T.purple, HOWL: T.orange };
const STAGE_COLORS = { "In Qualification": "#7c5cbf", Proposal: "#5b6abf", "Waiting For Response": "#3b73c4", "Working On Contract": "#2a8f4e", "On Hold": "#9a9a9a" };
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
    <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: `2px solid ${T.border}` }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: "12px 22px", border: "none", background: active === t.key ? T.bgCard : "transparent", cursor: "pointer",
          fontSize: 13, fontWeight: active === t.key ? 700 : 500, letterSpacing: 0.2,
          color: active === t.key ? T.text : T.textMuted,
          borderBottom: active === t.key ? `2px solid ${T.text}` : "2px solid transparent",
          borderRadius: active === t.key ? "8px 8px 0 0" : 0, marginBottom: -2,
        }}>{t.label}{t.count != null ? ` (${t.count})` : ""}</button>
      ))}
    </div>
  );
}

function RAGBar({ status }) {
  const total = Object.values(status).reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: "flex", gap: 24, marginBottom: 20, background: T.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${T.border}`, flexWrap: "wrap", alignItems: "center" }}>
      {["green", "yellow", "red", "blue"].map((k) => !status[k] ? null : (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: RAG[k].dot, border: "2px solid #fff", boxShadow: `0 0 0 1px ${RAG[k].dot}` }} />
          <div><div style={{ fontSize: 22, fontWeight: 800 }}>{status[k]}</div><div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>{RAG[k].label}</div></div>
        </div>
      ))}
      <div style={{ marginLeft: "auto", fontSize: 12, color: T.textDim }}>{total} projects</div>
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
function ExecKPIStrip({ live, newbiz }) {
  const net = live.financials.total_overage - live.financials.total_investment;
  const woc = newbiz.pipeline_funnel.find((s) => s.stage === "Working On Contract") || { forecast: 0, count: 0 };
  return (
    <div className="exec-kpi-strip" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
      {[
        { label: "Live Revenue", value: fmtK(live.financials.total_budget), color: T.text, sub: `${live.count} projects` },
        { label: "Burn Rate", value: `${live.financials.burn_rate_pct}%`, color: burnColor(live.financials.burn_rate_pct), sub: `${fmtK(live.financials.total_actuals)} spent` },
        { label: "Net Overservice", value: fmtK(net), color: net > 0 ? T.red : T.green, sub: `${live.financials.overserviced_count} projects (${fmtK(live.financials.total_investment)} invested)` },
        { label: "Weighted Pipeline", value: fmtK(newbiz.weighted_pipeline), color: T.orange, sub: `${fmtK(newbiz.total_forecast)} unweighted` },
        { label: "Near Close", value: fmtK(woc.forecast), color: T.green, sub: `${woc.count} deals working on contract` },
      ].map((kpi) => (
        <div key={kpi.label} style={s.execKpi}>
          <div style={s.execLabel}>{kpi.label}</div>
          <div style={{ ...s.execValue, color: kpi.color }}>{kpi.value}</div>
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
  if (!history?.length || history.length < 2) {
    return <div style={{ color: T.textDim, padding: 20, textAlign: "center", fontSize: 13 }}>
      {history?.length === 1 ? "First data point logged. Trend chart will appear after next week's snapshot." : "Logging first data point..."}
    </div>;
  }

  const W = 680, H = 180, PX = 50, PY = 20;
  const metrics = [
    { key: "live_revenue", label: "Live Revenue", color: T.text },
    { key: "net_overservice", label: "Net Overservice", color: T.red },
    { key: "weighted_pipeline", label: "Wtd Pipeline", color: T.orange },
  ];

  const allVals = history.flatMap((h) => metrics.map((m) => h[m.key] || 0));
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 1);
  const range = maxV - minV || 1;

  const xStep = history.length > 1 ? (W - PX * 2) / (history.length - 1) : 0;
  const yScale = (v) => PY + (H - PY * 2) * (1 - (v - minV) / range);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H + 30} style={{ display: "block" }}>
        {/* Zero line if range crosses zero */}
        {minV < 0 && maxV > 0 && <line x1={PX} x2={W - PX} y1={yScale(0)} y2={yScale(0)} stroke={T.border} strokeDasharray="4,4" />}
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = PY + (H - PY * 2) * (1 - f);
          const val = minV + range * f;
          return <g key={f}><line x1={PX} x2={W - PX} y1={y} y2={y} stroke={T.border} strokeWidth={0.5} /><text x={PX - 6} y={y + 4} textAnchor="end" fontSize={9} fill={T.textDim}>{fmtK(val)}</text></g>;
        })}
        {/* Lines */}
        {metrics.map((m) => {
          const points = history.map((h, i) => `${PX + i * xStep},${yScale(h[m.key] || 0)}`).join(" ");
          return <polyline key={m.key} points={points} fill="none" stroke={m.color} strokeWidth={2} />;
        })}
        {/* Dots on last point */}
        {metrics.map((m) => {
          const last = history[history.length - 1];
          const x = PX + (history.length - 1) * xStep;
          const y = yScale(last[m.key] || 0);
          return <circle key={m.key + "-dot"} cx={x} cy={y} r={4} fill={m.color} />;
        })}
        {/* X axis labels */}
        {history.map((h, i) => {
          if (history.length > 8 && i % Math.ceil(history.length / 8) !== 0 && i !== history.length - 1) return null;
          return <text key={i} x={PX + i * xStep} y={H + 10} textAnchor="middle" fontSize={9} fill={T.textDim}>{h.date.slice(5)}</text>;
        })}
      </svg>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 4 }}>
        {metrics.map((m) => <span key={m.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.textMuted }}><span style={{ width: 12, height: 3, background: m.color, borderRadius: 2 }} />{m.label}</span>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Treemap
// ---------------------------------------------------------------------------
function EcosystemTreemap({ ecosystems }) {
  if (!ecosystems?.length) return null;
  const total = ecosystems.reduce((a, e) => a + e.budget, 0) || 1;
  const rows = []; let cur = [], rowB = 0;
  const target = total / Math.ceil(Math.sqrt(ecosystems.length));
  for (const eco of ecosystems) { cur.push(eco); rowB += eco.budget; if (rowB >= target) { rows.push({ items: cur, budget: rowB }); cur = []; rowB = 0; } }
  if (cur.length) rows.push({ items: cur, budget: rowB });
  return (
    <div style={{ minHeight: 180 }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", height: `${Math.max((row.budget / total) * 220, 70)}px`, marginBottom: 3 }}>
          {row.items.map((eco, ci) => {
            const pctW = row.budget > 0 ? (eco.budget / row.budget) * 100 : 100 / row.items.length;
            const bg = burnColor(eco.burn_rate);
            const ryCnt = (eco.rag?.red || 0) + (eco.rag?.yellow || 0);
            return (
              <div className="treemap-cell" key={ci} title={`${eco.name}\nBudget: ${fmt(eco.budget)}\nBurn: ${eco.burn_rate}%\nOverage: ${fmt(eco.overage)}`} style={{
                width: `${pctW}%`, marginRight: 3, borderRadius: 10, background: `linear-gradient(135deg, ${bg}, ${bg}cc)`,
                padding: "10px 14px", display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: "default", transition: "filter 0.15s", overflow: "hidden",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>{eco.name}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{fmtK(eco.budget)}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>{eco.burn_rate}% burn</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }}>{eco.projects}p{ryCnt > 0 ? ` ⚠${ryCnt}` : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, color: T.textDim }}>
        {[["≤50%", T.green], ["≤70%", "#6a9e2a"], ["≤85%", T.yellow], ["≤95%", T.orange], [">95%", T.red]].map(([l, c]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c, border: `2px solid ${T.bgCard}`, boxShadow: `0 0 0 1px ${c}` }} />{l}</span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked Pipeline
// ---------------------------------------------------------------------------
function StackedPipeline({ data, displayNames }) {
  if (!data?.length) return <div style={{ color: T.textDim, padding: 20 }}>No pipeline data</div>;
  const maxW = Math.max(...data.map((e) => e.total_weighted), 1);
  return (
    <div>
      {data.map((eco) => (
        <div key={eco.ecosystem} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 110, fontSize: 12, fontWeight: 600, color: ECO_COLORS[eco.ecosystem] || T.textMuted }}>{eco.ecosystem}</div>
          <div style={{ flex: 1, height: 28, background: T.bgHover, borderRadius: 6, overflow: "hidden", display: "flex" }}>
            {eco.stages.filter((st) => st.weighted > 0).map((st) => {
              const sn = stageName(st.stage, displayNames);
              return <div key={st.stage} title={`${sn}: ${st.count} deals, ${fmtK(st.weighted)} wtd`} style={{ width: `${(st.weighted / maxW) * 100}%`, background: STAGE_COLORS[sn] || T.textDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", minWidth: 4, borderRight: "1px solid rgba(255,255,255,0.3)" }}>{(st.weighted / maxW) * 100 > 8 ? st.count : ""}</div>;
            })}
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
function BubbleMatrix({ matrix, billable }) {
  if (!matrix?.ecosystems?.length) return <div style={{ color: T.textDim, padding: 20 }}>No data</div>;
  const lower = (billable || []).map((e) => e.toLowerCase());
  const ecoIdxs = matrix.ecosystems.map((e, i) => ({ name: e, idx: i })).filter((e) => lower.some((b) => e.name.toLowerCase().includes(b)));
  if (!ecoIdxs.length) return <div style={{ color: T.textDim, padding: 20 }}>No billable ecosystem data</div>;
  const rtTotals = matrix.requestTypes.map((rt, ci) => ({ name: rt, idx: ci, total: ecoIdxs.reduce((sum, e) => sum + matrix.cells[e.idx][ci].count, 0) })).sort((a, b) => b.total - a.total);
  const topRT = rtTotals.filter((r) => r.total > 0).slice(0, 10);
  const maxCount = Math.max(...ecoIdxs.flatMap((e) => topRT.map((rt) => matrix.cells[e.idx][rt.idx].count)), 1);
  const maxBudget = Math.max(...ecoIdxs.flatMap((e) => topRT.map((rt) => matrix.cells[e.idx][rt.idx].budget)), 1);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>
          <th style={{ ...s.matrixTh, textAlign: "left", width: 100 }}>Ecosystem</th>
          {topRT.map((rt) => <th key={rt.name} style={s.matrixTh} title={rt.name}><div style={{ transform: "rotate(-45deg)", transformOrigin: "left bottom", whiteSpace: "nowrap", fontSize: 10, fontWeight: 600, color: T.textMuted }}>{rt.name.length > 14 ? rt.name.slice(0, 12) + "…" : rt.name}</div></th>)}
        </tr></thead>
        <tbody>{ecoIdxs.map((eco) => (
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
        ))}</tbody>
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
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ fontSize: 11, color: T.textDim }}>{eco.deal_count} deals</span>
          {eco.avg_win_pct != null && <span style={{ fontSize: 14, fontWeight: 700, color: eco.avg_win_pct >= 50 ? T.green : eco.avg_win_pct >= 25 ? T.yellow : T.red }}>{eco.avg_win_pct}% avg win</span>}
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

function PillChart({ data, colorMap }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  const cols = [T.blue, T.purple, T.pink, T.orange, T.green, T.textDim, T.red, T.teal];
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (<div>
    <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>{entries.map(([k, c], i) => <div key={k} style={{ width: `${(c / total) * 100}%`, background: colorMap?.[k] || cols[i % cols.length], minWidth: c > 0 ? 3 : 0 }} title={`${k}: ${c}`} />)}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>{entries.map(([k, c], i) => <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}><div style={{ width: 8, height: 8, borderRadius: 3, background: colorMap?.[k] || cols[i % cols.length] }} /><span style={{ color: T.textMuted }}>{k}</span><span style={{ fontWeight: 600 }}>{c}</span></div>)}</div>
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
  const [tab, setTab] = useState("overview");
  const [history, setHistory] = useState([]);

  async function loadData() {
    setLoading(true);
    try {
      const [snapRes, histRes] = await Promise.all([
        fetch("/api/snapshot", { cache: "no-store" }),
        fetch("/api/history", { cache: "no-store" }).catch(() => ({ json: () => ({ history: [] }) })),
      ]);
      const snap = await snapRes.json();
      const hist = await histRes.json();
      if (snap.error) throw new Error(snap.error);
      setData(snap); setHistory(hist.history || []); setError(null);
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
    <div style={s.container}>
      <div style={s.header}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 4, color: T.textMuted, textTransform: "uppercase", marginBottom: 4 }}><img src="https://ktuyiikwhspwmzvyczit.supabase.co/storage/v1/object/public/assets/brand/antenna-new-logo.svg" alt="Antenna Group" style={{ height: 28, marginBottom: 4 }} /></div>
        <h1 style={s.title}>{d?.title || "Antenna Group — All Projects Dashboard"}</h1>
        <div style={s.subtitle}>
          <span>{d ? `${d.total_projects} active projects` : ""}</span>
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
        ]} active={tab} onChange={setTab} />

        {/* ============ EXECUTIVE OVERVIEW ============ */}
        {tab === "overview" && (<>
          <ExecKPIStrip live={d.live} newbiz={d.newbiz} />
          <Section title="Weekly Trends" subtitle="Live Revenue · Net Overservice · Weighted Pipeline"><TrendChart history={history} /></Section>
          <div style={{ height: 16 }} />
          <div className="chart-row" style={s.chartRow}>
            <Section title="Revenue by Ecosystem" subtitle="Size = budget · Color = burn rate"><EcosystemTreemap ecosystems={liveEcoBillable} /></Section>
            <Section title="Overservice Exposure" subtitle="FTC · Dashed = investment offset"><DivergingOverservice ecosystems={liveEcoBillable} /></Section>
          </div>
          <div className="chart-row" style={s.chartRow}>
            <Section title="Weighted Pipeline by Ecosystem" subtitle="Stacked by stage"><StackedPipeline data={nbEcoPipeline} displayNames={dn} /></Section>
            <Section title="Service Mix by Ecosystem" subtitle="Size = projects · Opacity = budget"><BubbleMatrix matrix={d.live.ecosystem_request_type} billable={billable} /></Section>
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
          <AIInsights />
        </>)}

        {/* ============ LIVE WORK ============ */}
        {tab === "live" && (<>
          <RAGBar status={d.live.status} />
          <div className="kpi-grid" style={s.kpiGrid}>
            <KPI label="Total Budget" value={fmtK(d.live.financials.total_budget)} />
            <KPI label="Actuals" value={fmtK(d.live.financials.total_actuals)} detail={`${d.live.financials.tracked_projects} tracked`} />
            <KPI label="Burn Rate" value={`${d.live.financials.burn_rate_pct}%`} color={burnColor(d.live.financials.burn_rate_pct)} />
            <KPI label="Forecast Overage" value={fmtK(d.live.financials.total_overage)} color={d.live.financials.total_overage > 0 ? T.red : T.green} />
            <KPI label="OOP" value={fmtK(d.live.financials.total_oop)} />
            <KPI label="Overserviced" value={d.live.financials.overserviced_count} detail={fmtK(d.live.financials.overserviced_amount)} color={d.live.financials.overserviced_count > 0 ? T.red : T.green} />
            <KPI label="Investment" value={fmtK(d.live.financials.total_investment)} />
            <KPI label="Missing Time" value={fmtK(d.live.financials.missing_time_total)} color={d.live.financials.missing_time_total > 5000 ? T.yellow : T.green} />
          </div>
          <div className="chart-row" style={s.chartRow}>
            <Section title="Budget by Ecosystem" subtitle="Billable P&Ls"><BarChart data={liveEcoBillable} labelKey="name" valueKey="budget" color={T.text} formatValue={fmtK} /></Section>
            <Section title="Overage by Ecosystem" subtitle="Billable P&Ls"><BarChart data={liveEcoBillable.filter((e) => e.overage !== 0).sort((a,b) => b.overage - a.overage)} labelKey="name" valueKey="overage" color={(i) => i.overage > 0 ? T.red : T.green} formatValue={fmtK} /></Section>
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
          <div className="chart-row" style={s.chartRow}>
            <Section title="Work Progress"><PillChart data={d.live.work_progress} /></Section>
            <Section title="Resource Status"><PillChart data={d.live.resource_status} /></Section>
          </div>
          <Section title="Live Projects" subtitle="Billable ecosystems · Sorted by overage"><DataTable data={liveProjectsBillable} columns={mkLiveCols(dn)} /></Section>
        </>)}

        {/* ============ RED LIST ============ */}
        {tab === "redlist" && (<>
          {(() => {
            const reds = d.live.projects.filter((p) => p.rag_color === "red").sort((a, b) => b.overage - a.overage);
            const totalOverage = reds.reduce((sum, p) => sum + (p.overage || 0), 0);
            const totalBudget = reds.reduce((sum, p) => sum + (p.budget_forecast || 0), 0);
            const totalActuals = reds.reduce((sum, p) => sum + (typeof p.actuals_display === "number" ? p.actuals_display : 0), 0);

            // By ecosystem
            const byEco = {}; reds.forEach((p) => { const e = p.ecosystem || "Unassigned"; byEco[e] = byEco[e] || { count: 0, overage: 0, budget: 0 }; byEco[e].count++; byEco[e].overage += p.overage || 0; byEco[e].budget += p.budget_forecast || 0; });
            const ecoEntries = Object.entries(byEco).sort((a, b) => b[1].overage - a[1].overage);

            // By client
            const byClient = {}; reds.forEach((p) => { const c = p.client_name || "Unknown"; byClient[c] = byClient[c] || { count: 0, overage: 0 }; byClient[c].count++; byClient[c].overage += p.overage || 0; });
            const clientEntries = Object.entries(byClient).sort((a, b) => b[1].overage - a[1].overage);

            // By service type
            const bySvc = {}; reds.forEach((p) => { const svc = p.request_type || "Unspecified"; svc.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => { bySvc[s] = (bySvc[s] || 0) + 1; }); });
            const svcEntries = Object.entries(bySvc).sort((a, b) => b[1] - a[1]);

            const maxClientOv = Math.max(...clientEntries.map(([, v]) => v.overage), 1);
            const maxEcoOv = Math.max(...ecoEntries.map(([, v]) => v.overage), 1);

            if (!reds.length) return <div style={{ textAlign: "center", padding: 60, color: T.green, fontSize: 18, fontWeight: 700 }}>✓ No projects on the Red List</div>;

            return (<>
              {/* KPI Strip */}
              <div className="exec-kpi-strip" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
                <div style={s.execKpi}><div style={s.execLabel}>Red Projects</div><div style={{ ...s.execValue, color: T.red }}>{reds.length}</div><div style={s.execSub}>of {d.live.count} live projects ({Math.round((reds.length / d.live.count) * 100)}%)</div></div>
                <div style={s.execKpi}><div style={s.execLabel}>Total Overage</div><div style={{ ...s.execValue, color: T.red }}>{fmtK(totalOverage)}</div><div style={s.execSub}>forecast overservice</div></div>
                <div style={s.execKpi}><div style={s.execLabel}>Budget at Risk</div><div style={{ ...s.execValue, color: T.text }}>{fmtK(totalBudget)}</div><div style={s.execSub}>{fmtK(totalActuals)} spent to date</div></div>
                <div style={s.execKpi}><div style={s.execLabel}>Avg Overage</div><div style={{ ...s.execValue, color: T.red }}>{fmtK(totalOverage / reds.length)}</div><div style={s.execSub}>per red project</div></div>
              </div>

              <div className="chart-row" style={s.chartRow}>
                {/* Ecosystem Concentration */}
                <Section title="Overservice by Ecosystem" subtitle="Where red projects are concentrated">
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                    {/* Donut */}
                    <svg width={160} height={160} viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
                      {(() => {
                        const total = ecoEntries.reduce((s, [, v]) => s + v.overage, 0) || 1;
                        let cumAngle = -90;
                        return ecoEntries.map(([name, v], i) => {
                          const pctVal = v.overage / total;
                          const angle = pctVal * 360;
                          const startRad = (cumAngle * Math.PI) / 180;
                          const endRad = ((cumAngle + angle) * Math.PI) / 180;
                          cumAngle += angle;
                          const large = angle > 180 ? 1 : 0;
                          const r = 65, cx = 80, cy = 80;
                          const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad);
                          const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad);
                          return <path key={name} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`} fill={ECO_COLORS[name] || [T.teal, T.orange, T.purple, T.textDim][i % 4]} opacity={0.85}><title>{name}: {fmtK(v.overage)} ({Math.round(pctVal * 100)}%)</title></path>;
                        });
                      })()}
                      <circle cx={80} cy={80} r={35} fill={T.bgCard} />
                      <text x={80} y={76} textAnchor="middle" fontSize="18" fontWeight="900" fill={T.red}>{reds.length}</text>
                      <text x={80} y={92} textAnchor="middle" fontSize="9" fill={T.textDim}>projects</text>
                    </svg>
                    {/* Legend + detail */}
                    <div style={{ flex: 1 }}>
                      {ecoEntries.map(([name, v]) => (
                        <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: ECO_COLORS[name] || T.textDim, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: ECO_COLORS[name] || T.textMuted }}>{name}</div>
                            <div style={{ height: 8, background: T.bgHover, borderRadius: 4, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 4, background: T.red, width: `${(v.overage / maxEcoOv) * 100}%` }} /></div>
                          </div>
                          <div style={{ textAlign: "right", minWidth: 70 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: T.red }}>{fmtK(v.overage)}</div>
                            <div style={{ fontSize: 10, color: T.textDim }}>{v.count} project{v.count !== 1 ? "s" : ""}</div>
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
                </Section>

                {/* Overage Distribution */}
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

              {/* Red Projects Table */}
              <Section title="Red List Projects" subtitle="Sorted by overage · highest first">
                <DataTable data={reds} columns={[
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
            <Section title="Weighted Pipeline by Ecosystem" subtitle="Climate · Health · Real Estate · Public Affairs"><StackedPipeline data={nbEcoPipeline} displayNames={dn} /></Section>
          </div>
          <div className="chart-row" style={s.chartRow}>
            <Section title="Qualification Recommendation" subtitle="% of pipeline">{(() => { const total = Object.values(d.newbiz.by_recommendation).reduce((a, b) => a + b, 0) || 1; return (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>{Object.entries(d.newbiz.by_recommendation).sort((a, b) => b[1] - a[1]).map(([key, count]) => {
                const pctVal = Math.round((count / total) * 100); const color = key === "PROCEED" ? T.green : key === "DECLINE" ? T.red : T.textDim;
                return <div key={key} style={{ textAlign: "center", padding: "14px 20px", borderRadius: 10, background: T.bgHover, border: `1px solid ${T.border}`, flex: 1, minWidth: 90 }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color }}>{pctVal}%</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2 }}>{key}</div>
                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{count} deals</div>
                </div>; })}</div>); })()}</Section>
            <Section title="Data Completeness" subtitle="Pipeline data quality">
              <DataCompleteness data={d.newbiz.data_completeness} />
              {(() => {
                const nbProjects = d.newbiz.projects;
                const untracked = nbProjects.filter((p) => p.actuals_display === "No Tracking");
                const pctUntracked = nbProjects.length ? Math.round((untracked.length / nbProjects.length) * 100) : 0;
                return (
                  <div style={{ marginTop: 16, padding: "12px 14px", background: pctUntracked > 50 ? "#ffebee" : T.bgHover, borderRadius: 8, border: `1px solid ${pctUntracked > 50 ? "#ef9a9a" : T.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Pursuit Effort Not Tracked</div>
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{untracked.length} of {nbProjects.length} opportunities have no actuals tracking</div>
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
            { key: "actuals_display", label: "Actuals", w: 90, render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12, color: v === "No Tracking" ? T.textDim : T.text }}>{typeof v === "number" ? fmtK(v) : v}</span> },
            { key: "percent_complete", label: "% Done", w: 70, render: (v) => <span style={{ fontSize: 12, color: T.textMuted }}>{pct(v)}</span> },
            { key: "project_manager", label: "PM/Prod", w: 120, filter: true },
          ]} /></Section>
        </>); })()}
        </>)}

        <div style={s.footer}>Generated {new Date(d.generated_at).toLocaleString()}</div>
      </>)}

      {loading && !data && <div style={{ textAlign: "center", padding: 80, color: T.textDim }}><div style={{ fontSize: 28, marginBottom: 12, animation: "spin 1s linear infinite" }}>⟳</div>Loading from Smartsheet...</div>}
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
