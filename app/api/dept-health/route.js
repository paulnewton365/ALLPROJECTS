/**
 * Department Health API — Delivery & Experiences
 * Fetches from 5 Smartsheet sources:
 *   - Revenue Trend Pivot (sheet)
 *   - E&D Utilization (report)
 *   - Integrated Project Status (report)
 *   - Penetration This Month (sheet)
 *   - Penetration Last Month (sheet)
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = "https://api.smartsheet.com/2.0";

async function apiRequest(endpoint) {
  const token = process.env.SMARTSHEET_API_TOKEN;
  if (!token) throw new Error("SMARTSHEET_API_TOKEN not set");
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Smartsheet ${res.status}: ${body}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseCurrency(val) {
  if (val == null || val === "" || val === "No Tracking") return 0;
  const s = String(val).replace(/[$,\s]/g, "");
  if (s.startsWith("(") && s.endsWith(")")) return -parseFloat(s.slice(1, -1)) || 0;
  return parseFloat(s) || 0;
}

function parsePercent(val) {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/%/g, "").trim();
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return n < 1 && n > 0 ? Math.round(n * 100) : Math.round(n);
}

// ---------------------------------------------------------------------------
// Revenue Trend Pivot — multi-section sheet (65 rows)
// Sections: TOTAL EFFORT, BOOKED REVENUE, DEVIATION, etc.
// Each section has header row, sub-header (Delivery | Experiences | Total | Adjusted Total)
// Then monthly rows: YYYY-MM | val | val | val | val
// ---------------------------------------------------------------------------
function parseRevenuePivot(rows, columns) {
  const colMap = {};
  for (const col of columns) colMap[col.id] = col.title;

  const sections = {};
  let currentSection = null;

  for (const row of rows) {
    const cells = {};
    for (const cell of row.cells || []) {
      const name = colMap[cell.columnId] || "";
      cells[name] = cell.displayValue || cell.value;
    }

    const firstVal = Object.values(cells)[0];
    const firstStr = String(firstVal || "").trim();

    // Detect section header: ALL CAPS, no numbers
    if (firstStr && firstStr === firstStr.toUpperCase() && !/\d{4}-\d{2}/.test(firstStr) && firstStr.length > 3) {
      currentSection = firstStr;
      if (!sections[currentSection]) sections[currentSection] = [];
      continue;
    }

    // Skip sub-header rows (contain "Delivery", "Experiences", etc.)
    if (/^(delivery|experiences|total|adjusted)/i.test(firstStr)) continue;

    // Data row: starts with YYYY-MM
    if (/^\d{4}-\d{2}$/.test(firstStr) && currentSection) {
      const vals = Object.values(cells);
      sections[currentSection].push({
        month: firstStr,
        delivery: parseCurrency(vals[1]),
        experiences: parseCurrency(vals[2]),
        total: parseCurrency(vals[3]),
        adjusted: parseCurrency(vals[4]),
      });
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// E&D Utilization Report (13 rows)
// Columns: "ROLE - Name", Utilization %, Billable %, Admin Time %
// ---------------------------------------------------------------------------
function parseUtilization(rows, columns) {
  const colMap = {};
  for (const col of columns) colMap[col.id] = col.title;

  return rows.map((row) => {
    const item = {};
    for (const cell of row.cells || []) {
      const name = colMap[cell.columnId] || "";
      item[name] = cell.displayValue || cell.value;
    }
    // Find the name column (first text column, often "Team Member" or first col)
    const nameCol = Object.keys(item).find((k) => /team|member|name/i.test(k)) || Object.keys(item)[0];
    const nameVal = String(item[nameCol] || "").trim();
    if (!nameVal) return null;

    // Extract role from "ROLE - Name" format
    let role = "Unknown", name = nameVal;
    if (nameVal.includes(" - ")) {
      const parts = nameVal.split(" - ");
      role = parts[0].trim();
      name = parts.slice(1).join(" - ").trim();
    }

    return {
      name,
      role,
      utilization: parsePercent(item["Utilization %"] || item["Utilization"]),
      billable: parsePercent(item["Billable %"] || item["Billable"]),
      admin_time: parsePercent(item["Admin Time %"] || item["Admin Time"] || item["Admin"]),
      non_billable: 0, // calculated below
    };
  }).filter(Boolean).map((t) => {
    t.non_billable = Math.max(0, (t.utilization || 0) - (t.billable || 0));
    return t;
  });
}

// ---------------------------------------------------------------------------
// Integrated Project Status Report (26 rows)
// Has unique fields not in main report: Top Priority, Last Weeks Deviation, etc.
// ---------------------------------------------------------------------------
function parseIntegrated(rows, columns) {
  const colMap = {};
  for (const col of columns) colMap[col.id] = col.title;

  return rows.map((row) => {
    const item = {};
    for (const cell of row.cells || []) {
      const name = colMap[cell.columnId] || "";
      item[name] = cell.displayValue || cell.value;
    }
    return {
      rid: item["RID"] || "-",
      client: item["Client"] || "-",
      project_name: item["Assignment Title"] || item["Assignment"] || "-",
      ecosystem: item["Owning Ecosystem"] || item["Ecosystem"] || "-",
      rag: (item["RAG"] || "").toLowerCase().trim() || "unknown",
      budget_forecast: parseCurrency(item["Budget Forecast"]),
      actuals: parseCurrency(item["Actuals"]),
      overage: parseCurrency(item["Overage"]),
      percent_complete: parsePercent(item["Work Progress"] || item["% Complete"]),
      top_priority: item["Top Priority"] || null,
      last_weeks_deviation: parseCurrency(item["Last Weeks Deviation"] || item["Last Week's Deviation"]),
      creative_retainer: item["Creative Retainer"] || null,
      resource_status: item["Resource Status"] || "-",
      pm: item["PM/PROD Assigned"] || item["PM/Prod Assigned"] || "-",
      integrated_actuals_pct: parsePercent(item["INTEGRATED Actuals %"]),
      monthly_budget: parseCurrency(item["Monthly Budget"]),
    };
  });
}

// ---------------------------------------------------------------------------
// Penetration Sheet Parser
// Small sheets with Experiences % and Delivery % values
// ---------------------------------------------------------------------------
function parsePenetrationSheet(raw) {
  if (!raw || !raw.rows) return { experiences: null, delivery: null };
  const colMap = {};
  for (const col of raw.columns || []) colMap[col.id] = col.title;

  const result = { experiences: null, delivery: null };
  const allCells = [];

  for (const row of raw.rows) {
    const rowData = {};
    for (const cell of row.cells || []) {
      const colName = colMap[cell.columnId] || "";
      const val = cell.displayValue || cell.value;
      rowData[colName] = val;
      if (val != null) allCells.push({ colName, val: String(val), rowId: row.id });
    }
    const vals = Object.values(rowData).map((v) => String(v || ""));
    const hasExp = vals.some((v) => /experiences/i.test(v));
    const hasDel = vals.some((v) => /delivery/i.test(v));
    const pctVal = vals.find((v) => v.match(/^\d+%?$/) || v.match(/^\d+\.\d+%?$/));
    const pctNum = pctVal ? parseFloat(pctVal.replace(/%/, "")) : null;
    if (hasExp && pctNum != null) result.experiences = pctNum;
    if (hasDel && pctNum != null) result.delivery = pctNum;
  }

  // Fallback: if exactly 2 rows with percentages, assume first=Experiences, second=Delivery
  if (result.experiences == null && result.delivery == null) {
    const pctCells = allCells.filter((c) => {
      const sv = String(c.val);
      return sv.match(/^\d+%?$/) && parseFloat(sv) <= 100;
    });
    if (pctCells.length >= 2) {
      result.experiences = parseFloat(pctCells[0].val);
      result.delivery = parseFloat(pctCells[1].val);
    } else if (pctCells.length === 1) {
      result.experiences = parseFloat(pctCells[0].val);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main GET handler
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const REVENUE_PIVOT_SHEET = process.env.DEPT_REVENUE_SHEET_ID || "813359948582788";
    const UTILIZATION_REPORT = process.env.DEPT_UTILIZATION_REPORT_ID || "6562385201418116";
    const INTEGRATED_REPORT = process.env.DEPT_INTEGRATED_REPORT_ID || "7478085113827204";
    const PENETRATION_THIS_MONTH = process.env.DEPT_PENETRATION_THIS_ID || "4701999716061060";
    const PENETRATION_LAST_MONTH = process.env.DEPT_PENETRATION_LAST_ID || "1413449557954436";

    // Fetch all 5 sources in parallel — penetration uses .catch() so failure is non-fatal
    const [revenueRaw, utilizationRaw, integratedRaw, penThisRaw, penLastRaw] = await Promise.all([
      apiRequest(`/sheets/${REVENUE_PIVOT_SHEET}?pageSize=10000`),
      apiRequest(`/reports/${UTILIZATION_REPORT}?pageSize=100`),
      apiRequest(`/reports/${INTEGRATED_REPORT}?pageSize=100&include=sourceSheets`),
      apiRequest(`/sheets/${PENETRATION_THIS_MONTH}?pageSize=100`).catch(() => null),
      apiRequest(`/sheets/${PENETRATION_LAST_MONTH}?pageSize=100`).catch(() => null),
    ]);

    // Parse each source
    const revenueSections = parseRevenuePivot(revenueRaw.rows || [], revenueRaw.columns || []);
    const utilization = parseUtilization(utilizationRaw.rows || [], utilizationRaw.columns || []);
    const integrated = parseIntegrated(integratedRaw.rows || [], integratedRaw.columns || []);
    const penThis = parsePenetrationSheet(penThisRaw);
    const penLast = parsePenetrationSheet(penLastRaw);

    // -----------------------------------------------------------------------
    // Aggregate utilization
    // -----------------------------------------------------------------------
    const utilizationSummary = {
      team_size: utilization.length,
      avg_utilization: utilization.length > 0 ? Math.round(utilization.reduce((a, t) => a + (t.utilization || 0), 0) / utilization.length) : 0,
      avg_billable: utilization.length > 0 ? Math.round(utilization.reduce((a, t) => a + (t.billable || 0), 0) / utilization.length) : 0,
      avg_admin: utilization.length > 0 ? Math.round(utilization.reduce((a, t) => a + (t.admin_time || 0), 0) / utilization.length) : 0,
      high_utilization: utilization.filter((t) => (t.utilization || 0) >= 80).length,
      low_billable: utilization.filter((t) => (t.billable || 0) < 30).length,
      by_role: (() => {
        const roles = {};
        for (const t of utilization) {
          if (!roles[t.role]) roles[t.role] = { count: 0, totalUtil: 0, totalBillable: 0, totalAdmin: 0 };
          roles[t.role].count++;
          roles[t.role].totalUtil += t.utilization || 0;
          roles[t.role].totalBillable += t.billable || 0;
          roles[t.role].totalAdmin += t.admin_time || 0;
        }
        return Object.entries(roles).map(([role, data]) => ({
          role,
          count: data.count,
          avg_utilization: Math.round(data.totalUtil / data.count),
          avg_billable: Math.round(data.totalBillable / data.count),
          avg_admin: Math.round(data.totalAdmin / data.count),
        }));
      })(),
    };

    // -----------------------------------------------------------------------
    // Aggregate integrated projects
    // -----------------------------------------------------------------------
    const integratedSummary = {
      total_projects: integrated.length,
      total_budget: integrated.reduce((a, p) => a + p.budget_forecast, 0),
      total_actuals: integrated.reduce((a, p) => a + p.actuals, 0),
      total_overage: integrated.reduce((a, p) => a + Math.max(0, p.overage), 0),
      total_deviation: integrated.reduce((a, p) => a + (p.last_weeks_deviation || 0), 0),
      rag: (() => {
        const counts = { green: 0, yellow: 0, red: 0, blue: 0 };
        integrated.forEach((p) => { if (counts[p.rag] != null) counts[p.rag]++; });
        return counts;
      })(),
      by_ecosystem: (() => {
        const ecos = {};
        integrated.forEach((p) => {
          const e = p.ecosystem || "Other";
          if (!ecos[e]) ecos[e] = { count: 0, budget: 0, actuals: 0, overage: 0, deviation: 0 };
          ecos[e].count++;
          ecos[e].budget += p.budget_forecast;
          ecos[e].actuals += p.actuals;
          ecos[e].overage += p.overage;
          ecos[e].deviation += p.last_weeks_deviation || 0;
        });
        return ecos;
      })(),
    };

    // -----------------------------------------------------------------------
    // Revenue summary from TOTAL EFFORT section
    // -----------------------------------------------------------------------
    const effort = revenueSections["TOTAL EFFORT"] || [];
    const latestMonth = effort.length > 0 ? effort[effort.length - 1] : null;
    const prevMonth = effort.length > 1 ? effort[effort.length - 2] : null;
    const revenueSummary = {
      latest_month: latestMonth?.month || null,
      latest_total: latestMonth?.total || 0,
      latest_delivery: latestMonth?.delivery || 0,
      latest_experiences: latestMonth?.experiences || 0,
      mom_change: (latestMonth && prevMonth && prevMonth.total > 0)
        ? Math.round(((latestMonth.total - prevMonth.total) / prevMonth.total) * 1000) / 10
        : null,
      delivery_share: latestMonth && latestMonth.total > 0
        ? Math.round((latestMonth.delivery / latestMonth.total) * 1000) / 10
        : null,
    };

    return Response.json({
      generated_at: new Date().toISOString(),
      revenue_sections: revenueSections,
      revenue_summary: revenueSummary,
      utilization: utilization,
      utilization_summary: utilizationSummary,
      integrated_projects: integrated,
      integrated_summary: integratedSummary,
      penetration: {
        this_month: penThis,
        last_month: penLast,
      },
      _debug_penetration: {
        this_month_sheet: penThisRaw?.name || "failed to fetch",
        last_month_sheet: penLastRaw?.name || "failed to fetch",
        this_month_rows: penThisRaw?.totalRowCount || 0,
        last_month_rows: penLastRaw?.totalRowCount || 0,
      },
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("Dept health error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
