const { listSheets, listReports, inspectSource } = require("../../../lib/smartsheet");

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const inspectId = searchParams.get("inspect");
    const inspectType = searchParams.get("type") || "sheet";

    // If inspecting a specific source
    if (inspectId) {
      const details = await inspectSource(inspectId, inspectType);
      return Response.json(details);
    }

    // Otherwise list everything
    const [sheets, reports] = await Promise.all([listSheets(), listReports()]);

    return Response.json({
      sheets: sheets.map((s) => ({ id: s.id, name: s.name })),
      reports: reports.map((r) => ({ id: r.id, name: r.name })),
    });
  } catch (err) {
    console.error("Discover error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
