const { getPipelineHistory } = require("../../../lib/pipeline-history");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const history = await getPipelineHistory();
    return Response.json({ history });
  } catch (err) {
    return Response.json({ history: [], error: err.message });
  }
}
