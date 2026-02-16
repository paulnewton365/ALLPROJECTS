/**
 * Department Health API — Delivery & Experiences
 * v3 — Positional column mapping, discipline-based revenue, service mix matrix
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
  return n > 0 && n < 1 ? Math.round(n * 1000) / 10 : Math.round(n);
}

// Report row → object by POSITION (reports have mismatched column IDs)
function reportRowToObject(row, columns) {
  const obj = {};
  const cells = row.cells || [];
  for (let i = 0; i < cells.length && i < columns.length; i++) {
    obj[columns[i].title] = cells[i].displayValue != null ? cells[i].displayValue : cells[i].value;
  }
  return obj;
}

// Discipline groupings
const EXP_DISCIPLINES = ["CREATIVE COPYWRITER", "CREATIVE STRATEGY", "DESIGN", "DIGITAL PRODUCER", "INTEGRATED STRATEGY", "STUDIO MANAGEMENT", "TECH DEV"];
const DEL_DISCIPLINES = ["IPM", "SUPPORT"];

// ---------------------------------------------------------------------------
// Revenue Trend Pivot — multi-section sheet
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
    const firstColTitle = columns[0] ? colMap[columns[0].id] : Object.keys(cells)[0];
    const firstStr = String(cells[firstColTitle] || "").trim();

    if (!firstStr || firstStr === "undefined" || firstStr === "null") continue;
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
    if (/^(delivery|experiences|total|adjusted)/i.test(firstStr)) continue;
    if (!/^\d/.test(firstStr)) {
      currentSection = firstStr.toUpperCase();
      if (!sections[currentSection]) sections[currentSection] = [];
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// E&D Utilization Report — positional mapping
// ---------------------------------------------------------------------------
function parseUtilization(rows, columns) {
  return rows.map((row) => {
    const item = reportRowToObject(row, columns);
    let nameVal = item["Team Member"] || item["Primary"] || "";
    nameVal = String(nameVal).trim();
    if (!nameVal) return null;
    const primaryVal = String(item["Primary"] || "").trim();
    let role = "Unknown", name = nameVal;
    if (primaryVal.includes(" - ")) {
      const parts = primaryVal.split(" - ");
      role = parts[0].trim();
      name = parts.slice(1).join(" - ").trim();
    }
    return {
      name, role,
      utilization: parsePercent(item["Utilization"]),
      billable: parsePercent(item["Billable"]),
      admin_time: parsePercent(item["Admin Time"]),
      non_billable: Math.max(0, parsePercent(item["Utilization"]) - parsePercent(item["Billable"])),
      utilization_target: parsePercent(item["Utilization Target"] || item["Target"] || item["Util Target"] || item["Utilization target"] || item["target"] || item["Target %"] || item["Util. Target"]),
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Integrated Project Status — positional mapping + request_type extraction
// ---------------------------------------------------------------------------
function parseIntegrated(rows, columns) {
  return rows.map((row) => {
    const item = reportRowToObject(row, columns);
    const ragRaw = String(item["RAG"] || "").toLowerCase().trim();
    const rag = ["green", "yellow", "red", "blue"].includes(ragRaw) ? ragRaw : "unknown";
    // Split comma-separated request types
    const rtRaw = item["Request Type"] || "";
    const requestTypes = rtRaw ? String(rtRaw).split(",").map((s) => s.trim()).filter(Boolean) : [];

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
      request_types: requestTypes,
    };
  });
}

// ---------------------------------------------------------------------------
// Penetration + Revenue from Time & Fees sheets
// Replicates SUMIF formulas: sum Incurred + Forecast by discipline
// ---------------------------------------------------------------------------
function calculateFromTimesheet(raw) {
  if (!raw?.rows?.length) return null;
  let disciplineColId = null, incurredColId = null, forecastColId = null;
  for (const col of raw.columns || []) {
    const t = (col.title || "").toLowerCase();
    if (t === "discipline") disciplineColId = col.id;
    if (t.includes("incurred") && t.includes("currency")) incurredColId = col.id;
    if (t.includes("forecast") && t.includes("currency")) forecastColId = col.id;
    if (!forecastColId && t.includes("budget") && t.includes("currency")) forecastColId = col.id;
  }
  if (!disciplineColId || !incurredColId) return null;

  let totalIncurred = 0, expIncurred = 0, delIncurred = 0;
  let totalForecast = 0, expForecast = 0, delForecast = 0;

  for (const row of raw.rows) {
    let discipline = null, incurred = 0, forecast = 0;
    for (const cell of row.cells || []) {
      if (cell.columnId === disciplineColId) discipline = String(cell.value || cell.displayValue || "").toUpperCase().trim();
      if (cell.columnId === incurredColId) incurred = parseCurrency(cell.value != null ? cell.value : cell.displayValue);
      if (forecastColId && cell.columnId === forecastColId) forecast = parseCurrency(cell.value != null ? cell.value : cell.displayValue);
    }
    totalIncurred += incurred;
    totalForecast += forecast;
    if (discipline && EXP_DISCIPLINES.includes(discipline)) { expIncurred += incurred; expForecast += forecast; }
    if (discipline && DEL_DISCIPLINES.includes(discipline)) { delIncurred += incurred; delForecast += forecast; }
  }

  const total = totalIncurred + totalForecast;
  return {
    total_revenue: total,
    exp_revenue: expIncurred + expForecast,
    del_revenue: delIncurred + delForecast,
    exp_incurred: expIncurred,
    del_incurred: delIncurred,
    exp_forecast: expForecast,
    del_forecast: delForecast,
    // Penetration = discipline share of total incurred only (matches SS formula)
    penetration_exp: totalIncurred > 0 ? Math.round((expIncurred / totalIncurred) * 100) : 0,
    penetration_del: totalIncurred > 0 ? Math.round((delIncurred / totalIncurred) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Build Service Mix matrix from integrated projects (for BubbleMatrix)
// ---------------------------------------------------------------------------
function buildServiceMixMatrix(projects) {
  const ecoSet = new Set();
  const rtSet = new Set();
  for (const p of projects) {
    if (p.ecosystem && p.ecosystem !== "-") ecoSet.add(p.ecosystem);
    for (const rt of (p.request_types || [])) rtSet.add(rt);
  }
  const ecosystems = [...ecoSet].sort();
  const requestTypes = [...rtSet].sort();

  // Build cells[ecoIdx][rtIdx] = { count, budget }
  const cells = ecosystems.map(() => requestTypes.map(() => ({ count: 0, budget: 0 })));
  for (const p of projects) {
    const eIdx = ecosystems.indexOf(p.ecosystem);
    if (eIdx === -1) continue;
    for (const rt of (p.request_types || [])) {
      const rIdx = requestTypes.indexOf(rt);
      if (rIdx === -1) continue;
      cells[eIdx][rIdx].count++;
      cells[eIdx][rIdx].budget += p.budget_forecast || 0;
    }
  }
  return { ecosystems, requestTypes, cells };
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

    const [revenueRaw, utilizationRaw, integratedRaw, penThisRaw, penLastRaw] = await Promise.all([
      apiRequest(`/sheets/${REVENUE_PIVOT_SHEET}?pageSize=10000`),
      apiRequest(`/reports/${UTILIZATION_REPORT}?pageSize=100`),
      apiRequest(`/reports/${INTEGRATED_REPORT}?pageSize=100`),
      apiRequest(`/sheets/${PENETRATION_THIS_MONTH}?pageSize=10000`).catch(() => null),
      apiRequest(`/sheets/${PENETRATION_LAST_MONTH}?pageSize=10000`).catch(() => null),
    ]);

    const revenueSections = parseRevenuePivot(revenueRaw.rows || [], revenueRaw.columns || []);
    const utilization = parseUtilization(utilizationRaw.rows || [], utilizationRaw.columns || []);
    const utilization_columns = (utilizationRaw.columns || []).map((c) => c.title);
    const integrated = parseIntegrated(integratedRaw.rows || [], integratedRaw.columns || []);
    const thisMonthCalc = calculateFromTimesheet(penThisRaw);
    const lastMonthCalc = calculateFromTimesheet(penLastRaw);

    // -----------------------------------------------------------------------
    // Utilization summary
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
          role, count: data.count,
          avg_utilization: Math.round(data.totalUtil / data.count),
          avg_billable: Math.round(data.totalBillable / data.count),
          avg_admin: Math.round(data.totalAdmin / data.count),
        }));
      })(),
    };

    // -----------------------------------------------------------------------
    // Integrated summary + ecosystem revenue
    // -----------------------------------------------------------------------
    const integratedSummary = {
      total_projects: integrated.length,
      total_budget: integrated.reduce((a, p) => a + p.budget_forecast, 0),
      total_actuals: integrated.reduce((a, p) => a + p.actuals, 0),
      total_overage: integrated.reduce((a, p) => a + (p.overage || 0), 0),
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
    // Revenue summary — from timesheets (Actuals + Forecast)
    // -----------------------------------------------------------------------
    const revenueSummary = {
      // Live revenue from this month's timesheets
      this_month_total: thisMonthCalc ? thisMonthCalc.total_revenue : 0,
      this_month_exp: thisMonthCalc ? thisMonthCalc.exp_revenue : 0,
      this_month_del: thisMonthCalc ? thisMonthCalc.del_revenue : 0,
      last_month_total: lastMonthCalc ? lastMonthCalc.total_revenue : 0,
      last_month_exp: lastMonthCalc ? lastMonthCalc.exp_revenue : 0,
      last_month_del: lastMonthCalc ? lastMonthCalc.del_revenue : 0,
    };

    // -----------------------------------------------------------------------
    // Penetration (from incurred only, matching SS formulas)
    // -----------------------------------------------------------------------
    const penetration = {
      this_month: thisMonthCalc ? {
        experiences: thisMonthCalc.penetration_exp,
        delivery: thisMonthCalc.penetration_del,
        combined: thisMonthCalc.penetration_exp + thisMonthCalc.penetration_del,
      } : { experiences: null, delivery: null, combined: null },
      last_month: lastMonthCalc ? {
        experiences: lastMonthCalc.penetration_exp,
        delivery: lastMonthCalc.penetration_del,
        combined: lastMonthCalc.penetration_exp + lastMonthCalc.penetration_del,
      } : { experiences: null, delivery: null, combined: null },
    };

    // -----------------------------------------------------------------------
    // Service Mix matrix for BubbleMatrix
    // -----------------------------------------------------------------------
    const serviceMixMatrix = buildServiceMixMatrix(integrated);

    // -----------------------------------------------------------------------
    // Revenue from pivot (kept for deviation/booked charts)
    // -----------------------------------------------------------------------
    const effort = revenueSections["TOTAL EFFORT"] || [];
    const latestNonZero = [...effort].reverse().find((m) => m.total > 0);
    const latestIdx = latestNonZero ? effort.indexOf(latestNonZero) : -1;
    const prevMonth = latestIdx > 0 ? effort[latestIdx - 1] : null;
    const pivotSummary = {
      latest_month: latestNonZero?.month || null,
      latest_total: latestNonZero?.total || 0,
      mom_change: (latestNonZero && prevMonth && prevMonth.total > 0)
        ? Math.round(((latestNonZero.total - prevMonth.total) / prevMonth.total) * 1000) / 10
        : null,
    };

    return Response.json({
      generated_at: new Date().toISOString(),
      revenue_sections: revenueSections,
      revenue_summary: revenueSummary,
      pivot_summary: pivotSummary,
      utilization,
      utilization_columns,
      utilization_summary: utilizationSummary,
      integrated_projects: integrated,
      integrated_summary: integratedSummary,
      penetration,
      service_mix_matrix: serviceMixMatrix,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("Dept health error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
