/**
 * Department Health API — Fetches Delivery vs Experiences data
 * Sources: Revenue Trend Pivot (sheet), E&D Utilization (report), Integrated Project Status (report)
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
    throw new Error(`Smartsheet API error ${res.status}: ${body}`);
  }
  return res.json();
}

function parseCurrency(val) {
  if (val == null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const s = String(val).trim();
  if (!s || s === "No Tracking" || s === "-" || s === "N/A") return 0;
  const isNeg = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));
  const cleaned = s.replace(/[$,\s()]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return isNeg && num > 0 ? -num : num;
}

function parsePercent(val) {
  if (val == null) return null;
  if (typeof val === "number") return isNaN(val) ? null : (val > 1 ? val : val * 100);
  const s = String(val).trim();
  if (!s || s === "-" || s === "N/A") return null;
  const num = parseFloat(s.replace(/[%\s]/g, ""));
  return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Parse Revenue Trend Pivot sheet (65 rows, multi-section layout)
// Sections: TOTAL EFFORT, BOOKED REVENUE, DEVIATION, etc.
// Each section has header rows then monthly data rows (YYYY-MM format)
// ---------------------------------------------------------------------------
function parseRevenuePivot(rows, columns) {
  const colMap = {};
  for (const col of columns) {
    colMap[col.id || col.virtualId] = col.title;
  }

  // Convert raw rows to objects
  const parsed = rows.map((row) => {
    const item = {};
    for (const cell of row.cells || []) {
      const colId = cell.columnId || cell.virtualColumnId;
      const colName = colMap[colId];
      if (colName) item[colName] = cell.displayValue || cell.value || null;
    }
    return item;
  });

  // Walk through rows detecting sections
  const sections = {};
  let currentSection = null;

  for (const row of parsed) {
    const primary = (row["Primary Column"] || "").trim();

    // Skip blank rows
    if (!primary) continue;

    // Detect section headers (all caps, no currency)
    if (primary === primary.toUpperCase() && !primary.startsWith("$") && !primary.match(/^\d{4}-\d{2}$/)) {
      // Check if it's a known header or looks like one
      if (!primary.match(/^\d/) && primary.length > 2) {
        currentSection = primary;
        if (!sections[currentSection]) sections[currentSection] = [];
        continue;
      }
    }

    // Skip sub-headers (where Delivery column = "Delivery")
    if (row["Delivery"] === "Delivery" || row["Experiences"] === "Experiences") continue;

    // Monthly data row (YYYY-MM format)
    if (primary.match(/^\d{4}-\d{2}$/) && currentSection) {
      sections[currentSection].push({
        month: primary,
        delivery: parseCurrency(row["Delivery"]),
        experiences: parseCurrency(row["Experiences"]),
        total: parseCurrency(row["Total"]),
        adjusted: parseCurrency(row["Adjusted"]),
      });
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Parse E&D Utilization report
// ---------------------------------------------------------------------------
function parseUtilization(rows, columns) {
  const colMap = {};
  for (const col of columns) {
    colMap[col.virtualId || col.id] = col.title;
  }

  return rows.map((row) => {
    const item = {};
    for (const cell of row.cells || []) {
      const colId = cell.virtualColumnId || cell.columnId;
      item[colMap[colId] || `col_${colId}`] = cell.displayValue || cell.value || null;
    }

    // Extract role from "ROLE - Name" format in Primary column
    const primary = item["Primary"] || item["Team Member"] || "";
    const dashIdx = primary.indexOf(" - ");
    const role = dashIdx > -1 ? primary.substring(0, dashIdx).trim() : "Unknown";
    const name = item["Team Member"] || (dashIdx > -1 ? primary.substring(dashIdx + 3).trim() : primary);

    return {
      name,
      role,
      utilization: parsePercent(item["Utilization"]),
      billable: parsePercent(item["Billable"]),
      admin_time: parsePercent(item["Admin Time"]),
      // Derived: non-billable utilization = utilization - billable
      non_billable: (() => {
        const u = parsePercent(item["Utilization"]);
        const b = parsePercent(item["Billable"]);
        return (u != null && b != null) ? Math.round(u - b) : null;
      })(),
    };
  }).filter((r) => r.name); // Filter out any empty rows
}

// ---------------------------------------------------------------------------
// Parse Integrated Project Status report (for unique fields)
// ---------------------------------------------------------------------------
function parseIntegrated(rows, columns) {
  const colMap = {};
  for (const col of columns) {
    colMap[col.virtualId || col.id] = col.title;
  }

  return rows.map((row) => {
    const item = {};
    for (const cell of row.cells || []) {
      const colId = cell.virtualColumnId || cell.columnId;
      item[colMap[colId] || `col_${colId}`] = cell.displayValue || cell.value || null;
    }

    return {
      rid: item["RID"] || "-",
      client: item["Client"] || "-",
      project_name: item["Assignment Title"] || "-",
      workflow_status: item["Workflow Status"] || "-",
      ecosystem: item["Owning Ecosystem"] || "-",
      budget_forecast: parseCurrency(item["Budget Forecast"]),
      actuals: parseCurrency(item["Actuals"]),
      overage: parseCurrency(item["Overage"]),
      rag: (item["RAG"] || "").toLowerCase(),
      top_priority: item["Top Priority"] || null,
      last_weeks_deviation: parseCurrency(item["Last Weeks Deviation"]),
      work_progress: item["Work Progress"] || "-",
      percent_complete: parsePercent(item["% Complete"]),
      approved_investment: parseCurrency(item["Approved Investment Total"]),
      pm: item["PM/PROD Assigned"] || "-",
      has_pm: item["PM?"] || "-",
      creative_retainer: item["Creative Retainer"] || null,
      resource_status: item["Resource Status"] || "-",
      assignment: item["Assignment"] || "-",
      integrated_actuals_pct: parsePercent(item["INTEGRATED Actuals %"]),
      recommendation: item["RECOMMENDATION"] || null,
      monthly_baseline: parseCurrency(item["Monthly Baseline Budget"]),
      monthly_budget: parseCurrency(item["Monthly Budget"]),
      request_type: item["Request Type"] || "-",
      investment_forecast: parseCurrency(item["Investment Forecast"]),
    };
  });
}

export async function GET() {
  try {
    // Source IDs from dashboard inspection
    const REVENUE_PIVOT_SHEET = process.env.DEPT_REVENUE_SHEET_ID || "813359948582788";
    const UTILIZATION_REPORT = process.env.DEPT_UTILIZATION_REPORT_ID || "6562385201418116";
    const INTEGRATED_REPORT = process.env.DEPT_INTEGRATED_REPORT_ID || "7478085113827204";
    const PENETRATION_THIS_MONTH = process.env.DEPT_PENETRATION_THIS_ID || "4701999716061060";
    const PENETRATION_LAST_MONTH = process.env.DEPT_PENETRATION_LAST_ID || "1413449557954436";

    // Fetch all 5 sources in parallel
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

    // ---------------------------------------------------------------------------
    // Aggregate utilization
    // ---------------------------------------------------------------------------
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
        })).sort((a, b) => b.avg_billable - a.avg_billable);
      })(),
    };

    // ---------------------------------------------------------------------------
    // Aggregate integrated projects
    // ---------------------------------------------------------------------------
    const integratedSummary = {
      total_projects: integrated.length,
      total_budget: integrated.reduce((a, p) => a + p.budget_forecast, 0),
      total_actuals: integrated.reduce((a, p) => a + p.actuals, 0),
      total_overage: integrated.reduce((a, p) => a + p.overage, 0),
      total_deviation: integrated.reduce((a, p) => a + p.last_weeks_deviation, 0),
      rag: { green: 0, yellow: 0, red: 0, blue: 0 },
      by_ecosystem: {},
    };
    for (const p of integrated) {
      if (integratedSummary.rag[p.rag] != null) integratedSummary.rag[p.rag]++;
      const eco = p.ecosystem || "Other";
      if (!integratedSummary.by_ecosystem[eco]) integratedSummary.by_ecosystem[eco] = { count: 0, budget: 0, actuals: 0, overage: 0, deviation: 0 };
      integratedSummary.by_ecosystem[eco].count++;
      integratedSummary.by_ecosystem[eco].budget += p.budget_forecast;
      integratedSummary.by_ecosystem[eco].actuals += p.actuals;
      integratedSummary.by_ecosystem[eco].overage += p.overage;
      integratedSummary.by_ecosystem[eco].deviation += p.last_weeks_deviation;
    }

    // ---------------------------------------------------------------------------
    // Revenue trend — compute latest month totals and MoM change
    // ---------------------------------------------------------------------------
    const effortData = revenueSections["TOTAL EFFORT"] || [];
    const latestMonth = effortData.length > 0 ? effortData[effortData.length - 1] : null;
    const prevMonth = effortData.length > 1 ? effortData[effortData.length - 2] : null;

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

    // ---------------------------------------------------------------------------
    // Parse penetration sheets
    // These are small sheets with Experiences % and Delivery % values
    // ---------------------------------------------------------------------------
    function parsePenetrationSheet(raw) {
      if (!raw || !raw.rows) return { experiences: null, delivery: null };
      const colMap = {};
      for (const col of raw.columns || []) {
        colMap[col.id] = col.title;
      }
      // Walk all cells looking for percentage values and labels
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
        // Look for rows containing "Experiences" or "Delivery" with a percentage value
        const vals = Object.values(rowData).map((v) => String(v || ""));
        const hasExp = vals.some((v) => /experiences/i.test(v));
        const hasDel = vals.some((v) => /delivery/i.test(v));
        // Find percentage value in this row
        const pctVal = vals.find((v) => v.match(/^\d+%?$/) || v.match(/^\d+\.\d+%?$/));
        const pctNum = pctVal ? parseFloat(pctVal.replace(/%/, "")) : null;
        if (hasExp && pctNum != null) result.experiences = pctNum;
        if (hasDel && pctNum != null) result.delivery = pctNum;
      }
      // Fallback: if sheet has exactly 2 rows with percentages, assume first=Experiences, second=Delivery
      if (result.experiences == null && result.delivery == null) {
        const pctCells = allCells.filter((c) => {
          const s = String(c.val);
          return s.match(/^\d+%?$/) && parseFloat(s) <= 100;
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

    const penThis = parsePenetrationSheet(penThisRaw);
    const penLast = parsePenetrationSheet(penLastRaw);

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
      // Debug: include raw sheet names to verify we got the right data
      _debug_penetration: {
        this_month_sheet: penThisRaw?.name || "failed to fetch",
        last_month_sheet: penLastRaw?.name || "failed to fetch",
        this_month_rows: penThisRaw?.totalRowCount || 0,
        last_month_rows: penLastRaw?.totalRowCount || 0,
      },
    });
  } catch (err) {
    console.error("Dept health error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
