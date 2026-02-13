/**
 * Monthly cron — snapshots penetration and revenue data
 * Runs on the 1st of each month via Vercel Cron
 * Logs the PREVIOUS month's penetration values
 */

const { appendDeptHistory } = require("../../../../lib/dept-history");

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
  let totalForecast = 0, expForecast = 0, delForecast = 0;

  for (const row of raw.rows) {
    let discipline = null, incurred = 0, forecast = 0;
    for (const cell of row.cells || []) {
      if (cell.columnId === disciplineColId) discipline = String(cell.value || "").toUpperCase().trim();
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
    experiences_pct: total > 0 ? Math.round(((expIncurred + expForecast) / total) * 100) : 0,
    delivery_pct: total > 0 ? Math.round(((delIncurred + delForecast) / total) * 100) : 0,
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
    const LAST_MONTH_SHEET = process.env.DEPT_PENETRATION_LAST_ID || "1413449557954436";
    const THIS_MONTH_SHEET = process.env.DEPT_PENETRATION_THIS_ID || "4701999716061060";

    const [lastRaw, thisRaw] = await Promise.all([
      apiRequest(`/sheets/${LAST_MONTH_SHEET}?pageSize=10000`).catch(() => null),
      apiRequest(`/sheets/${THIS_MONTH_SHEET}?pageSize=10000`).catch(() => null),
    ]);

    // Use last month data for penetration snapshot
    const lastCalc = calculateFromSheet(lastRaw);
    const thisCalc = calculateFromSheet(thisRaw);

    // Determine the month label: this cron runs on 1st, so last month = previous month
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthLabel = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    if (!lastCalc) {
      return Response.json({ error: "Could not calculate penetration from Last Month sheet" }, { status: 500 });
    }

    const entry = {
      month: monthLabel,
      experiences: lastCalc.experiences_pct,
      delivery: lastCalc.delivery_pct,
      combined: lastCalc.experiences_pct + lastCalc.delivery_pct,
      exp_revenue: thisCalc ? thisCalc.exp_revenue : 0,
      del_revenue: thisCalc ? thisCalc.del_revenue : 0,
    };

    const history = await appendDeptHistory(entry);
    return Response.json({ success: true, logged: entry, total_entries: history.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
