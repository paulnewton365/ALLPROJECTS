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
    ? `/reports/${sourceId}?pageSize=10000&include=sourceSheets`
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
    const effectiveId = col.virtualId || col.id;
    colMap[effectiveId] = col.title;
    return { id: col.id, virtualId: col.virtualId || null, title: col.title, type: col.type || "N/A" };
  });
  const sampleRows = (data.rows || []).slice(0, 5).map((row) => {
    const rowData = {};
    for (const cell of row.cells || []) {
      const colId = cell.virtualColumnId || cell.columnId;
      const colName = colMap[colId] || `col_${colId}`;
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
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const s = String(val).trim();
  if (!s || s === "No Tracking" || s === "-" || s === "N/A" || s === "null" || s === "undefined") return 0;
  // Handle parenthesized negatives like ($5,000.00)
  const isNeg = s.startsWith("(") && s.endsWith(")");
  const cleaned = s.replace(/[$,\s()]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return isNeg ? -num : num;
}

function parsePercent(val) {
  if (val == null) return null;
  if (typeof val === "number") return isNaN(val) ? null : (val > 1 ? val : val * 100);
  const s = String(val).trim();
  if (!s || s === "No Tracking" || s === "-" || s === "N/A") return null;
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

function classifyCategory(workflowStatus, sheetName) {
  const wf = (workflowStatus || "").trim().toLowerCase();
  const sn = (sheetName || "").trim().toLowerCase();
  for (const [category, rules] of Object.entries(config.categories)) {
    if (rules.workflowStatuses) {
      if (rules.workflowStatuses.some((s) => s.toLowerCase() === wf)) return category;
    }
    if (rules.sheetNames) {
      if (rules.sheetNames.some((s) => sn.includes(s.toLowerCase()))) return category;
    }
  }
  return "Uncategorized";
}

function incrementMap(map, key, data) {
  if (!map[key]) map[key] = { budget: 0, actuals: 0, overage: 0, oop: 0, projects: 0, overserviced: 0, investment: 0, pipeline: 0 };
  map[key].budget += Number(data.budget) || 0;
  map[key].actuals += Number(data.actuals) || 0;
  map[key].overage += Number(data.overage) || 0;
  map[key].oop += Number(data.oop) || 0;
  map[key].projects += 1;
  map[key].investment += Number(data.investment) || 0;
  map[key].pipeline += Number(data.pipeline) || 0;
  if (data.isOver) map[key].overserviced += 1;
}

// ---------------------------------------------------------------------------
// Main snapshot
// ---------------------------------------------------------------------------

async function fetchSnapshot() {
  const { sourceId, sourceType, columnMapping } = config;
  if (!sourceId) throw new Error("No source ID configured. Set SMARTSHEET_SOURCE_ID or update lib/config.js");

  const raw = await getSource(sourceId, sourceType);

  // Column ID -> title (handle both sheets and reports)
  const colMap = {};
  for (const col of raw.columns || []) {
    if (col.id) colMap[col.id] = col.title;
    if (col.virtualId) colMap[col.virtualId] = col.title;
  }

  // Reverse: Smartsheet title -> our field name
  const reverseMap = {};
  for (const [field, ssColName] of Object.entries(columnMapping)) reverseMap[ssColName] = field;

  // Build sheetId -> sheetName map from sourceSheets (reports only)
  const sheetIdMap = {};
  for (const sheet of raw.sourceSheets || []) {
    if (sheet.id && sheet.name) sheetIdMap[sheet.id] = sheet.name;
  }

  // Extract all rows with all fields
  const projects = (raw.rows || []).map((row) => {
    const item = {};
    for (const cell of row.cells || []) {
      // Reports use virtualColumnId, sheets use columnId
      const colId = cell.virtualColumnId || cell.columnId;
      const ssColName = colMap[colId];
      if (!ssColName) continue;
      const fieldName = reverseMap[ssColName] || ssColName;
      item[fieldName] = cell.displayValue || cell.value || null;
    }
    // Reports include the source sheet name on each row (or we derive from sheetId)
    item._sheetName = row.sheetName || sheetIdMap[row.sheetId] || "";
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
  const categoryMap = {};

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

    // Category classification (by workflow status or source sheet name)
    const category = classifyCategory(p.workflow_status, p._sheetName);
    incrementMap(categoryMap, category, aggData);

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
      category,
      source_sheet: p._sheetName || "-",
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

  // Safe number helper
  const safe = (n) => (isNaN(n) || n == null) ? 0 : n;

  return {
    title: config.title,
    generated_at: new Date().toISOString(),
    total_projects: projects.length,

    status: statusCounts,
    workflow: workflowCounts,
    work_progress: workProgressCounts,
    resource_status: resourceStatusCounts,

    financials: {
      total_budget: safe(totalBudget),
      total_actuals: safe(totalActuals),
      total_oop: safe(totalOOP),
      total_overage: safe(totalOverage),
      total_remaining: safe(totalBudget - totalActuals),
      burn_rate_pct: totalBudget > 0 ? Math.round((safe(totalActuals) / safe(totalBudget)) * 1000) / 10 : 0,
      overserviced_count: safe(overservicedCount),
      overserviced_amount: safe(overservicedAmount),
      total_investment: safe(totalInvestment),
      total_pipeline: safe(totalPipeline),
      total_monthly_budget: safe(totalMonthlyBudget),
      tracked_projects: safe(trackedCount),
      untracked_projects: safe(projects.length - trackedCount),
    },

    flags: {
      no_pm: safe(noPMCount),
      high_priority: safe(highPriorityCount),
    },

    by_client: toSortedArray(clientMap),
    by_pm: toSortedArray(pmMap, "projects"),
    by_ecosystem: toSortedArray(ecosystemMap),
    by_category: toSortedArray(categoryMap, "projects"),
    category_order: Object.keys(config.categories),
    by_request_type: Object.entries(requestTypeMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),

    projects: projectTable,
  };
}

module.exports = { listSheets, listReports, inspectSource, fetchSnapshot };
