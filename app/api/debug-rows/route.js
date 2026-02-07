import { NextResponse } from "next/server";

const BASE_URL = "https://api.smartsheet.com/2.0";

export async function GET() {
  try {
    const token = process.env.SMARTSHEET_API_TOKEN;
    const sourceId = process.env.SMARTSHEET_SOURCE_ID;
    const sourceType = process.env.SMARTSHEET_SOURCE_TYPE || "report";

    const endpoint = sourceType === "report"
      ? `${BASE_URL}/reports/${sourceId}?pageSize=10000`
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

    // Inspect ALL row-level properties (not just cells)
    const rowAnalysis = (raw.rows || []).map((row, idx) => {
      // Extract every key on the row object EXCEPT cells
      const rowMeta = {};
      for (const key of Object.keys(row)) {
        if (key === "cells") continue;
        rowMeta[key] = row[key];
      }

      // Extract cell values
      const cellData = {};
      for (const cell of row.cells || []) {
        const colId = cell.virtualColumnId || cell.columnId;
        const colName = colMap[colId] || `col_${colId}`;
        cellData[colName] = {
          value: cell.value,
          displayValue: cell.displayValue,
          // Include any extra cell properties
          ...(cell.formula ? { formula: cell.formula } : {}),
          ...(cell.hyperlink ? { hyperlink: cell.hyperlink } : {}),
          ...(cell.linksOutToCells ? { linksOutToCells: cell.linksOutToCells } : {}),
        };
      }

      return { rowIndex: idx, meta: rowMeta, cells: cellData };
    });

    // Find rows that look like summaries (no sheetName, or special properties)
    const uniqueRowKeys = new Set();
    for (const row of raw.rows || []) {
      for (const key of Object.keys(row)) {
        uniqueRowKeys.add(key);
      }
    }

    // Count rows by sheetName
    const sheetNameCounts = {};
    let noSheetName = 0;
    for (const row of raw.rows || []) {
      if (row.sheetName) {
        sheetNameCounts[row.sheetName] = (sheetNameCounts[row.sheetName] || 0) + 1;
      } else {
        noSheetName++;
      }
    }

    // Show distinct values of any boolean or flag-like properties
    const flagProps = {};
    for (const key of uniqueRowKeys) {
      if (key === "cells" || key === "id") continue;
      const values = new Set();
      for (const row of raw.rows || []) {
        values.add(String(row[key] ?? "undefined"));
      }
      if (values.size <= 20) { // Only show if not too many unique values
        flagProps[key] = [...values];
      } else {
        flagProps[key] = `${values.size} unique values`;
      }
    }

    return NextResponse.json({
      totalRows: raw.rows?.length || 0,
      totalColumns: raw.columns?.length || 0,
      allRowProperties: [...uniqueRowKeys],
      propertyValues: flagProps,
      sheetNameCounts,
      rowsWithoutSheetName: noSheetName,
      // Show first 5 and last 5 rows for inspection
      firstRows: rowAnalysis.slice(0, 5),
      lastRows: rowAnalysis.slice(-5),
      // Find any rows that have unusual properties
      potentialSummaryRows: rowAnalysis.filter((r) =>
        !r.meta.sheetName ||
        r.meta.expanded === false ||
        r.meta.filteredOut === true ||
        Object.keys(r.meta).length !== Object.keys(rowAnalysis[0]?.meta || {}).length
      ).slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
