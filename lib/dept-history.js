const { list, put } = require("@vercel/blob");

const BLOB_KEY = "dept-health-history.json";

// Baseline data — Dec 2025 target + Jan/Feb 2026 snapshots
const BASELINE = [
  { month: "2025-12", experiences: 10, delivery: 6, combined: 16, exp_revenue: 0, del_revenue: 0 },
  { month: "2026-01-16", experiences: 10, delivery: 6, combined: 16, exp_revenue: 0, del_revenue: 0 },
  { month: "2026-02-16", experiences: 9, delivery: 5, combined: 14, exp_revenue: 0, del_revenue: 0 },
];

async function getDeptHistory() {
  try {
    const blobs = await list({ prefix: BLOB_KEY });
    if (!blobs.blobs.length) return [...BASELINE];
    const res = await fetch(blobs.blobs[0].url);
    const data = await res.json();
    // Ensure baselines are always present
    const merged = [...data];
    for (const b of BASELINE) {
      if (!merged.find((d) => d.month === b.month)) merged.push(b);
    }
    merged.sort((a, b) => a.month.localeCompare(b.month));
    return merged;
  } catch (err) {
    console.error("Dept history read error:", err.message);
    return [...BASELINE];
  }
}

async function appendDeptHistory(entry) {
  try {
    const existing = await getDeptHistory();
    // Replace if same month exists, otherwise append
    const filtered = existing.filter((e) => e.month !== entry.month);
    filtered.push(entry);
    // Sort by date key and keep last 104 entries (~2 years weekly)
    filtered.sort((a, b) => a.month.localeCompare(b.month));
    const trimmed = filtered.slice(-104);
    await put(BLOB_KEY, JSON.stringify(trimmed), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return trimmed;
  } catch (err) {
    console.error("Dept history write error:", err.message);
    throw err;
  }
}

module.exports = { getDeptHistory, appendDeptHistory };
