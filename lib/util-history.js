const { list, put } = require("@vercel/blob");

const BLOB_KEY = "util-history.json";

// Baseline data — Feb 2026 snapshots based on current Team Utilization data
const BASELINE = [
  { date: "2026-02-16", avg_utilization: 70, avg_billable: 42, avg_admin: 22 },
];

async function getUtilHistory() {
  try {
    const blobs = await list({ prefix: BLOB_KEY });
    if (!blobs.blobs.length) return [...BASELINE];
    const res = await fetch(blobs.blobs[0].url);
    const data = await res.json();
    const merged = [...data];
    for (const b of BASELINE) {
      if (!merged.find((d) => d.date === b.date)) merged.push(b);
    }
    merged.sort((a, b) => a.date.localeCompare(b.date));
    return merged;
  } catch (err) {
    console.error("Util history read error:", err.message);
    return [...BASELINE];
  }
}

async function appendUtilHistory(entry) {
  try {
    const existing = await getUtilHistory();
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
    console.error("Util history write error:", err.message);
    throw err;
  }
}

module.exports = { getUtilHistory, appendUtilHistory };
