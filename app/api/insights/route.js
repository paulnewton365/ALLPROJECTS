import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DATA_DICTIONARY = `
DATA DICTIONARY — Antenna Group Project Dashboard

SEGMENTS:
- Live Work: Active billable projects (RID starts with R). Key ecosystems: Climate, Real Estate, Health, Public Affairs, HOWL.
- Internal: Non-billable agency projects (Admin Time, Approved Investment projects).
- New Business: Pipeline opportunities not yet won (RID starts with NB).

KEY FIELDS:
- Budget Forecast: Contracted revenue for live work; estimated value for new biz
- Actuals: Timesheet-based spend to date
- Overage (FTC): Forecast to Complete. Positive = overservice anticipated. Negative = underage. 0 = on budget.
- RAG: Red (>10% over forecast), Yellow (over but <10%), Green (on/under), Blue (significant underservice)
- Win Probability: Likelihood of winning new biz (used to weight pipeline)
- Weighted Pipeline: Budget Forecast × Win Probability
- Approved Investment: CEO/CFO approved fee investment (offsets overservice)
- Net Overservice: Total Overage minus Total Approved Investment
- Creative Retainer: T&M creative retainer sold with project
- Missing Time: Value of anticipated but unapproved timesheets
- Burn Rate: Actuals / Budget as percentage

ECOSYSTEMS are internal P&L departments: Climate, Real Estate, Health, Public Affairs, HOWL, plus Support and Web Warranty.

PIPELINE STAGES (in order of progression): In Qualification → Proposal → Waiting For Response → Working On Contract → (Won/Lost)
On Hold = paused opportunities expected to resume.
`;

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  try {
    const { fetchSnapshot } = require("@/lib/smartsheet");
    const snapshot = await fetchSnapshot();

    // Build a concise data summary for Claude
    const live = snapshot.live;
    const nb = snapshot.newbiz;
    const internal = snapshot.internal;

    // Top overserviced projects
    const topOverservice = live.projects
      .filter((p) => p.overage > 0)
      .sort((a, b) => b.overage - a.overage)
      .slice(0, 10)
      .map((p) => `${p.rid} ${p.client_name} - ${p.project_name}: ${p.overage.toLocaleString()} overage (RAG: ${p.rag}, Budget: ${p.budget_forecast.toLocaleString()})`);

    // Ecosystem summaries
    const ecoSummaries = live.by_ecosystem.map((e) =>
      `${e.name}: ${e.projects}p, Budget $${Math.round(e.budget).toLocaleString()}, Actuals $${Math.round(e.actuals).toLocaleString()}, Burn ${e.burn_rate}%, Overage $${Math.round(e.overage).toLocaleString()}, Investment $${Math.round(e.investment).toLocaleString()}`
    );

    // Pipeline summary
    const pipelineSummary = nb.pipeline_funnel.map((s) =>
      `${s.stage}: ${s.count} deals, Forecast $${Math.round(s.forecast).toLocaleString()}, Weighted $${Math.round(s.weighted).toLocaleString()}`
    );

    // Service mix
    const serviceTypes = live.by_request_type.slice(0, 15).map((r) => `${r.name}: ${r.count}`);

    // NB ecosystem pipeline
    const nbEcoSummary = nb.by_ecosystem.map((e) =>
      `${e.name}: ${e.count} deals, Forecast $${Math.round(e.forecast).toLocaleString()}, Weighted $${Math.round(e.weighted).toLocaleString()}`
    );

    const dataPayload = `
LIVE WORK SUMMARY (${live.count} projects):
- Total Budget: $${Math.round(live.financials.total_budget).toLocaleString()}
- Total Actuals: $${Math.round(live.financials.total_actuals).toLocaleString()}
- Burn Rate: ${live.financials.burn_rate_pct}%
- Forecast Overage: $${Math.round(live.financials.total_overage).toLocaleString()}
- Approved Investment: $${Math.round(live.financials.total_investment).toLocaleString()}
- Net Overservice: $${Math.round(live.financials.total_overage - live.financials.total_investment).toLocaleString()}
- Overserviced Projects: ${live.financials.overserviced_count}
- RAG Status: Green=${live.status.green}, Yellow=${live.status.yellow}, Red=${live.status.red}, Blue=${live.status.blue}
- Missing Time Value: $${Math.round(live.financials.missing_time_total).toLocaleString()}
- Top Priority Projects: ${live.flags.top_priority}

ECOSYSTEM BREAKDOWN:
${ecoSummaries.join("\n")}

TOP OVERSERVICED PROJECTS:
${topOverservice.join("\n")}

SERVICE MIX (by project count):
${serviceTypes.join(", ")}

NEW BUSINESS PIPELINE (${nb.count} opportunities):
- Total Forecast: $${Math.round(nb.total_forecast).toLocaleString()}
- Weighted Pipeline: $${Math.round(nb.weighted_pipeline).toLocaleString()}
- Near Close (Working On Contract): ${nb.pipeline_funnel.find((s) => s.stage === "Working On Contract")?.count || 0} deals worth $${Math.round(nb.pipeline_funnel.find((s) => s.stage === "Working On Contract")?.forecast || 0).toLocaleString()}
- Data Completeness: ${nb.data_completeness.pct_complete}% fully complete

PIPELINE BY STAGE:
${pipelineSummary.join("\n")}

PIPELINE BY ECOSYSTEM:
${nbEcoSummary.join("\n")}

INTERNAL PROJECTS (${internal.count}):
- Total Investment: $${Math.round(internal.total_investment).toLocaleString()}
- Total Actuals: $${Math.round(internal.total_actuals).toLocaleString()}
`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `You are an executive analyst for Antenna Group, an integrated marketing and communications agency. Review the following live project data and provide a concise executive briefing.

${DATA_DICTIONARY}

CURRENT DATA:
${dataPayload}

Provide a brief, sharp executive analysis covering:
1. **Portfolio Health** — Overall state of live work. Flag any concerning burn rates or overservice patterns by ecosystem.
2. **Revenue Concentration Risk** — Is revenue too concentrated in any single ecosystem or client?
3. **Overservice Alert** — Which projects or ecosystems need immediate attention? Consider the investment offset.
4. **Pipeline Outlook** — Strength of new business pipeline. How healthy is the weighted pipeline relative to current live revenue? Any ecosystem gaps in the pipeline?
5. **Service Trends** — What types of work dominate? Are we seeing growth in integrated vs comms-only work?
6. **One Key Recommendation** — The single most important action for leadership this week.

Keep it concise and actionable. Use specific numbers. No fluff. Write for a CEO and CFO audience.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
    }

    const result = await response.json();
    const analysis = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return NextResponse.json({
      analysis,
      generated_at: new Date().toISOString(),
      data_snapshot: {
        live_count: live.count,
        newbiz_count: nb.count,
        live_revenue: live.financials.total_budget,
        weighted_pipeline: nb.weighted_pipeline,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
