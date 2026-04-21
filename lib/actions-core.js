/**
 * Actions Core — shared evaluation & grouping logic for the Actions tab
 *
 * Exported to both:
 *   - app/api/actions/route.js (on-demand page load)
 *   - app/api/cron/log-snapshot/route.js (weekly volume snapshot)
 *
 * Keeps trigger thresholds + dept-head routing + the filter rule in one place.
 *
 * v1.15.9 changes vs first-pass (inlined in route.js):
 *   - Delivery panel routed to Heather Corey for Workflow Status "Active Support"
 *   - Action Owner column surfaced alongside PM / Assignment
 *   - Filter: drop projects whose ONLY trigger is overage_pct (other triggers remain)
 *   - 4-week stale flag on any action with days_open >= 28
 */

const { daysBetween } = require("./actions-history");

const BASE_URL = "https://api.smartsheet.com/2.0";
const REPORT_ID = process.env.ALL_PROJECTS_REPORT_ID || "1172654530711428";
const REPORT_URL = `https://app.smartsheet.com/reports/${REPORT_ID}`;

// --- Thresholds ---------------------------------------------------------
const DEVIATION_OVER_THRESHOLD = 3500;
const DEVIATION_UNDER_THRESHOLD = -5000;
const OVERAGE_PCT_THRESHOLD = 10;
const STALE_DAYS = 100;             // pipeline item in system > this = stale_stage
const AGING_ACTION_DAYS = 28;       // days_open >= this = aging (4 weeks, flagged in UI)

// --- Routing ------------------------------------------------------------
// Heather Corey takes any Active Support project regardless of ecosystem.
// Christa is covering Health in lieu of a full-time lead (annotated via teams[].covering).
const HEATHER_TRIGGER_STATUS = "active support";

const TEAMS = [
  { key: "climate",     title: "Climate & Public Affairs", lead: "Kristin O'Connell", ecosystems: ["Climate", "Public Affairs"] },
  { key: "real_estate", title: "Real Estate",              lead: "Jorge Mendez",      ecosystems: ["Real Estate"] },
  { key: "health",      title: "Health",                   lead: "Christa Segalini",  ecosystems: ["Health"], covering: true },
  { key: "howl_exp",    title: "HOWL & Experiences",       lead: "Paul Newton",       ecosystems: ["HOWL", "Experiences"] },
  { key: "performance", title: "Performance",              lead: "Pola Finkelzon",    ecosystems: ["Performance"] },
  { key: "delivery",    title: "Delivery (Active Support)", lead: "Heather Corey",    ecosystems: [], delivery: true },
];

// Ecosystem -> team key (used when the Active Support override doesn't apply)
const ECO_TO_TEAM = (() => {
  const m = {};
  TEAMS.forEach((t) => t.ecosystems.forEach((e) => { m[e] = t.key; }));
  return m;
})();

// --- Parsing helpers ----------------------------------------------------
// Mirror lib/smartsheet.js — handle number type directly, broader null equivalents
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
  if (val == null || val === "") return null;
  const s = String(val).replace(/%/g, "").trim();
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return n > 0 && n < 1 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
}

function ragColor(val) {
  if (!val) return "unknown";
  const v = String(val).toLowerCase().trim();
  if (v === "green") return "green";
  if (v === "yellow") return "yellow";
  if (v === "red") return "red";
  if (v === "blue") return "blue";
  return "unknown";
}

function isExplicitNoTracking(val) {
  if (val == null) return false;
  const s = String(val).trim().toLowerCase();
  return s === "no tracking" || s === "n/a";
}

function reportRowToObject(row, columns) {
  const obj = {};
  const cells = row.cells || [];
  for (let i = 0; i < cells.length && i < columns.length; i++) {
    obj[columns[i].title] = cells[i].displayValue != null ? cells[i].displayValue : cells[i].value;
  }
  return obj;
}

// --- Smartsheet fetch ---------------------------------------------------
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

