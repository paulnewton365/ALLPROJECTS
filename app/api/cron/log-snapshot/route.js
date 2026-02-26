const { appendHistory } = require("../../../../lib/history");
const { fetchSnapshot } = require("../../../../lib/smartsheet");
const { appendDeviationHistory } = require("../../../../lib/deviation-history");
const { appendPipelineHistory } = require("../../../../lib/pipeline-history");
const { appendUtilAgencyHistory } = require("../../../../lib/util-agency-history");

const BASE_URL = "https://api.smartsheet.com/2.0";
async function ssApiRequest(endpoint) {
  const token = process.env.SMARTSHEET_API_TOKEN;
  if (!token) return null;
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  return res.ok ? res.json() : null;
}
function parsePercent(val) {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/%/g, "").trim();
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return n > 0 && n < 1 ? Math.round(n * 1000) / 10 : Math.round(n);
}

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const snapshot = await fetchSnapshot();
    const netOverservice = snapshot.live.financials.total_overage - snapshot.live.financials.total_investment;
    const dateLabel = new Date().toISOString().split("T")[0];
    const entry = {
      date: dateLabel,
      live_revenue: snapshot.live.financials.total_budget,
      live_actuals: snapshot.live.financials.total_actuals,
      net_overservice: netOverservice,
      weighted_pipeline: snapshot.newbiz.weighted_pipeline,
      live_count: snapshot.live.count,
      newbiz_count: snapshot.newbiz.count,
      overserviced_count: snapshot.live.financials.overserviced_count,
      burn_rate: snapshot.live.financials.burn_rate_pct,
    };
    const history = await appendHistory(entry);

    // Deviation snapshot
    let devEntry = null;
    if (snapshot.live.deviation) {
      const dev = snapshot.live.deviation;
      const byEco = dev.by_ecosystem || {};
      devEntry = {
        date: dateLabel,
        total: dev.total,
        total_ecosystem: dev.total_ecosystem,
        total_ed: dev.total_ed,
        total_perf: dev.total_perf,
        total_integrated: dev.total_integrated,
        climate: Math.round(byEco.Climate?.total || 0),
        real_estate: Math.round(byEco["Real Estate"]?.total || 0),
        health: Math.round(byEco.Health?.total || 0),
        climate_eco: Math.round(byEco.Climate?.eco || 0),
        real_estate_eco: Math.round(byEco["Real Estate"]?.eco || 0),
        health_eco: Math.round(byEco.Health?.eco || 0),
      };
      await appendDeviationHistory(devEntry);
    }

    // Pipeline snapshot
    let pipeEntry = null;
    if (snapshot.newbiz) {
      const nbEcos = snapshot.newbiz.by_ecosystem || [];
      const findEco = (name) => nbEcos.find((e) => e.name === name)?.weighted || 0;
      pipeEntry = {
        date: dateLabel,
        weighted_total: snapshot.newbiz.weighted_pipeline || 0,
        climate: Math.round(findEco("Climate")),
        real_estate: Math.round(findEco("Real Estate")),
        health: Math.round(findEco("Health")),
      };
      await appendPipelineHistory(pipeEntry);
    }

    // Agency utilization snapshot
    let utilEntry = null;
    try {
      const UTIL_REPORT = process.env.AGENCY_UTILIZATION_REPORT_ID || "4581510595170180";
      const utilRaw = await ssApiRequest(`/reports/${UTIL_REPORT}?pageSize=200`);
      if (utilRaw && utilRaw.rows) {
        const cols = utilRaw.columns || [];
        const people = (utilRaw.rows || []).map((row) => {
          const item = {};
          (row.cells || []).forEach((cell, i) => { if (cols[i]) item[cols[i].title] = cell.displayValue ?? cell.value ?? null; });
          const name = String(item["Team Member"] || "").trim();
          if (!name) return null;
          return { name, ecosystem: String(item["ECOSYSTEM"] || "").trim().toUpperCase(), utilization: parsePercent(item["Utilization"]), admin: parsePercent(item["Admin Time"]) };
        }).filter(Boolean);
        const total = people.length;
        const avgUtil = total > 0 ? Math.round(people.reduce((s, p) => s + p.utilization, 0) / total) : 0;
        const avgAdmin = total > 0 ? Math.round(people.reduce((s, p) => s + p.admin, 0) / total) : 0;
        const ecoAvg = {};
        people.forEach((p) => { if (!ecoAvg[p.ecosystem]) ecoAvg[p.ecosystem] = { total: 0, count: 0 }; ecoAvg[p.ecosystem].total += p.utilization; ecoAvg[p.ecosystem].count++; });
        utilEntry = {
          date: dateLabel,
          team_size: total,
          avg_utilization: avgUtil,
          avg_admin: avgAdmin,
          climate: Math.round((ecoAvg.CLIMATE?.total || 0) / (ecoAvg.CLIMATE?.count || 1)),
          real_estate: Math.round((ecoAvg["REAL ESTATE"]?.total || 0) / (ecoAvg["REAL ESTATE"]?.count || 1)),
          health: Math.round((ecoAvg.HEALTH?.total || 0) / (ecoAvg.HEALTH?.count || 1)),
          delivery: Math.round((ecoAvg.DELIVERY?.total || 0) / (ecoAvg.DELIVERY?.count || 1)),
          experiences: Math.round((ecoAvg.EXPERIENCES?.total || 0) / (ecoAvg.EXPERIENCES?.count || 1)),
          performance: Math.round((ecoAvg.PERFORMANCE?.total || 0) / (ecoAvg.PERFORMANCE?.count || 1)),
        };
        await appendUtilAgencyHistory(utilEntry);
      }
    } catch (e) { console.error("Agency util snapshot error:", e.message); }

    return Response.json({ success: true, logged: entry, dev_logged: devEntry, pipe_logged: pipeEntry, util_logged: utilEntry, total_entries: history.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
