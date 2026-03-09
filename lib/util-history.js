/**
 * Delivery & Experiences Utilization History
 * Stores weekly snapshots of avg_utilization, avg_billable, avg_admin
 * Written by: app/api/cron/log-dept-snapshot
 * Read by:    app/api/util-history
 * Consumed by: D&E tab "Utilization Trend" chart
 */

const { list, put } = require("@vercel/blob");

const BLOB_KEY = "dept-utilization-history.json";

async function getUtilHistory() {
  try {
    const blobs = await list({ prefix: BLOB_KEY });
    if (!blobs.blobs.length) return [];
    const res = await fetch(blobs.blobs[0].url);
    return await res.json();
  } catch (err) {
    console.error("Util history read error:", err.message);
    return [];
  }
}

async function appendUtilHistory(entry) {
  try {
    const existing = await getUtilHistory();
    // Deduplicate by date — one entry per day (cron runs weekly)
    const filtered = existing.filter((e) => e.date !== entry.date);
    filtered.push(entry);
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    // Keep last 104 entries (~2 years of weekly snapshots)
    const trimmed = filtered.slice(-104);
    await put(BLOB_KEY, JSON.stringify(trimmed), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return trimmed;
  } catch (err) {
    console.error("Util history write error:", err.message);
    throw err;
  }
}

module.exports = { getUtilHistory, appendUtilHistory };
