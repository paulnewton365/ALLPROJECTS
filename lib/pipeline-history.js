const { list, put } = require("@vercel/blob");

const BLOB_KEY = "pipeline-history.json";

async function getPipelineHistory() {
  try {
    const blobs = await list({ prefix: BLOB_KEY });
    if (!blobs.blobs.length) return [];
    const res = await fetch(blobs.blobs[0].url);
    return await res.json();
  } catch (err) {
    console.error("Pipeline history read error:", err.message);
    return [];
  }
}

async function appendPipelineHistory(entry) {
  try {
    const existing = await getPipelineHistory();
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
    console.error("Pipeline history write error:", err.message);
    throw err;
  }
}

module.exports = { getPipelineHistory, appendPipelineHistory };
