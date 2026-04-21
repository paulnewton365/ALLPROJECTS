/**
 * Actions API
 *
 * Pulls the All Projects report (default 1172654530711428), evaluates trigger
 * rules against every row, routes each action to a department head based on
 * Owning Ecosystem, and returns actions grouped by head. Also records first_seen
 * / last_seen per action via lib/actions-history so the UI can show "days open".
 *
 * Triggers:
 *   Live (RID starts with R):
 *     deviation_over   Last 30 Deviation > +$3,500
 *     deviation_under  Last 30 Deviation < -$5,000
 *     overage_pct      Overage > 10% of Budget Forecast
 *     ready_to_close   % Complete >= 100
 *     no_tracking      Actuals explicitly "No Tracking"
 *
 *   Pipeline (RID starts with NB):
 *     missing_budget   Budget Forecast = 0/blank
 *     no_tracking      Actuals = 0/blank/"No Tracking"
 *     stale_stage      Row createdAt older than 100 days
 */

import {
  getActionsHistory,
  saveActionsHistory,
  reconcileActions,
  daysBetween,
} from "../../../lib/actions-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const BASE_URL = "https://api.smartsheet.com/2.0";
const REPORT_ID = process.env.ALL_PROJECTS_REPORT_ID || "1172654530711428";

// Ecosystem -> department head. PA rolls into Climate per Paul.
const DEPT_HEADS = {
  "Climate": "Kristin O'Connell",
  "Public Affairs": "Kristin O'Connell",
  "Real Estate": "Jorge Mendez",
  "Health": "Christa Segalini",
  "HOWL": "Paul Newton",
  "Experiences": "Paul Newton",
  "Delivery": "Paul Newton",
  "Performance": "Pola Finkelzon",
};

// Canonical rendering order of dept heads + the ecosystems each covers
const HEADS = [
  { name: "Kristin O'Connell", ecosystems: ["Climate", "Public Affairs"] },
  { name: "Jorge Mendez",      ecosystems: ["Real Estate"] },
  { name: "Christa Segalini",  ecosystems: ["Health"] },
  { name: "Paul Newton",       ecosystems: ["HOWL", "Experiences", "Delivery"] },
  { name: "Pola Finkelzon",    ecosystems: ["Performance"] },
];

const DEVIATION_OVER_THRESHOLD = 3500;
const DEVIATION_UNDER_THRESHOLD = -5000;
const OVERAGE_PCT_THRESHOLD = 10;
const STALE_DAYS = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function reportRowToObject(row, columns) {
  const obj = {};
  const cells = row.cells || [];
  for (let i = 0; i < cells.length && i < columns.length; i++) {
    obj[columns[i].title] = cells[i].displayValue != null ? cells[i].displayValue : cells[i].value;
  }
  return obj;
}

