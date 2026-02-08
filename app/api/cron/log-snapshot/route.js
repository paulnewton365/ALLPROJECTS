import { NextResponse } from "next/server";
import { appendHistory } from "../../../../lib/history.js";
import { fetchSnapshot } from "../../../../lib/smartsheet.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
    return NextResponse.json({ success: true, logged: entry, total_entries: history.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
