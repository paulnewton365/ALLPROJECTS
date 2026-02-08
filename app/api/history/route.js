const { getHistory, appendHistory } = require("../../../lib/history");
const { fetchSnapshot } = require("../../../lib/smartsheet");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const history = await getHistory();
    return Response.json({ history });
  } catch (err) {
    return Response.json({ history: [], error: err.message });
  }
}

export async function POST() {
  try {
    const snapshot = await fetchSnapshot();
    const netOverservice = snapshot.live.financials.total_overage - snapshot.live.financials.total_investment;
    const entry = {
      date: new Date().toISOString().split("T")[0],
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
    return Response.json({ logged: entry, total_entries: history.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
