"use client";

import { useState, useEffect, useMemo } from "react";

// ---------------------------------------------------------------------------
// Styles (embedded to keep it single-file friendly)
// ---------------------------------------------------------------------------
const GLOBAL_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f0f2f5;
    color: #1a1a2e;
  }
  ::selection { background: #3b82f6; color: #fff; }
`;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function fmtCurrency(n) {
  return "$" + Math.round(n).toLocaleString();
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_COLORS = {
  green: { bg: "#dcfce7", text: "#166534", dot: "#22c55e" },
  yellow: { bg: "#fef9c3", text: "#854d0e", dot: "#eab308" },
  red: { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  unknown: { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af" },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPICard({ label, value, detail, color }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color: color || "#1a1a2e" }}>{value}</div>
      {detail && <div style={styles.kpiDetail}>{detail}</div>}
    </div>
  );
}

function StatusBar({ status }) {
  return (
    <div style={styles.statusBar}>
      {["green", "yellow", "red", "unknown"].map((key) => (
        <div key={key} style={styles.statusSegment}>
          <div
            style={{
              ...styles.statusDot,
              background: STATUS_COLORS[key].dot,
            }}
          />
          <div>
            <div style={styles.statusCount}>{status[key] || 0}</div>
            <div style={styles.statusLabel}>
              {key === "green"
                ? "On Track"
                : key === "yellow"
                ? "At Risk"
                : key === "red"
                ? "Off Track"
                : "Unset"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BarChart({ data, labelKey, valueKey, maxVal, color = "#3b82f6", formatValue }) {
  if (!data || data.length === 0) return <div style={{ color: "#9ca3af" }}>No data</div>;
  const max = maxVal || Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div>
      {data.slice(0, 10).map((item, i) => {
        const val = item[valueKey] || 0;
        const pct = max > 0 ? (val / max) * 100 : 0;
        const isNeg = item.variance != null && item.variance < 0;
        return (
          <div key={i} style={styles.barRow}>
            <div style={styles.barLabel} title={item[labelKey]}>
              {item[labelKey]}
            </div>
            <div style={styles.barTrack}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${Math.min(pct, 100)}%`,
                  background: isNeg ? "#ef4444" : color,
                }}
              />
            </div>
            <div
              style={{
                ...styles.barValue,
                color: isNeg ? "#ef4444" : "#1a1a2e",
              }}
            >
              {formatValue ? formatValue(val) : val}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ color, label }) {
  const c = STATUS_COLORS[color] || STATUS_COLORS.unknown;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
      }}
    >
      {label}
    </span>
  );
}

