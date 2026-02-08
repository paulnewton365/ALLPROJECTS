import { NextResponse } from "next/server";

const BASE_URL = "https://api.smartsheet.com/2.0";

export async function GET() {
  try {
    const token = process.env.SMARTSHEET_API_TOKEN;
    const sourceId = process.env.SMARTSHEET_SOURCE_ID;
    const sourceType = process.env.SMARTSHEET_SOURCE_TYPE || "report";

    const endpoint = sourceType === "report"
      ? `${BASE_URL}/reports/${sourceId}?pageSize=10000&include=sourceSheets`
      : `${BASE_URL}/sheets/${sourceId}?pageSize=10000`;

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const raw = await res.json();

    // Build column map
    const colMap = {};
    for (const col of raw.columns || []) {
      const id = col.virtualId || col.id;
      colMap[id] = col.title;
    }

    // Source sheets mapping
    const sourceSheets = (raw.sourceSheets || []).map((s) => ({
      id: s.id, name: s.name,
    }));
    const sheetIdMap = {};
    for (const s of sourceSheets) sheetIdMap[s.id] = s.name;

    // Count rows per source sheet
    const rowsBySheet = {};
    for (const row of raw.rows || []) {
      const name = sheetIdMap[row.sheetId] || `unknown_${row.sheetId}`;
      rowsBySheet[name] = (rowsBySheet[name] || 0) + 1;
    }

    // Count rows per workflow status
    const rowsByWorkflow = {};
    for (const row of raw.rows || []) {
      const wfCell = (row.cells || []).find((c) => {
        const cid = c.virtualColumnId || c.columnId;
        return colMap[cid] === "Workflow Status";
      });
      const wf = wfCell?.displayValue || wfCell?.value || "EMPTY";
      rowsByWorkflow[wf] = (rowsByWorkflow[wf] || 0) + 1;
    }

    // Cross-tabulate: workflow status x source sheet
    const crossTab = {};
    for (const row of raw.rows || []) {
      const sheetName = sheetIdMap[row.sheetId] || `unknown_${row.sheetId}`;
      const wfCell = (row.cells || []).find((c) => {
        const cid = c.virtualColumnId || c.columnId;
        return colMap[cid] === "Workflow Status";
      });
      const wf = wfCell?.displayValue || wfCell?.value || "EMPTY";
      const key = `${sheetName} | ${wf}`;
      crossTab[key] = (crossTab[key] || 0) + 1;
    }

    return NextResponse.json({
      totalRows: raw.rows?.length || 0,
      sourceSheets,
      rowsBySheet,
      rowsByWorkflow,
      crossTab,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
