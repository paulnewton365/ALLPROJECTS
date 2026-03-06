/**
 * Retainers API — Pulls from All Projects report, filters for Contract Type containing RETAINER
 * Returns summaries + per-ecosystem project lists
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = "https://api.smartsheet.com/2.0";
const REPORT_ID = process.env.RETAINERS_REPORT_ID || "1172654530711428";

async function apiRequest(endpoint) {
  const token = process.env.SMARTSHEET_API_TOKEN;
  if (!token) throw new Error("SMARTSHEET_API_TOKEN not set");
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Smartsheet ${res.status}: ${body}`);
  }
  return res.json();
}

function reportRowToObject(row, columns) {
  const obj = {};
  const cells = row.cells || [];
  for (let i = 0; i < cells.length && i < columns.length; i++) {
    const val = cells[i].displayValue != null ? cells[i].displayValue : cells[i].value;
    obj[columns[i].title] = val;
  }
  return obj;
}

function parseCurrency(val) {
  if (val == null || val === "" || val === "No Tracking" || val === "-") return 0;
  const s = String(val).replace(/[$,\s]/g, "");
  if (s.startsWith("(") && s.endsWith(")")) return -(parseFloat(s.slice(1, -1)) || 0);
  return parseFloat(s) || 0;
}

function parsePercent(val) {
  if (val == null || val === "") return null;
  const s = String(val).replace(/%/g, "").trim();
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return n > 0 && n < 1 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
}

function ragColor(val) {
  if (!val) return "unknown";
  const v = String(val).toLowerCase();
  if (v === "green") return "green";
  if (v === "yellow") return "yellow";
  if (v === "red") return "red";
  if (v === "blue") return "blue";
  return "unknown";
}

export async function GET() {
  try {
    const raw = await apiRequest(`/reports/${REPORT_ID}?pageSize=10000`);
    const columns = raw.columns || [];

    const allProjects = (raw.rows || []).map((row) => {
      const item = reportRowToObject(row, columns);

      const contractType = String(item["Contract Type"] || "").toUpperCase();
      if (!contractType.includes("RETAINER")) return null;

      return {
        rid: String(item["RID"] || item["RID "] || "").trim(),
        client: String(item["Client"] || "").trim(),
        project_name: String(item["Assignment Title"] || "").trim(),
        contract_type: String(item["Contract Type"] || "").trim(),
        rag: String(item["RAG"] || "").trim(),
        rag_color: ragColor(item["RAG"]),
        ecosystem: String(item["Owning Ecosystem"] || item["Ecosystem"] || "").trim(),
        pct_complete: parsePercent(item["% Complete"]),
        sow_time_elapsed: parsePercent(item["SOW Time Elapsed"]),
        budget_forecast: parseCurrency(item["Budget Forecast"]),
        actuals: parseCurrency(item["Actuals"]),
        overage: parseCurrency(item["Overage"]),
        oop: parseCurrency(item["OOP"]),
        contracts_total: parseCurrency(item["Contracts Total"]),
        deviation_this_month: parseCurrency(item["Deviation This Month"]),
        deviation_last_30: parseCurrency(item["Last 30 Deviation"]),
      };
    }).filter(Boolean);

    // Summaries
    const total = allProjects.length;
    const total_value = allProjects.reduce((s, p) => s + (p.budget_forecast || 0), 0);
    const total_deviation_this_month = allProjects.reduce((s, p) => s + (p.deviation_this_month || 0), 0);
    const total_deviation_last_30 = allProjects.reduce((s, p) => s + (p.deviation_last_30 || 0), 0);

    // Top 5 by budget
    const top_by_budget = [...allProjects]
      .sort((a, b) => (b.budget_forecast || 0) - (a.budget_forecast || 0))
      .slice(0, 5);

    // Top 5 by overage
    const top_by_overage = [...allProjects]
      .filter((p) => (p.overage || 0) > 0)
      .sort((a, b) => (b.overage || 0) - (a.overage || 0))
      .slice(0, 5);

    // By ecosystem
    const ecosystems = ["Climate", "Real Estate", "Health", "Public Affairs"];
    const by_ecosystem = {};
    for (const eco of ecosystems) {
      by_ecosystem[eco] = allProjects
        .filter((p) => p.ecosystem === eco)
        .sort((a, b) => (b.budget_forecast || 0) - (a.budget_forecast || 0));
    }

    // Also capture any ecosystems not in the standard list
    const otherEcos = [...new Set(allProjects.map((p) => p.ecosystem))].filter(
      (e) => e && !ecosystems.includes(e)
    );
    for (const eco of otherEcos) {
      by_ecosystem[eco] = allProjects
        .filter((p) => p.ecosystem === eco)
        .sort((a, b) => (b.budget_forecast || 0) - (a.budget_forecast || 0));
    }

    return Response.json({
      summary: {
        total,
        total_value,
        total_deviation_this_month,
        total_deviation_last_30,
      },
      top_by_budget,
      top_by_overage,
      by_ecosystem,
      all_projects: allProjects,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("Retainers error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