function ProjectTable({ projects }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [overOnly, setOverOnly] = useState(false);
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    let result = [...projects];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          (p.project_name || "").toLowerCase().includes(q) ||
          (p.client_name || "").toLowerCase().includes(q) ||
          (p.project_manager || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      result = result.filter((p) => p.status_color === statusFilter);
    }
    if (overOnly) {
      result = result.filter((p) => p.is_overserviced);
    }
    if (sortCol != null) {
      result.sort((a, b) => {
        let av = a[sortCol];
        let bv = b[sortCol];
        if (typeof av === "number" && typeof bv === "number") {
          return sortAsc ? av - bv : bv - av;
        }
        av = String(av || "");
        bv = String(bv || "");
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return result;
  }, [projects, search, statusFilter, overOnly, sortCol, sortAsc]);

  function handleSort(col) {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  }

  const cols = [
    { key: "project_name", label: "Project" },
    { key: "client_name", label: "Client" },
    { key: "status", label: "Status" },
    { key: "project_manager", label: "PM" },
    { key: "budget_allocated", label: "Budget" },
    { key: "budget_spent", label: "Spent" },
    { key: "percent_complete", label: "% Done" },
  ];

  return (
    <>
      <div style={styles.filterBar}>
        <input
          type="text"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.filterInput}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={styles.filterInput}
        >
          <option value="">All Statuses</option>
          <option value="green">On Track</option>
          <option value="yellow">At Risk</option>
          <option value="red">Off Track</option>
          <option value="unknown">Unset</option>
        </select>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={overOnly}
            onChange={(e) => setOverOnly(e.target.checked)}
          />
          Overserviced only
        </label>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>
          {filtered.length} of {projects.length} projects
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              {cols.map((col) => (
                <th
                  key={col.key}
                  style={styles.th}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label} {sortCol === col.key ? (sortAsc ? "▲" : "▼") : ""}
                </th>
              ))}
              <th style={styles.th}>Flag</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={i} style={i % 2 === 0 ? {} : { background: "#f8f9fa" }}>
                <td style={styles.td}>{p.project_name}</td>
                <td style={styles.td}>{p.client_name}</td>
                <td style={styles.td}>
                  <StatusBadge color={p.status_color} label={p.status} />
                </td>
                <td style={styles.td}>{p.project_manager}</td>
                <td style={styles.td}>{fmtCurrency(p.budget_allocated)}</td>
                <td style={styles.td}>{fmtCurrency(p.budget_spent)}</td>
                <td style={styles.td}>
                  {p.percent_complete != null ? `${Math.round(p.percent_complete)}%` : "-"}
                </td>
                <td style={styles.td}>
                  {p.is_overserviced && (
                    <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 12 }}>
                      OVER
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...styles.td, textAlign: "center", color: "#9ca3af" }}>
                  No matching projects
                </td>
              </tr>
            )}
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
  const [lastRefresh, setLastRefresh] = useState(null);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/snapshot", { cache: "no-store" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>{data?.title || "Project Snapshot Dashboard"}</h1>
          <div style={styles.subtitle}>
            {lastRefresh && <>Last refreshed: {fmtDate(lastRefresh.toISOString())}</>}
            <button onClick={loadData} style={styles.refreshBtn} disabled={loading}>
              {loading ? "Loading..." : "↻ Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {error}
            <div style={{ marginTop: 8, fontSize: 13 }}>
              Make sure your SMARTSHEET_API_TOKEN and SMARTSHEET_SOURCE_ID are set in Vercel
              environment variables. Hit <code>/api/discover</code> to list available sheets and
              reports.
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Status Bar */}
            <StatusBar status={data.status} />

            {/* KPI Cards */}
            <div style={styles.kpiGrid}>
              <KPICard label="Active Projects" value={data.total_projects} />
              <KPICard label="Total Budget" value={fmtCurrency(data.financials.total_budget)} />
              <KPICard
                label="Total Spent"
                value={fmtCurrency(data.financials.total_spent)}
                detail={`${data.financials.burn_rate_pct}% of budget`}
              />
              <KPICard
                label="Overserviced"
                value={data.financials.overserviced_count}
                detail={`${fmtCurrency(data.financials.overserviced_amount)} over budget`}
                color={data.financials.overserviced_count > 0 ? "#ef4444" : "#22c55e"}
              />
            </div>

            {/* Charts */}
            <div style={styles.chartRow}>
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Budget by Client</h2>
                <BarChart
                  data={data.by_client}
                  labelKey="name"
                  valueKey="budget"
                  color="#3b82f6"
                  formatValue={fmtCurrency}
                />
              </div>
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Spend by Client</h2>
                <BarChart
                  data={data.by_client}
                  labelKey="name"
                  valueKey="spent"
                  maxVal={data.by_client.length > 0 ? data.by_client[0].budget : 1}
                  color="#8b5cf6"
                  formatValue={fmtCurrency}
                />
              </div>
            </div>

            {/* PM Workload */}
            {data.by_pm.length > 0 && (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Workload by Project Manager</h2>
                <BarChart
                  data={data.by_pm}
                  labelKey="name"
                  valueKey="projects"
                  color="#3b82f6"
                  formatValue={(v) => `${v} projects`}
                />
              </div>
            )}

            {/* Project Table */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Project Details</h2>
              <ProjectTable projects={data.projects} />
            </div>

            <div style={styles.footer}>
              Generated {fmtDate(data.generated_at)} via Smartsheet API
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
// Inline styles
// ---------------------------------------------------------------------------
const styles = {
  container: { maxWidth: 1200, margin: "0 auto", padding: 24 },
  header: { textAlign: "center", marginBottom: 32 },
  title: { fontSize: 28, fontWeight: 700, color: "#1a1a2e" },
  subtitle: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 4,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  refreshBtn: {
    background: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "6px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  errorBox: {
    background: "#fee2e2",
    border: "1px solid #fecaca",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    color: "#991b1b",
    fontSize: 14,
  },
  statusBar: {
    display: "flex",
    gap: 24,
    marginBottom: 24,
    background: "#fff",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    flexWrap: "wrap",
  },
  statusSegment: { display: "flex", alignItems: "center", gap: 8 },
  statusDot: { width: 14, height: 14, borderRadius: "50%" },
  statusCount: { fontSize: 24, fontWeight: 700 },
  statusLabel: { fontSize: 13, color: "#6b7280" },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },
  kpiCard: {
    background: "#fff",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#6b7280",
    marginBottom: 8,
  },
  kpiValue: { fontSize: 32, fontWeight: 700 },
  kpiDetail: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  chartRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
    marginBottom: 24,
  },
  section: {
    background: "#fff",
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  sectionTitle: { fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#1a1a2e" },
  barRow: { display: "flex", alignItems: "center", marginBottom: 10 },
  barLabel: {
    width: 140,
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  barTrack: {
    flex: 1,
    height: 24,
    background: "#f0f2f5",
    borderRadius: 6,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 6, transition: "width 0.5s ease" },
  barValue: { width: 100, textAlign: "right", fontSize: 13, fontWeight: 600, paddingLeft: 8 },
  filterBar: {
    display: "flex",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
    alignItems: "center",
  },
  filterInput: {
    padding: "6px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 13,
    background: "white",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontWeight: 600,
    color: "#6b7280",
    borderBottom: "2px solid #e5e7eb",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    cursor: "pointer",
    userSelect: "none",
  },
  td: { padding: "10px 12px", borderBottom: "1px solid #f0f2f5" },
  footer: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 32,
    paddingBottom: 24,
  },
};
