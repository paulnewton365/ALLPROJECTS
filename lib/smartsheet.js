/**
 * Smartsheet API Client
 * Uses the REST API directly — no SDK needed.
 */

const config = require("./config");

const BASE_URL = "https://api.smartsheet.com/2.0";

async function apiRequest(endpoint) {
  const token = process.env.SMARTSHEET_API_TOKEN;
  if (!token) throw new Error("SMARTSHEET_API_TOKEN environment variable is not set");

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Smartsheet API error ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * List all sheets in the account
 */
async function listSheets() {
  const data = await apiRequest("/sheets?pageSize=200&includeAll=true");
  return data.data || [];
}

/**
 * List all reports in the account
 */
async function listReports() {
  const data = await apiRequest("/reports?pageSize=200&includeAll=true");
  return data.data || [];
}

/**
 * Get full sheet or report data with all rows
 */
async function getSource(sourceId, sourceType = "sheet") {
  const endpoint =
    sourceType === "report"
      ? `/reports/${sourceId}?pageSize=10000`
      : `/sheets/${sourceId}?pageSize=10000`;
  return apiRequest(endpoint);
}

/**
 * Inspect a source — returns columns and sample rows
 */
async function inspectSource(sourceId, sourceType = "sheet") {
  const endpoint =
    sourceType === "report"
      ? `/reports/${sourceId}?pageSize=10`
      : `/sheets/${sourceId}?pageSize=10`;

  const data = await apiRequest(endpoint);

  const colMap = {};
  const columns = (data.columns || []).map((col) => {
    colMap[col.id] = col.title;
    return {
      id: col.id,
      title: col.title,
      type: col.type || "N/A",
    };
  });

  const sampleRows = (data.rows || []).slice(0, 5).map((row) => {
    const rowData = {};
    for (const cell of row.cells || []) {
      const colName = colMap[cell.columnId] || `col_${cell.columnId}`;
      rowData[colName] = cell.displayValue || cell.value || null;
    }
    return rowData;
  });

  return {
    name: data.name,
    totalRows: data.totalRowCount,
    columns,
    sampleRows,
  };
}

// ---------------------------------------------------------------------------
// Data transformation
// ---------------------------------------------------------------------------

function parseCurrency(val) {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parsePercent(val) {
  if (val == null) return null;
  if (typeof val === "number") return val > 1 ? val : val * 100;
  const cleaned = String(val).replace(/[%\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function classifyStatus(value) {
  if (!value) return "unknown";
  const lower = String(value).trim().toLowerCase();
  for (const [color, keywords] of Object.entries(config.statusValues)) {
    if (keywords.some((kw) => kw.toLowerCase() === lower)) return color;
  }
  return "unknown";
}

/**
 * Fetch and transform data into dashboard-ready metrics
 */
async function fetchSnapshot() {
  const { sourceId, sourceType, columnMapping } = config;

  if (!sourceId) {
    throw new Error(
      "No source ID configured. Set SMARTSHEET_SOURCE_ID or update lib/config.js"
    );
  }

  const raw = await getSource(sourceId, sourceType);

  // Build column ID -> name map
  const colMap = {};
  for (const col of raw.columns || []) {
    colMap[col.id] = col.title;
  }

  // Reverse mapping: smartsheet col name -> our field name
  const reverseMap = {};
  for (const [field, ssColName] of Object.entries(columnMapping)) {
    reverseMap[ssColName] = field;
  }

  // Extract rows
  const projects = (raw.rows || []).map((row) => {
    const item = {};
    for (const cell of row.cells || []) {
      const ssColName = colMap[cell.columnId];
      const fieldName = reverseMap[ssColName] || ssColName;
      item[fieldName] = cell.displayValue || cell.value || null;
    }
    return item;
  });

  // Compute metrics
  let totalBudget = 0;
  let totalSpent = 0;
  const statusCounts = { green: 0, yellow: 0, red: 0, unknown: 0 };
  const clientMap = {};
  const pmMap = {};
  let overservicedCount = 0;
  let overservicedAmount = 0;

  const projectTable = projects.map((p) => {
    const budget = parseCurrency(p.budget_allocated);
    const spent = parseCurrency(p.budget_spent);
    const pctComplete = parsePercent(p.percent_complete);
    const statusColor = classifyStatus(p.status);
    const isOver = spent > budget && budget > 0;

    totalBudget += budget;
    totalSpent += spent;
    statusCounts[statusColor] = (statusCounts[statusColor] || 0) + 1;

    if (isOver) {
      overservicedCount++;
      overservicedAmount += spent - budget;
    }

    // Client aggregation
    const client = p.client_name || "Unassigned";
    if (!clientMap[client]) clientMap[client] = { budget: 0, spent: 0, projects: 0 };
    clientMap[client].budget += budget;
    clientMap[client].spent += spent;
    clientMap[client].projects++;

    // PM aggregation
    const pm = p.project_manager || "Unassigned";
    if (!pmMap[pm]) pmMap[pm] = { budget: 0, spent: 0, projects: 0 };
    pmMap[pm].budget += budget;
    pmMap[pm].spent += spent;
    pmMap[pm].projects++;

    return {
      project_name: p.project_name || "-",
      client_name: client,
      status: p.status || "-",
      status_color: statusColor,
      project_manager: pm,
      budget_allocated: budget,
      budget_spent: spent,
      percent_complete: pctComplete,
      is_overserviced: isOver,
      project_type: p.project_type || "-",
      start_date: p.start_date || null,
      end_date: p.end_date || null,
    };
  });

  // Sort aggregations
  const byClient = Object.entries(clientMap)
    .map(([name, data]) => ({ name, ...data, variance: data.budget - data.spent }))
    .sort((a, b) => b.budget - a.budget);

  const byPM = Object.entries(pmMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.projects - a.projects);

  return {
    title: config.title,
    generated_at: new Date().toISOString(),
    total_projects: projects.length,
    status: statusCounts,
    financials: {
      total_budget: totalBudget,
      total_spent: totalSpent,
      total_remaining: totalBudget - totalSpent,
      burn_rate_pct: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 1000) / 10 : 0,
      overserviced_count: overservicedCount,
      overserviced_amount: overservicedAmount,
    },
    by_client: byClient,
    by_pm: byPM,
    projects: projectTable,
  };
}

module.exports = {
  listSheets,
  listReports,
  inspectSource,
  fetchSnapshot,
};
