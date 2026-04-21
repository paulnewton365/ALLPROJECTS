const { getActionsTrend } = require("../../../lib/actions-trend");

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const history = await getActionsTrend();
    return Response.json({ history }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err) {
    return Response.json({ error: err.message, history: [] }, { status: 500 });
  }
}
