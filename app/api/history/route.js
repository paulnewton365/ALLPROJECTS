import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getHistory } = require("@/lib/history");
    const history = await getHistory();
    return NextResponse.json({ history });
  } catch (err) {
    return NextResponse.json({ history: [], error: err.message });
  }
}

// Manual trigger: POST /api/history to log current snapshot
export async function POST() {
  try {
    const { fetchSnapshot } = require("@/lib/smartsheet");
    const { appendHistory } = require("@/lib/history");
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
    return NextResponse.json({ logged: entry, total_entries: history.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
