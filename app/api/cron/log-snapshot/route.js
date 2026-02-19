const { appendHistory } = require("../../../../lib/history");
const { fetchSnapshot } = require("../../../../lib/smartsheet");
const { appendDeviationHistory } = require("../../../../lib/deviation-history");

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

    return Response.json({ success: true, logged: entry, dev_logged: devEntry, total_entries: history.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
