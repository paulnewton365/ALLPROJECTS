"use client";
import { useState, useEffect, useMemo } from "react";

// ---------------------------------------------------------------------------
// Antenna Group Brand Theme
// ---------------------------------------------------------------------------
const T = {
  bg: "#0b0b10", bgCard: "#141419", bgCardAlt: "#1a1a22", bgHover: "#22222d",
  border: "#2a2a35", borderLight: "#1e1e28",
  text: "#f0f0f4", textMuted: "#8b8b9e", textDim: "#5e5e72",
  accent: "#c8f549", accentDim: "#a4cc2e", // Antenna lime-green
  blue: "#5b9cf6", purple: "#a78bfa", pink: "#f472b6", orange: "#fb923c",
  red: "#f87171", green: "#4ade80", yellow: "#facc15", teal: "#2dd4bf",
};

const GLOBAL_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${T.bg}; color: ${T.text}; }
  ::selection { background: ${T.accent}; color: ${T.bg}; }
  .treemap-cell:hover { filter: brightness(1.15) !important; }
  input, select { color-scheme: dark; }
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
  green: { bg: "#16453480", text: "#4ade80", dot: "#4ade80", label: "Green" },
  yellow: { bg: "#85500e80", text: "#facc15", dot: "#facc15", label: "Yellow" },
  red: { bg: "#991b1b80", text: "#f87171", dot: "#f87171", label: "Red" },
  blue: { bg: "#1e40af80", text: "#60a5fa", dot: "#60a5fa", label: "Blue" },
  unknown: { bg: "#2a2a3580", text: "#5e5e72", dot: "#5e5e72", label: "Unset" },
};

const ECO_COLORS = { "Climate": T.green, "Real Estate": T.blue, "Health": T.pink, "Public Affairs": T.purple, "HOWL": T.orange };
const STAGE_COLORS = { "In Qualification": "#a78bfa", "Proposal": "#818cf8", "Waiting For Response": "#60a5fa", "Working On Contract": "#4ade80", "On Hold": "#5e5e72" };

function burnColor(rate) {
  if (rate <= 50) return T.green;
  if (rate <= 70) return "#84cc16";
  if (rate <= 85) return T.yellow;
  if (rate <= 95) return T.orange;
  return T.red;
}

function stageName(raw, displayNames) { return displayNames?.[raw] || raw; }

// Filter to billable ecosystems only
function billableOnly(arr, ecosystems, key = "name") {
  if (!ecosystems?.length) return arr;
  const lower = ecosystems.map((e) => e.toLowerCase());
  return arr.filter((item) => lower.some((e) => (item[key] || "").toLowerCase().includes(e)));
}

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
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: c.bg, color: c.text }}>{label}</span>;
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: `1px solid ${T.border}` }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: "12px 20px", border: "none", background: "transparent", cursor: "pointer",
          fontSize: 13, fontWeight: active === t.key ? 700 : 500,
          color: active === t.key ? T.accent : T.textMuted,
          borderBottom: active === t.key ? `2px solid ${T.accent}` : "2px solid transparent",
          marginBottom: -1, letterSpacing: 0.3,
        }}>{t.label}{t.count != null ? ` (${t.count})` : ""}</button>
      ))}
    </div>
  );
}

