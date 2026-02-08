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

    const topOverservice = live.projects
      .filter((p) => p.overage > 0).sort((a, b) => b.overage - a.overage).slice(0, 10)
      .map((p) => p.rid + " " + p.client_name + " - " + p.project_name + ": " + p.overage.toLocaleString() + " overage (RAG: " + p.rag + ", Budget: " + p.budget_forecast.toLocaleString() + ")");

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
    ].join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: "You are an executive analyst for Antenna Group, an integrated marketing and communications agency. Review the following live project data and provide a concise executive briefing.\n\n" + DATA_DICTIONARY + "\n\nCURRENT DATA:\n" + dataPayload + "\n\nProvide a brief, sharp executive analysis covering:\n1. Portfolio Health - Overall state of live work. Flag concerning burn rates or overservice by ecosystem.\n2. Revenue Concentration Risk - Is revenue too concentrated in any ecosystem or client?\n3. Overservice Alert - Which projects or ecosystems need immediate attention? Consider investment offset.\n4. Pipeline Outlook - Strength of new business pipeline vs current live revenue. Ecosystem gaps?\n5. Service Trends - What types of work dominate?\n6. One Key Recommendation - Single most important action for leadership this week.\n\nIMPORTANT: Do NOT reference utilization, staff utilization, or employee allocation rates. We do not have utilization data in this dataset. Burn rate refers to project budget consumption (actuals vs budget), not staff utilization. Focus only on data available in the snapshot.\n\nKeep it concise and actionable. Use specific numbers. No fluff. CEO and CFO audience.",
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
