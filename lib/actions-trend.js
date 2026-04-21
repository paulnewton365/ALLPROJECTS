/**
 * Actions Trend — weekly snapshots of action volume over time
 *
 * Blob: actions-trend.json  (array, sorted ascending by date)
 * Each entry: { date, total, live, pipeline, deviation_over, deviation_under,
 *               overage_pct, ready_to_close, no_tracking, missing_budget, stale_stage }
 *
 * Written by: app/api/cron/log-snapshot/route.js (Mondays 04:00 UTC)
 * Read by:    app/api/actions-trend/route.js (used by Actions tab chart)
 *
 * Keeps the most recent 104 entries (~2 years of weekly data).
 */

const { list, put } = require("@vercel/blob");

const BLOB_KEY = "actions-trend.json";

async function getActionsTrend() {
  try {
    const blobs = await list({ prefix: BLOB_KEY });
    if (!blobs.blobs.length) return [];
    const res = await fetch(blobs.blobs[0].url);
    return await res.json();
  } catch (err) {
    console.error("Actions trend read error:", err.message);
    return [];
  }
}

async function appendActionsTrend(entry) {
  try {
    const existing = await getActionsTrend();
    const filtered = existing.filter((e) => e.date !== entry.date);
    filtered.push(entry);
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    const trimmed = filtered.slice(-104);
    await put(BLOB_KEY, JSON.stringify(trimmed), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return trimmed;
  } catch (err) {
    console.error("Actions trend write error:", err.message);
    throw err;
  }
}

module.exports = { getActionsTrend, appendActionsTrend };