function RAGBar({ status }) {
  const total = Object.values(status).reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: "flex", gap: 24, marginBottom: 20, background: T.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${T.border}`, flexWrap: "wrap", alignItems: "center" }}>
      {["green", "yellow", "red", "blue"].map((k) => {
        if (!status[k]) return null;
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: RAG[k].dot }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: RAG[k].text }}>{status[k]}</div>
              <div style={{ fontSize: 11, color: T.textDim }}>{RAG[k].label}</div>
            </div>
          </div>
        );
      })}
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
    <div className="exec-kpi-strip" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
      {[
        { label: "Live Revenue", value: fmtK(live.financials.total_budget), color: T.accent, sub: `${live.count} projects` },
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
    <div style={{ minHeight: 200 }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", height: `${Math.max((row.budget / total) * 220, 60)}px`, marginBottom: 3 }}>
          {row.items.map((eco, ci) => {
            const pctW = row.budget > 0 ? (eco.budget / row.budget) * 100 : 100 / row.items.length;
            const bg = burnColor(eco.burn_rate);
            const ryCnt = (eco.rag?.red || 0) + (eco.rag?.yellow || 0);
            return (
              <div className="treemap-cell" key={ci} title={`${eco.name}\nBudget: ${fmt(eco.budget)}\nBurn: ${eco.burn_rate}%\nOverage: ${fmt(eco.overage)}`} style={{
                width: `${pctW}%`, marginRight: 3, borderRadius: 10, background: `linear-gradient(135deg, ${bg}cc, ${bg}77)`,
                padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: "default", transition: "filter 0.15s", overflow: "hidden",
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{eco.name}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{fmtK(eco.budget)}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{eco.burn_rate}% burn</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{eco.projects}p</span>
                    {ryCnt > 0 && <span style={{ fontSize: 10, background: "rgba(248,113,113,0.6)", color: "#fff", borderRadius: 4, padding: "1px 4px" }}>⚠{ryCnt}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10, color: T.textDim }}>
        <span>Size = budget</span><span>Color = burn rate:</span>
        {[["≤50%", T.green], ["≤70%", "#84cc16"], ["≤85%", T.yellow], ["≤95%", T.orange], [">95%", T.red]].map(([l, c]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: c }} />{l}</span>
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
          <div style={{ width: 110, fontSize: 12, fontWeight: 600, color: ECO_COLORS[eco.ecosystem] || T.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{eco.ecosystem}</div>
          <div style={{ flex: 1, height: 30, background: T.bgCardAlt, borderRadius: 6, overflow: "hidden", display: "flex" }}>
            {eco.stages.filter((st) => st.weighted > 0).map((st) => {
              const sn = stageName(st.stage, displayNames);
              return (
                <div key={st.stage} title={`${sn}: ${st.count} deals, ${fmtK(st.weighted)} wtd`} style={{
                  width: `${(st.weighted / maxW) * 100}%`, background: STAGE_COLORS[sn] || T.textDim,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff",
                  minWidth: st.weighted > 0 ? 4 : 0, borderRight: "1px solid rgba(0,0,0,0.3)",
                }}>{(st.weighted / maxW) * 100 > 8 ? st.count : ""}</div>
              );
            })}
          </div>
          <div style={{ textAlign: "right", minWidth: 80 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{fmtK(eco.total_weighted)}</div>
            <div style={{ fontSize: 10, color: T.textDim }}>{fmtK(eco.total_forecast)} fcst</div>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, marginTop: 12, fontSize: 10, color: T.textDim, flexWrap: "wrap" }}>
        {Object.entries(STAGE_COLORS).map(([stage, color]) => (
          <span key={stage} style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: color }} />{stage}</span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diverging Overservice
// ---------------------------------------------------------------------------
function DivergingOverservice({ ecosystems }) {
  if (!ecosystems?.length) return null;
  const data = ecosystems.filter((e) => e.overage !== 0 || e.investment > 0).sort((a, b) => b.overage - a.overage);
  if (!data.length) return <div style={{ color: T.textDim, padding: 20 }}>No overservice data</div>;
  const maxAbs = Math.max(...data.map((e) => Math.max(Math.abs(e.overage), Math.abs(e.overage - e.investment))), 1);
  const mid = 50;
  return (
    <div>
      {data.map((eco) => {
        const overPct = (eco.overage / maxAbs) * 45;
        const isOver = eco.overage > 0;
        return (
          <div key={eco.name} style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div style={{ width: 110, fontSize: 12, fontWeight: 600, textAlign: "right", paddingRight: 12, color: ECO_COLORS[eco.name] || T.textMuted, whiteSpace: "nowrap" }}>{eco.name}</div>
            <div style={{ flex: 1, height: 28, position: "relative" }}>
              <div style={{ position: "absolute", left: `${mid}%`, top: 0, bottom: 0, width: 1, background: T.border, zIndex: 2 }} />
              {isOver ? (
                <>
                  <div style={{ position: "absolute", left: `${mid}%`, top: 2, bottom: 2, borderRadius: "0 4px 4px 0", width: `${Math.min(Math.abs(overPct), 48)}%`, background: T.red + "bb" }} />
                  {eco.investment > 0 && <div style={{ position: "absolute", left: `${mid + Math.abs(overPct) - (eco.investment / maxAbs) * 45}%`, top: 0, bottom: 0, width: `${(eco.investment / maxAbs) * 45}%`, borderRight: `2px dashed ${T.green}`, zIndex: 3 }} />}
                </>
              ) : (
                <div style={{ position: "absolute", right: `${100 - mid}%`, top: 2, bottom: 2, borderRadius: "4px 0 0 4px", width: `${Math.min(Math.abs(overPct), 48)}%`, background: T.green + "bb" }} />
              )}
            </div>
            <div style={{ minWidth: 110, textAlign: "right" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: eco.overage > 0 ? T.red : T.green }}>{fmtK(eco.overage)}</span>
              {eco.investment > 0 && <span style={{ fontSize: 10, color: T.textDim, marginLeft: 4 }}>({fmtK(eco.investment)} inv)</span>}
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 10, color: T.textDim }}>
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
        <tbody>
          {ecoIdxs.map((eco) => (
            <tr key={eco.name}>
              <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, borderBottom: `1px solid ${T.border}`, color: ECO_COLORS[eco.name] || T.textMuted }}>{eco.name}</td>
              {topRT.map((rt) => {
                const cell = matrix.cells[eco.idx][rt.idx];
                if (!cell?.count) return <td key={rt.name} style={{ padding: 4, textAlign: "center", borderBottom: `1px solid ${T.border}` }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: T.border, margin: "0 auto" }} /></td>;
                const r = 6 + (cell.count / maxCount) * 16;
                const op = 0.3 + (cell.budget / maxBudget) * 0.7;
                return (
                  <td key={rt.name} style={{ padding: 4, textAlign: "center", borderBottom: `1px solid ${T.border}` }}>
                    <svg width={r * 2 + 4} height={r * 2 + 4} style={{ display: "block", margin: "0 auto" }}>
                      <circle cx={r + 2} cy={r + 2} r={r} fill={ECO_COLORS[eco.name] || T.blue} fillOpacity={op} />
                      {cell.count > 1 && <text x={r + 2} y={r + 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{cell.count}</text>}
                    </svg>
                    <div style={{ fontSize: 9, color: T.textDim, marginTop: 1 }}>{fmtK(cell.budget)}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10, color: T.textDim }}><span>Size = projects</span><span>Opacity = budget</span></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Win % and Services by Ecosystem (New Biz)
// ---------------------------------------------------------------------------
function EcoWinServices({ data, billable }) {
  const filtered = billableOnly(data, billable, "ecosystem");
  if (!filtered.length) return <div style={{ color: T.textDim, padding: 20 }}>No data</div>;
  return (
    <div>
      {filtered.map((eco) => (
        <div key={eco.ecosystem} style={{ marginBottom: 16, padding: "12px 14px", background: T.bgCardAlt, borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: ECO_COLORS[eco.ecosystem] || T.textMuted }}>{eco.ecosystem}</span>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T.textDim }}>{eco.deal_count} deals</span>
              {eco.avg_win_pct != null && (
                <span style={{ fontSize: 14, fontWeight: 700, color: eco.avg_win_pct >= 50 ? T.green : eco.avg_win_pct >= 25 ? T.yellow : T.red }}>{eco.avg_win_pct}% avg win</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {eco.services.slice(0, 8).map((svc) => (
              <span key={svc.name} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: `${ECO_COLORS[eco.ecosystem] || T.blue}33`, color: ECO_COLORS[eco.ecosystem] || T.blue, fontWeight: 600 }}>
                {svc.name} ({svc.count})
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Completeness (New Biz)
// ---------------------------------------------------------------------------
function DataCompleteness({ data }) {
  if (!data) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: data.pct_complete >= 80 ? T.green : data.pct_complete >= 50 ? T.yellow : T.red }}>{data.pct_complete}%</div>
        <div><div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Fully Complete</div><div style={{ fontSize: 11, color: T.textDim }}>{data.fully_complete} of {data.total} deals have all fields</div></div>
      </div>
      {data.by_field.map((f) => {
        const label = { budget_forecast: "Budget Forecast", win_probability: "Win Probability", recommendation: "Recommendation", request_type: "Request Type", ecosystem: "Ecosystem", project_manager: "PM/Lead" }[f.field] || f.field;
        return (
          <div key={f.field} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 110, fontSize: 11, fontWeight: 500, color: T.textMuted }}>{label}</div>
            <div style={{ flex: 1, height: 16, background: T.bgCardAlt, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, width: `${f.pct}%`, background: f.pct >= 80 ? T.green : f.pct >= 50 ? T.yellow : T.red, transition: "width 0.5s" }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: f.pct >= 80 ? T.green : f.pct >= 50 ? T.yellow : T.red, minWidth: 40, textAlign: "right" }}>{f.pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------
function BarChart({ data, labelKey, valueKey, color = T.blue, formatValue, limit = 12 }) {
  if (!data?.length) return <div style={{ color: T.textDim, padding: 12 }}>No data</div>;
  const sliced = data.slice(0, limit);
  const max = Math.max(...sliced.map((d) => Math.abs(Number(d[valueKey]) || 0)), 1);
  return (
    <div>
      {sliced.map((item, i) => {
        const val = Number(item[valueKey]) || 0;
        return (
          <div key={i} style={s.barRow}>
            <div style={s.barLabel} title={item[labelKey]}>{item[labelKey]}</div>
            <div style={s.barTrack}><div style={{ ...s.barFill, width: `${Math.min((Math.abs(val) / max) * 100, 100)}%`, background: typeof color === "function" ? color(item) : color }} /></div>
            <div style={{ ...s.barValue, color: val < 0 ? T.green : val > 0 && item.overserviced > 0 ? T.red : T.text }}>{formatValue ? formatValue(val, item) : val}</div>
          </div>
        );
      })}
    </div>
  );
}

function PillChart({ data, colorMap }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  const defCols = [T.blue, T.purple, T.pink, T.orange, T.green, T.textDim, T.red, T.teal];
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div style={{ display: "flex", height: 24, borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
        {entries.map(([k, c], i) => <div key={k} style={{ width: `${(c / total) * 100}%`, background: colorMap?.[k] || defCols[i % defCols.length], minWidth: c > 0 ? 3 : 0 }} title={`${k}: ${c}`} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        {entries.map(([k, c], i) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 3, background: colorMap?.[k] || defCols[i % defCols.length] }} />
            <span style={{ color: T.textDim }}>{k}</span><span style={{ fontWeight: 600, color: T.text }}>{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineFunnel({ funnel, displayNames }) {
  const maxCount = Math.max(...funnel.map((s) => s.count), 1);
  return (
    <div>
      {funnel.map((stage) => {
        const sn = stageName(stage.stage, displayNames);
        return (
          <div key={stage.stage} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, padding: "8px 0" }}>
            <div style={{ width: 150, fontSize: 12, fontWeight: 600, color: STAGE_COLORS[sn] || T.textDim }}>{sn}</div>
            <div style={{ flex: 1, height: 28, background: T.bgCardAlt, borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 6, width: `${(stage.count / maxCount) * 100}%`, background: STAGE_COLORS[sn] || T.textDim, display: "flex", alignItems: "center", paddingLeft: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{stage.count}</span>
              </div>
            </div>
            <div style={{ textAlign: "right", minWidth: 100 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{fmtK(stage.forecast)}</div>
              <div style={{ fontSize: 10, color: T.textDim }}>{fmtK(stage.weighted)} wtd</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Table
// ---------------------------------------------------------------------------
function DataTable({ data, columns, emptyMsg = "No projects" }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const filterCols = useMemo(() => columns.filter((c) => c.filter), [columns]);

  const filtered = useMemo(() => {
    let r = [...data];
    if (search) { const q = search.toLowerCase(); r = r.filter((p) => columns.some((c) => String(p[c.key] || "").toLowerCase().includes(q))); }
    for (const [key, val] of Object.entries(filters)) { if (val) r = r.filter((p) => String(p[key]) === val); }
    if (sortCol) r.sort((a, b) => { let av = a[sortCol], bv = b[sortCol]; if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av; return sortAsc ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? "")); });
    return r;
  }, [data, search, filters, sortCol, sortAsc, columns]);

  return (
    <>
      <div style={s.filterBar}>
        <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...s.filterInput, minWidth: 180 }} />
        {filterCols.map((col) => {
          const opts = [...new Set(data.map((p) => String(p[col.key])))].sort();
          return <select key={col.key} value={filters[col.key] || ""} onChange={(e) => setFilters({ ...filters, [col.key]: e.target.value })} style={s.filterInput}><option value="">All {col.label}</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
        })}
        <span style={{ marginLeft: "auto", fontSize: 12, color: T.textDim }}>{filtered.length} of {data.length}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead><tr>
            {columns.map((col) => <th key={col.key} style={{ ...s.th, minWidth: col.w || 80 }} onClick={() => { if (sortCol === col.key) setSortAsc(!sortAsc); else { setSortCol(col.key); setSortAsc(true); } }}>{col.label} {sortCol === col.key ? (sortAsc ? "▲" : "▼") : ""}</th>)}
          </tr></thead>
          <tbody>
            {filtered.map((p, i) => <tr key={i} style={i % 2 ? { background: T.bgCardAlt } : {}}>
              {columns.map((col) => <td key={col.key} style={{ ...s.td, ...(col.style || {}) }}>{col.render ? col.render(p[col.key], p) : (col.fmt ? col.fmt(p[col.key]) : (p[col.key] ?? "-"))}</td>)}
            </tr>)}
            {!filtered.length && <tr><td colSpan={columns.length} style={{ ...s.td, textAlign: "center", color: T.textDim, padding: 40 }}>{emptyMsg}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Column Defs
// ---------------------------------------------------------------------------
const mkLiveCols = (displayNames) => [
  { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "top_priority", label: "⚑", w: 30, render: (v) => v ? <span style={{ color: T.accent, fontWeight: 700 }}>★</span> : null },
  { key: "client_name", label: "Client", w: 120, filter: true, style: { fontWeight: 600 } },
  { key: "project_name", label: "Assignment", w: 200 },
  { key: "rag", label: "RAG", w: 65, filter: true, render: (v, p) => <Badge color={p.rag_color} label={v} /> },
  { key: "budget_forecast", label: "Budget", w: 90, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "actuals_display", label: "Actuals", w: 90, render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12, color: v === "No Tracking" ? T.textDim : T.text }}>{typeof v === "number" ? fmtK(v) : v}</span> },
  { key: "overage_display", label: "FTC", w: 90, render: (v, p) => { const n = p.overage; return <span style={{ fontFamily: "monospace", fontSize: 12, color: n > 0 ? T.red : n < 0 ? T.green : v === "No Tracking" ? T.textDim : T.text, fontWeight: n > 0 ? 700 : 400 }}>{typeof v === "number" ? fmtK(v) : v}</span>; } },
  { key: "percent_complete", label: "% Done", w: 60, render: (v) => <span style={{ fontSize: 12, color: T.textMuted }}>{pct(v)}</span> },
  { key: "project_manager", label: "PM/Prod", w: 110, filter: true },
  { key: "ecosystem", label: "Ecosystem", w: 85, filter: true, render: (v) => <span style={{ fontSize: 11, color: ECO_COLORS[v] || T.textMuted }}>{v}</span> },
  { key: "work_progress", label: "Progress", w: 100 },
];

const mkNewbizCols = (displayNames) => [
  { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "client_name", label: "Client", w: 130, filter: true, style: { fontWeight: 600 } },
  { key: "project_name", label: "Opportunity", w: 200 },
  { key: "workflow_status", label: "Stage", w: 130, filter: true, render: (v) => { const sn = stageName(v, displayNames); return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: `${STAGE_COLORS[sn] || T.textDim}33`, color: STAGE_COLORS[sn] || T.textDim, fontWeight: 600 }}>{sn}</span>; } },
  { key: "recommendation", label: "Rec", w: 90, filter: true, render: (v) => { const clean = (!v || v === "-" || v.toLowerCase() === "none") ? "Not Qualified" : v; return <span style={{ fontSize: 11, fontWeight: 700, color: clean === "PROCEED" ? T.green : clean === "DECLINE" ? T.red : T.textDim }}>{clean}</span>; } },
  { key: "budget_forecast", label: "Forecast", w: 100, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "win_probability", label: "Win %", w: 65, render: (v) => <span style={{ fontSize: 12, fontWeight: 600, color: v >= 75 ? T.green : v >= 50 ? T.yellow : v > 0 ? T.orange : T.textDim }}>{pct(v)}</span> },
  { key: "weighted_pipeline", label: "Weighted", w: 95, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "ecosystem", label: "Ecosystem", w: 85, filter: true, render: (v) => <span style={{ fontSize: 11, color: ECO_COLORS[v] || T.textMuted }}>{v}</span> },
  { key: "request_type", label: "Services", w: 180 },
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

  async function loadData() {
    setLoading(true);
    try { const res = await fetch("/api/snapshot", { cache: "no-store" }); const json = await res.json(); if (json.error) throw new Error(json.error); setData(json); setError(null); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadData(); }, []);
  const d = data;

  // Memoized filtered data
  const billable = d?.billable_ecosystems || [];
  const dn = d?.stage_display_names || {};
  const liveEcoBillable = useMemo(() => billableOnly(d?.live?.by_ecosystem || [], billable), [d, billable]);
  const nbEcoBillable = useMemo(() => billableOnly(d?.newbiz?.pipeline_by_ecosystem || [], billable, "ecosystem"), [d, billable]);
  const nbEcoWinBillable = useMemo(() => billableOnly(d?.newbiz?.eco_win_services || [], billable, "ecosystem"), [d, billable]);

  // Live projects: billable ecosystems only, sorted by overage desc
  const liveProjectsBillable = useMemo(() => {
    if (!d) return [];
    return d.live.projects
      .filter((p) => billable.some((b) => (p.ecosystem || "").toLowerCase().includes(b.toLowerCase())))
      .sort((a, b) => (b.overage || 0) - (a.overage || 0));
  }, [d, billable]);

  // New biz projects sorted by stage order
  const nbProjectsSorted = useMemo(() => {
    if (!d) return [];
    const order = d.pipeline_stage_order || [];
    return [...d.newbiz.projects].sort((a, b) => {
      const ai = order.indexOf(a.workflow_status); const bi = order.indexOf(b.workflow_status);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [d]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: T.accent, textTransform: "uppercase", marginBottom: 6 }}>Antenna Group</div>
          <h1 style={s.title}>{d?.title || "Project Snapshot"}</h1>
          <div style={s.subtitle}>
            <span>{d ? `${d.total_projects} active projects` : ""}</span>
            <button onClick={loadData} disabled={loading} style={s.refreshBtn}>{loading ? "Loading..." : "↻ Refresh"}</button>
          </div>
        </div>

        {error && <div style={s.errorBox}><strong>Error:</strong> {error}</div>}

        {d && (
          <>
            <Tabs tabs={[
              { key: "overview", label: "Executive Overview" },
              { key: "live", label: "Live Work", count: d.live.count },
              { key: "newbiz", label: "New Business", count: d.newbiz.count },
              { key: "internal", label: "Internal Projects", count: d.internal.count },
              { key: "projects", label: "All Projects" },
            ]} active={tab} onChange={setTab} />

            {/* ============================================================ */}
            {/* EXECUTIVE OVERVIEW */}
            {/* ============================================================ */}
            {tab === "overview" && (<>
              <ExecKPIStrip live={d.live} newbiz={d.newbiz} />

              <div className="chart-row" style={s.chartRow}>
                <Section title="Revenue by Ecosystem" subtitle="Billable P&Ls · Size = budget · Color = burn rate">
                  <EcosystemTreemap ecosystems={liveEcoBillable} />
                </Section>
                <Section title="Overservice Exposure" subtitle="Forecast to complete · Dashed = investment offset">
                  <DivergingOverservice ecosystems={liveEcoBillable} />
                </Section>
              </div>

              <div className="chart-row" style={s.chartRow}>
                <Section title="Weighted Pipeline by Ecosystem" subtitle="Stacked by stage · Win-probability weighted">
                  <StackedPipeline data={nbEcoBillable} displayNames={dn} />
                </Section>
                <Section title="Service Mix by Ecosystem" subtitle="Size = projects · Opacity = budget">
                  <BubbleMatrix matrix={d.live.ecosystem_request_type} billable={billable} />
                </Section>
              </div>

              <div className="chart-row" style={s.chartRow}>
                <Section title="Top Priority Projects" subtitle="Ordered by budget">
                  {(() => {
                    const tp = d.live.projects.filter((p) => p.top_priority).sort((a, b) => b.budget_forecast - a.budget_forecast);
                    if (!tp.length) return <div style={{ color: T.textDim, padding: 12 }}>No top priority projects flagged</div>;
                    return tp.map((p) => (
                      <div key={p.rid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                        <span style={{ color: T.accent, fontWeight: 700 }}>★</span>
                        <span style={{ fontFamily: "monospace", color: T.textDim }}>{p.rid}</span>
                        <span style={{ fontWeight: 600 }}>{p.client_name}</span>
                        <span style={{ flex: 1, color: T.textMuted }}>{p.project_name}</span>
                        <Badge color={p.rag_color} label={p.rag} />
                        <span style={{ fontFamily: "monospace", fontWeight: 600, minWidth: 60, textAlign: "right" }}>{fmtK(p.budget_forecast)}</span>
                      </div>
                    ));
                  })()}
                </Section>
                <Section title="Overservice Projects" subtitle="Ranked by forecast to complete">
                  {(() => {
                    const os = d.live.projects.filter((p) => p.overage > 0).sort((a, b) => b.overage - a.overage);
                    if (!os.length) return <div style={{ color: T.green, padding: 12 }}>✓ No overserviced projects</div>;
                    return os.slice(0, 12).map((p) => (
                      <div key={p.rid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                        <Badge color={p.rag_color} label={p.rag} />
                        <span style={{ fontFamily: "monospace", color: T.textDim }}>{p.rid}</span>
                        <span style={{ fontWeight: 600 }}>{p.client_name}</span>
                        <span style={{ flex: 1, color: T.textMuted }}>{p.project_name}</span>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.red, minWidth: 60, textAlign: "right" }}>{fmtK(p.overage)}</span>
                      </div>
                    ));
                  })()}
                </Section>
              </div>
            </>)}

            {/* ============================================================ */}
            {/* LIVE WORK */}
            {/* ============================================================ */}
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
                <Section title="Budget by Ecosystem" subtitle="Billable P&Ls">
                  <BarChart data={liveEcoBillable} labelKey="name" valueKey="budget" color={T.accent} formatValue={fmtK} />
                </Section>
                <Section title="Overage by Ecosystem" subtitle="Billable P&Ls">
                  <BarChart data={liveEcoBillable.filter((e) => e.overage !== 0).sort((a,b) => b.overage - a.overage)} labelKey="name" valueKey="overage" color={(item) => item.overage > 0 ? T.red : T.green} formatValue={fmtK} />
                </Section>
              </div>

              <div className="chart-row" style={s.chartRow}>
                <Section title="Creative Retainers">
                  {d.live.creative_retainers.length > 0 ? (
                    <div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 10, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, padding: "0 4px" }}>
                        <div style={{ width: 60 }}>RID</div><div style={{ flex: 1 }}>Client</div><div style={{ width: 100 }}>Project</div><div style={{ width: 80, textAlign: "right" }}>Retainer</div><div style={{ width: 80, textAlign: "right" }}>Budget</div><div style={{ width: 70 }}>Ecosystem</div>
                      </div>
                      {d.live.creative_retainers.map((cr) => (
                        <div key={cr.rid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 4px", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                          <div style={{ width: 60, fontFamily: "monospace", color: T.textDim }}>{cr.rid}</div>
                          <div style={{ flex: 1, fontWeight: 600 }}>{cr.client}</div>
                          <div style={{ width: 100, color: T.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cr.project}</div>
                          <div style={{ width: 80, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: T.accent }}>{fmtK(cr.retainer)}</div>
                          <div style={{ width: 80, textAlign: "right", fontFamily: "monospace", color: T.textMuted }}>{fmtK(cr.budget)}</div>
                          <div style={{ width: 70, fontSize: 11, color: ECO_COLORS[cr.ecosystem] || T.textMuted }}>{cr.ecosystem}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ color: T.textDim, padding: 12 }}>No creative retainers active</div>}
                </Section>
                <Section title="Budget by Client (Top 12)">
                  <BarChart data={d.live.by_client} labelKey="name" valueKey="budget" color={T.blue} formatValue={fmtK} />
                </Section>
              </div>

              <div className="chart-row" style={s.chartRow}>
                <Section title="Work Progress"><PillChart data={d.live.work_progress} /></Section>
                <Section title="Resource Status"><PillChart data={d.live.resource_status} /></Section>
              </div>

              <Section title="Live Projects" subtitle="Billable ecosystems · Sorted by overage">
                <DataTable data={liveProjectsBillable} columns={mkLiveCols(dn)} />
              </Section>
            </>)}

            {/* ============================================================ */}
            {/* NEW BUSINESS */}
            {/* ============================================================ */}
            {tab === "newbiz" && (<>
              <div className="kpi-grid" style={s.kpiGrid}>
                <KPI label="Opportunities" value={d.newbiz.count} />
                <KPI label="Total Forecast" value={fmtK(d.newbiz.total_forecast)} detail="Unweighted" />
                <KPI label="Weighted Pipeline" value={fmtK(d.newbiz.weighted_pipeline)} color={T.orange} />
                <KPI label="Near Close" value={fmtK(d.newbiz.pipeline_funnel.find((s) => s.stage === "Working On Contract")?.forecast || 0)} detail={`${d.newbiz.pipeline_funnel.find((s) => s.stage === "Working On Contract")?.count || 0} deals`} color={T.green} />
              </div>

              <div className="chart-row" style={s.chartRow}>
                <Section title="Pipeline by Stage">
                  <PipelineFunnel funnel={d.newbiz.pipeline_funnel} displayNames={dn} />
                </Section>
                <Section title="Weighted Pipeline by Ecosystem" subtitle="Billable P&Ls">
                  <StackedPipeline data={nbEcoBillable} displayNames={dn} />
                </Section>
              </div>

              <div className="chart-row" style={s.chartRow}>
                <Section title="Qualification Recommendation" subtitle="% of pipeline">
                  {(() => {
                    const total = Object.values(d.newbiz.by_recommendation).reduce((a, b) => a + b, 0) || 1;
                    return (
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        {Object.entries(d.newbiz.by_recommendation).sort((a, b) => b[1] - a[1]).map(([key, count]) => {
                          const pctVal = Math.round((count / total) * 100);
                          const color = key === "PROCEED" ? T.green : key === "DECLINE" ? T.red : T.textDim;
                          return (
                            <div key={key} style={{ textAlign: "center", padding: "14px 24px", borderRadius: 10, background: T.bgCardAlt, flex: 1, minWidth: 100 }}>
                              <div style={{ fontSize: 32, fontWeight: 800, color }}>{pctVal}%</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2 }}>{key}</div>
                              <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{count} deals</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </Section>
                <Section title="Data Completeness" subtitle="How complete is our pipeline data?">
                  <DataCompleteness data={d.newbiz.data_completeness} />
                </Section>
              </div>

              <div className="chart-row" style={s.chartRow}>
                <Section title="Win Probability & Services by Ecosystem" subtitle="Billable P&Ls">
                  <EcoWinServices data={d.newbiz.eco_win_services} billable={billable} />
                </Section>
                <Section />
              </div>

              <Section title="Pipeline Deals" subtitle="Ordered: Proposal → Waiting → Contract → Qualification → On Hold">
                <DataTable data={nbProjectsSorted} columns={mkNewbizCols(dn)} />
              </Section>
            </>)}

            {/* ============================================================ */}
            {/* INTERNAL PROJECTS */}
            {/* ============================================================ */}
            {tab === "internal" && (<>
              <div className="kpi-grid" style={{ ...s.kpiGrid, gridTemplateColumns: "repeat(3, 1fr)" }}>
                <KPI label="Internal Projects" value={d.internal.count} />
                <KPI label="Approved Investment" value={fmtK(d.internal.total_investment)} color={T.purple} />
                <KPI label="Actuals" value={fmtK(d.internal.total_actuals)} />
              </div>

              {d.internal.by_category.length > 0 && (
                <Section title="By Category">
                  {d.internal.by_category.map((cat) => (
                    <div key={cat.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{cat.name}</div>
                      <div style={{ fontSize: 12, color: T.textMuted }}>{cat.projects} projects</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.purple, minWidth: 80, textAlign: "right" }}>{fmtK(cat.investment)}</div>
                    </div>
                  ))}
                </Section>
              )}

              <Section title="Internal Projects">
                <DataTable data={d.internal.projects} columns={[
                  { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
                  { key: "client_name", label: "Client", w: 140, style: { fontWeight: 600 } },
                  { key: "project_name", label: "Assignment", w: 250 },
                  { key: "category", label: "Category", w: 160, filter: true },
                  { key: "approved_investment", label: "Approved Investment", w: 120, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
                  { key: "actuals_display", label: "Actuals", w: 90, render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12, color: v === "No Tracking" ? T.textDim : T.text }}>{typeof v === "number" ? fmtK(v) : v}</span> },
                  { key: "work_progress", label: "Progress", w: 120 },
                  { key: "project_manager", label: "PM/Prod", w: 120, filter: true },
                ]} />
              </Section>
            </>)}

            {/* ============================================================ */}
            {/* ALL PROJECTS */}
            {/* ============================================================ */}
            {tab === "projects" && (
              <Section>
                <DataTable
                  data={[...d.live.projects.map((p) => ({ ...p, _segment: "Live" })), ...d.newbiz.projects.map((p) => ({ ...p, _segment: "New Biz" })), ...d.internal.projects.map((p) => ({ ...p, _segment: "Internal" }))]}
                  columns={[
                    { key: "_segment", label: "Segment", w: 70, filter: true, render: (v) => <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: v === "Live" ? `${T.accent}33` : v === "New Biz" ? `${T.orange}33` : `${T.purple}33`, color: v === "Live" ? T.accent : v === "New Biz" ? T.orange : T.purple }}>{v}</span> },
                    { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
                    { key: "client_name", label: "Client", w: 120, filter: true, style: { fontWeight: 600 } },
                    { key: "project_name", label: "Assignment", w: 200 },
                    { key: "category", label: "Category", w: 130, filter: true },
                    { key: "workflow_status", label: "Status", w: 120, filter: true },
                    { key: "ecosystem", label: "Ecosystem", w: 90, filter: true },
                    { key: "budget_forecast", label: "Budget", w: 100, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
                    { key: "project_manager", label: "PM/Lead", w: 120, filter: true },
                  ]}
                />
              </Section>
            )}

            <div style={s.footer}>Generated {new Date(d.generated_at).toLocaleString()}</div>
          </>
        )}

        {loading && !data && <div style={{ textAlign: "center", padding: 80, color: T.textDim }}><div style={{ fontSize: 32, marginBottom: 12 }}>⟳</div>Loading snapshot from Smartsheet...</div>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = {
  container: { maxWidth: 1440, margin: "0 auto", padding: "24px 24px 48px" },
  header: { textAlign: "center", marginBottom: 28 },
  title: { fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: -0.5 },
  subtitle: { color: T.textMuted, fontSize: 13, marginTop: 6, display: "flex", justifyContent: "center", alignItems: "center", gap: 12 },
  refreshBtn: { background: T.accent, color: T.bg, border: "none", borderRadius: 8, padding: "6px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  errorBox: { background: "#991b1b33", border: `1px solid ${T.red}44`, borderRadius: 12, padding: 20, marginBottom: 24, color: T.red, fontSize: 14 },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 },
  kpiCard: { background: T.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${T.border}` },
  kpiLabel: { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: T.textDim, marginBottom: 4 },
  kpiValue: { fontSize: 28, fontWeight: 800 },
  kpiDetail: { fontSize: 11, color: T.textDim, marginTop: 2 },
  execKpi: { background: T.bgCard, borderRadius: 12, padding: "20px 16px 16px", border: `1px solid ${T.border}`, textAlign: "center" },
  execLabel: { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: T.textDim, marginBottom: 8 },
  execValue: { fontSize: 30, fontWeight: 800, lineHeight: 1 },
  execSub: { fontSize: 10, color: T.textDim, marginTop: 8 },
  chartRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  section: { background: T.bgCard, borderRadius: 12, padding: 22, border: `1px solid ${T.border}` },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: T.text, margin: 0 },
  barRow: { display: "flex", alignItems: "center", marginBottom: 6 },
  barLabel: { width: 120, fontSize: 12, fontWeight: 500, color: T.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  barTrack: { flex: 1, height: 20, background: T.bgCardAlt, borderRadius: 6, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 6, transition: "width 0.5s ease" },
  barValue: { width: 80, textAlign: "right", fontSize: 12, fontWeight: 600, paddingLeft: 8, color: T.text },
  filterBar: { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" },
  filterInput: { padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, background: T.bgCardAlt, color: T.text },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", padding: "8px 8px", fontWeight: 600, color: T.textDim, borderBottom: `2px solid ${T.border}`, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" },
  td: { padding: "7px 8px", borderBottom: `1px solid ${T.borderLight}`, whiteSpace: "nowrap", fontSize: 12, color: T.text },
  matrixTh: { padding: "4px 4px 20px", fontSize: 10, fontWeight: 600, color: T.textDim, textAlign: "center", borderBottom: `2px solid ${T.border}`, verticalAlign: "bottom", height: 60 },
  footer: { textAlign: "center", color: T.textDim, fontSize: 11, marginTop: 32, letterSpacing: 0.3 },
};
