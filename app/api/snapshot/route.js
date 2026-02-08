const { fetchSnapshot } = require("../../../lib/smartsheet");

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await fetchSnapshot();
    return Response.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("Snapshot error:", err);
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
