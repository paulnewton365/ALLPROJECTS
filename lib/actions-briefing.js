/**
 * Actions Briefing — cached AI-generated headline paragraph for the Actions tab
 *
 * Blob: actions-briefing.json  (single object)
 *   { briefing, generated_at, data_hash }
 *
 * Cache logic (see app/api/actions/route.js):
 *   - If blob exists, and data_hash matches the current data, and generated_at
 *     is less than 24h old, return the cached briefing.
 *   - Otherwise regenerate via Anthropic API and overwrite the blob.
 *
 * The data_hash lets us regenerate immediately when something material changes
 * (e.g. a new action appears or one clears) even inside the 24h window.
 */

const { list, put } = require("@vercel/blob");

const BLOB_KEY = "actions-briefing.json";
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getCachedBriefing() {
  try {
    const blobs = await list({ prefix: BLOB_KEY });
    if (!blobs.blobs.length) return null;
    const res = await fetch(blobs.blobs[0].url);
    return await res.json();
  } catch (err) {
    console.error("Briefing cache read error:", err.message);
    return null;
  }
}

async function saveBriefing(briefing, data_hash) {
  try {
    const payload = { briefing, data_hash, generated_at: new Date().toISOString() };
    await put(BLOB_KEY, JSON.stringify(payload), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return payload;
  } catch (err) {
    console.error("Briefing cache write error:", err.message);
    throw err;
  }
}

/** Deterministic hash of the data that drives the briefing. */
function hashBriefingInput(input) {
  const s = JSON.stringify(input);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return String(h);
}

function isCacheFresh(cached, currentHash) {
  if (!cached || !cached.briefing || !cached.generated_at) return false;
  if (cached.data_hash !== currentHash) return false;
  const age = Date.now() - new Date(cached.generated_at).getTime();
  return age >= 0 && age < MAX_CACHE_AGE_MS;
}

module.exports = { getCachedBriefing, saveBriefing, hashBriefingInput, isCacheFresh };
