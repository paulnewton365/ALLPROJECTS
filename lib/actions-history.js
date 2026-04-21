/**
 * Actions History — persistent "days open" tracking for the Actions tab
 *
 * Blob stores a map of { actionId: { first_seen, last_seen } } where
 * actionId is a composite key like "R1234:deviation_over" or "NB9594:missing_budget".
 *
 * On each /api/actions refresh:
 *   - Compute current triggers from Smartsheet
 *   - For each current trigger already in the blob: keep first_seen, update last_seen
 *   - For each new current trigger: set first_seen = today, last_seen = today
 *   - Drop any blob entries not in current triggers (action resolved)
 *   - Write updated map back
 *
 * days_open = today - first_seen. If the same trigger later resolves and reappears,
 * it gets a fresh first_seen (intentional — that's a new occurrence).
 *
 * Written by: app/api/actions
 * Read by:    app/api/actions
 */

const { list, put } = require("@vercel/blob");

const BLOB_KEY = "actions-history.json";

async function getActionsHistory() {
  try {
    const blobs = await list({ prefix: BLOB_KEY });
    if (!blobs.blobs.length) return {};
    const res = await fetch(blobs.blobs[0].url);
    return await res.json();
  } catch (err) {
    console.error("Actions history read error:", err.message);
    return {};
  }
}

async function saveActionsHistory(actionsMap) {
  try {
    await put(BLOB_KEY, JSON.stringify(actionsMap), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return actionsMap;
  } catch (err) {
    console.error("Actions history write error:", err.message);
    throw err;
  }
}

/**
 * Given the list of currently-active action IDs and the existing history map,
 * return an updated map with first_seen preserved where possible and last_seen
 * set to today. Resolved actions (not in currentIds) are dropped.
 */
function reconcileActions(currentIds, history) {
  const today = new Date().toISOString().split("T")[0];
  const updated = {};
  for (const id of currentIds) {
    if (history && history[id] && history[id].first_seen) {
      updated[id] = { first_seen: history[id].first_seen, last_seen: today };
    } else {
      updated[id] = { first_seen: today, last_seen: today };
    }
  }
  return updated;
}

/** Whole-day difference between two YYYY-MM-DD strings. */
function daysBetween(fromDate, toDate) {
  const a = new Date(fromDate);
  const b = new Date(toDate);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

module.exports = { getActionsHistory, saveActionsHistory, reconcileActions, daysBetween };