const NB_DEFAULT_ACTION_OWNER = "Jake Rozmaryn";

async function fetchProjects() {
  const raw = await apiRequest(`/reports/${REPORT_ID}?pageSize=10000`);
  const columns = raw.columns || [];
  const rawProjects = (raw.rows || []).map((row) => {
    const item = reportRowToObject(row, columns);
    const rid = String(item["RID"] || "").trim();
    if (!rid) return null;
    return {
      rid,
      client: String(item["Client"] || "").trim() || "-",
      project_name: String(item["Assignment Title"] || "").trim() || "-",
      ecosystem: String(item["Owning Ecosystem"] || "").trim(),
      workflow_status: String(item["Workflow Status"] || "").trim(),
      contract_type: String(item["Contract Type"] || "").trim(),
      rag: String(item["RAG"] || "").trim(),
      rag_color: ragColor(item["RAG"]),
      pm: String(item["PM/PROD Assigned"] || "").trim(),
      assignment: String(item["Assignment"] || "").trim(),
      // "Action Owner" column — may not exist on every report; graceful fallback to blank
      action_owner: String(item["Action Owner"] || "").trim(),
      budget_forecast: parseCurrency(item["Budget Forecast"]),
      actuals_raw: item["Actuals"],
      actuals: parseCurrency(item["Actuals"]),
      overage: parseCurrency(item["Overage"]),
      last_30_deviation: parseCurrency(item["Last 30 Deviation"]),
      pct_complete: parsePercent(item["% Complete"]),
      created_at: row.createdAt || null,
    };
  }).filter(Boolean);

  // Deduplicate by RID — when a report pulls rows from multiple source sheets,
  // the same project can appear more than once (e.g. parent + child rows, or
  // rollup + line-item). Keep the FIRST occurrence since report ordering
  // generally puts the primary record first. Track the count for diagnostics.
  const seen = new Set();
  const duplicateRids = new Set();
  const projects = [];
  for (const p of rawProjects) {
    if (seen.has(p.rid)) {
      duplicateRids.add(p.rid);
      continue;
    }
    seen.add(p.rid);

    // Default action owner: New Business projects without an explicit
    // Action Owner fall to Jake Rozmaryn. This covers the agency's current
    // policy that NB pipeline-hygiene actions are Jake's by default.
    if (p.rid.startsWith("NB") && !p.action_owner) {
      p.action_owner = NB_DEFAULT_ACTION_OWNER;
    }

    projects.push(p);
  }

  projects._dedup = {
    raw_count: rawProjects.length,
    deduped_count: projects.length,
    duplicate_rids: Array.from(duplicateRids).sort(),
  };
  return projects;
}

