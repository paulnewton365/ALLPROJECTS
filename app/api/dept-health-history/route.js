const { getDeptHistory, appendDeptHistory } = require("../../../lib/dept-history");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const history = await getDeptHistory();
    return Response.json({ history });
  } catch (err) {
    return Response.json({ history: [], error: err.message });
  }
}

export async function POST(request) {
  try {
    // Accept snapshot data from cron or manual trigger
    const body = await request.json().catch(() => null);
    if (!body || !body.month) {
      return Response.json({ error: "POST body must include { month, experiences, delivery, combined }" }, { status: 400 });
    }
    const entry = {
      month: body.month,
      experiences: body.experiences || 0,
      delivery: body.delivery || 0,
      combined: body.combined || (body.experiences || 0) + (body.delivery || 0),
      exp_revenue: body.exp_revenue || 0,
      del_revenue: body.del_revenue || 0,
      logged_at: new Date().toISOString(),
    };
    const history = await appendDeptHistory(entry);
    return Response.json({ logged: entry, history, total_entries: history.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
