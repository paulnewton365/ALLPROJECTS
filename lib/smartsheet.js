/**
 * Smartsheet API Client — Full extraction for ALL PROJECTS LIST
 */

const config = require("./config");
const BASE_URL = "https://api.smartsheet.com/2.0";

async function apiRequest(endpoint) {
  const token = process.env.SMARTSHEET_API_TOKEN;
  if (!token) throw new Error("SMARTSHEET_API_TOKEN environment variable is not set");
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Smartsheet API error ${res.status}: ${body}`);
  }
  return res.json();
}

async function listSheets() {
  const data = await apiRequest("/sheets?pageSize=200&includeAll=true");
  return data.data || [];
}

async function listReports() {
  const data = await apiRequest("/reports?pageSize=200&includeAll=true");
  return data.data || [];
}

async function getSource(sourceId, sourceType = "sheet") {
  const endpoint = sourceType === "report"
    ? `/reports/${sourceId}?pageSize=10000`
    : `/sheets/${sourceId}?pageSize=10000`;
  return apiRequest(endpoint);
}

async function inspectSource(sourceId, sourceType = "sheet") {
  const endpoint = sourceType === "report"
    ? `/reports/${sourceId}?pageSize=10`
    : `/sheets/${sourceId}?pageSize=10`;
  const data = await apiRequest(endpoint);
  const colMap = {};
  const columns = (data.columns || []).map((col) => {
    colMap[col.id] = col.title;
    return { id: col.id, title: col.title, type: col.type || "N/A" };
  });
  const sampleRows = (data.rows || []).slice(0, 5).map((row) => {
    const rowData = {};
    for (const cell of row.cells || []) {
      const colName = colMap[cell.columnId] || `col_${cell.columnId}`;
      rowData[colName] = cell.displayValue || cell.value || null;
    }
    return rowData;
  });
  return { name: data.name, totalRows: data.totalRowCount, columns, sampleRows };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCurrency(val) {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const s = String(val).trim();
  if (s === "No Tracking" || s === "-" || s === "" || s === "N/A") return 0;
  const cleaned = s.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parsePercent(val) {
  if (val == null) return null;
  if (typeof val === "number") return val > 1 ? val : val * 100;
  const s = String(val).trim();
  if (s === "No Tracking" || s === "-" || s === "" || s === "N/A") return null;
  const cleaned = s.replace(/[%\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function isTracked(val) {
  if (val == null) return false;
  const s = String(val).trim().toLowerCase();
  return s !== "no tracking" && s !== "" && s !== "-" && s !== "n/a";
}

function classifyStatus(value) {
  if (!value) return "unknown";
  const lower = String(value).trim().toLowerCase();
  for (const [color, keywords] of Object.entries(config.statusValues)) {
    if (keywords.some((kw) => kw.toLowerCase() === lower)) return color;
  }
  return "unknown";
}

function classifyWorkflow(value) {
  if (!value) return "unknown";
  const lower = String(value).trim().toLowerCase();
  for (const [phase, keywords] of Object.entries(config.workflowPhases)) {
    if (keywords.some((kw) => kw.toLowerCase() === lower)) return phase;
  }
  return "other";
}

function incrementMap(map, key, data) {
  if (!map[key]) map[key] = { budget: 0, actuals: 0, overage: 0, oop: 0, projects: 0, overserviced: 0, investment: 0, pipeline: 0 };
  map[key].budget += data.budget || 0;
  map[key].actuals += data.actuals || 0;
  map[key].overage += data.overage || 0;
  map[key].oop += data.oop || 0;
  map[key].projects += 1;
  map[key].investment += data.investment || 0;
  map[key].pipeline += data.pipeline || 0;
  if (data.isOver) map[key].overserviced += 1;
}

// ---------------------------------------------------------------------------
// Main snapshot
// ---------------------------------------------------------------------------

async function fetchSnapshot() {
  const { sourceId, sourceType, columnMapping } = config;
  if (!sourceId) throw new Error("No source ID configured. Set SMARTSHEET_SOURCE_ID or update lib/config.js");

  const raw = await getSource(sourceId, sourceType);

  // Column ID -> title
  const colMap = {};
  for (const col of raw.columns || []) colMap[col.id] = col.title;

  // Reverse: Smartsheet title -> our field name
  const reverseMap = {};
  for (const [field, ssColName] of Object.entries(columnMapping)) reverseMap[ssColName] = field;

  // Extract all rows with all fields
  const projects = (raw.rows || []).map((row) => {
    const item = {};
    for (const cell of row.cells || []) {
      const ssColName = colMap[cell.columnId];
      const fieldName = reverseMap[ssColName] || ssColName;
      item[fieldName] = cell.displayValue || cell.value || null;
    }
    return item;
  });

  // ---------------------------------------------------------------------------
  // Compute everything
  // ---------------------------------------------------------------------------
  let totalBudget = 0, totalActuals = 0, totalOOP = 0, totalOverage = 0;
  let totalInvestment = 0, totalPipeline = 0, totalMonthlyBudget = 0;
  let overservicedCount = 0, overservicedAmount = 0;
  let trackedCount = 0, noPMCount = 0, highPriorityCount = 0;

  const statusCounts = { green: 0, yellow: 0, red: 0, unknown: 0 };
  const workflowCounts = {};
  const workProgressCounts = {};
  const resourceStatusCounts = {};
  const clientMap = {};
  const pmMap = {};
  const ecosystemMap = {};
  const requestTypeMap = {};

  const projectTable = projects.map((p) => {
    const budget = parseCurrency(p.budget_forecast);
    const actuals = parseCurrency(p.actuals);
    const oop = parseCurrency(p.oop);
    const overage = parseCurrency(p.overage);
    const pctComplete = parsePercent(p.percent_complete);
    const statusColor = classifyStatus(p.rag);
    const workflowPhase = classifyWorkflow(p.workflow_status);
    const investment = parseCurrency(p.approved_investment);
    const pipeline = parseCurrency(p.weighted_pipeline);
    const monthlyBudget = parseCurrency(p.monthly_budget);
    const isOver = overage > 0 || (actuals > budget && budget > 0 && isTracked(p.actuals));
    const actualsTracked = isTracked(p.actuals);
    const overageTracked = isTracked(p.overage);

    totalBudget += budget;
    totalOOP += oop;
    totalInvestment += investment;
    totalPipeline += pipeline;
    totalMonthlyBudget += monthlyBudget;

    if (actualsTracked) {
      totalActuals += actuals;
      trackedCount++;
    }
    if (overageTracked) totalOverage += overage;

    statusCounts[statusColor] = (statusCounts[statusColor] || 0) + 1;

    // Workflow
    const wf = p.workflow_status || "Unknown";
    workflowCounts[wf] = (workflowCounts[wf] || 0) + 1;

    // Work progress
    if (p.work_progress) {
      workProgressCounts[p.work_progress] = (workProgressCounts[p.work_progress] || 0) + 1;
    }

    // Resource status
    if (p.resource_status) {
      resourceStatusCounts[p.resource_status] = (resourceStatusCounts[p.resource_status] || 0) + 1;
    }

    if (isOver) {
      overservicedCount++;
      overservicedAmount += overage > 0 ? overage : (actuals - budget);
    }

    if (p.has_pm === "No") noPMCount++;
    if (p.top_priority === "High") highPriorityCount++;

    // Aggregation data
    const aggData = { budget, actuals: actualsTracked ? actuals : 0, overage: overageTracked ? overage : 0, oop, isOver, investment, pipeline };

    const client = p.client_name || "Unassigned";
    incrementMap(clientMap, client, aggData);

    const pm = p.project_manager || "Unassigned";
    incrementMap(pmMap, pm, aggData);

    const eco = p.ecosystem || "Unassigned";
    incrementMap(ecosystemMap, eco, aggData);

    // Request type can be comma-separated
    const types = (p.request_type || "Unassigned").split(",").map((t) => t.trim());
    for (const t of types) {
      if (!requestTypeMap[t]) requestTypeMap[t] = 0;
      requestTypeMap[t]++;
    }

    return {
      rid: p.rid || "-",
      project_name: p.project_name || "-",
      client_name: client,
      rag: p.rag || "-",
      rag_color: statusColor,
      workflow_status: p.workflow_status || "-",
      workflow_phase: workflowPhase,
      project_manager: pm,
      budget_forecast: budget,
      actuals: actualsTracked ? actuals : null,
      actuals_display: actualsTracked ? actuals : "No Tracking",
      oop,
      overage: overageTracked ? overage : null,
      overage_display: overageTracked ? overage : (isTracked(p.overage) ? overage : "No Tracking"),
      percent_complete: pctComplete,
      top_priority: p.top_priority || "-",
      work_progress: p.work_progress || "-",
      has_pm: p.has_pm || "-",
      resource_status: p.resource_status || "-",
      ecosystem: eco,
      request_type: p.request_type || "-",
      win_probability: p.win_probability || "-",
      investment_forecast: parseCurrency(p.investment_forecast),
      approved_investment: investment,
      weighted_pipeline: pipeline,
      monthly_budget: monthlyBudget,
      monthly_baseline: parseCurrency(p.monthly_baseline),
      missing_time: p.missing_time || "-",
      recommendation: p.recommendation || "-",
      last_weeks_deviation: p.last_weeks_deviation || "-",
      creative_retainer: parseCurrency(p.creative_retainer),
      time_and_materials: p.time_and_materials || false,
      is_overserviced: isOver,
    };
  });

  // Sort helper
  const toSortedArray = (map, sortKey = "budget") =>
    Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b[sortKey] - a[sortKey]);

  return {
    title: config.title,
    generated_at: new Date().toISOString(),
    total_projects: projects.length,

    status: statusCounts,
    workflow: workflowCounts,
    work_progress: workProgressCounts,
    resource_status: resourceStatusCounts,

    financials: {
      total_budget: totalBudget,
      total_actuals: totalActuals,
      total_oop: totalOOP,
      total_overage: totalOverage,
      total_remaining: totalBudget - totalActuals,
      burn_rate_pct: totalBudget > 0 ? Math.round((totalActuals / totalBudget) * 1000) / 10 : 0,
      overserviced_count: overservicedCount,
      overserviced_amount: overservicedAmount,
      total_investment: totalInvestment,
      total_pipeline: totalPipeline,
      total_monthly_budget: totalMonthlyBudget,
      tracked_projects: trackedCount,
      untracked_projects: projects.length - trackedCount,
    },

    flags: {
      no_pm: noPMCount,
      high_priority: highPriorityCount,
    },

    by_client: toSortedArray(clientMap),
    by_pm: toSortedArray(pmMap, "projects"),
    by_ecosystem: toSortedArray(ecosystemMap),
    by_request_type: Object.entries(requestTypeMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),

    projects: projectTable,
  };
}

module.exports = { listSheets, listReports, inspectSource, fetchSnapshot };