function parseCurrency(val) {
  if (val == null || val === "" || val === "No Tracking" || val === "-") return 0;
  const s = String(val).replace(/[$,\s]/g, "");
  if (s.startsWith("(") && s.endsWith(")")) return -(parseFloat(s.slice(1, -1)) || 0);
  return parseFloat(s) || 0;
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

// ---------------------------------------------------------------------------
// Trigger evaluation
// ---------------------------------------------------------------------------
function evaluateTriggers(projects, today) {
  const triggers = [];

  for (const p of projects) {
    const isLive = p.rid.startsWith("R") && !p.rid.startsWith("NB");
    const isNB = p.rid.startsWith("NB");
    if (!isLive && !isNB) continue;

    if (isLive) {
      // Deviation overservicing
      if (p.last_30_deviation > DEVIATION_OVER_THRESHOLD) {
        triggers.push({
          id: `${p.rid}:deviation_over`,
          rid: p.rid,
          type: "deviation_over",
          label_amount: p.last_30_deviation,
          sort_value: Math.abs(p.last_30_deviation),
          project: p,
        });
      }
      // Deviation underservicing (booked too much in)
      if (p.last_30_deviation < DEVIATION_UNDER_THRESHOLD) {
        triggers.push({
          id: `${p.rid}:deviation_under`,
          rid: p.rid,
          type: "deviation_under",
          label_amount: p.last_30_deviation,
          sort_value: Math.abs(p.last_30_deviation),
          project: p,
        });
      }
      // Overage > 10% of budget
      if (p.budget_forecast > 0 && p.overage > 0) {
        const pct = (p.overage / p.budget_forecast) * 100;
        if (pct > OVERAGE_PCT_THRESHOLD) {
          triggers.push({
            id: `${p.rid}:overage_pct`,
            rid: p.rid,
            type: "overage_pct",
            label_amount: p.overage,
            pct_of_budget: Math.round(pct * 10) / 10,
            sort_value: p.overage,
            project: p,
          });
        }
      }
      // 100% complete, needs closing
      if (p.pct_complete != null && p.pct_complete >= 100) {
        triggers.push({
          id: `${p.rid}:ready_to_close`,
          rid: p.rid,
          type: "ready_to_close",
          sort_value: 0,
          project: p,
        });
      }
      // No time tracking (explicit flag)
      if (isExplicitNoTracking(p.actuals_raw)) {
        triggers.push({
          id: `${p.rid}:no_tracking`,
          rid: p.rid,
          type: "no_tracking",
          sort_value: 0,
          project: p,
        });
      }
    }

    if (isNB) {
      // Missing budget forecast
      if (p.budget_forecast <= 0) {
        triggers.push({
          id: `${p.rid}:missing_budget`,
          rid: p.rid,
          type: "missing_budget",
          sort_value: 0,
          project: p,
        });
      }
      // No tracking (for NB, $0 or blank actuals counts)
      if (p.actuals <= 0 || isExplicitNoTracking(p.actuals_raw)) {
        triggers.push({
          id: `${p.rid}:no_tracking`,
          rid: p.rid,
          type: "no_tracking",
          sort_value: 0,
          project: p,
        });
      }
      // Stale — row has been in the system more than STALE_DAYS
      if (p.created_at) {
        const createdDay = String(p.created_at).split("T")[0];
        const daysOld = daysBetween(createdDay, today);
        if (daysOld > STALE_DAYS) {
          triggers.push({
            id: `${p.rid}:stale_stage`,
            rid: p.rid,
            type: "stale_stage",
            days_old: daysOld,
            sort_value: 0,
            project: p,
          });
        }
      }
    }
  }

  return triggers;
}

// ---------------------------------------------------------------------------
// Group + shape response
// ---------------------------------------------------------------------------
function groupByHead(triggersWithDays) {
  const byHead = {};
  for (const h of HEADS) {
    byHead[h.name] = {
      name: h.name,
      ecosystems: h.ecosystems,
      live: {},     // rid -> { project, triggers: [] }
      pipeline: {}, // rid -> { project, triggers: [] }
      live_count: 0,
      pipeline_count: 0,
      total: 0,
      total_dollar_impact: 0,
    };
  }
  const unassigned = {
    name: "Unassigned",
    ecosystems: [],
    live: {}, pipeline: {},
    live_count: 0, pipeline_count: 0, total: 0, total_dollar_impact: 0,
  };

  for (const t of triggersWithDays) {
    const head = DEPT_HEADS[t.project.ecosystem];
    const bucket = head ? byHead[head] : unassigned;
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
      sort_value: t.sort_value || 0,
    });
    if (t.rid.startsWith("NB")) bucket.pipeline_count++;
    else bucket.live_count++;
    bucket.total++;
    bucket.total_dollar_impact += Math.abs(t.sort_value || 0);
  }

  // Convert nested rid-maps to arrays; sort projects by total dollar impact DESC then days_open DESC
  const projectArr = (m) => {
    const arr = Object.entries(m).map(([rid, data]) => {
      const totalDollar = data.triggers.reduce((s, x) => s + Math.abs(x.sort_value || 0), 0);
      const maxDays = data.triggers.reduce((m, x) => Math.max(m, x.days_open || 0), 0);
      // Sort triggers within a project: $ ones first desc, hygiene after
      data.triggers.sort((a, b) => (b.sort_value || 0) - (a.sort_value || 0) || (b.days_open || 0) - (a.days_open || 0));
      return { rid, ...data, total_dollar: totalDollar, max_days_open: maxDays };
    });
    arr.sort((a, b) => b.total_dollar - a.total_dollar || b.max_days_open - a.max_days_open);
    return arr;
  };

  const heads = HEADS.map((h) => ({
    ...byHead[h.name],
    live: projectArr(byHead[h.name].live),
    pipeline: projectArr(byHead[h.name].pipeline),
  }));

  if (unassigned.total > 0) {
    heads.push({
      ...unassigned,
      live: projectArr(unassigned.live),
      pipeline: projectArr(unassigned.pipeline),
    });
  }

  return heads;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const raw = await apiRequest(`/reports/${REPORT_ID}?pageSize=10000`);
    const columns = raw.columns || [];
    const today = new Date().toISOString().split("T")[0];

    const projects = (raw.rows || []).map((row) => {
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
        budget_forecast: parseCurrency(item["Budget Forecast"]),
        actuals_raw: item["Actuals"],
        actuals: parseCurrency(item["Actuals"]),
        overage: parseCurrency(item["Overage"]),
        last_30_deviation: parseCurrency(item["Last 30 Deviation"]),
        pct_complete: parsePercent(item["% Complete"]),
        created_at: row.createdAt || null,
      };
    }).filter(Boolean);

    // Evaluate
    const triggers = evaluateTriggers(projects, today);

    // Reconcile against blob history (best-effort — don't fail the whole request
    // if blob is unavailable; just render with days_open = 0).
    let updated = {};
    let historyError = null;
    try {
      const history = await getActionsHistory();
      updated = reconcileActions(triggers.map((t) => t.id), history);
      await saveActionsHistory(updated);
    } catch (err) {
      historyError = err.message;
      // Fall back: treat every current trigger as first-seen-today
      updated = triggers.reduce((acc, t) => {
        acc[t.id] = { first_seen: today, last_seen: today };
        return acc;
      }, {});
    }

    const triggersWithDays = triggers.map((t) => {
      const rec = updated[t.id] || { first_seen: today, last_seen: today };
      return {
        ...t,
        first_seen: rec.first_seen,
        days_open: daysBetween(rec.first_seen, today),
      };
    });

    // Group and summarize
    const heads = groupByHead(triggersWithDays);

    const by_type = triggersWithDays.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {});

    const summary = {
      total: triggersWithDays.length,
      live: triggersWithDays.filter((t) => !t.rid.startsWith("NB")).length,
      pipeline: triggersWithDays.filter((t) => t.rid.startsWith("NB")).length,
      by_type,
      new_today: triggersWithDays.filter((t) => t.days_open === 0).length,
      oldest_days_open: triggersWithDays.reduce((m, t) => Math.max(m, t.days_open || 0), 0),
    };

    return Response.json(
      {
        summary,
        heads,
        generated_at: new Date().toISOString(),
        history_error: historyError,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    console.error("Actions error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
