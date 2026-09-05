import { positionKey } from "./threeCommitGraph.js";

// Shared lane/row geometry for the 2D mode: the Three.js graph panel and the HTML
// FACT table must agree on lane order and row positions so rows stay aligned.

export const LANE_GAP = 3;
export const ROW_GAP = 2.2;

// One lane per parallel EXPERIENCE branch (root branches included), plus fallback
// lanes for any other endpoint position (e.g. PERSON nodes referenced by LINK lines).
// Lanes are ordered by depth, then by lane position — this count is what drives the
// responsive left/right width split of the 2D view.
export function computeLaneIndexByKey(payload) {
  const laneIndexByKey = new Map();
  payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .map((node) => ({ key: positionKey(node.x, node.y), x: node.x, y: node.y }))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y))
    .forEach(({ key }) => {
      if (!laneIndexByKey.has(key)) laneIndexByKey.set(key, laneIndexByKey.size);
    });
  payload.nodes3d.forEach((node) => {
    const key = positionKey(node.x, node.y);
    if (!laneIndexByKey.has(key)) laneIndexByKey.set(key, laneIndexByKey.size);
  });
  return laneIndexByKey;
}

export function computeMaxZ(payload) {
  return Math.max(1, ...payload.nodes3d.map((node) => node.z));
}

// Row index shared by the 2D graph and the FACT table: rows are ordered by z
// (newest first, so the table reads newest → oldest top to bottom), and a fact that
// appears on multiple lanes (ancestor EXPERIENCE copies) shares a single row.
export function computeFactRowIndexById(payload) {
  const rowIndexById = new Map();
  payload.nodes3d
    .filter((node) => node.entityType === "FACT")
    .slice()
    .sort((left, right) => right.z - left.z || String(left.id).localeCompare(String(right.id)))
    .forEach((node) => {
      if (!rowIndexById.has(node.id)) rowIndexById.set(node.id, rowIndexById.size);
    });
  return rowIndexById;
}

export function laneX(laneIndexByKey, key) {
  return (laneIndexByKey.get(key) ?? 0) * LANE_GAP;
}

export function rowY(rowCount, rowIndex) {
  return (rowCount - 1 - rowIndex) * ROW_GAP;
}
