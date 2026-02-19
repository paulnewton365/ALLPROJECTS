const { list, put } = require("@vercel/blob");

const BLOB_KEY = "deviation-history.json";

async function getDeviationHistory() {
  try {
    const blobs = await list({ prefix: BLOB_KEY });
    if (!blobs.blobs.length) return [];
    const res = await fetch(blobs.blobs[0].url);
    return await res.json();
  } catch (err) {
    console.error("Deviation history read error:", err.message);
    return [];
  }
}

async function appendDeviationHistory(entry) {
  try {
    const existing = await getDeviationHistory();
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
    console.error("Deviation history write error:", err.message);
    throw err;
  }
}

module.exports = { getDeviationHistory, appendDeviationHistory };
