const { list, put } = require("@vercel/blob");

const BLOB_KEY = "dashboard-history.json";

async function getHistory() {
  try {
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
    const existing = await getHistory();
    const filtered = existing.filter((e) => e.date !== entry.date);
    filtered.push(entry);
    const trimmed = filtered.slice(-52);
    await put(BLOB_KEY, JSON.stringify(trimmed), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return trimmed;
  } catch (err) {
    console.error("History write error:", err.message);
    throw err;
  }
}

module.exports = { getHistory, appendHistory };
