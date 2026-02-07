/**
 * Smartsheet API Client — Segmented extraction (Live Work + New Business)
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
    ? `/reports/${sourceId}?pageSize=10&include=sourceSheets`
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

function getSegment(category) {
  const cat = config.categories[category];
  return cat ? cat.segment : "unknown";
}

function incrementMap(map, key, data) {
  if (!map[key]) map[key] = { budget: 0, actuals: 0, overage: 0, oop: 0, projects: 0, overserviced: 0, underserviced: 0, investment: 0, pipeline: 0 };
  map[key].budget += Number(data.budget) || 0;
  map[key].actuals += Number(data.actuals) || 0;
  map[key].overage += Number(data.overage) || 0;
  map[key].oop += Number(data.oop) || 0;
  map[key].projects += 1;
  map[key].investment += Number(data.investment) || 0;
  map[key].pipeline += Number(data.pipeline) || 0;
  if (data.isOver) map[key].overserviced += 1;
  if (data.isUnder) map[key].underserviced += 1;
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

  // Extract all rows
  const allRows = (raw.rows || []).map((row) => {
    const item = {};
    for (const cell of row.cells || []) {
      const colId = cell.virtualColumnId || cell.columnId;
      const ssColName = colMap[colId];
      if (!ssColName) continue;
      const fieldName = reverseMap[ssColName] || ssColName;
      item[fieldName] = cell.displayValue || cell.value || null;
    }
    item._sheetName = row.sheetName || sheetIdMap[row.sheetId] || "";
    return item;
  });

  // Filter to only categorized projects
  const projects = allRows.filter((p) => classifyCategory(p.workflow_status, p._sheetName) !== "Uncategorized");

  // ---------------------------------------------------------------------------
  // Process each project into a normalized record
  // ---------------------------------------------------------------------------
  const liveProjects = [];
  const newbizProjects = [];

  // Aggregation maps — separate for live and newbiz
  const live = {
    budget: 0, actuals: 0, oop: 0, overage: 0, investment: 0, monthlyBudget: 0,
    overservicedCount: 0, overservicedAmount: 0, underservicedCount: 0, trackedCount: 0,
    noPM: 0, topPriority: 0, missingTimeTotal: 0,
    status: { green: 0, yellow: 0, red: 0, blue: 0, unknown: 0 },
    byClient: {}, byPM: {}, byEcosystem: {}, byCategory: {}, byRequestType: {},
    workProgress: {}, resourceStatus: {},
  };

  const nb = {
    totalForecast: 0, weightedPipeline: 0, totalInvestment: 0,
    byStage: {}, byEcosystem: {}, byRecommendation: {}, byAssignment: {},
    stageProjects: {},
  };

  for (const p of projects) {
    const category = classifyCategory(p.workflow_status, p._sheetName);
    const segment = getSegment(category);
    const budget = parseCurrency(p.budget_forecast);
    const actuals = parseCurrency(p.actuals);
    const oop = parseCurrency(p.oop);
    const overage = parseCurrency(p.overage);
    const pctComplete = parsePercent(p.percent_complete);
    const statusColor = classifyStatus(p.rag);
    const investment = parseCurrency(p.approved_investment);
    const pipeline = parseCurrency(p.weighted_pipeline);
    const monthlyBudget = parseCurrency(p.monthly_budget);
    const winProb = parsePercent(p.win_probability);
    const actualsTracked = isTracked(p.actuals);
    const overageTracked = isTracked(p.overage);
    const isOver = overage > 0;
    const isUnder = overage < 0;
    const missingTime = parseCurrency(p.missing_time);

    const client = p.client_name || "Unassigned";
    const pm = p.project_manager || "Unassigned";
    const eco = p.ecosystem || "Unassigned";

    const base = {
      rid: p.rid || "-",
      project_name: p.project_name || "-",
      client_name: client,
      workflow_status: p.workflow_status || "-",
      category,
      segment,
      source_sheet: p._sheetName || "-",
      project_manager: pm,
      ecosystem: eco,
      request_type: p.request_type || "-",
      top_priority: p.top_priority || null,
      assignment: p.assignment || "-",
    };

    if (segment === "live") {
      const rec = {
        ...base,
        rag: p.rag || "-",
        rag_color: statusColor,
        budget_forecast: budget,
        actuals: actualsTracked ? actuals : null,
        actuals_display: actualsTracked ? actuals : "No Tracking",
        oop,
        overage: overageTracked ? overage : null,
        overage_display: overageTracked ? overage : "No Tracking",
        percent_complete: pctComplete,
        work_progress: p.work_progress || "-",
        has_pm: p.has_pm || "-",
        resource_status: p.resource_status || "-",
        approved_investment: investment,
        missing_time: missingTime,
        missing_time_display: p.missing_time || "-",
        monthly_budget: monthlyBudget,
        monthly_baseline: parseCurrency(p.monthly_baseline),
        creative_retainer: parseCurrency(p.creative_retainer),
        last_weeks_deviation: p.last_weeks_deviation || "-",
        is_overserviced: isOver,
        is_underserviced: isUnder,
      };

      liveProjects.push(rec);

      // Aggregations
      live.budget += budget;
      live.oop += oop;
      live.investment += investment;
      live.monthlyBudget += monthlyBudget;
      if (actualsTracked) { live.actuals += actuals; live.trackedCount++; }
      if (overageTracked) live.overage += overage;
      if (isOver) { live.overservicedCount++; live.overservicedAmount += overage; }
      if (isUnder) live.underservicedCount++;
      if (p.has_pm === "No" || !p.has_pm) live.noPM++;
      if (p.top_priority) live.topPriority++;
      live.missingTimeTotal += missingTime;
      live.status[statusColor] = (live.status[statusColor] || 0) + 1;

      const aggData = { budget, actuals: actualsTracked ? actuals : 0, overage: overageTracked ? overage : 0, oop, isOver, isUnder, investment, pipeline: 0 };
      incrementMap(live.byClient, client, aggData);
      incrementMap(live.byPM, pm, aggData);
      incrementMap(live.byEcosystem, eco, aggData);
      incrementMap(live.byCategory, category, aggData);

      if (p.work_progress) live.workProgress[p.work_progress] = (live.workProgress[p.work_progress] || 0) + 1;
      if (p.resource_status) live.resourceStatus[p.resource_status] = (live.resourceStatus[p.resource_status] || 0) + 1;

      const types = (p.request_type || "Unassigned").split(",").map((t) => t.trim());
      for (const t of types) live.byRequestType[t] = (live.byRequestType[t] || 0) + 1;

    } else if (segment === "newbiz") {
      const wf = p.workflow_status || "-";
      const rec = {
        ...base,
        budget_forecast: budget,
        win_probability: winProb,
        weighted_pipeline: pipeline,
        recommendation: p.recommendation || "-",
        resource_status: p.resource_status || "-",
        approved_investment: investment,
        oop,
      };

      newbizProjects.push(rec);

      // Aggregations
      nb.totalForecast += budget;
      nb.weightedPipeline += pipeline;
      nb.totalInvestment += investment;

      // By pipeline stage
      if (!nb.byStage[wf]) nb.byStage[wf] = { count: 0, forecast: 0, weighted: 0 };
      nb.byStage[wf].count++;
      nb.byStage[wf].forecast += budget;
      nb.byStage[wf].weighted += pipeline;

      // By ecosystem
      if (!nb.byEcosystem[eco]) nb.byEcosystem[eco] = { count: 0, forecast: 0, weighted: 0 };
      nb.byEcosystem[eco].count++;
      nb.byEcosystem[eco].forecast += budget;
      nb.byEcosystem[eco].weighted += pipeline;

      // By recommendation
      const recc = p.recommendation || "None";
      nb.byRecommendation[recc] = (nb.byRecommendation[recc] || 0) + 1;

      // By assignment type
      const asgn = p.assignment || "Unknown";
      nb.byAssignment[asgn] = (nb.byAssignment[asgn] || 0) + 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers for output
  // ---------------------------------------------------------------------------
  const toSortedArray = (map, sortKey = "budget") =>
    Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b[sortKey] - a[sortKey]);

  const toCountArray = (map) =>
    Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  const safe = (n) => (isNaN(n) || n == null) ? 0 : n;

  // Pipeline stages in order
  const pipelineFunnel = config.pipelineStages.map((stage) => ({
    stage,
    ...(nb.byStage[stage] || { count: 0, forecast: 0, weighted: 0 }),
  }));

  // Ecosystem breakdown for new biz
  const nbEcosystems = Object.entries(nb.byEcosystem)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.forecast - a.forecast);

  return {
    title: config.title,
    generated_at: new Date().toISOString(),
    total_projects: projects.length,

    // ---- LIVE WORK ----
    live: {
      count: liveProjects.length,
      financials: {
        total_budget: safe(live.budget),
        total_actuals: safe(live.actuals),
        total_oop: safe(live.oop),
        total_overage: safe(live.overage),
        total_remaining: safe(live.budget - live.actuals),
        burn_rate_pct: live.budget > 0 ? Math.round((safe(live.actuals) / safe(live.budget)) * 1000) / 10 : 0,
        overserviced_count: safe(live.overservicedCount),
        overserviced_amount: safe(live.overservicedAmount),
        underserviced_count: safe(live.underservicedCount),
        total_investment: safe(live.investment),
        total_monthly_budget: safe(live.monthlyBudget),
        tracked_projects: safe(live.trackedCount),
        missing_time_total: safe(live.missingTimeTotal),
      },
      flags: {
        no_pm: safe(live.noPM),
        top_priority: safe(live.topPriority),
      },
      status: live.status,
      work_progress: live.workProgress,
      resource_status: live.resourceStatus,
      by_client: toSortedArray(live.byClient),
      by_pm: toSortedArray(live.byPM, "projects"),
      by_ecosystem: toSortedArray(live.byEcosystem),
      by_category: toSortedArray(live.byCategory, "projects"),
      by_request_type: toCountArray(live.byRequestType),
      projects: liveProjects,
    },

    // ---- NEW BUSINESS ----
    newbiz: {
      count: newbizProjects.length,
      total_forecast: safe(nb.totalForecast),
      weighted_pipeline: safe(nb.weightedPipeline),
      total_investment: safe(nb.totalInvestment),
      pipeline_funnel: pipelineFunnel,
      by_ecosystem: nbEcosystems,
      by_recommendation: nb.byRecommendation,
      by_assignment: nb.byAssignment,
      projects: newbizProjects,
    },

    category_order: Object.keys(config.categories),
  };
}

module.exports = { listSheets, listReports, inspectSource, fetchSnapshot };
