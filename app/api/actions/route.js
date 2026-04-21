/**
 * Actions API (v1.15.9)
 *
 * Returns everything the Actions tab needs in one call:
 *   - heads:  per-team panels (Climate & PA, Real Estate, Health, HOWL/Exp,
 *             Performance, Delivery, + Unassigned if present)
 *   - summary: total / live / pipeline / by_type / new_today / oldest / aging
 *   - briefing: cached AI headline paragraph (<= 150 words)
 *   - report_url: deep link to the all-projects Smartsheet report
 *
 * Filter: projects whose ONLY trigger is overage_pct are dropped entirely.
 * All other triggers remain (including overage_pct when it coexists with others).
 *
 * Query params:
 *   ?refresh=1   Bust the briefing cache and regenerate immediately
 */

import {
  fetchProjects, evaluateTriggers, applyOverageOnlyFilter, groupByTeam,
  REPORT_URL, AGING_ACTION_DAYS,
} from "../../../lib/actions-core";
import {
  getActionsHistory, saveActionsHistory, reconcileActions, daysBetween,
} from "../../../lib/actions-history";
import {
  getCachedBriefing, saveBriefing, hashBriefingInput, isCacheFresh,
} from "../../../lib/actions-briefing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

// -------------------------------------------------------------------------
// Briefing
// -------------------------------------------------------------------------
async function generateBriefing(summary, heads) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const byType = summary.by_type || {};
  const topImpact = heads
    .reduce((acc, h) => {
      [...h.live, ...h.pipeline].forEach((p) => acc.push({ head: h.name, ...p }));
      return acc;
    }, [])
    .sort((a, b) => b.total_dollar - a.total_dollar)
    .slice(0, 5)
    .map((p) => `- ${p.head}: ${p.rid} ${p.project.client} / ${p.project.project_name} — $${Math.round(p.total_dollar).toLocaleString()}, ${p.triggers.length} trigger(s), oldest ${p.max_days_open}d`);

  const teamLines = heads
    .filter((h) => h.total > 0)
    .map((h) => `- ${h.name} (${h.lead}): ${h.total} actions (${h.live_count} live / ${h.pipeline_count} pipeline), $${Math.round(h.total_dollar_impact).toLocaleString()} impact, ${h.aging_count} aging 4w+`);

  const hygieneCount = (byType.no_tracking || 0) + (byType.missing_budget || 0) + (byType.ready_to_close || 0) + (byType.stale_stage || 0);
  const financialCount = (byType.deviation_over || 0) + (byType.deviation_under || 0) + (byType.overage_pct || 0);

  const prompt = `You are writing the opening paragraph of an executive dashboard section that surfaces week-over-week actions arising from an all-projects review at Antenna Group, an integrated marketing & communications agency.

CURRENT ACTIONS SNAPSHOT:
- Total active actions: ${summary.total} (${summary.live} live work, ${summary.pipeline} pipeline)
- New today: ${summary.new_today} · Oldest open: ${summary.oldest_days_open} days · Aging (4w+): ${summary.aging_count}
- Financial triggers (deviation over/under, overage): ${financialCount}
- Data-hygiene triggers (no tracking, missing budget, ready-to-close, stale): ${hygieneCount}

BY TRIGGER TYPE:
- Overservicing (deviation +>$3.5K): ${byType.deviation_over || 0}
- Underservicing (deviation <-$5K): ${byType.deviation_under || 0}
- Overage >10% of budget: ${byType.overage_pct || 0}
- Ready to close (100% complete, still open): ${byType.ready_to_close || 0}
- No time tracking: ${byType.no_tracking || 0}
- Missing pipeline budget: ${byType.missing_budget || 0}
- Stale pipeline (>100d in system): ${byType.stale_stage || 0}

BY TEAM:
${teamLines.join("\n") || "- None"}

TOP-IMPACT PROJECTS:
${topImpact.join("\n") || "- None"}

Write a single paragraph of no more than 150 words that gives the reader a snapshot of the current state of actions AND the cleanliness of our data (are the hygiene triggers high? low? trending in a bad direction?). Lead with the most important signal. Be specific with numbers. Call out which team has the heaviest load if it's lopsided. If data-hygiene issues are dominant, say that; if it's a financial week, say that. Do not use markdown, bullets, or headers — prose only. Do not restate every number from above; pick the ones that matter. No fluff openings like "This week" or "In summary". CFO / CEO audience.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("Briefing Anthropic error:", response.status, body);
      return null;
    }
    const result = await response.json();
    return result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  } catch (err) {
    console.error("Briefing generation failed:", err.message);
    return null;
  }
}

// -------------------------------------------------------------------------
// GET
// -------------------------------------------------------------------------
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";
    const today = new Date().toISOString().split("T")[0];

    // 1. Pull + evaluate
    const projects = await fetchProjects();
    const dedup = projects._dedup || null;
    const rawTriggers = evaluateTriggers(projects, today);
    const { kept: triggers, dropped_count: overage_only_dropped } = applyOverageOnlyFilter(rawTriggers);

    // 2. Reconcile days-open history
    let reconciled = {};
    let historyError = null;
    try {
      const history = await getActionsHistory();
      reconciled = reconcileActions(triggers.map((t) => t.id), history);
      await saveActionsHistory(reconciled);
    } catch (err) {
      historyError = err.message;
      reconciled = triggers.reduce((acc, t) => {
        acc[t.id] = { first_seen: today, last_seen: today };
        return acc;
      }, {});
    }

    const triggersWithDays = triggers.map((t) => {
      const rec = reconciled[t.id] || { first_seen: today, last_seen: today };
      return { ...t, first_seen: rec.first_seen, days_open: daysBetween(rec.first_seen, today) };
    });

    // 3. Group into team panels
    const heads = groupByTeam(triggersWithDays);

    // 4. Build summary
    const by_type = triggersWithDays.reduce((acc, t) => { acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {});
    const aging_count = triggersWithDays.filter((t) => (t.days_open || 0) >= AGING_ACTION_DAYS).length;
    const summary = {
      total: triggersWithDays.length,
      live: triggersWithDays.filter((t) => !t.rid.startsWith("NB")).length,
      pipeline: triggersWithDays.filter((t) => t.rid.startsWith("NB")).length,
      by_type,
      new_today: triggersWithDays.filter((t) => t.days_open === 0).length,
      oldest_days_open: triggersWithDays.reduce((m, t) => Math.max(m, t.days_open || 0), 0),
      aging_count,
      aging_threshold_days: AGING_ACTION_DAYS,
      overage_only_dropped,
      dedup: dedup ? {
        raw_rows: dedup.raw_count,
        unique_rids: dedup.deduped_count,
        duplicate_count: dedup.duplicate_rids.length,
        duplicate_rids: dedup.duplicate_rids.slice(0, 20), // cap for response size
      } : null,
    };

    // 5. Briefing (cached)
    let briefing = null;
    let briefing_generated_at = null;
    const briefingInput = {
      total: summary.total,
      by_type: summary.by_type,
      aging_count,
      team_totals: heads.map((h) => ({ n: h.name, t: h.total, $: Math.round(h.total_dollar_impact), a: h.aging_count })),
    };
    const dataHash = hashBriefingInput(briefingInput);

    if (summary.total > 0) {
      const cached = await getCachedBriefing();
      if (!forceRefresh && isCacheFresh(cached, dataHash)) {
        briefing = cached.briefing;
        briefing_generated_at = cached.generated_at;
      } else {
        const fresh = await generateBriefing(summary, heads);
        if (fresh) {
          try {
            const saved = await saveBriefing(fresh, dataHash);
            briefing = saved.briefing;
            briefing_generated_at = saved.generated_at;
          } catch (err) {
            // Even if caching fails, serve the fresh briefing for this request
            briefing = fresh;
            briefing_generated_at = new Date().toISOString();
          }
        } else if (cached && cached.briefing) {
          // AI unavailable — fall back to stale cache rather than show nothing
          briefing = cached.briefing;
          briefing_generated_at = cached.generated_at;
        }
      }
    }

    return Response.json(
      {
        summary,
        heads,
        briefing,
        briefing_generated_at,
        report_url: REPORT_URL,
        generated_at: new Date().toISOString(),
        history_error: historyError,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    console.error("Actions error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
