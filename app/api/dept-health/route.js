/**
 * Department Health API — Delivery & Experiences
 * v2 — Fixed column mapping for reports, section detection, penetration calculation
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
  // If value is like 0.47438, it's a decimal — convert to percentage
  return n > 0 && n < 1 ? Math.round(n * 100) : Math.round(n);
}

// ---------------------------------------------------------------------------
// Report row → object using POSITIONAL column mapping
// Reports return cells with source-sheet columnIds that don't match report
// column IDs. The only reliable approach is positional: cells[i] → columns[i].
// ---------------------------------------------------------------------------
function reportRowToObject(row, columns) {
  const obj = {};
  const cells = row.cells || [];
  for (let i = 0; i < cells.length && i < columns.length; i++) {
    const title = columns[i].title;
    obj[title] = cells[i].displayValue != null ? cells[i].displayValue : cells[i].value;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Revenue Trend Pivot — multi-section sheet
// Sections separated by blank rows, headers can be short (e.g. "OS")
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

    // Get value from first column
    const firstColTitle = columns[0] ? colMap[columns[0].id] : Object.keys(cells)[0];
    const firstVal = cells[firstColTitle];
    const firstStr = String(firstVal || "").trim();

    // Empty row — skip (section boundary)
    if (!firstStr || firstStr === "undefined" || firstStr === "null") {
      continue;
    }

    // Data row: starts with YYYY-MM
    if (/^\d{4}-\d{2}$/.test(firstStr)) {
      if (currentSection) {
        sections[currentSection].push({
          month: firstStr,
          delivery: parseCurrency(cells["Delivery"]),
          experiences: parseCurrency(cells["Experiences"]),
          total: parseCurrency(cells["Total"]),
          adjusted: parseCurrency(cells["Adjusted"]),
        });
      }
      continue;
    }

    // Sub-header rows (column labels like "Delivery", "Experiences", "Total")
    if (/^(delivery|experiences|total|adjusted)/i.test(firstStr)) {
      continue;
    }

    // Anything else that is text (not starting with a digit) = section header
    // No minimum length — handles short names like "OS"
    if (firstStr && !/^\d/.test(firstStr)) {
      currentSection = firstStr.toUpperCase();
      if (!sections[currentSection]) sections[currentSection] = [];
      continue;
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// E&D Utilization Report — POSITIONAL column mapping
// Columns (by position): Primary, Team Member, Utilization, Billable, Admin Time
// Primary has "ROLE - Name", values are decimals like 0.47
// ---------------------------------------------------------------------------
function parseUtilization(rows, columns) {
  return rows.map((row) => {
    const item = reportRowToObject(row, columns);

    // Get the name from "Team Member" or "Primary"
    let nameVal = item["Team Member"] || item["Primary"] || "";
    nameVal = String(nameVal).trim();
    if (!nameVal) return null;

    // Extract role from "ROLE - Name" pattern in Primary column
    const primaryVal = String(item["Primary"] || "").trim();
    let role = "Unknown", name = nameVal;
    if (primaryVal.includes(" - ")) {
      const parts = primaryVal.split(" - ");
      role = parts[0].trim();
      name = parts.slice(1).join(" - ").trim();
    }

    // Parse percentages — values are decimals (0.47) or display strings ("47%")
    const util = parsePercent(item["Utilization"]);
    const bill = parsePercent(item["Billable"]);
    const admin = parsePercent(item["Admin Time"]);

    return {
      name,
      role,
      utilization: util,
      billable: bill,
      admin_time: admin,
      non_billable: Math.max(0, util - bill),
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Integrated Project Status Report — POSITIONAL column mapping
// ---------------------------------------------------------------------------
function parseIntegrated(rows, columns) {
  return rows.map((row) => {
    const item = reportRowToObject(row, columns);

    const ragRaw = String(item["RAG"] || "").toLowerCase().trim();
    const rag = ["green", "yellow", "red", "blue"].includes(ragRaw) ? ragRaw : "unknown";

    return {
      rid: item["RID"] || "-",
      client: item["Client"] || "-",
      project_name: item["Assignment Title"] || item["Assignment"] || "-",
      ecosystem: item["Owning Ecosystem"] || "-",
      rag,
      budget_forecast: parseCurrency(item["Budget Forecast"]),
      actuals: parseCurrency(item["Actuals"]),
      overage: parseCurrency(item["Overage"]),
      percent_complete: parsePercent(item["% Complete"] || item["Work Progress"]),
      top_priority: item["Top Priority"] || null,
      last_weeks_deviation: parseCurrency(item["Last Weeks Deviation"]),
      creative_retainer: item["Creative Retainer"] || null,
      resource_status: item["Resource Status"] || "-",
      pm: item["PM/PROD Assigned"] || "-",
      integrated_actuals_pct: parsePercent(item["INTEGRATED Actuals %"]),
      monthly_budget: parseCurrency(item["Monthly Budget"]),
    };
  });
}

// ---------------------------------------------------------------------------
// Penetration Calculator
// Replicates the Smartsheet SUMIF formulas from the raw Time & Fees data:
//   Experiences = SUM(disciplines) / total incurred
//   Delivery = SUM(disciplines) / total incurred
// ---------------------------------------------------------------------------
function calculatePenetration(raw) {
  if (!raw || !raw.rows || !raw.columns) return { experiences: null, delivery: null };

  // Find column IDs for Discipline and Incurred (currency)
  let disciplineColId = null;
  let incurredColId = null;
  for (const col of raw.columns) {
    const t = (col.title || "").toLowerCase();
    if (t === "discipline") disciplineColId = col.id;
    if (t.includes("incurred") && t.includes("currency")) incurredColId = col.id;
  }

  if (!disciplineColId || !incurredColId) {
    return { experiences: null, delivery: null };
  }

  const EXP_DISCIPLINES = [
    "CREATIVE COPYWRITER", "CREATIVE STRATEGY", "DESIGN",
    "DIGITAL PRODUCER", "INTEGRATED STRATEGY", "STUDIO MANAGEMENT", "TECH DEV",
  ];
  const DEL_DISCIPLINES = ["IPM", "SUPPORT"];

  let totalIncurred = 0;
  let expIncurred = 0;
  let delIncurred = 0;

  for (const row of raw.rows) {
    let discipline = null;
    let incurred = 0;
    for (const cell of row.cells || []) {
      if (cell.columnId === disciplineColId) {
        discipline = String(cell.value || cell.displayValue || "").toUpperCase().trim();
      }
      if (cell.columnId === incurredColId) {
        incurred = parseCurrency(cell.value != null ? cell.value : cell.displayValue);
      }
    }
    if (incurred !== 0) {
      totalIncurred += incurred;
      if (discipline && EXP_DISCIPLINES.includes(discipline)) expIncurred += incurred;
      if (discipline && DEL_DISCIPLINES.includes(discipline)) delIncurred += incurred;
    }
  }

  if (totalIncurred === 0) return { experiences: null, delivery: null };

  return {
    experiences: Math.round((expIncurred / totalIncurred) * 100),
    delivery: Math.round((delIncurred / totalIncurred) * 100),
  };
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
      apiRequest(`/reports/${INTEGRATED_REPORT}?pageSize=100`),
      apiRequest(`/sheets/${PENETRATION_THIS_MONTH}?pageSize=10000`).catch(() => null),
      apiRequest(`/sheets/${PENETRATION_LAST_MONTH}?pageSize=10000`).catch(() => null),
    ]);

    // Parse each source
    const revenueSections = parseRevenuePivot(revenueRaw.rows || [], revenueRaw.columns || []);
    const utilization = parseUtilization(utilizationRaw.rows || [], utilizationRaw.columns || []);
    const integrated = parseIntegrated(integratedRaw.rows || [], integratedRaw.columns || []);
    const penThis = calculatePenetration(penThisRaw);
    const penLast = calculatePenetration(penLastRaw);

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
    // Revenue summary — use latest month with non-zero data
    // -----------------------------------------------------------------------
    const effort = revenueSections["TOTAL EFFORT"] || [];
    const latestNonZero = [...effort].reverse().find((m) => m.total > 0);
    const latestIdx = latestNonZero ? effort.indexOf(latestNonZero) : -1;
    const prevMonth = latestIdx > 0 ? effort[latestIdx - 1] : null;
    const revenueSummary = {
      latest_month: latestNonZero?.month || null,
      latest_total: latestNonZero?.total || 0,
      latest_delivery: latestNonZero?.delivery || 0,
      latest_experiences: latestNonZero?.experiences || 0,
      mom_change: (latestNonZero && prevMonth && prevMonth.total > 0)
        ? Math.round(((latestNonZero.total - prevMonth.total) / prevMonth.total) * 1000) / 10
        : null,
      delivery_share: latestNonZero && latestNonZero.total > 0
        ? Math.round((latestNonZero.delivery / latestNonZero.total) * 1000) / 10
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
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("Dept health error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
