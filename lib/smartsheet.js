/**
 * Smartsheet API Client — Segmented extraction (Live + Internal + New Business)
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

async function listSheets() { return (await apiRequest("/sheets?pageSize=200&includeAll=true")).data || []; }
async function listReports() { return (await apiRequest("/reports?pageSize=200&includeAll=true")).data || []; }

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
    colMap[col.virtualId || col.id] = col.title;
    return { id: col.id, virtualId: col.virtualId || null, title: col.title, type: col.type || "N/A" };
  });
  const sampleRows = (data.rows || []).slice(0, 5).map((row) => {
    const rowData = {};
    for (const cell of row.cells || []) {
      const colId = cell.virtualColumnId || cell.columnId;
      rowData[colMap[colId] || `col_${colId}`] = cell.displayValue || cell.value || null;
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
  const num = parseFloat(s.replace(/[%\s]/g, ""));
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
    if (rules.workflowStatuses && rules.workflowStatuses.some((s) => s.toLowerCase() === wf)) return category;
    if (rules.sheetNames && rules.sheetNames.some((s) => sn.includes(s.toLowerCase()))) return category;
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

const safe = (n) => (isNaN(n) || n == null) ? 0 : n;

// ---------------------------------------------------------------------------
// Main snapshot
// ---------------------------------------------------------------------------
async function fetchSnapshot() {
  const { sourceId, sourceType, columnMapping } = config;
  if (!sourceId) throw new Error("No source ID configured");

  const raw = await getSource(sourceId, sourceType);

  const colMap = {};
  for (const col of raw.columns || []) {
    if (col.id) colMap[col.id] = col.title;
    if (col.virtualId) colMap[col.virtualId] = col.title;
  }
  const reverseMap = {};
  for (const [field, ssColName] of Object.entries(columnMapping)) reverseMap[ssColName] = field;

  const sheetIdMap = {};
  for (const sheet of raw.sourceSheets || []) {
    if (sheet.id && sheet.name) sheetIdMap[sheet.id] = sheet.name;
  }

  const allRows = (raw.rows || []).map((row) => {
    const item = {};
    for (const cell of row.cells || []) {
      const colId = cell.virtualColumnId || cell.columnId;
      const ssColName = colMap[colId];
      if (!ssColName) continue;
      item[reverseMap[ssColName] || ssColName] = cell.displayValue || cell.value || null;
    }
    item._sheetName = row.sheetName || sheetIdMap[row.sheetId] || "";
    return item;
  });

  const projects = allRows.filter((p) => classifyCategory(p.workflow_status, p._sheetName) !== "Uncategorized");

  // ---- Collections ----
  const liveProjects = [];
  const internalProjects = [];
  const newbizProjects = [];

  // ---- Live aggregations ----
  const live = {
    budget: 0, actuals: 0, oop: 0, overage: 0, investment: 0, monthlyBudget: 0,
    overservicedCount: 0, overservicedAmount: 0, underservicedCount: 0, trackedCount: 0,
    noPM: 0, topPriority: 0, missingTimeTotal: 0,
    status: { green: 0, yellow: 0, red: 0, blue: 0, unknown: 0 },
    byClient: {}, byPM: {}, byEcosystem: {}, byCategory: {}, byRequestType: {},
    workProgress: {}, resourceStatus: {}, ecoRAG: {},
  };
  const ecoRequestType = {};
  const creativeRetainers = []; // clients with creative retainers

  // ---- Internal aggregations ----
  const internal = { budget: 0, actuals: 0, investment: 0, byCategory: {} };

  // ---- New Business aggregations ----
  const nb = {
    totalForecast: 0, weightedPipeline: 0, totalInvestment: 0,
    byStage: {}, byEcosystem: {}, byRecommendation: {}, byAssignment: {},
    byEcosystemStage: {},
    ecoWinServices: {}, // ecosystem -> { totalWinProb, count, services: { svc -> count } }
    dataCompleteness: { total: 0, complete: 0, fields: {} },
  };

  // Fields to check for data completeness
  const completenessFields = ["budget_forecast", "win_probability", "recommendation", "request_type", "ecosystem", "project_manager"];

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
    const creativeRetainer = parseCurrency(p.creative_retainer);

    const client = p.client_name || "Unassigned";
    const pm = p.project_manager || "Unassigned";
    const eco = p.ecosystem || "Unassigned";

    const base = {
      rid: p.rid || "-",
      project_name: p.project_name || "-",
      client_name: client,
      workflow_status: p.workflow_status || "-",
      category, segment,
      source_sheet: p._sheetName || "-",
      project_manager: pm,
      ecosystem: eco,
      request_type: p.request_type || "-",
      top_priority: p.top_priority || null,
      assignment: p.assignment || "-",
      fit: p.fit || "-",
    };

    // ===== INTERNAL =====
    if (segment === "internal") {
      const rec = {
        ...base,
        budget_forecast: budget,
        actuals: actualsTracked ? actuals : null,
        actuals_display: actualsTracked ? actuals : "No Tracking",
        approved_investment: investment,
        overage: overageTracked ? overage : null,
        overage_display: overageTracked ? overage : "No Tracking",
        percent_complete: pctComplete,
        work_progress: p.work_progress || "-",
        has_pm: p.has_pm || "-",
        rag: p.rag || "-",
        rag_color: statusColor,
      };
      internalProjects.push(rec);
      internal.budget += budget;
      internal.actuals += (actualsTracked ? actuals : 0);
      internal.investment += investment;
      incrementMap(internal.byCategory, category, { budget, actuals: actualsTracked ? actuals : 0, overage: 0, oop: 0, isOver: false, isUnder: false, investment, pipeline: 0 });
      continue;
    }

    // ===== LIVE =====
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
        creative_retainer: creativeRetainer,
        last_weeks_deviation: p.last_weeks_deviation || "-",
        last_30_deviation: parseCurrency(p.last_30_deviation),
        deviation_ecosystem: parseCurrency(p.deviation_ecosystem),
        deviation_ed: parseCurrency(p.deviation_ed),
        deviation_perf: parseCurrency(p.deviation_perf),
        is_overserviced: isOver,
        is_underserviced: isUnder,
      };
      liveProjects.push(rec);

      // Track creative retainers
      if (creativeRetainer > 0) {
        creativeRetainers.push({ client, project: p.project_name || "-", retainer: creativeRetainer, budget, actuals: actualsTracked ? actuals : 0, ecosystem: eco, rid: p.rid || "-" });
      }

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

      // Ecosystem-level aggregations: only for core ecosystem projects (Active Climate, Active Health, etc.)
      // Support & Web Warranty still count in portfolio totals above but don't inflate ecosystem revenue
      const isCoreEco = category === "Active Live Projects";

      if (isCoreEco) {
        if (!live.ecoRAG[eco]) live.ecoRAG[eco] = { green: 0, yellow: 0, red: 0, blue: 0, unknown: 0 };
        live.ecoRAG[eco][statusColor] = (live.ecoRAG[eco][statusColor] || 0) + 1;
      }

      const aggData = { budget, actuals: actualsTracked ? actuals : 0, overage: overageTracked ? overage : 0, oop, isOver, isUnder, investment, pipeline: 0 };
      incrementMap(live.byClient, client, aggData);
      incrementMap(live.byPM, pm, aggData);
      if (isCoreEco) incrementMap(live.byEcosystem, eco, aggData);
      incrementMap(live.byCategory, category, aggData);

      if (p.work_progress) live.workProgress[p.work_progress] = (live.workProgress[p.work_progress] || 0) + 1;
      if (p.resource_status) live.resourceStatus[p.resource_status] = (live.resourceStatus[p.resource_status] || 0) + 1;

      const types = (p.request_type || "Unassigned").split(",").map((t) => t.trim());
      for (const t of types) {
        live.byRequestType[t] = (live.byRequestType[t] || 0) + 1;
        if (isCoreEco) {
          if (!ecoRequestType[eco]) ecoRequestType[eco] = {};
          if (!ecoRequestType[eco][t]) ecoRequestType[eco][t] = { count: 0, budget: 0 };
          ecoRequestType[eco][t].count++;
          ecoRequestType[eco][t].budget += budget;
        }
      }
      continue;
    }

    // ===== NEW BUSINESS =====
    if (segment === "newbiz") {
      const wf = p.workflow_status || "-";
      const rec = {
        ...base,
        budget_forecast: budget,
        actuals: actualsTracked ? actuals : null,
        actuals_display: actualsTracked ? actuals : "No Tracking",
        win_probability: winProb,
        weighted_pipeline: pipeline,
        recommendation: p.recommendation || "-",
        resource_status: p.resource_status || "-",
        approved_investment: investment,
        oop,
      };
      newbizProjects.push(rec);

      nb.totalForecast += budget;
      nb.weightedPipeline += pipeline;
      nb.totalInvestment += investment;

      if (!nb.byStage[wf]) nb.byStage[wf] = { count: 0, forecast: 0, weighted: 0 };
      nb.byStage[wf].count++;
      nb.byStage[wf].forecast += budget;
      nb.byStage[wf].weighted += pipeline;

      if (!nb.byEcosystem[eco]) nb.byEcosystem[eco] = { count: 0, forecast: 0, weighted: 0 };
      nb.byEcosystem[eco].count++;
      nb.byEcosystem[eco].forecast += budget;
      nb.byEcosystem[eco].weighted += pipeline;

      // Recommendation - normalize "None"/"" to "Not Qualified"
      const rawRec = (p.recommendation || "").trim();
      const recc = (!rawRec || rawRec === "-" || rawRec.toLowerCase() === "none") ? "Not Qualified" : rawRec;
      nb.byRecommendation[recc] = (nb.byRecommendation[recc] || 0) + 1;

      const asgn = p.assignment || "Unknown";
      nb.byAssignment[asgn] = (nb.byAssignment[asgn] || 0) + 1;

      if (!nb.byEcosystemStage[eco]) nb.byEcosystemStage[eco] = {};
      if (!nb.byEcosystemStage[eco][wf]) nb.byEcosystemStage[eco][wf] = { count: 0, forecast: 0, weighted: 0 };
      nb.byEcosystemStage[eco][wf].count++;
      nb.byEcosystemStage[eco][wf].forecast += budget;
      nb.byEcosystemStage[eco][wf].weighted += pipeline;

      // Win % and services by ecosystem
      if (!nb.ecoWinServices[eco]) nb.ecoWinServices[eco] = { totalWinProb: 0, countWithWin: 0, count: 0, weighted: 0, forecast: 0, services: {} };
      nb.ecoWinServices[eco].count++;
      nb.ecoWinServices[eco].weighted += pipeline;
      nb.ecoWinServices[eco].forecast += budget;
      if (winProb != null) { nb.ecoWinServices[eco].totalWinProb += winProb; nb.ecoWinServices[eco].countWithWin++; }
      const svcs = (p.request_type || "").split(",").map((t) => t.trim()).filter(Boolean);
      for (const svc of svcs) {
        nb.ecoWinServices[eco].services[svc] = (nb.ecoWinServices[eco].services[svc] || 0) + 1;
      }

      // Data completeness
      nb.dataCompleteness.total++;
      let fieldsFilled = 0;
      for (const f of completenessFields) {
        if (!nb.dataCompleteness.fields[f]) nb.dataCompleteness.fields[f] = { filled: 0, total: 0 };
        nb.dataCompleteness.fields[f].total++;
        const val = p[f];
        const filled = val != null && String(val).trim() !== "" && String(val).trim() !== "-" && String(val).trim().toLowerCase() !== "no tracking" && String(val).trim().toLowerCase() !== "n/a";
        if (filled) { nb.dataCompleteness.fields[f].filled++; fieldsFilled++; }
      }
      if (fieldsFilled === completenessFields.length) nb.dataCompleteness.complete++;
    }
  }

  // ---------------------------------------------------------------------------
  // Output helpers
  // ---------------------------------------------------------------------------
  const toSortedArray = (map, sortKey = "budget") =>
    Object.entries(map).map(([name, data]) => ({ name, ...data })).sort((a, b) => b[sortKey] - a[sortKey]);

  const toCountArray = (map) =>
    Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  // Enriched live ecosystems
  const liveEcosystems = toSortedArray(live.byEcosystem).map((eco) => ({
    ...eco,
    burn_rate: eco.budget > 0 ? Math.round((eco.actuals / eco.budget) * 1000) / 10 : 0,
    net_overservice: eco.overage - eco.investment,
    rag: live.ecoRAG[eco.name] || { green: 0, yellow: 0, red: 0, blue: 0, unknown: 0 },
  }));

  // Pipeline by ecosystem × stage
  const pipelineByEcosystem = Object.entries(nb.byEcosystemStage)
    .map(([eco, stages]) => ({
      ecosystem: eco,
      total_weighted: Object.values(stages).reduce((a, s) => a + s.weighted, 0),
      total_forecast: Object.values(stages).reduce((a, s) => a + s.forecast, 0),
      stages: config.pipelineStages.map((stage) => ({ stage, ...(stages[stage] || { count: 0, forecast: 0, weighted: 0 }) })),
    }))
    .sort((a, b) => b.total_weighted - a.total_weighted);

  // Pipeline funnel
  const pipelineFunnel = config.pipelineStages.map((stage) => ({
    stage, ...(nb.byStage[stage] || { count: 0, forecast: 0, weighted: 0 }),
  }));

  // NB ecosystems
  const nbEcosystems = Object.entries(nb.byEcosystem)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.forecast - a.forecast);

  // Bubble matrix: ecosystem × request type
  const allRequestTypes = [...new Set(Object.values(ecoRequestType).flatMap((rt) => Object.keys(rt)))].sort();
  const ecoNames = liveEcosystems.map((e) => e.name);
  const bubbleMatrix = {
    ecosystems: ecoNames,
    requestTypes: allRequestTypes,
    cells: ecoNames.map((eco) => allRequestTypes.map((rt) => ecoRequestType[eco]?.[rt] || { count: 0, budget: 0 })),
  };

  // Win % and services by ecosystem
  const ecoWinServices = Object.entries(nb.ecoWinServices)
    .map(([eco, data]) => ({
      ecosystem: eco,
      avg_win_pct: data.countWithWin > 0 ? Math.round(data.totalWinProb / data.countWithWin) : null,
      deal_count: data.count,
      weighted: data.weighted,
      forecast: data.forecast,
      services: Object.entries(data.services).sort((a, b) => b[1] - a[1]).map(([svc, count]) => ({ name: svc, count })),
    }))
    .sort((a, b) => b.deal_count - a.deal_count);

  // Creative retainers sorted by value
  creativeRetainers.sort((a, b) => b.retainer - a.retainer);

  // Data completeness summary
  const completeness = {
    total: nb.dataCompleteness.total,
    fully_complete: nb.dataCompleteness.complete,
    pct_complete: nb.dataCompleteness.total > 0 ? Math.round((nb.dataCompleteness.complete / nb.dataCompleteness.total) * 100) : 0,
    by_field: Object.entries(nb.dataCompleteness.fields).map(([field, data]) => ({
      field,
      filled: data.filled,
      total: data.total,
      pct: data.total > 0 ? Math.round((data.filled / data.total) * 100) : 0,
    })).sort((a, b) => a.pct - b.pct),
  };

  return {
    title: config.title,
    generated_at: new Date().toISOString(),
    total_projects: projects.length,
    billable_ecosystems: config.billableEcosystems,
    stage_display_names: config.stageDisplayNames,
    pipeline_stage_order: config.pipelineStageOrder,

    live: {
      count: liveProjects.length,
      financials: {
        total_budget: safe(live.budget), total_actuals: safe(live.actuals),
        total_oop: safe(live.oop), total_overage: safe(live.overage),
        total_remaining: safe(live.budget - live.actuals),
        burn_rate_pct: live.budget > 0 ? Math.round((safe(live.actuals) / safe(live.budget)) * 1000) / 10 : 0,
        overserviced_count: safe(live.overservicedCount), overserviced_amount: safe(live.overservicedAmount),
        underserviced_count: safe(live.underservicedCount),
        total_investment: safe(live.investment), total_monthly_budget: safe(live.monthlyBudget),
        tracked_projects: safe(live.trackedCount), missing_time_total: safe(live.missingTimeTotal),
      },
      flags: { no_pm: safe(live.noPM), top_priority: safe(live.topPriority) },
      status: live.status,
      work_progress: live.workProgress,
      resource_status: live.resourceStatus,
      by_client: toSortedArray(live.byClient),
      by_pm: toSortedArray(live.byPM, "projects"),
      by_ecosystem: liveEcosystems,
      by_category: toSortedArray(live.byCategory, "projects"),
      by_request_type: toCountArray(live.byRequestType),
      ecosystem_request_type: bubbleMatrix,
      creative_retainers: creativeRetainers,
      fit_by_ecosystem: (() => {
        const fitEcos = {};
        liveProjects.filter((p) => p.category === "Active Live Projects").forEach((p) => {
          const eco = p.ecosystem || "Unassigned";
          const fit = (p.fit && p.fit !== "-") ? p.fit.trim() : "Unclassified";
          if (!fitEcos[eco]) fitEcos[eco] = {};
          fitEcos[eco][fit] = (fitEcos[eco][fit] || 0) + 1;
        });
        return fitEcos;
      })(),
      deviation: (() => {
        const active = liveProjects.filter((p) => p.category === "Active Live Projects");
        const total = active.reduce((s, p) => s + (p.last_30_deviation || 0), 0);
        const totalEco = active.reduce((s, p) => s + (p.deviation_ecosystem || 0), 0);
        const totalED = active.reduce((s, p) => s + (p.deviation_ed || 0), 0);
        const totalPerf = active.reduce((s, p) => s + (p.deviation_perf || 0), 0);
        const byEcosystem = {};
        active.forEach((p) => {
          const eco = p.ecosystem || "Other";
          if (!byEcosystem[eco]) byEcosystem[eco] = { total: 0, eco: 0, ed: 0, perf: 0, count: 0 };
          byEcosystem[eco].total += p.last_30_deviation || 0;
          byEcosystem[eco].eco += p.deviation_ecosystem || 0;
          byEcosystem[eco].ed += p.deviation_ed || 0;
          byEcosystem[eco].perf += p.deviation_perf || 0;
          byEcosystem[eco].count++;
        });
        return {
          total: Math.round(total),
          total_ecosystem: Math.round(totalEco),
          total_ed: Math.round(totalED),
          total_perf: Math.round(totalPerf),
          total_integrated: Math.round(totalED + totalPerf),
          by_ecosystem: byEcosystem,
          top_deviators: [...active].sort((a, b) => Math.abs(b.last_30_deviation || 0) - Math.abs(a.last_30_deviation || 0)).slice(0, 10).map((p) => ({
            rid: p.rid, client: p.client_name, project: p.project_name, ecosystem: p.ecosystem, rag: p.rag_color,
            deviation: p.last_30_deviation, deviation_eco: p.deviation_ecosystem, deviation_ed: p.deviation_ed, deviation_perf: p.deviation_perf,
          })),
          red_high_deviation: active.filter((p) => p.rag_color === "red" && (p.last_30_deviation || 0) > 2000).sort((a, b) => (b.last_30_deviation || 0) - (a.last_30_deviation || 0)).map((p) => ({
            rid: p.rid, client: p.client_name, project: p.project_name, ecosystem: p.ecosystem,
            deviation: p.last_30_deviation, deviation_eco: p.deviation_ecosystem, deviation_ed: p.deviation_ed, deviation_perf: p.deviation_perf, overage: p.overage,
          })),
        };
      })(),
      projects: liveProjects,
    },

    internal: {
      count: internalProjects.length,
      total_budget: safe(internal.budget),
      total_actuals: safe(internal.actuals),
      total_investment: safe(internal.investment),
      by_category: toSortedArray(internal.byCategory, "projects"),
      projects: internalProjects,
    },

    newbiz: {
      count: newbizProjects.length,
      total_forecast: safe(nb.totalForecast),
      weighted_pipeline: safe(nb.weightedPipeline),
      total_investment: safe(nb.totalInvestment),
      pipeline_funnel: pipelineFunnel,
      pipeline_by_ecosystem: pipelineByEcosystem,
      by_ecosystem: nbEcosystems,
      by_recommendation: nb.byRecommendation,
      by_assignment: nb.byAssignment,
      eco_win_services: ecoWinServices,
      data_completeness: completeness,
      projects: newbizProjects,
    },

    category_order: Object.keys(config.categories),
  };
}

module.exports = { listSheets, listReports, inspectSource, fetchSnapshot };