// --- Trigger evaluation -------------------------------------------------
function evaluateTriggers(projects, today) {
  const triggers = [];

  for (const p of projects) {
    const isLive = p.rid.startsWith("R") && !p.rid.startsWith("NB");
    const isNB = p.rid.startsWith("NB");
    if (!isLive && !isNB) continue;

    if (isLive) {
      if (p.last_30_deviation > DEVIATION_OVER_THRESHOLD) {
        triggers.push({ id: `${p.rid}:deviation_over`, rid: p.rid, type: "deviation_over",
          label_amount: p.last_30_deviation, sort_value: Math.abs(p.last_30_deviation), project: p });
      }
      if (p.last_30_deviation < DEVIATION_UNDER_THRESHOLD) {
        triggers.push({ id: `${p.rid}:deviation_under`, rid: p.rid, type: "deviation_under",
          label_amount: p.last_30_deviation, sort_value: Math.abs(p.last_30_deviation), project: p });
      }
      if (p.budget_forecast > 0 && p.overage > 0) {
        const pct = (p.overage / p.budget_forecast) * 100;
        if (pct > OVERAGE_PCT_THRESHOLD) {
          triggers.push({ id: `${p.rid}:overage_pct`, rid: p.rid, type: "overage_pct",
            label_amount: p.overage, pct_of_budget: Math.round(pct * 10) / 10,
            sort_value: p.overage, project: p });
        }
      }
      if (p.pct_complete != null && p.pct_complete >= 100) {
        triggers.push({ id: `${p.rid}:ready_to_close`, rid: p.rid, type: "ready_to_close",
          sort_value: 0, project: p });
      }
      if (isExplicitNoTracking(p.actuals_raw)) {
        triggers.push({ id: `${p.rid}:no_tracking`, rid: p.rid, type: "no_tracking",
          sort_value: 0, project: p });
      }
    }

    if (isNB) {
      if (p.budget_forecast <= 0) {
        triggers.push({ id: `${p.rid}:missing_budget`, rid: p.rid, type: "missing_budget",
          sort_value: 0, project: p });
      }
      if (p.actuals <= 0 || isExplicitNoTracking(p.actuals_raw)) {
        triggers.push({ id: `${p.rid}:no_tracking`, rid: p.rid, type: "no_tracking",
          sort_value: 0, project: p });
      }
      if (p.created_at) {
        const createdDay = String(p.created_at).split("T")[0];
        const daysOld = daysBetween(createdDay, today);
        if (daysOld > STALE_DAYS) {
          triggers.push({ id: `${p.rid}:stale_stage`, rid: p.rid, type: "stale_stage",
            days_old: daysOld, sort_value: 0, project: p });
        }
      }
    }
  }

  return triggers;
}

/**
 * Filter rule (user-requested): drop any project whose ONLY trigger is overage_pct.
 * If the project has overage_pct + anything else, all triggers stay.
 * Operates on the flat triggers array.
 */
function applyOverageOnlyFilter(triggers) {
  const byRid = {};
  for (const t of triggers) {
    if (!byRid[t.rid]) byRid[t.rid] = [];
    byRid[t.rid].push(t);
  }
  const droppedRids = new Set();
  for (const [rid, ts] of Object.entries(byRid)) {
    if (ts.length > 0 && ts.every((t) => t.type === "overage_pct")) {
      droppedRids.add(rid);
    }
  }
  return {
    kept: triggers.filter((t) => !droppedRids.has(t.rid)),
    dropped_count: droppedRids.size,
  };
}

// --- Routing ------------------------------------------------------------
/**
 * Choose which team a trigger belongs to:
 *   1. If Workflow Status is "Active Support" -> delivery (Heather Corey)
 *   2. Otherwise map by Owning Ecosystem -> team key
 *   3. Otherwise unassigned
 */
function routeTeamKey(project) {
  const status = String(project.workflow_status || "").trim().toLowerCase();
  if (status === HEATHER_TRIGGER_STATUS) return "delivery";
  return ECO_TO_TEAM[project.ecosystem] || null;
}

