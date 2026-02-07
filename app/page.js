"use client";

import { useState, useEffect, useMemo } from "react";

// ---------------------------------------------------------------------------
// Global CSS
// ---------------------------------------------------------------------------
const GLOBAL_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f0f2f5; color: #1a1a2e;
  }
  ::selection { background: #3b82f6; color: #fff; }
  .treemap-cell:hover { filter: brightness(0.92); }
  .bubble-cell:hover circle { stroke-width: 2; stroke: #1a1a2e; }
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
  green: { bg: "#dcfce7", text: "#166534", dot: "#22c55e", label: "Green" },
  yellow: { bg: "#fef9c3", text: "#854d0e", dot: "#eab308", label: "Yellow" },
  red: { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444", label: "Red" },
  blue: { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6", label: "Blue" },
  unknown: { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af", label: "Unset" },
};

const ECO_COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#14b8a6", "#ef4444", "#eab308"];
const STAGE_COLORS = {
  "IN REVIEW": "#a78bfa", "Proposal": "#818cf8", "Waiting For Response": "#60a5fa",
  "Working On Contract": "#34d399", "On Hold": "#9ca3af",
};
const STAGE_ORDER = ["IN REVIEW", "Proposal", "Waiting For Response", "Working On Contract", "On Hold"];

const CATEGORY_COLORS = {
  "Internal Admin Time": "#6b7280", "Internal Approved Projects": "#8b5cf6",
  "Active Live Projects": "#3b82f6", "Active Support": "#10b981",
  "Active Web Warranty": "#f59e0b", "New Business Qualification": "#ec4899",
  "New Business Pipeline": "#f97316",
};

// Burn rate -> color gradient (green to amber to red)
function burnColor(rate) {
  if (rate <= 50) return "#22c55e";
  if (rate <= 70) return "#84cc16";
  if (rate <= 85) return "#eab308";
  if (rate <= 95) return "#f97316";
  return "#ef4444";
}

// ---------------------------------------------------------------------------
// Shared UI Components
// ---------------------------------------------------------------------------

function Section({ title, subtitle, children, style: sx }) {
  return (
    <div style={{ ...s.section, ...sx }}>
      {title && <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
        <h2 style={s.sectionTitle}>{title}</h2>
        {subtitle && <span style={{ fontSize: 11, color: "#9ca3af" }}>{subtitle}</span>}
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
    <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e5e7eb" }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: "10px 20px", border: "none", background: "transparent", cursor: "pointer",
          fontSize: 14, fontWeight: active === t.key ? 700 : 500,
          color: active === t.key ? "#3b82f6" : "#6b7280",
          borderBottom: active === t.key ? "2px solid #3b82f6" : "2px solid transparent",
          marginBottom: -2,
        }}>{t.label}{t.count != null ? ` (${t.count})` : ""}</button>
      ))}
    </div>
  );
}

function RAGBar({ status }) {
  const total = Object.values(status).reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: "flex", gap: 20, marginBottom: 20, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", flexWrap: "wrap", alignItems: "center" }}>
      {["green", "yellow", "red", "blue", "unknown"].map((k) => {
        if (!status[k]) return null;
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: RAG[k].dot }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{status[k]}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{RAG[k].label}</div>
            </div>
          </div>
        );
      })}
      <div style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>{total} projects</div>
    </div>
  );
}

