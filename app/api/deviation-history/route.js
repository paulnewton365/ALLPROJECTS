const { getDeviationHistory } = require("../../../lib/deviation-history");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const history = await getDeviationHistory();
    return Response.json({ history });
  } catch (err) {
    return Response.json({ history: [], error: err.message });
  }
}
