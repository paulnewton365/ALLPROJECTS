/**
 * Weekly cron — snapshots penetration and revenue data
 * Runs every Monday via Vercel Cron
 * Logs the current "So Far This Month" penetration values
 */

import { appendDeptHistory } from "../../../../lib/dept-history";

export const dynamic = "force-dynamic";

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

function parseCurrency(val) {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/[$,\s]/g, "");
  if (s.startsWith("(") && s.endsWith(")")) return -parseFloat(s.slice(1, -1)) || 0;
  return parseFloat(s) || 0;
}

const EXP_DISCIPLINES = ["CREATIVE COPYWRITER", "CREATIVE STRATEGY", "DESIGN", "DIGITAL PRODUCER", "INTEGRATED STRATEGY", "STUDIO MANAGEMENT", "TECH DEV"];
const DEL_DISCIPLINES = ["IPM", "SUPPORT"];

function calculateFromSheet(raw) {
  if (!raw?.rows?.length) return null;
  let disciplineColId = null, incurredColId = null, forecastColId = null;
  for (const col of raw.columns || []) {
    const t = (col.title || "").toLowerCase();
    if (t === "discipline") disciplineColId = col.id;
    if (t.includes("incurred") && t.includes("currency")) incurredColId = col.id;
    if (t.includes("forecast") && t.includes("currency")) forecastColId = col.id;
  }
  if (!disciplineColId || !incurredColId) return null;

  let totalIncurred = 0, expIncurred = 0, delIncurred = 0;
  let expForecast = 0, delForecast = 0;

  for (const row of raw.rows) {
    let discipline = null, incurred = 0, forecast = 0;
    for (const cell of row.cells || []) {
      if (cell.columnId === disciplineColId) discipline = String(cell.value || cell.displayValue || "").toUpperCase().trim();
      if (cell.columnId === incurredColId) incurred = parseCurrency(cell.value != null ? cell.value : cell.displayValue);
      if (forecastColId && cell.columnId === forecastColId) forecast = parseCurrency(cell.value != null ? cell.value : cell.displayValue);
    }
    totalIncurred += incurred;
    if (discipline && EXP_DISCIPLINES.includes(discipline)) { expIncurred += incurred; expForecast += forecast; }
    if (discipline && DEL_DISCIPLINES.includes(discipline)) { delIncurred += incurred; delForecast += forecast; }
  }

  return {
    experiences_pct: totalIncurred > 0 ? Math.round((expIncurred / totalIncurred) * 100) : 0,
    delivery_pct: totalIncurred > 0 ? Math.round((delIncurred / totalIncurred) * 100) : 0,
    exp_revenue: expIncurred + expForecast,
    del_revenue: delIncurred + delForecast,
  };
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const THIS_MONTH_SHEET = process.env.DEPT_PENETRATION_THIS_ID || "4701999716061060";
    const thisRaw = await apiRequest(`/sheets/${THIS_MONTH_SHEET}?pageSize=10000`).catch(() => null);
    const thisCalc = calculateFromSheet(thisRaw);

    if (!thisCalc) {
      return Response.json({ error: "Could not calculate penetration from This Month sheet" }, { status: 500 });
    }

    // Weekly data point keyed by date (YYYY-MM-DD)
    const now = new Date();
    const dateLabel = now.toISOString().split("T")[0];

    const entry = {
      month: dateLabel,
      experiences: thisCalc.experiences_pct,
      delivery: thisCalc.delivery_pct,
      combined: thisCalc.experiences_pct + thisCalc.delivery_pct,
      exp_revenue: thisCalc.exp_revenue,
      del_revenue: thisCalc.del_revenue,
    };

    const history = await appendDeptHistory(entry);
    return Response.json({ success: true, logged: entry, total_entries: history.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
