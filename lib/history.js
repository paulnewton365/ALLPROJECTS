/**
 * Weekly history tracking via Vercel Blob
 * Stores snapshots of key metrics each Monday
 */

const BLOB_KEY = "dashboard-history.json";

async function getHistory() {
  try {
    const { list } = require("@vercel/blob");
    const blobs = await list({ prefix: BLOB_KEY });
    if (!blobs.blobs.length) return [];
    const res = await fetch(blobs.blobs[0].url);
    return await res.json();
  } catch (err) {
    console.error("History read error:", err.message);
    return [];
  }
}

async function appendHistory(entry) {
  try {
    const { put } = require("@vercel/blob");
    const existing = await getHistory();
    // Deduplicate by date (keep latest per date)
    const dateKey = entry.date;
    const filtered = existing.filter((e) => e.date !== dateKey);
    filtered.push(entry);
    // Keep last 52 weeks
    const trimmed = filtered.slice(-52);
    await put(BLOB_KEY, JSON.stringify(trimmed), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
    });
    return trimmed;
  } catch (err) {
    console.error("History write error:", err.message);
    throw err;
  }
}

module.exports = { getHistory, appendHistory };
