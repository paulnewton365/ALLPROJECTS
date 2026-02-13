const { inspectSource } = require("../../../lib/smartsheet");

export const dynamic = "force-dynamic";

const BASE_URL = "https://api.smartsheet.com/2.0";

async function apiRequest(endpoint) {
  const token = process.env.SMARTSHEET_API_TOKEN;
  if (!token) throw new Error("SMARTSHEET_API_TOKEN not set");
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Smartsheet API error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dashboardId = searchParams.get("id") || "2485570590009220";
  const inspect = searchParams.get("inspect"); // optional: inspect a specific source from the dashboard

  try {
    // If inspect param, drill into a specific sheet/report
    if (inspect) {
      const type = searchParams.get("type") || "sheet";
      const data = await inspectSource(inspect, type);
      return Response.json(data);
    }

    // Fetch dashboard structure
    const dashboard = await apiRequest(`/sights/${dashboardId}`);

    const summary = {
      id: dashboard.id,
      name: dashboard.name,
      permalink: dashboard.permalink || null,
      totalWidgets: (dashboard.widgets || []).length,
      widgets: (dashboard.widgets || []).map((w) => {
        const widget = {
          id: w.id,
          type: w.type,
          title: w.title || w.type,
          xPosition: w.xPosition,
          yPosition: w.yPosition,
          width: w.width,
          height: w.height,
        };

        // Extract source references based on widget type
        if (w.contents) {
          // Chart/Report widgets often have contents with source info
          widget.contents = {
            type: w.contents.type,
            reportId: w.contents.reportId || null,
            sheetId: w.contents.sheetId || null,
            sourceId: w.contents.sourceId || null,
            column: w.contents.column || null,
            hyperlink: w.contents.hyperlink || null,
            htmlContent: w.contents.htmlContent ? "(HTML present)" : null,
            cellData: w.contents.cellData ? `${w.contents.cellData.length} cells` : null,
            shortcutData: w.contents.shortcutData || null,
          };
        }

        // Some widgets store source in different places
        if (w.reportId) widget.reportId = w.reportId;
        if (w.sheetId) widget.sheetId = w.sheetId;

        return widget;
      }),
    };

    // Collect all unique source IDs for easy reference
    const sourceIds = new Set();
    summary.widgets.forEach((w) => {
      if (w.reportId) sourceIds.add({ id: w.reportId, type: "report", widget: w.title });
      if (w.contents?.reportId) sourceIds.add({ id: w.contents.reportId, type: "report", widget: w.title });
      if (w.contents?.sheetId) sourceIds.add({ id: w.contents.sheetId, type: "sheet", widget: w.title });
      if (w.contents?.sourceId) sourceIds.add({ id: w.contents.sourceId, type: "unknown", widget: w.title });
    });

    summary.dataSources = [...sourceIds];
    summary.inspectHint = "Add ?inspect=SOURCE_ID&type=sheet (or type=report) to inspect a specific source's columns and sample data";

    return Response.json(summary);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

