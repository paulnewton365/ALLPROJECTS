const { getUtilHistory } = require("../../../lib/util-history");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const history = await getUtilHistory();
    return Response.json({ history });
  } catch (err) {
    return Response.json({ history: [], error: err.message });
  }
}