function KPI({ label, value, detail, color, small }) {
  return (
    <div style={s.kpiCard}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={{ ...s.kpiValue, color: color || "#1a1a2e", fontSize: small ? 22 : 28 }}>{value}</div>
      {detail && <div style={s.kpiDetail}>{detail}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. EXECUTIVE KPI STRIP
// ---------------------------------------------------------------------------
function ExecKPIStrip({ live, newbiz }) {
  const netOverservice = live.financials.total_overage - live.financials.total_investment;
  return (
    <div className="exec-kpi-strip" style={{
      display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24,
    }}>
      <div style={s.execKpi}>
        <div style={s.execLabel}>Live Revenue</div>
        <div style={{ ...s.execValue, color: "#3b82f6" }}>{fmtK(live.financials.total_budget)}</div>
        <div style={s.execSub}>{live.count} projects</div>
      </div>
      <div style={s.execKpi}>
        <div style={s.execLabel}>Burn Rate</div>
        <div style={{ ...s.execValue, color: burnColor(live.financials.burn_rate_pct) }}>{live.financials.burn_rate_pct}%</div>
        <div style={s.execSub}>{fmtK(live.financials.total_actuals)} spent</div>
      </div>
      <div style={s.execKpi}>
        <div style={s.execLabel}>Net Overservice</div>
        <div style={{ ...s.execValue, color: netOverservice > 0 ? "#ef4444" : "#22c55e" }}>{fmtK(netOverservice)}</div>
        <div style={s.execSub}>{live.financials.overserviced_count} projects ({fmtK(live.financials.total_investment)} invested)</div>
      </div>
      <div style={s.execKpi}>
        <div style={s.execLabel}>Weighted Pipeline</div>
        <div style={{ ...s.execValue, color: "#f97316" }}>{fmtK(newbiz.weighted_pipeline)}</div>
        <div style={s.execSub}>{fmtK(newbiz.total_forecast)} unweighted</div>
      </div>
      <div style={s.execKpi}>
        <div style={s.execLabel}>Near Close</div>
        <div style={{ ...s.execValue, color: "#22c55e" }}>{fmtK(newbiz.pipeline_funnel.find((s) => s.stage === "Working On Contract")?.forecast || 0)}</div>
        <div style={s.execSub}>{newbiz.pipeline_funnel.find((s) => s.stage === "Working On Contract")?.count || 0} deals working on contract</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. TREEMAP — Revenue by Ecosystem
// ---------------------------------------------------------------------------
function EcosystemTreemap({ ecosystems }) {
  if (!ecosystems?.length) return null;
  const total = ecosystems.reduce((a, e) => a + e.budget, 0) || 1;
  // Layout: simple squarified rows
  const rows = [];
  let currentRow = [];
  let rowBudget = 0;
  const targetRowBudget = total / Math.ceil(Math.sqrt(ecosystems.length));

  for (const eco of ecosystems) {
    currentRow.push(eco);
    rowBudget += eco.budget;
    if (rowBudget >= targetRowBudget) {
      rows.push({ items: currentRow, budget: rowBudget });
      currentRow = [];
      rowBudget = 0;
    }
  }
  if (currentRow.length) rows.push({ items: currentRow, budget: rowBudget });

  return (
    <div style={{ minHeight: 220 }}>
      {rows.map((row, ri) => {
        const rowPct = (row.budget / total) * 100;
        return (
          <div key={ri} style={{ display: "flex", height: `${Math.max(rowPct * 2.2, 50)}px`, marginBottom: 2 }}>
            {row.items.map((eco, ci) => {
              const cellPct = row.budget > 0 ? (eco.budget / row.budget) * 100 : 100 / row.items.length;
              const bg = burnColor(eco.burn_rate);
              const ragCounts = eco.rag || {};
              const redYellow = (ragCounts.red || 0) + (ragCounts.yellow || 0);
              return (
                <div className="treemap-cell" key={ci} title={`${eco.name}\nBudget: ${fmt(eco.budget)}\nActuals: ${fmt(eco.actuals)}\nBurn: ${eco.burn_rate}%\nOverage: ${fmt(eco.overage)}\n${eco.projects} projects`} style={{
                  width: `${cellPct}%`, marginRight: 2, borderRadius: 8,
                  background: `linear-gradient(135deg, ${bg}dd, ${bg}99)`,
                  padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between",
                  cursor: "default", transition: "filter 0.15s", overflow: "hidden",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{eco.name}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>{fmtK(eco.budget)}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>{eco.burn_rate}% burn</div>
                    <div style={{ display: "flex", gap: 3 }}>
                      {eco.projects > 0 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)" }}>{eco.projects}p</span>}
                      {redYellow > 0 && <span style={{ fontSize: 10, background: "rgba(239,68,68,0.7)", color: "#fff", borderRadius: 4, padding: "1px 4px" }}>⚠{redYellow}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 10, color: "#6b7280" }}>
        <span>Cell size = budget share</span>
        <span>Color = burn rate:</span>
        {[["≤50%", "#22c55e"], ["≤70%", "#84cc16"], ["≤85%", "#eab308"], ["≤95%", "#f97316"], [">95%", "#ef4444"]].map(([l, c]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: "inline-block" }} />{l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. STACKED PIPELINE — Weighted pipeline by Ecosystem × Stage
// ---------------------------------------------------------------------------
function StackedPipeline({ pipelineByEcosystem }) {
  if (!pipelineByEcosystem?.length) return <div style={{ color: "#9ca3af", padding: 20 }}>No pipeline data</div>;
  const maxWeighted = Math.max(...pipelineByEcosystem.map((e) => e.total_weighted), 1);

  return (
    <div>
      {pipelineByEcosystem.map((eco, i) => (
        <div key={eco.ecosystem} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 120, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={eco.ecosystem}>{eco.ecosystem}</div>
          <div style={{ flex: 1, height: 32, background: "#f0f2f5", borderRadius: 6, overflow: "hidden", display: "flex" }}>
            {eco.stages.filter((st) => st.weighted > 0).map((st) => {
              const w = (st.weighted / maxWeighted) * 100;
              return (
                <div key={st.stage} title={`${st.stage}: ${st.count} deals, ${fmtK(st.weighted)} weighted`} style={{
                  width: `${w}%`, background: STAGE_COLORS[st.stage] || "#9ca3af",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 600, color: "#fff", minWidth: st.weighted > 0 ? 4 : 0,
                  borderRight: "1px solid rgba(255,255,255,0.3)",
                }}>
                  {w > 8 ? st.count : ""}
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: "right", minWidth: 80 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtK(eco.total_weighted)}</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>{fmtK(eco.total_forecast)} fcst</div>
          </div>
        </div>
      ))}
      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 10, color: "#6b7280", flexWrap: "wrap" }}>
        {STAGE_ORDER.map((stage) => (
          <span key={stage} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: STAGE_COLORS[stage] }} />{stage}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. DIVERGING BAR — Overservice by Ecosystem
// ---------------------------------------------------------------------------
function DivergingOverservice({ ecosystems }) {
  if (!ecosystems?.length) return null;
  const data = ecosystems.filter((e) => e.overage !== 0 || e.investment > 0).sort((a, b) => b.overage - a.overage);
  if (!data.length) return <div style={{ color: "#9ca3af", padding: 20 }}>No overservice data</div>;
  const maxAbs = Math.max(...data.map((e) => Math.max(Math.abs(e.overage), Math.abs(e.overage - e.investment))), 1);
  const midX = 50; // percentage of container width for the zero line

  return (
    <div>
      {data.map((eco) => {
        const overPct = (eco.overage / maxAbs) * 45;
        const netOverservice = eco.overage - eco.investment;
        const investPct = eco.investment > 0 ? (eco.investment / maxAbs) * 45 : 0;
        const isOver = eco.overage > 0;

        return (
          <div key={eco.name} style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <div style={{ width: 120, fontSize: 12, fontWeight: 600, textAlign: "right", paddingRight: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={eco.name}>{eco.name}</div>
            <div style={{ flex: 1, height: 28, position: "relative" }}>
              {/* Zero line */}
              <div style={{ position: "absolute", left: `${midX}%`, top: 0, bottom: 0, width: 1, background: "#374151", zIndex: 2 }} />
              {/* Bar */}
              {isOver ? (
                <>
                  <div title={`Overage: ${fmt(eco.overage)}`} style={{
                    position: "absolute", left: `${midX}%`, top: 2, bottom: 2, borderRadius: "0 4px 4px 0",
                    width: `${Math.min(Math.abs(overPct), 48)}%`, background: "#ef4444",
                  }} />
                  {eco.investment > 0 && (
                    <div title={`Investment offset: ${fmt(eco.investment)}`} style={{
                      position: "absolute", left: `${midX + Math.abs(overPct) - investPct}%`, top: 0, bottom: 0,
                      width: `${investPct}%`, borderRight: "2px dashed #22c55e", zIndex: 3,
                    }} />
                  )}
                </>
              ) : (
                <div title={`Underage: ${fmt(Math.abs(eco.overage))}`} style={{
                  position: "absolute", right: `${100 - midX}%`, top: 2, bottom: 2, borderRadius: "4px 0 0 4px",
                  width: `${Math.min(Math.abs(overPct), 48)}%`, background: "#22c55e",
                }} />
              )}
            </div>
            <div style={{ minWidth: 100, textAlign: "right" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: eco.overage > 0 ? "#ef4444" : "#22c55e" }}>{fmtK(eco.overage)}</span>
              {eco.investment > 0 && (
                <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 4 }}>({fmtK(eco.investment)} inv)</span>
              )}
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 10, color: "#6b7280" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#ef4444" }} />Overservice (FTC)</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#22c55e" }} />Underage</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 0, borderTop: "2px dashed #22c55e" }} />Investment offset</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. BUBBLE MATRIX — Ecosystem × Request Type
// ---------------------------------------------------------------------------
function BubbleMatrix({ matrix }) {
  if (!matrix || !matrix.ecosystems?.length || !matrix.requestTypes?.length) return <div style={{ color: "#9ca3af", padding: 20 }}>No data</div>;
  
  // Find max for sizing
  const allCounts = matrix.cells.flat().map((c) => c.count);
  const maxCount = Math.max(...allCounts, 1);
  const allBudgets = matrix.cells.flat().map((c) => c.budget);
  const maxBudget = Math.max(...allBudgets, 1);

  // Limit display to top request types by total count
  const rtTotals = matrix.requestTypes.map((rt, ci) => ({
    name: rt, idx: ci,
    total: matrix.cells.reduce((sum, row) => sum + row[ci].count, 0),
  })).sort((a, b) => b.total - a.total);
  const topRT = rtTotals.slice(0, 10);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...s.matrixTh, width: 120, textAlign: "left" }}>Ecosystem</th>
            {topRT.map((rt) => (
              <th key={rt.name} style={{ ...s.matrixTh, maxWidth: 80 }} title={rt.name}>
                <div style={{ transform: "rotate(-45deg)", transformOrigin: "left bottom", whiteSpace: "nowrap", fontSize: 10, fontWeight: 600 }}>{rt.name.length > 14 ? rt.name.slice(0, 12) + "…" : rt.name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.ecosystems.map((eco, ri) => (
            <tr key={eco}>
              <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, borderBottom: "1px solid #f0f2f5" }}>{eco}</td>
              {topRT.map((rt) => {
                const cell = matrix.cells[ri][rt.idx];
                if (!cell || cell.count === 0) return <td key={rt.name} style={{ padding: 4, textAlign: "center", borderBottom: "1px solid #f0f2f5" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e5e7eb", margin: "0 auto" }} />
                </td>;
                const radius = 6 + (cell.count / maxCount) * 18;
                const opacity = 0.3 + (cell.budget / maxBudget) * 0.7;
                return (
                  <td key={rt.name} className="bubble-cell" style={{ padding: 4, textAlign: "center", borderBottom: "1px solid #f0f2f5" }}>
                    <svg width={radius * 2 + 4} height={radius * 2 + 4} style={{ display: "block", margin: "0 auto" }}>
                      <circle cx={radius + 2} cy={radius + 2} r={radius} fill={ECO_COLORS[ri % ECO_COLORS.length]} fillOpacity={opacity} />
                      {cell.count > 1 && <text x={radius + 2} y={radius + 6} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{cell.count}</text>}
                    </svg>
                    <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>{fmtK(cell.budget)}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 10, color: "#6b7280" }}>
        <span>Circle size = project count</span>
        <span>Opacity = budget concentration</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable BarChart
// ---------------------------------------------------------------------------
function BarChart({ data, labelKey, valueKey, maxVal, color = "#3b82f6", formatValue, limit = 12 }) {
  if (!data?.length) return <div style={{ color: "#9ca3af", padding: 12 }}>No data</div>;
  const sliced = data.slice(0, limit);
  const max = maxVal || Math.max(...sliced.map((d) => Math.abs(Number(d[valueKey]) || 0)), 1);
  return (
    <div>
      {sliced.map((item, i) => {
        const val = Number(item[valueKey]) || 0;
        const pctW = max > 0 ? (Math.abs(val) / max) * 100 : 0;
        return (
          <div key={i} style={s.barRow}>
            <div style={s.barLabel} title={item[labelKey]}>{item[labelKey]}</div>
            <div style={s.barTrack}>
              <div style={{ ...s.barFill, width: `${Math.min(pctW, 100)}%`, background: typeof color === "function" ? color(item) : color }} />
            </div>
            <div style={{ ...s.barValue, color: val < 0 ? "#22c55e" : item.overserviced > 0 ? "#ef4444" : "#1a1a2e" }}>
              {formatValue ? formatValue(val, item) : val}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PillChart({ data, colorMap }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  const defaultColors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#6b7280", "#ef4444", "#14b8a6"];
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div style={{ display: "flex", height: 24, borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
        {entries.map(([key, count], i) => (
          <div key={key} style={{ width: `${(count / total) * 100}%`, background: colorMap?.[key] || defaultColors[i % defaultColors.length], minWidth: count > 0 ? 3 : 0 }} title={`${key}: ${count}`} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        {entries.map(([key, count], i) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 3, background: colorMap?.[key] || defaultColors[i % defaultColors.length] }} />
            <span style={{ color: "#6b7280" }}>{key}</span>
            <span style={{ fontWeight: 600 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineFunnel({ funnel }) {
  const maxCount = Math.max(...funnel.map((s) => s.count), 1);
  return (
    <div>
      {funnel.map((stage) => (
        <div key={stage.stage} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, padding: "8px 0" }}>
          <div style={{ width: 150, fontSize: 12, fontWeight: 600, color: STAGE_COLORS[stage.stage] || "#6b7280" }}>{stage.stage}</div>
          <div style={{ flex: 1, height: 28, background: "#f0f2f5", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 6, width: `${(stage.count / maxCount) * 100}%`, background: STAGE_COLORS[stage.stage] || "#9ca3af", display: "flex", alignItems: "center", paddingLeft: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{stage.count}</span>
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: 100 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtK(stage.forecast)}</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>{fmtK(stage.weighted)} wtd</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Table (configurable columns)
// ---------------------------------------------------------------------------
function DataTable({ data, columns, emptyMsg = "No projects" }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const filterCols = useMemo(() => columns.filter((c) => c.filter), [columns]);

  const filtered = useMemo(() => {
    let r = [...data];
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((p) => columns.some((c) => String(p[c.key] || "").toLowerCase().includes(q)));
    }
    for (const [key, val] of Object.entries(filters)) {
      if (val) r = r.filter((p) => String(p[key]) === val);
    }
    if (sortCol) {
      r.sort((a, b) => {
        let av = a[sortCol], bv = b[sortCol];
        if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
        av = String(av ?? ""); bv = String(bv ?? "");
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return r;
  }, [data, search, filters, sortCol, sortAsc, columns]);

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  return (
    <>
      <div style={s.filterBar}>
        <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...s.filterInput, minWidth: 180 }} />
        {filterCols.map((col) => {
          const opts = [...new Set(data.map((p) => String(p[col.key])))].sort();
          return (
            <select key={col.key} value={filters[col.key] || ""} onChange={(e) => setFilters({ ...filters, [col.key]: e.target.value })} style={s.filterInput}>
              <option value="">All {col.label}</option>
              {opts.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>{filtered.length} of {data.length}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ ...s.th, minWidth: col.w || 80 }} onClick={() => handleSort(col.key)}>
                  {col.label} {sortCol === col.key ? (sortAsc ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8f9fa" } : {}}>
                {columns.map((col) => (
                  <td key={col.key} style={{ ...s.td, ...(col.style || {}) }}>
                    {col.render ? col.render(p[col.key], p) : (col.fmt ? col.fmt(p[col.key]) : (p[col.key] ?? "-"))}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={columns.length} style={{ ...s.td, textAlign: "center", color: "#9ca3af", padding: 40 }}>{emptyMsg}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------
const liveCols = [
  { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "top_priority", label: "⚑", w: 30, render: (v) => v ? <span style={{ color: "#dc2626", fontWeight: 700 }}>★</span> : null },
  { key: "client_name", label: "Client", w: 120, filter: true, style: { fontWeight: 600 } },
  { key: "project_name", label: "Assignment", w: 200 },
  { key: "category", label: "Category", w: 130, filter: true, render: (v) => <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "#f0f2f5", color: CATEGORY_COLORS[v] || "#6b7280", fontWeight: 600 }}>{v}</span> },
  { key: "rag", label: "RAG", w: 65, filter: true, render: (v, p) => <Badge color={p.rag_color} label={v} /> },
  { key: "budget_forecast", label: "Budget", w: 90, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "actuals_display", label: "Actuals", w: 90, render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12, color: v === "No Tracking" ? "#9ca3af" : "#1a1a2e" }}>{typeof v === "number" ? fmtK(v) : v}</span> },
  { key: "overage_display", label: "Overage (FTC)", w: 100, render: (v, p) => { const n = p.overage; return <span style={{ fontFamily: "monospace", fontSize: 12, color: n > 0 ? "#ef4444" : n < 0 ? "#22c55e" : v === "No Tracking" ? "#9ca3af" : "#1a1a2e", fontWeight: n > 0 ? 700 : 400 }}>{typeof v === "number" ? fmtK(v) : v}</span>; } },
  { key: "percent_complete", label: "% Done", w: 65, render: (v) => <span style={{ fontSize: 12 }}>{pct(v)}</span> },
  { key: "project_manager", label: "PM/Prod", w: 120, filter: true },
  { key: "ecosystem", label: "Ecosystem", w: 85, filter: true },
  { key: "work_progress", label: "Progress", w: 100 },
  { key: "resource_status", label: "Resources", w: 110 },
];

const newbizCols = [
  { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "client_name", label: "Client", w: 130, filter: true, style: { fontWeight: 600 } },
  { key: "project_name", label: "Opportunity", w: 220 },
  { key: "workflow_status", label: "Stage", w: 130, filter: true, render: (v) => <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: STAGE_COLORS[v] ? `${STAGE_COLORS[v]}22` : "#f3f4f6", color: STAGE_COLORS[v] || "#6b7280", fontWeight: 600 }}>{v}</span> },
  { key: "recommendation", label: "Rec", w: 80, filter: true, render: (v) => v === "PROCEED" ? <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 12 }}>PROCEED</span> : v === "DECLINE" ? <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 12 }}>DECLINE</span> : <span style={{ fontSize: 12, color: "#9ca3af" }}>{v}</span> },
  { key: "budget_forecast", label: "Forecast", w: 100, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "win_probability", label: "Win %", w: 65, render: (v) => <span style={{ fontSize: 12, fontWeight: 600, color: v >= 75 ? "#22c55e" : v >= 50 ? "#eab308" : v > 0 ? "#f97316" : "#9ca3af" }}>{pct(v)}</span> },
  { key: "weighted_pipeline", label: "Weighted", w: 100, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
  { key: "assignment", label: "Type", w: 90, filter: true, render: (v) => <span style={{ fontSize: 11 }}>{v}</span> },
  { key: "ecosystem", label: "Ecosystem", w: 90, filter: true },
  { key: "request_type", label: "Services", w: 180 },
  { key: "project_manager", label: "Lead", w: 120, filter: true },
  { key: "resource_status", label: "Resources", w: 110 },
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
    try {
      const res = await fetch("/api/snapshot", { cache: "no-store" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);
  const d = data;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <div style={s.container}>
        <div style={s.header}>
          <h1 style={s.title}>{d?.title || "Project Snapshot Dashboard"}</h1>
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
              { key: "projects", label: "All Projects" },
            ]} active={tab} onChange={setTab} />

            {/* ============================================================ */}
            {/* EXECUTIVE OVERVIEW TAB */}
            {/* ============================================================ */}
            {tab === "overview" && (
              <>
                <ExecKPIStrip live={d.live} newbiz={d.newbiz} />

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Revenue by Ecosystem" subtitle="Size = budget share · Color = burn rate">
                    <EcosystemTreemap ecosystems={d.live.by_ecosystem} />
                  </Section>
                  <Section title="Overservice Exposure by Ecosystem" subtitle="Forecast to complete · Dashed line = approved investment">
                    <DivergingOverservice ecosystems={d.live.by_ecosystem} />
                  </Section>
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Weighted Pipeline by Ecosystem" subtitle="Stacked by stage · Values = win-probability weighted">
                    <StackedPipeline pipelineByEcosystem={d.newbiz.pipeline_by_ecosystem} />
                  </Section>
                  <Section title="Service Mix by Ecosystem" subtitle="Size = project count · Opacity = budget concentration">
                    <BubbleMatrix matrix={d.live.ecosystem_request_type} />
                  </Section>
                </div>

                {/* Quick-look tables for top priority and red/yellow projects */}
                <div className="chart-row" style={s.chartRow}>
                  <Section title="Top Priority Projects">
                    {(() => {
                      const tp = d.live.projects.filter((p) => p.top_priority);
                      if (!tp.length) return <div style={{ color: "#9ca3af", padding: 12 }}>No top priority projects flagged</div>;
                      return tp.map((p) => (
                        <div key={p.rid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f0f2f5", fontSize: 12 }}>
                          <span style={{ color: "#dc2626", fontWeight: 700 }}>★</span>
                          <span style={{ fontFamily: "monospace", color: "#6b7280" }}>{p.rid}</span>
                          <span style={{ fontWeight: 600 }}>{p.client_name}</span>
                          <span style={{ flex: 1, color: "#374151" }}>{p.project_name}</span>
                          <Badge color={p.rag_color} label={p.rag} />
                          <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtK(p.budget_forecast)}</span>
                        </div>
                      ));
                    })()}
                  </Section>
                  <Section title="At Risk Projects" subtitle="Red + Yellow RAG">
                    {(() => {
                      const atRisk = d.live.projects.filter((p) => p.rag_color === "red" || p.rag_color === "yellow").sort((a, b) => (b.overage || 0) - (a.overage || 0));
                      if (!atRisk.length) return <div style={{ color: "#22c55e", padding: 12 }}>✓ No at-risk projects</div>;
                      return atRisk.slice(0, 10).map((p) => (
                        <div key={p.rid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f0f2f5", fontSize: 12 }}>
                          <Badge color={p.rag_color} label={p.rag} />
                          <span style={{ fontFamily: "monospace", color: "#6b7280" }}>{p.rid}</span>
                          <span style={{ fontWeight: 600 }}>{p.client_name}</span>
                          <span style={{ flex: 1, color: "#374151" }}>{p.project_name}</span>
                          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#ef4444" }}>{p.overage != null ? fmtK(p.overage) : "-"}</span>
                        </div>
                      ));
                    })()}
                  </Section>
                </div>
              </>
            )}

            {/* ============================================================ */}
            {/* LIVE WORK TAB */}
            {/* ============================================================ */}
            {tab === "live" && (
              <>
                <RAGBar status={d.live.status} />
                <div className="kpi-grid" style={s.kpiGrid}>
                  <KPI label="Total Budget" value={fmtK(d.live.financials.total_budget)} />
                  <KPI label="Actuals" value={fmtK(d.live.financials.total_actuals)} detail={`${d.live.financials.tracked_projects} tracked`} />
                  <KPI label="Burn Rate" value={`${d.live.financials.burn_rate_pct}%`} />
                  <KPI label="Forecast Overage" value={fmtK(d.live.financials.total_overage)} color={d.live.financials.total_overage > 0 ? "#ef4444" : "#22c55e"} />
                  <KPI label="OOP" value={fmtK(d.live.financials.total_oop)} />
                  <KPI label="Overserviced" value={d.live.financials.overserviced_count} detail={fmtK(d.live.financials.overserviced_amount)} color={d.live.financials.overserviced_count > 0 ? "#ef4444" : "#22c55e"} />
                  <KPI label="Investment" value={fmtK(d.live.financials.total_investment)} />
                  <KPI label="Missing Time" value={fmtK(d.live.financials.missing_time_total)} color={d.live.financials.missing_time_total > 5000 ? "#f59e0b" : "#22c55e"} />
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Budget by Ecosystem">
                    <BarChart data={d.live.by_ecosystem} labelKey="name" valueKey="budget" color="#3b82f6" formatValue={fmtK} />
                  </Section>
                  <Section title="Overage by Ecosystem">
                    <BarChart data={d.live.by_ecosystem.filter((e) => e.overage !== 0).sort((a,b) => b.overage - a.overage)} labelKey="name" valueKey="overage" color={(item) => item.overage > 0 ? "#ef4444" : "#22c55e"} formatValue={fmtK} />
                  </Section>
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Budget by Client (Top 12)">
                    <BarChart data={d.live.by_client} labelKey="name" valueKey="budget" color="#3b82f6" formatValue={fmtK} />
                  </Section>
                  <Section title="Projects by PM/Prod">
                    <BarChart data={d.live.by_pm} labelKey="name" valueKey="projects" color="#8b5cf6" formatValue={(v) => `${v} projects`} />
                  </Section>
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Work Progress">
                    <PillChart data={d.live.work_progress} />
                  </Section>
                  <Section title="Resource Status">
                    <PillChart data={d.live.resource_status} />
                  </Section>
                </div>

                <Section title="Live Projects">
                  <DataTable data={d.live.projects} columns={liveCols} />
                </Section>
              </>
            )}

            {/* ============================================================ */}
            {/* NEW BUSINESS TAB */}
            {/* ============================================================ */}
            {tab === "newbiz" && (
              <>
                <div className="kpi-grid" style={s.kpiGrid}>
                  <KPI label="Opportunities" value={d.newbiz.count} />
                  <KPI label="Total Forecast" value={fmtK(d.newbiz.total_forecast)} detail="Unweighted" />
                  <KPI label="Weighted Pipeline" value={fmtK(d.newbiz.weighted_pipeline)} color="#f97316" />
                  <KPI label="Near Close" value={fmtK(d.newbiz.pipeline_funnel.find((s) => s.stage === "Working On Contract")?.forecast || 0)} detail={`${d.newbiz.pipeline_funnel.find((s) => s.stage === "Working On Contract")?.count || 0} deals`} color="#22c55e" />
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Pipeline by Stage">
                    <PipelineFunnel funnel={d.newbiz.pipeline_funnel} />
                  </Section>
                  <Section title="Weighted Pipeline by Ecosystem">
                    <StackedPipeline pipelineByEcosystem={d.newbiz.pipeline_by_ecosystem} />
                  </Section>
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Qualification Recommendation">
                    <div style={{ display: "flex", gap: 20 }}>
                      {Object.entries(d.newbiz.by_recommendation).sort((a,b) => b[1] - a[1]).map(([key, count]) => (
                        <div key={key} style={{ textAlign: "center", padding: "12px 24px", borderRadius: 8, background: key === "PROCEED" ? "#dcfce7" : key === "DECLINE" ? "#fee2e2" : "#f3f4f6", flex: 1 }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: key === "PROCEED" ? "#166534" : key === "DECLINE" ? "#991b1b" : "#374151" }}>{count}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: key === "PROCEED" ? "#166534" : key === "DECLINE" ? "#991b1b" : "#6b7280" }}>{key}</div>
                        </div>
                      ))}
                    </div>
                  </Section>
                  <Section title="Assignment Type">
                    <PillChart data={d.newbiz.by_assignment} colorMap={{ "Integrated": "#f97316", "Comms Only": "#3b82f6" }} />
                  </Section>
                </div>

                <Section title="Pipeline Deals">
                  <DataTable data={d.newbiz.projects} columns={newbizCols} />
                </Section>
              </>
            )}

            {/* ============================================================ */}
            {/* ALL PROJECTS TAB */}
            {/* ============================================================ */}
            {tab === "projects" && (
              <Section>
                <DataTable
                  data={[...d.live.projects.map((p) => ({ ...p, _segment: "Live" })), ...d.newbiz.projects.map((p) => ({ ...p, _segment: "New Biz" }))]}
                  columns={[
                    { key: "_segment", label: "Segment", w: 70, filter: true, render: (v) => <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: v === "Live" ? "#dbeafe" : "#ffedd5", color: v === "Live" ? "#1e40af" : "#9a3412" }}>{v}</span> },
                    { key: "rid", label: "RID", w: 70, style: { fontFamily: "monospace", fontSize: 12 } },
                    { key: "client_name", label: "Client", w: 120, filter: true, style: { fontWeight: 600 } },
                    { key: "project_name", label: "Assignment", w: 200 },
                    { key: "category", label: "Category", w: 130, filter: true },
                    { key: "workflow_status", label: "Status", w: 120, filter: true },
                    { key: "ecosystem", label: "Ecosystem", w: 90, filter: true },
                    { key: "budget_forecast", label: "Budget/Forecast", w: 100, fmt: fmtK, style: { fontFamily: "monospace", fontSize: 12 } },
                    { key: "project_manager", label: "PM/Lead", w: 120, filter: true },
                  ]}
                />
              </Section>
            )}

            <div style={s.footer}>Generated {new Date(d.generated_at).toLocaleString()} via Smartsheet API</div>
          </>
        )}

        {loading && !data && (
          <div style={{ textAlign: "center", padding: 80, color: "#6b7280" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⟳</div>
            Loading snapshot from Smartsheet...
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = {
  container: { maxWidth: 1440, margin: "0 auto", padding: "24px 24px 48px" },
  header: { textAlign: "center", marginBottom: 24 },
  title: { fontSize: 26, fontWeight: 700, color: "#1a1a2e" },
  subtitle: { color: "#6b7280", fontSize: 14, marginTop: 4, display: "flex", justifyContent: "center", alignItems: "center", gap: 12 },
  refreshBtn: { background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  errorBox: { background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 12, padding: 20, marginBottom: 24, color: "#991b1b", fontSize: 14 },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 },
  kpiCard: { background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  kpiLabel: { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#6b7280", marginBottom: 4 },
  kpiValue: { fontSize: 28, fontWeight: 700 },
  kpiDetail: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  execKpi: { background: "#fff", borderRadius: 12, padding: "20px 20px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", textAlign: "center" },
  execLabel: { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#6b7280", marginBottom: 6 },
  execValue: { fontSize: 32, fontWeight: 800, lineHeight: 1 },
  execSub: { fontSize: 11, color: "#9ca3af", marginTop: 6 },
  chartRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 },
  section: { background: "#fff", borderRadius: 12, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 0 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: "#1a1a2e", margin: 0 },
  barRow: { display: "flex", alignItems: "center", marginBottom: 6 },
  barLabel: { width: 130, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  barTrack: { flex: 1, height: 20, background: "#f0f2f5", borderRadius: 6, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 6, transition: "width 0.5s ease" },
  barValue: { width: 90, textAlign: "right", fontSize: 12, fontWeight: 600, paddingLeft: 8 },
  filterBar: { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" },
  filterInput: { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12, background: "white" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", padding: "8px 8px", fontWeight: 600, color: "#6b7280", borderBottom: "2px solid #e5e7eb", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" },
  td: { padding: "7px 8px", borderBottom: "1px solid #f0f2f5", whiteSpace: "nowrap", fontSize: 12 },
  matrixTh: { padding: "4px 4px 20px", fontSize: 10, fontWeight: 600, color: "#6b7280", textAlign: "center", borderBottom: "2px solid #e5e7eb", verticalAlign: "bottom", height: 60 },
  footer: { textAlign: "center", color: "#9ca3af", fontSize: 12, marginTop: 32 },
};
