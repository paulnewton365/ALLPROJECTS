const { fetchSnapshot } = require("../../../lib/smartsheet");

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DATA_DICTIONARY = `
DATA DICTIONARY - Antenna Group Project Dashboard

SEGMENTS:
- Live Work: Active billable projects (RID starts with R). Key ecosystems: Climate, Real Estate, Health, Public Affairs, HOWL.
- Internal: Non-billable agency projects (Admin Time, Approved Investment projects).
- New Business: Pipeline opportunities not yet won (RID starts with NB).

KEY FIELDS:
- Budget Forecast: Contracted revenue for live work; estimated value for new biz
- Actuals: Timesheet-based spend to date
- Overage (FTC): Forecast to Complete. Positive = overservice. Negative = underage.
- RAG: Red (>10% over), Yellow (over but <10%), Green (on/under), Blue (underservice)
- Win Probability: Likelihood of winning new biz (used to weight pipeline)
- Weighted Pipeline: Budget Forecast x Win Probability
- Approved Investment: CEO/CFO approved fee investment (offsets overservice)
- Net Overservice: Total Overage minus Total Approved Investment
- Burn Rate: Actuals / Budget as percentage

ECOSYSTEMS are internal P&L departments: Climate, Real Estate, Health, Public Affairs, HOWL, plus Support and Web Warranty.
PIPELINE STAGES: In Qualification > Proposal > Waiting For Response > Working On Contract > (Won/Lost). On Hold = paused.

DEVIATION:
- Last 30 Deviation: Difference between booked (scheduled) hours and actual hours logged on timesheets over 30 days, in dollars
- Positive = team logged MORE time than was booked (overworking the project)
- Negative = team logged LESS time than was booked (underworking the project)
- Broken down by: Ecosystem teams (Account & PR), Experiences & Delivery (Creative, Tech, Strategy, PM), Performance (Paid Media, Measurement, Social)

UTILIZATION:
- Utilization: Percentage of available time spent on client/project work (last 30 days)
- Utilization Target: Expected utilization percentage for the role/level
- Utilization Status: Over (exceeds target significantly), Utilized (at or near target), Capacity (below target, has bandwidth)
- Happiness Measure: Workload pressure indicator — Extreme (dangerously overloaded), Severe (stretched), No Pain (comfortable)
- Admin Time: Percentage of time on non-billable admin work
`;

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  try {
    const snapshot = await fetchSnapshot();
    const live = snapshot.live;
    const nb = snapshot.newbiz;
    const internal = snapshot.internal;

    // Fetch agency utilization
    let utilSummary = "";
    try {
      const BASE_URL = "https://api.smartsheet.com/2.0";
      const ssToken = process.env.SMARTSHEET_API_TOKEN;
      const UTIL_REPORT = process.env.AGENCY_UTILIZATION_REPORT_ID || "4581510595170180";
      if (ssToken) {
        const utilRes = await fetch(`${BASE_URL}/reports/${UTIL_REPORT}?pageSize=200`, { headers: { Authorization: `Bearer ${ssToken}`, "Content-Type": "application/json" } });
        if (utilRes.ok) {
          const utilRaw = await utilRes.json();
          const cols = utilRaw.columns || [];
          const ppl = (utilRaw.rows || []).map((row) => {
            const item = {};
            (row.cells || []).forEach((cell, i) => { if (cols[i]) item[cols[i].title] = cell.displayValue ?? cell.value ?? null; });
            const name = String(item["Team Member"] || "").trim();
            if (!name) return null;
            const util = parseFloat(String(item["Utilization"] || "0").replace(/%/g, ""));
            const utilPct = util > 0 && util < 1 ? Math.round(util * 1000) / 10 : Math.round(util);
            return { name, eco: String(item["ECOSYSTEM"] || "").trim(), status: String(item["UTILIZATION STATUS"] || ""), happiness: String(item["HAPPINESS MEASURE"] || ""), utilPct };
          }).filter(Boolean);
          const tot = ppl.length;
          const avg = tot > 0 ? Math.round(ppl.reduce((s, p) => s + p.utilPct, 0) / tot) : 0;
          const over = ppl.filter((p) => p.status === "Over").length;
          const capacity = ppl.filter((p) => p.status === "Capacity").length;
          const extreme = ppl.filter((p) => p.happiness === "Extreme").length;
          const severe = ppl.filter((p) => p.happiness === "Severe").length;
          const ecoMap = {};
          ppl.forEach((p) => { if (!ecoMap[p.eco]) ecoMap[p.eco] = { t: 0, c: 0 }; ecoMap[p.eco].t += p.utilPct; ecoMap[p.eco].c++; });
          const ecoLines = Object.entries(ecoMap).map(([e, v]) => e + ": " + Math.round(v.t / v.c) + "% avg (" + v.c + " people)");
          utilSummary = [
            "", "AGENCY UTILIZATION (" + tot + " team members):",
            "- Average Utilization: " + avg + "%",
            "- Over-Utilized: " + over + ", Capacity (available): " + capacity,
            "- Workload Pressure: " + extreme + " extreme, " + severe + " severe",
            "BY ECOSYSTEM:", ...ecoLines,
          ].join("\n");
        }
      }
    } catch (e) { /* skip util if it fails */ }

    const topOverservice = live.projects
      .filter((p) => p.overage > 0).sort((a, b) => b.overage - a.overage).slice(0, 10)
      .map((p) => p.rid + " " + p.client_name + " - " + p.project_name + ": " + p.overage.toLocaleString() + " overage (RAG: " + p.rag + ", Budget: " + p.budget_forecast.toLocaleString() + ")");

    const dev = live.deviation || {};
    const topDeviators = (dev.top_deviators || []).slice(0, 5).map((p) =>
      p.rid + " " + p.client + " - " + p.project + " (" + p.ecosystem + "): $" + Math.round(p.deviation).toLocaleString() + " total deviation (Eco: $" + Math.round(p.deviation_eco || 0).toLocaleString() + ", E&D: $" + Math.round(p.deviation_ed || 0).toLocaleString() + ", Perf: $" + Math.round(p.deviation_perf || 0).toLocaleString() + ")");
    const redHighDev = (dev.red_high_deviation || []).map((p) =>
      p.rid + " " + p.client + " - " + p.project + ": $" + Math.round(p.deviation).toLocaleString() + " deviation, $" + Math.round(p.overage || 0).toLocaleString() + " overage");

    const ecoSummaries = live.by_ecosystem.map((e) =>
      e.name + ": " + e.projects + "p, Budget $" + Math.round(e.budget).toLocaleString() + ", Actuals $" + Math.round(e.actuals).toLocaleString() + ", Burn " + e.burn_rate + "%, Overage $" + Math.round(e.overage).toLocaleString() + ", Investment $" + Math.round(e.investment).toLocaleString());

    const pipelineSummary = nb.pipeline_funnel.map((s) =>
      s.stage + ": " + s.count + " deals, Forecast $" + Math.round(s.forecast).toLocaleString() + ", Weighted $" + Math.round(s.weighted).toLocaleString());

    const serviceTypes = live.by_request_type.slice(0, 15).map((r) => r.name + ": " + r.count);
    const nbEcoSummary = nb.by_ecosystem.map((e) => e.name + ": " + e.count + " deals, Forecast $" + Math.round(e.forecast).toLocaleString() + ", Weighted $" + Math.round(e.weighted).toLocaleString());

    const dataPayload = [
      "LIVE WORK SUMMARY (" + live.count + " projects):",
      "- Total Budget: $" + Math.round(live.financials.total_budget).toLocaleString(),
      "- Total Actuals: $" + Math.round(live.financials.total_actuals).toLocaleString(),
      "- Burn Rate: " + live.financials.burn_rate_pct + "%",
      "- Forecast Overage: $" + Math.round(live.financials.total_overage).toLocaleString(),
      "- Approved Investment: $" + Math.round(live.financials.total_investment).toLocaleString(),
      "- Net Overservice: $" + Math.round(live.financials.total_overage - live.financials.total_investment).toLocaleString(),
      "- Overserviced Projects: " + live.financials.overserviced_count,
      "- RAG: Green=" + live.status.green + ", Yellow=" + live.status.yellow + ", Red=" + live.status.red + ", Blue=" + live.status.blue,
      "",
      "ECOSYSTEM BREAKDOWN:",
      ...ecoSummaries,
      "",
      "TOP OVERSERVICED PROJECTS:",
      ...topOverservice,
      "",
      "SERVICE MIX: " + serviceTypes.join(", "),
      "",
      "NEW BUSINESS PIPELINE (" + nb.count + " opportunities):",
      "- Total Forecast: $" + Math.round(nb.total_forecast).toLocaleString(),
      "- Weighted Pipeline: $" + Math.round(nb.weighted_pipeline).toLocaleString(),
      "- Data Completeness: " + nb.data_completeness.pct_complete + "%",
      "",
      "PIPELINE BY STAGE:",
      ...pipelineSummary,
      "",
      "PIPELINE BY ECOSYSTEM:",
      ...nbEcoSummary,
      "",
      "INTERNAL PROJECTS (" + internal.count + "): Investment $" + Math.round(internal.total_investment).toLocaleString(),
      "",
      "DEVIATION (Last 30 Days — difference between booked time and actual time logged):",
      "- Total Deviation: $" + Math.round(dev.total || 0).toLocaleString(),
      "- Ecosystem Teams (Account & PR): $" + Math.round(dev.total_ecosystem || 0).toLocaleString(),
      "- Experiences & Delivery (Creative, Tech, Strategy, PM): $" + Math.round(dev.total_ed || 0).toLocaleString(),
      "- Performance (Paid Media, Measurement, Social): $" + Math.round(dev.total_perf || 0).toLocaleString(),
      "Positive deviation = team logged more time than booked (overworking). Negative = logged less than booked (underworking).",
      "",
      "TOP DEVIATING PROJECTS:",
      ...topDeviators,
      ...(redHighDev.length ? ["", "RED RAG PROJECTS WITH HIGH DEVIATION (>$2K):", ...redHighDev] : []),
      utilSummary,
    ].join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: "You are an executive analyst for Antenna Group, an integrated marketing and communications agency. Review the following live project data and provide a concise executive briefing.\n\n" + DATA_DICTIONARY + "\n\nCURRENT DATA:\n" + dataPayload + "\n\nProvide a brief, sharp executive analysis covering:\n1. Portfolio Health - Overall state of live work. Flag concerning burn rates or overservice by ecosystem.\n2. Revenue Concentration Risk - Is revenue too concentrated in any ecosystem or client?\n3. Overservice Alert - Which projects or ecosystems need immediate attention? Consider investment offset.\n4. Deviation Alert - Highlight significant time deviation trends. Which teams or projects are logging substantially more or less time than booked? What does this signal about resourcing?\n5. Utilization & Capacity - Are teams appropriately utilized? Flag any ecosystems with too many over-utilized or extreme workload staff. Where is there capacity for new work?\n6. Pipeline Outlook - Strength of new business pipeline vs current live revenue. Ecosystem gaps?\n7. One Key Recommendation - Single most important action for leadership this week.\n\nBurn rate refers to project budget consumption (actuals vs budget). Deviation refers to the gap between booked time and actual time logged on timesheets. Utilization refers to the percentage of available time spent on client work. Focus only on data available in the snapshot.\n\nKeep it concise and actionable. Use specific numbers. No fluff. CEO and CFO audience.",
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error("Anthropic API error " + response.status + ": " + errBody);
    }

    const result = await response.json();
    const analysis = result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

    return Response.json({
      analysis,
      generated_at: new Date().toISOString(),
      data_snapshot: { live_count: live.count, newbiz_count: nb.count, live_revenue: live.financials.total_budget, weighted_pipeline: nb.weighted_pipeline },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
