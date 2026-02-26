/**
 * Agency Utilization API — Full team utilization from Smartsheet report
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = "https://api.smartsheet.com/2.0";

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
  (row.cells || []).forEach((cell, i) => {
    const col = columns[i];
    if (col) obj[col.title] = cell.displayValue ?? cell.value ?? null;
  });
  return obj;
}

function parsePercent(val) {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/%/g, "").trim();
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return n > 0 && n < 1 ? Math.round(n * 1000) / 10 : Math.round(n);
}

export async function GET() {
  try {
    const REPORT_ID = process.env.AGENCY_UTILIZATION_REPORT_ID || "4581510595170180";
    const raw = await apiRequest(`/reports/${REPORT_ID}?pageSize=200`);

    const people = (raw.rows || []).map((row) => {
      const item = reportRowToObject(row, raw.columns || []);
      const name = String(item["Team Member"] || "").trim();
      if (!name) return null;

      const primaryGroup = String(item["Primary Group"] || "").trim();
      const ecosystem = String(item["ECOSYSTEM"] || "").trim().toUpperCase();
      const level = String(item["Level"] || "").trim();
      const status = String(item["UTILIZATION STATUS"] || "").trim();
      const happiness = String(item["HAPPINESS MEASURE"] || "").trim();

      return {
        name,
        primary_group: primaryGroup,
        ecosystem,
        level,
        num_projects: parseInt(item["NO. OF PROJECTS"]) || 0,
        utilization: parsePercent(item["Utilization"]),
        utilization_target: parsePercent(item["Utilization Target"]),
        utilization_status: status,
        nb_internal: parsePercent(item["NB/Internal"]),
        admin_time: parsePercent(item["Admin Time"]),
        happiness,
      };
    }).filter(Boolean);

    // Overall summary
    const total = people.length;
    const avgUtil = total > 0 ? Math.round(people.reduce((s, p) => s + p.utilization, 0) / total) : 0;
    const avgTarget = total > 0 ? Math.round(people.reduce((s, p) => s + p.utilization_target, 0) / total) : 0;
    const avgAdmin = total > 0 ? Math.round(people.reduce((s, p) => s + p.admin_time, 0) / total) : 0;
    const avgProjects = total > 0 ? Math.round((people.reduce((s, p) => s + p.num_projects, 0) / total) * 10) / 10 : 0;
    const overCount = people.filter((p) => p.utilization_status === "Over").length;
    const capacityCount = people.filter((p) => p.utilization_status === "Capacity").length;
    const utilizedCount = people.filter((p) => p.utilization_status === "Utilized").length;

    // By ecosystem
    const byEcosystem = {};
    people.forEach((p) => {
      const eco = p.ecosystem || "OTHER";
      if (!byEcosystem[eco]) byEcosystem[eco] = { count: 0, total_util: 0, total_target: 0, total_admin: 0, total_projects: 0, over: 0, capacity: 0, utilized: 0, extreme: 0, severe: 0 };
      const e = byEcosystem[eco];
      e.count++;
      e.total_util += p.utilization;
      e.total_target += p.utilization_target;
      e.total_admin += p.admin_time;
      e.total_projects += p.num_projects;
      if (p.utilization_status === "Over") e.over++;
      if (p.utilization_status === "Capacity") e.capacity++;
      if (p.utilization_status === "Utilized") e.utilized++;
      if (p.happiness === "Extreme") e.extreme++;
      if (p.happiness === "Severe") e.severe++;
    });

    const ecoSummary = Object.entries(byEcosystem).map(([name, e]) => ({
      name,
      count: e.count,
      avg_utilization: Math.round(e.total_util / e.count),
      avg_target: Math.round(e.total_target / e.count),
      avg_admin: Math.round(e.total_admin / e.count),
      avg_projects: Math.round((e.total_projects / e.count) * 10) / 10,
      over: e.over,
      capacity: e.capacity,
      utilized: e.utilized,
      extreme: e.extreme,
      severe: e.severe,
    })).sort((a, b) => b.count - a.count);

    // Happiness distribution
    const happiness = {
      extreme: people.filter((p) => p.happiness === "Extreme").length,
      severe: people.filter((p) => p.happiness === "Severe").length,
      no_pain: people.filter((p) => p.happiness === "No Pain").length,
    };

    // Status distribution
    const statusDist = { over: overCount, utilized: utilizedCount, capacity: capacityCount };

    return Response.json({
      team_size: total,
      avg_utilization: avgUtil,
      avg_target: avgTarget,
      avg_admin: avgAdmin,
      avg_projects: avgProjects,
      status: statusDist,
      happiness,
      by_ecosystem: ecoSummary,
      people: people.sort((a, b) => a.utilization - b.utilization),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
