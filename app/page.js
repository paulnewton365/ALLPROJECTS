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
  @media (max-width: 768px) {
    .chart-row { grid-template-columns: 1fr !important; }
    .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .filter-bar { flex-direction: column; }
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (n) => { n = Number(n) || 0; return "$" + Math.round(n).toLocaleString(); };
const fmtK = (n) => { n = Number(n) || 0; return n >= 1000000 ? "$" + (n / 1000000).toFixed(1) + "M" : n >= 1000 ? "$" + (n / 1000).toFixed(0) + "K" : fmt(n); };

const STATUS = {
  green: { bg: "#dcfce7", text: "#166534", dot: "#22c55e", label: "Green" },
  yellow: { bg: "#fef9c3", text: "#854d0e", dot: "#eab308", label: "Yellow" },
  red: { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444", label: "Red" },
  unknown: { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af", label: "Unset" },
};

const CATEGORY_COLORS = {
  "Internal Admin Time": { bg: "#f3f4f6", text: "#374151", accent: "#6b7280", icon: "⚙️" },
  "Internal Approved Projects": { bg: "#ede9fe", text: "#5b21b6", accent: "#8b5cf6", icon: "🏢" },
  "Active Live Projects": { bg: "#dbeafe", text: "#1e40af", accent: "#3b82f6", icon: "🚀" },
  "Active Support": { bg: "#d1fae5", text: "#065f46", accent: "#10b981", icon: "🛟" },
  "Active Web Warranty": { bg: "#fef3c7", text: "#92400e", accent: "#f59e0b", icon: "🌐" },
  "New Business Qualification": { bg: "#fce7f3", text: "#9d174d", accent: "#ec4899", icon: "🎯" },
  "New Business Pipeline": { bg: "#ffedd5", text: "#9a3412", accent: "#f97316", icon: "📊" },
  "Uncategorized": { bg: "#f3f4f6", text: "#6b7280", accent: "#9ca3af", icon: "❓" },
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function KPI({ label, value, detail, color, small }) {
  return (
    <div style={s.kpiCard}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={{ ...s.kpiValue, color: color || "#1a1a2e", fontSize: small ? 24 : 32 }}>{value}</div>
      {detail && <div style={s.kpiDetail}>{detail}</div>}
    </div>
  );
}

function StatusBar({ status }) {
  const total = Object.values(status).reduce((a, b) => a + b, 0);
  return (
    <div style={s.statusBar}>
      {["green", "yellow", "red", "unknown"].map((k) => (
        <div key={k} style={s.statusSeg}>
          <div style={{ ...s.statusDot, background: STATUS[k].dot }} />
          <div>
            <div style={s.statusCount}>{status[k] || 0}</div>
            <div style={s.statusLabel}>{STATUS[k].label}</div>
          </div>
        </div>
      ))}
      <div style={{ marginLeft: "auto", fontSize: 13, color: "#9ca3af", alignSelf: "center" }}>
        {total} total
      </div>
    </div>
  );
}

function PillChart({ data, colorMap }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  const defaultColors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#6b7280", "#ef4444", "#14b8a6"];
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
        {entries.map(([key, count], i) => (
          <div key={key} style={{
            width: `${(count / total) * 100}%`,
            background: colorMap?.[key] || defaultColors[i % defaultColors.length],
            minWidth: count > 0 ? 3 : 0,
          }} title={`${key}: ${count}`} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {entries.map(([key, count], i) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: colorMap?.[key] || defaultColors[i % defaultColors.length] }} />
            <span style={{ color: "#6b7280" }}>{key}</span>
            <span style={{ fontWeight: 600 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data, labelKey, valueKey, maxVal, color = "#3b82f6", formatValue, limit = 12 }) {
  if (!data?.length) return <div style={{ color: "#9ca3af", padding: 12 }}>No data</div>;
  const max = maxVal || Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div>
      {data.slice(0, limit).map((item, i) => {
        const val = Number(item[valueKey]) || 0;
        const pct = max > 0 ? (val / max) * 100 : 0;
        return (
          <div key={i} style={s.barRow}>
            <div style={s.barLabel} title={item[labelKey]}>{item[labelKey]}</div>
            <div style={s.barTrack}>
              <div style={{ ...s.barFill, width: `${Math.min(pct, 100)}%`, background: typeof color === "function" ? color(item) : color }} />
            </div>
            <div style={{ ...s.barValue, color: item.overserviced > 0 ? "#ef4444" : "#1a1a2e" }}>
              {formatValue ? formatValue(val, item) : val}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Badge({ color, label }) {
  const c = STATUS[color] || STATUS.unknown;
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: c.bg, color: c.text }}>{label}</span>;
}

function Section({ title, children, cols }) {
  return (
    <div style={{ ...s.section, ...(cols ? { gridColumn: cols } : {}) }}>
      {title && <h2 style={s.sectionTitle}>{title}</h2>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e5e7eb", paddingBottom: 0 }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: "10px 20px", border: "none", background: "transparent", cursor: "pointer",
          fontSize: 14, fontWeight: active === t.key ? 700 : 500,
          color: active === t.key ? "#3b82f6" : "#6b7280",
          borderBottom: active === t.key ? "2px solid #3b82f6" : "2px solid transparent",
          marginBottom: -2,
        }}>{t.label}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category Cards
// ---------------------------------------------------------------------------

function CategoryCards({ categories, categoryOrder, projects, onCategoryClick }) {
  // Build a lookup from the by_category array
  const catLookup = {};
  for (const c of categories) catLookup[c.name] = c;

  // Also count RAG status per category from projects
  const catStatus = {};
  for (const p of projects) {
    const cat = p.category || "Uncategorized";
    if (!catStatus[cat]) catStatus[cat] = { green: 0, yellow: 0, red: 0, unknown: 0 };
    catStatus[cat][p.rag_color] = (catStatus[cat][p.rag_color] || 0) + 1;
  }

  const ordered = [...categoryOrder, "Uncategorized"].filter((name) => catLookup[name]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 24 }}>
      {ordered.map((name) => {
        const cat = catLookup[name] || { projects: 0, budget: 0, actuals: 0, overage: 0, overserviced: 0, pipeline: 0 };
        const theme = CATEGORY_COLORS[name] || CATEGORY_COLORS["Uncategorized"];
        const rag = catStatus[name] || { green: 0, yellow: 0, red: 0, unknown: 0 };
        const ragTotal = rag.green + rag.yellow + rag.red + rag.unknown;

        return (
          <div key={name} onClick={() => onCategoryClick?.(name)} style={{
            background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            borderLeft: `4px solid ${theme.accent}`, cursor: onCategoryClick ? "pointer" : "default",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)"; }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: theme.text, marginBottom: 2 }}>
                  {theme.icon} {name}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a2e" }}>{cat.projects}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>projects</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>{fmtK(cat.budget)}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>budget</div>
              </div>
            </div>

            {/* Mini RAG bar */}
            {ragTotal > 0 && (
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8, background: "#f0f2f5" }}>
                {rag.green > 0 && <div style={{ width: `${(rag.green / ragTotal) * 100}%`, background: "#22c55e" }} />}
                {rag.yellow > 0 && <div style={{ width: `${(rag.yellow / ragTotal) * 100}%`, background: "#eab308" }} />}
                {rag.red > 0 && <div style={{ width: `${(rag.red / ragTotal) * 100}%`, background: "#ef4444" }} />}
                {rag.unknown > 0 && <div style={{ width: `${(rag.unknown / ragTotal) * 100}%`, background: "#d1d5db" }} />}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6b7280" }}>
              <span>Actuals: <b style={{ color: "#1a1a2e" }}>{fmtK(cat.actuals)}</b></span>
              {cat.overserviced > 0 && <span style={{ color: "#ef4444" }}>⚠ {cat.overserviced} over</span>}
              {cat.pipeline > 0 && <span>Pipeline: <b>{fmtK(cat.pipeline)}</b></span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project Table
// ---------------------------------------------------------------------------

function ProjectTable({ projects, initialCategory }) {
  const [search, setSearch] = useState("");
  const [ragFilter, setRagFilter] = useState("");
  const [wfFilter, setWfFilter] = useState("");
  const [ecoFilter, setEcoFilter] = useState("");
  const [pmFilter, setPmFilter] = useState("");
  const [catFilter, setCatFilter] = useState(initialCategory || "");
  const [overOnly, setOverOnly] = useState(false);
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Sync external category filter
  useEffect(() => { if (initialCategory !== undefined) setCatFilter(initialCategory); }, [initialCategory]);

  // Unique values for filters
  const wfOptions = useMemo(() => [...new Set(projects.map((p) => p.workflow_status))].sort(), [projects]);
  const ecoOptions = useMemo(() => [...new Set(projects.map((p) => p.ecosystem))].sort(), [projects]);
  const pmOptions = useMemo(() => [...new Set(projects.map((p) => p.project_manager))].sort(), [projects]);
  const catOptions = useMemo(() => [...new Set(projects.map((p) => p.category))].sort(), [projects]);

  const filtered = useMemo(() => {
    let r = [...projects];
    if (search) { const q = search.toLowerCase(); r = r.filter((p) => `${p.project_name} ${p.client_name} ${p.project_manager} ${p.rid} ${p.request_type}`.toLowerCase().includes(q)); }
    if (ragFilter) r = r.filter((p) => p.rag_color === ragFilter);
    if (wfFilter) r = r.filter((p) => p.workflow_status === wfFilter);
    if (ecoFilter) r = r.filter((p) => p.ecosystem === ecoFilter);
    if (pmFilter) r = r.filter((p) => p.project_manager === pmFilter);
    if (catFilter) r = r.filter((p) => p.category === catFilter);
    if (overOnly) r = r.filter((p) => p.is_overserviced);
    if (priorityOnly) r = r.filter((p) => p.top_priority === "High");
    if (sortCol) {
      r.sort((a, b) => {
        let av = a[sortCol], bv = b[sortCol];
        if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
        av = String(av || ""); bv = String(bv || "");
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return r;
  }, [projects, search, ragFilter, wfFilter, ecoFilter, pmFilter, catFilter, overOnly, priorityOnly, sortCol, sortAsc]);

  function handleSort(col) {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  }

  const cols = [
    { key: "rid", label: "RID", w: 80 },
    { key: "client_name", label: "Client", w: 120 },
    { key: "project_name", label: "Assignment", w: 200 },
    { key: "category", label: "Category", w: 140 },
    { key: "workflow_status", label: "Workflow", w: 100 },
    { key: "rag", label: "RAG", w: 70 },
    { key: "work_progress", label: "Progress", w: 100 },
    { key: "project_manager", label: "PM", w: 130 },
    { key: "ecosystem", label: "Ecosystem", w: 90 },
    { key: "budget_forecast", label: "Budget", w: 100 },
    { key: "actuals_display", label: "Actuals", w: 100 },
    { key: "overage_display", label: "Overage", w: 90 },
    { key: "percent_complete", label: "% Done", w: 70 },
    { key: "top_priority", label: "Priority", w: 70 },
    { key: "resource_status", label: "Resources", w: 120 },
  ];

  return (
    <>
      <div style={s.filterBar}>
        <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...s.filterInput, minWidth: 180 }} />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ ...s.filterInput, fontWeight: catFilter ? 600 : 400 }}>
          <option value="">All Categories</option>
          {catOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={ragFilter} onChange={(e) => setRagFilter(e.target.value)} style={s.filterInput}>
          <option value="">All RAG</option>
          <option value="green">Green</option><option value="yellow">Yellow</option><option value="red">Red</option><option value="unknown">Unset</option>
        </select>
        <select value={wfFilter} onChange={(e) => setWfFilter(e.target.value)} style={s.filterInput}>
          <option value="">All Workflow</option>
          {wfOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={ecoFilter} onChange={(e) => setEcoFilter(e.target.value)} style={s.filterInput}>
          <option value="">All Ecosystems</option>
          {ecoOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={pmFilter} onChange={(e) => setPmFilter(e.target.value)} style={s.filterInput}>
          <option value="">All PMs</option>
          {pmOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={overOnly} onChange={(e) => setOverOnly(e.target.checked)} /> Overserviced
        </label>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={priorityOnly} onChange={(e) => setPriorityOnly(e.target.checked)} /> High Priority
        </label>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>{filtered.length} of {projects.length}</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              {cols.map((col) => (
                <th key={col.key} style={{ ...s.th, minWidth: col.w }} onClick={() => handleSort(col.key)}>
                  {col.label} {sortCol === col.key ? (sortAsc ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const catTheme = CATEGORY_COLORS[p.category] || CATEGORY_COLORS["Uncategorized"];
              return (
              <tr key={i} style={i % 2 ? { background: "#f8f9fa" } : {}}>
                <td style={s.td}><span style={{ fontFamily: "monospace", fontSize: 12 }}>{p.rid}</span></td>
                <td style={{ ...s.td, fontWeight: 600 }}>{p.client_name}</td>
                <td style={s.td}>{p.project_name}</td>
                <td style={s.td}><span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: catTheme.bg, color: catTheme.text, fontWeight: 600, whiteSpace: "nowrap" }}>{p.category}</span></td>
                <td style={s.td}><span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: p.workflow_phase === "active" ? "#dbeafe" : p.workflow_phase === "on_hold" ? "#fef3c7" : p.workflow_phase === "pipeline" ? "#e0e7ff" : "#f3f4f6", color: "#374151" }}>{p.workflow_status}</span></td>
                <td style={s.td}><Badge color={p.rag_color} label={p.rag} /></td>
                <td style={s.td}><span style={{ fontSize: 12 }}>{p.work_progress}</span></td>
                <td style={s.td}>{p.project_manager}</td>
                <td style={s.td}><span style={{ fontSize: 12 }}>{p.ecosystem}</span></td>
                <td style={{ ...s.td, fontFamily: "monospace", fontSize: 12 }}>{fmtK(p.budget_forecast)}</td>
                <td style={{ ...s.td, fontFamily: "monospace", fontSize: 12, color: p.actuals === null ? "#9ca3af" : "#1a1a2e" }}>{p.actuals === null ? "No Tracking" : fmtK(p.actuals)}</td>
                <td style={{ ...s.td, fontFamily: "monospace", fontSize: 12, color: p.is_overserviced ? "#ef4444" : p.overage === null ? "#9ca3af" : "#1a1a2e", fontWeight: p.is_overserviced ? 700 : 400 }}>{p.overage === null ? "No Tracking" : fmtK(p.overage)}</td>
                <td style={s.td}>{p.percent_complete != null && !isNaN(p.percent_complete) ? `${Math.round(p.percent_complete)}%` : "-"}</td>
                <td style={s.td}>{p.top_priority === "High" ? <span style={{ color: "#dc2626", fontWeight: 700, fontSize: 12 }}>HIGH</span> : <span style={{ fontSize: 12, color: "#9ca3af" }}>{p.top_priority}</span>}</td>
                <td style={s.td}><span style={{ fontSize: 11 }}>{p.resource_status}</span></td>
              </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={cols.length} style={{ ...s.td, textAlign: "center", color: "#9ca3af", padding: 40 }}>No matching projects</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [categoryFilter, setCategoryFilter] = useState("");

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
        {/* Header */}
        <div style={s.header}>
          <h1 style={s.title}>{d?.title || "Project Snapshot Dashboard"}</h1>
          <div style={s.subtitle}>
            <span>{d ? `${d.total_projects} projects across ${d.by_client?.length || 0} clients` : ""}</span>
            <button onClick={loadData} disabled={loading} style={s.refreshBtn}>
              {loading ? "Loading..." : "↻ Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div style={s.errorBox}>
            <strong>Error:</strong> {error}
            <div style={{ marginTop: 8, fontSize: 13 }}>
              Check your environment variables in Vercel. Hit <code>/api/discover</code> to debug.
            </div>
          </div>
        )}

        {d && (
          <>
            <Tabs
              tabs={[
                { key: "overview", label: "Overview" },
                { key: "financials", label: "Financials" },
                { key: "operations", label: "Operations" },
                { key: "projects", label: "All Projects" },
              ]}
              active={tab}
              onChange={(t) => { if (t !== "projects") setCategoryFilter(""); setTab(t); }}
            />

            {/* ============================================================= */}
            {/* OVERVIEW TAB */}
            {/* ============================================================= */}
            {tab === "overview" && (
              <>
                <CategoryCards
                  categories={d.by_category}
                  categoryOrder={d.category_order || []}
                  projects={d.projects}
                  onCategoryClick={(name) => { setCategoryFilter(name); setTab("projects"); }}
                />
                <StatusBar status={d.status} />

                <div className="kpi-grid" style={s.kpiGrid}>
                  <KPI label="Total Budget" value={fmtK(d.financials.total_budget)} />
                  <KPI label="Total Actuals" value={fmtK(d.financials.total_actuals)} detail={`${d.financials.tracked_projects} of ${d.total_projects} tracked`} />
                  <KPI label="Overserviced" value={d.financials.overserviced_count} detail={fmt(d.financials.overserviced_amount) + " over"} color={d.financials.overserviced_count > 0 ? "#ef4444" : "#22c55e"} />
                  <KPI label="Pipeline Value" value={fmtK(d.financials.total_pipeline)} detail="Weighted" />
                  <KPI label="High Priority" value={d.flags.high_priority} color={d.flags.high_priority > 0 ? "#dc2626" : "#22c55e"} />
                  <KPI label="No PM Assigned" value={d.flags.no_pm} color={d.flags.no_pm > 0 ? "#f59e0b" : "#22c55e"} />
                  <KPI label="Monthly Budget" value={fmtK(d.financials.total_monthly_budget)} />
                  <KPI label="Investment" value={fmtK(d.financials.total_investment)} detail="Approved total" />
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Workflow Status">
                    <PillChart data={d.workflow} colorMap={{ Active: "#22c55e", "In Progress": "#3b82f6", "On Hold": "#eab308", Proposal: "#8b5cf6", Closed: "#6b7280", Complete: "#14b8a6" }} />
                  </Section>
                  <Section title="Work Progress">
                    <PillChart data={d.work_progress} />
                  </Section>
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Budget by Client (Top 12)">
                    <BarChart data={d.by_client} labelKey="name" valueKey="budget" color="#3b82f6" formatValue={fmtK} />
                  </Section>
                  <Section title="Budget by Ecosystem">
                    <BarChart data={d.by_ecosystem} labelKey="name" valueKey="budget" color="#8b5cf6" formatValue={fmtK} />
                  </Section>
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* FINANCIALS TAB */}
            {/* ============================================================= */}
            {tab === "financials" && (
              <>
                <div className="kpi-grid" style={s.kpiGrid}>
                  <KPI label="Total Budget" value={fmtK(d.financials.total_budget)} />
                  <KPI label="Actuals (Tracked)" value={fmtK(d.financials.total_actuals)} detail={`${d.financials.tracked_projects} projects tracked`} />
                  <KPI label="OOP" value={fmtK(d.financials.total_oop)} />
                  <KPI label="Total Overage" value={fmtK(d.financials.total_overage)} color={d.financials.total_overage > 0 ? "#ef4444" : "#22c55e"} />
                  <KPI label="Overserviced Projects" value={d.financials.overserviced_count} detail={`${fmt(d.financials.overserviced_amount)} total overage`} color={d.financials.overserviced_count > 0 ? "#ef4444" : "#22c55e"} />
                  <KPI label="Burn Rate" value={`${d.financials.burn_rate_pct}%`} detail="Actuals / Budget" />
                  <KPI label="Pipeline (Weighted)" value={fmtK(d.financials.total_pipeline)} />
                  <KPI label="Untracked Projects" value={d.financials.untracked_projects} color={d.financials.untracked_projects > 10 ? "#f59e0b" : "#22c55e"} detail="No actuals data" />
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Client Budgets">
                    <BarChart data={d.by_client} labelKey="name" valueKey="budget" color="#3b82f6" formatValue={fmtK} />
                  </Section>
                  <Section title="Client Actuals">
                    <BarChart data={d.by_client} labelKey="name" valueKey="actuals" maxVal={d.by_client[0]?.budget || 1} color={(item) => item.actuals > item.budget ? "#ef4444" : "#22c55e"} formatValue={fmtK} />
                  </Section>
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Ecosystem Budgets">
                    <BarChart data={d.by_ecosystem} labelKey="name" valueKey="budget" color="#8b5cf6" formatValue={fmtK} />
                  </Section>
                  <Section title="PM Budget Responsibility">
                    <BarChart data={d.by_pm.slice().sort((a,b) => b.budget - a.budget)} labelKey="name" valueKey="budget" color="#3b82f6" formatValue={fmtK} />
                  </Section>
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* OPERATIONS TAB */}
            {/* ============================================================= */}
            {tab === "operations" && (
              <>
                <div className="kpi-grid" style={s.kpiGrid}>
                  <KPI label="No PM Assigned" value={d.flags.no_pm} color={d.flags.no_pm > 0 ? "#f59e0b" : "#22c55e"} />
                  <KPI label="High Priority" value={d.flags.high_priority} color={d.flags.high_priority > 0 ? "#dc2626" : "#6b7280"} />
                  <KPI label="Active Projects" value={d.workflow["Active"] || d.workflow["In Progress"] || 0} />
                  <KPI label="On Hold" value={d.workflow["On Hold"] || 0} color="#eab308" />
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Workflow Status Breakdown">
                    <PillChart data={d.workflow} colorMap={{ Active: "#22c55e", "In Progress": "#3b82f6", "On Hold": "#eab308", Proposal: "#8b5cf6", Closed: "#6b7280" }} />
                  </Section>
                  <Section title="Resource Status">
                    <PillChart data={d.resource_status} />
                  </Section>
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Projects by PM">
                    <BarChart data={d.by_pm} labelKey="name" valueKey="projects" color="#3b82f6" formatValue={(v) => `${v} projects`} />
                  </Section>
                  <Section title="Service Type Mix">
                    <BarChart data={d.by_request_type} labelKey="name" valueKey="count" color="#8b5cf6" formatValue={(v) => `${v}`} />
                  </Section>
                </div>

                <div className="chart-row" style={s.chartRow}>
                  <Section title="Projects by Ecosystem">
                    <BarChart data={d.by_ecosystem} labelKey="name" valueKey="projects" color="#14b8a6" formatValue={(v) => `${v} projects`} />
                  </Section>
                  <Section title="Work Progress">
                    <PillChart data={d.work_progress} />
                  </Section>
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* ALL PROJECTS TAB */}
            {/* ============================================================= */}
            {tab === "projects" && (
              <Section>
                <ProjectTable projects={d.projects} initialCategory={categoryFilter} />
              </Section>
            )}

            <div style={s.footer}>
              Generated {new Date(d.generated_at).toLocaleString()} via Smartsheet API
              <br />
              v{process.env.BUILD_VERSION} | {process.env.BUILD_COMMIT} | Built {new Date(process.env.BUILD_TIME).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
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
  container: { maxWidth: 1360, margin: "0 auto", padding: "24px 24px 48px" },
  header: { textAlign: "center", marginBottom: 24 },
  title: { fontSize: 26, fontWeight: 700, color: "#1a1a2e" },
  subtitle: { color: "#6b7280", fontSize: 14, marginTop: 4, display: "flex", justifyContent: "center", alignItems: "center", gap: 12 },
  refreshBtn: { background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  errorBox: { background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 12, padding: 20, marginBottom: 24, color: "#991b1b", fontSize: 14 },
  statusBar: { display: "flex", gap: 24, marginBottom: 24, background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", flexWrap: "wrap" },
  statusSeg: { display: "flex", alignItems: "center", gap: 8 },
  statusDot: { width: 14, height: 14, borderRadius: "50%" },
  statusCount: { fontSize: 24, fontWeight: 700 },
  statusLabel: { fontSize: 13, color: "#6b7280" },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 },
  kpiCard: { background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  kpiLabel: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#6b7280", marginBottom: 6 },
  kpiValue: { fontSize: 28, fontWeight: 700 },
  kpiDetail: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  chartRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 },
  section: { background: "#fff", borderRadius: 12, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 14, color: "#1a1a2e" },
  barRow: { display: "flex", alignItems: "center", marginBottom: 8 },
  barLabel: { width: 130, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  barTrack: { flex: 1, height: 22, background: "#f0f2f5", borderRadius: 6, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 6, transition: "width 0.5s ease" },
  barValue: { width: 90, textAlign: "right", fontSize: 12, fontWeight: 600, paddingLeft: 8 },
  filterBar: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" },
  filterInput: { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12, background: "white" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#6b7280", borderBottom: "2px solid #e5e7eb", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" },
  td: { padding: "8px 10px", borderBottom: "1px solid #f0f2f5", whiteSpace: "nowrap" },
  footer: { textAlign: "center", color: "#9ca3af", fontSize: 12, marginTop: 32 },
};