// --- Assemble heads (panels) -------------------------------------------
function groupByTeam(triggersWithDays) {
  const byTeam = {};
  TEAMS.forEach((t) => {
    byTeam[t.key] = {
      key: t.key,
      name: t.title,
      lead: t.lead,
      ecosystems: t.ecosystems,
      covering: !!t.covering,
      delivery: !!t.delivery,
      live: {},
      pipeline: {},
      live_count: 0,
      pipeline_count: 0,
      total: 0,
      total_dollar_impact: 0,
      aging_count: 0,
    };
  });
  const unassigned = {
    key: "unassigned", name: "Unassigned", lead: "-", ecosystems: [],
    covering: false, delivery: false,
    live: {}, pipeline: {},
    live_count: 0, pipeline_count: 0, total: 0, total_dollar_impact: 0, aging_count: 0,
  };

  for (const t of triggersWithDays) {
    const teamKey = routeTeamKey(t.project);
    const bucket = teamKey && byTeam[teamKey] ? byTeam[teamKey] : unassigned;
    const bin = t.rid.startsWith("NB") ? bucket.pipeline : bucket.live;
    if (!bin[t.rid]) bin[t.rid] = { project: t.project, triggers: [] };
    bin[t.rid].triggers.push({
      id: t.id,
      type: t.type,
      label_amount: t.label_amount != null ? t.label_amount : null,
      pct_of_budget: t.pct_of_budget != null ? t.pct_of_budget : null,
      days_old: t.days_old != null ? t.days_old : null,
      first_seen: t.first_seen,
      days_open: t.days_open,
      aging: (t.days_open || 0) >= AGING_ACTION_DAYS,
      sort_value: t.sort_value || 0,
    });
    if (t.rid.startsWith("NB")) bucket.pipeline_count++;
    else bucket.live_count++;
    bucket.total++;
    bucket.total_dollar_impact += Math.abs(t.sort_value || 0);
    if ((t.days_open || 0) >= AGING_ACTION_DAYS) bucket.aging_count++;
  }

  // rid-map -> sorted array (by total $ desc, tie-break max days_open desc)
  const projectArr = (m) => {
    const arr = Object.entries(m).map(([rid, data]) => {
      const totalDollar = data.triggers.reduce((s, x) => s + Math.abs(x.sort_value || 0), 0);
      const maxDays = data.triggers.reduce((mx, x) => Math.max(mx, x.days_open || 0), 0);
      const hasAging = data.triggers.some((x) => x.aging);
      data.triggers.sort((a, b) => (b.sort_value || 0) - (a.sort_value || 0) || (b.days_open || 0) - (a.days_open || 0));
      return { rid, ...data, total_dollar: totalDollar, max_days_open: maxDays, has_aging: hasAging };
    });
    arr.sort((a, b) => b.total_dollar - a.total_dollar || b.max_days_open - a.max_days_open);
    return arr;
  };

  const teams = TEAMS.map((t) => ({
    ...byTeam[t.key],
    live: projectArr(byTeam[t.key].live),
    pipeline: projectArr(byTeam[t.key].pipeline),
  }));
  if (unassigned.total > 0) {
    teams.push({
      ...unassigned,
      live: projectArr(unassigned.live),
      pipeline: projectArr(unassigned.pipeline),
    });
  }
  return teams;
}

/**
 * One-shot compute used by the cron for weekly snapshot writes. Returns the
 * same summary structure the UI uses, minus the first_seen/days_open overlay
 * (cron cares about trigger counts, not per-action aging).
 */
async function computeActionSummaryForCron() {
  const today = new Date().toISOString().split("T")[0];
  const projects = await fetchProjects();
  const rawTriggers = evaluateTriggers(projects, today);
  const { kept, dropped_count } = applyOverageOnlyFilter(rawTriggers);
  const by_type = kept.reduce((acc, t) => { acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {});
  return {
    date: today,
    total: kept.length,
    live: kept.filter((t) => !t.rid.startsWith("NB")).length,
    pipeline: kept.filter((t) => t.rid.startsWith("NB")).length,
    deviation_over: by_type.deviation_over || 0,
    deviation_under: by_type.deviation_under || 0,
    overage_pct: by_type.overage_pct || 0,
    ready_to_close: by_type.ready_to_close || 0,
    no_tracking: by_type.no_tracking || 0,
    missing_budget: by_type.missing_budget || 0,
    stale_stage: by_type.stale_stage || 0,
    overage_only_dropped: dropped_count,
  };
}

module.exports = {
  TEAMS, ECO_TO_TEAM, REPORT_ID, REPORT_URL,
  DEVIATION_OVER_THRESHOLD, DEVIATION_UNDER_THRESHOLD, OVERAGE_PCT_THRESHOLD,
  STALE_DAYS, AGING_ACTION_DAYS, NB_DEFAULT_ACTION_OWNER,
  fetchProjects, evaluateTriggers, applyOverageOnlyFilter, groupByTeam,
  computeActionSummaryForCron,
};
