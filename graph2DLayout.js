import { positionKey } from "./threeCommitGraph.js";

// Shared lane/row geometry for the 2D mode: the SVG commit-graph panel and the HTML
// FACT table must agree on lane order and row positions so rows stay aligned.
// Both panes render in real CSS pixels (no world-unit/camera conversion), so a FACT's
// row center here is defined identically to where the HTML table renders that row.

export const ROW_HEIGHT_PX = 30;
export const TABLE_HEADER_HEIGHT_PX = 37;
export const LANE_WIDTH_PX = 56;

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
  return (laneIndexByKey.get(key) ?? 0) * LANE_WIDTH_PX;
}

// Pixel Y, measured from the top of the scrollable content (header included), of the
// vertical center of a row — the exact same formula the HTML table renders that row at
// (headerHeightPx + rowIndex * rowHeightPx + half a row). Sharing one native `scrollTop`
// between the two panes is therefore enough to keep them pixel-aligned. Accepts the *actual*
// measured header/row height (see HasmVisualizerComponent.jsx) so the graph always matches
// whatever the table really rendered at, not just the nominal ROW_HEIGHT_PX/TABLE_HEADER_HEIGHT_PX
// constants (which a browser's own font metrics or a host app's CSS could nudge slightly).
export function rowCenterY(rowIndex, rowHeightPx = ROW_HEIGHT_PX, headerHeightPx = TABLE_HEADER_HEIGHT_PX) {
  return headerHeightPx + rowIndex * rowHeightPx + rowHeightPx / 2;
}

