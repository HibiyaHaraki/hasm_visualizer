import {
  buildEntityColors,
  buildExperienceColorMaps,
  ensureReadableColor,
  positionKey,
} from "./threeCommitGraph.js";
import {
  LANE_WIDTH_PX,
  ROW_HEIGHT_PX,
  TABLE_HEADER_HEIGHT_PX,
  computeFactRowIndexById,
  computeLaneIndexByKey,
  laneX,
  rowCenterY,
} from "./graph2DLayout.js";

// Git-Extensions-style 2D commit graph rendered as plain SVG inside a native `overflow: auto`
// pane — not Three.js. The pane's DOM/box model is therefore identical to the HTML FACT table
// beside it (same header height, same fixed row height), so sharing one `scrollTop` value
// between the two panes keeps every FACT dot pixel-aligned with its table row; there is no
// world-unit/camera conversion left to drift. Native pointer events give free, real CSS `:hover`
// behavior on nodes/branches. Colors come from the exact same helpers as the 3D renderer, so
// FACT and EXPERIENCE colors are identical between 2D and 3D modes.

const SVG_NS = "http://www.w3.org/2000/svg";
const FACT_RADIUS_PX = 7;
const BRANCH_STROKE_PX = 4;
const LINK_STROKE_PX = 1.5;
const LANE_LABEL_GAP_PX = 10;

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function readThemeVar(container, name, fallback) {
  const value = getComputedStyle(container).getPropertyValue(name).trim();
  return value || fallback;
}

export function createCommitGraph2D(container, payload, theme, onSelect, onHover, factDatesById, initialViewState, scrollSync) {
  container.textContent = "";
  container.style.overflowY = "auto";
  container.style.overflowX = "hidden";
  container.style.background = theme.textBackgroundColor;

  const entityColors = buildEntityColors(theme);
  const { trunkColorByPositionKey, factColorByPositionKey } = buildExperienceColorMaps(payload, theme);
  const highlightColor = ensureReadableColor(theme.textColor, theme.textBackgroundColor);
  const borderColor = readThemeVar(container, "--theme-border", "rgba(128,128,128,0.4)");

  const laneIndexByKey = computeLaneIndexByKey(payload);
  const experienceIdByPositionKey = new Map(payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .map((node) => [positionKey(node.x, node.y), node.id]));

  // Row grid shared with the HTML FACT table: newest fact at row 0 (top).
  const rowIndexById = computeFactRowIndexById(payload);
  const rowCount = rowIndexById.size || 1;
  const maxZ = Math.max(1, ...payload.nodes3d.map((node) => node.z));
  const factRowCenterY = (factId) => rowCenterY(rowIndexById.get(factId) ?? 0);
  const zFallbackY = (z) => TABLE_HEADER_HEIGHT_PX + (1 - z / maxZ) * rowCount * ROW_HEIGHT_PX;
  // Branch endpoints are exact fact z values (firstFactZ/lastFactZ), so snapping z -> the fact's
  // grid row keeps EXPERIENCE lanes and connectors exactly on their FACT dots at any time scale.
  const rowYByZ = new Map();
  payload.nodes3d
    .filter((node) => node.entityType === "FACT")
    .forEach((node) => rowYByZ.set(node.z, factRowCenterY(node.id)));
  const toXY = (point) => ({
    x: laneX(laneIndexByKey, positionKey(point[0], point[1])),
    y: rowYByZ.get(point[2]) ?? zFallbackY(point[2]),
  });

  const graphWidthPx = Math.max(1, laneIndexByKey.size) * LANE_WIDTH_PX + 40;
  const contentHeightPx = TABLE_HEADER_HEIGHT_PX + rowCount * ROW_HEIGHT_PX;

  // Sticky lane-name header, in normal document flow exactly like the table's <th> row, so it
  // reserves the same TABLE_HEADER_HEIGHT_PX and scrolls out identically.
  const header = document.createElement("div");
  header.style.cssText = `position: sticky; top: 0; z-index: 2; height: ${TABLE_HEADER_HEIGHT_PX}px; background: ${theme.textBackgroundColor}; border-bottom: 1px solid ${borderColor};`;
  payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const trunkColor = trunkColorByPositionKey.get(key) || entityColors.EXPERIENCE;
      const label = document.createElement("span");
      label.textContent = node.label;
      label.style.cssText = `position: absolute; left: ${laneX(laneIndexByKey, key) + LANE_LABEL_GAP_PX}px; top: 50%; transform: translateY(-50%); color: ${trunkColor}; font-weight: 700; font-size: 0.78rem; white-space: nowrap;`;
      header.appendChild(label);
    });
  container.appendChild(header);

  const svg = svgEl("svg", { width: graphWidthPx, height: contentHeightPx, style: "display: block; overflow: visible;" });
  container.appendChild(svg);

  const nodeById = new Map(payload.nodes3d.map((node) => [node.id, node]));
  const trackedElements = []; // { element, node, baseColor, baseOpacity }
  const experienceElementsById = new Map();
  const factElementsById = new Map();

  const resolveLineColor = (line) => {
    if (line.lineType === "LINK") return entityColors.LINK;
    const endpoint = line.lineType === "BRANCH_MERGE" ? line.from : line.to;
    return trunkColorByPositionKey.get(positionKey(endpoint[0], endpoint[1])) || entityColors.EXPERIENCE;
  };

  const attachHover = (element, getNode) => {
    element.classList.add("HasmVisualizer_GraphHoverable2D");
    element.addEventListener("pointerenter", (event) => {
      const node = getNode();
      setHighlight(node);
      onHover?.(node, event);
    });
    element.addEventListener("pointerleave", (event) => {
      setHighlight(null);
      onHover?.(null, event);
    });
    element.addEventListener("click", () => onSelect?.(getNode()));
  };

  payload.lines3d.forEach((line) => {
    const color = resolveLineColor(line);
    const from = toXY(line.from);
    const to = toXY(line.to);
    let element;
    if (line.lineType === "LINK") {
      element = svgEl("line", {
        x1: from.x, y1: from.y, x2: to.x, y2: to.y,
        stroke: color, "stroke-width": LINK_STROKE_PX, "stroke-dasharray": "6 5", opacity: 0.7,
      });
    } else {
      // Same perpendicular-offset control point as the 3D renderer's flat variant.
      const controlX = (from.x + to.x) / 2 - (to.y - from.y) * 0.18;
      const controlY = (from.y + to.y) / 2 + (to.x - from.x) * 0.18;
      const d = line.controlPoints?.length
        ? `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`
        : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      element = svgEl("path", {
        d, fill: "none", stroke: color, "stroke-width": BRANCH_STROKE_PX, "stroke-linecap": "round",
      });
    }
    svg.appendChild(element);
    if (line.lineType === "BRANCH") {
      const experienceId = line.id.replace("branch-", "");
      const node = nodeById.get(experienceId);
      attachHover(element, () => node);
      trackedElements.push({ element, node, baseColor: color, isStroke: true });
      const elements = experienceElementsById.get(experienceId) || [];
      elements.push(element);
      experienceElementsById.set(experienceId, elements);
    }
  });

  // FACT commit dots snapped to their table row; labels live in the HTML table beside this panel.
  payload.nodes3d
    .filter((node) => node.entityType === "FACT")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const color = factColorByPositionKey.get(key) || entityColors.FACT;
      const opacity = node.isDirectFact ? 1 : 0.32;
      const circle = svgEl("circle", {
        cx: laneX(laneIndexByKey, key), cy: factRowCenterY(node.id), r: FACT_RADIUS_PX,
        fill: color, "fill-opacity": opacity,
      });
      circle.style.cursor = "pointer";
      svg.appendChild(circle);
      attachHover(circle, () => node);
      trackedElements.push({ element: circle, node, baseColor: color, baseOpacity: opacity });

      const elements = factElementsById.get(node.id) || [];
      elements.push(circle);
      factElementsById.set(node.id, elements);
    });

  // Highlight hovered node plus its linked entities / parent EXPERIENCEs (same rule as 3D).
  function setHighlight(node) {
    const highlightedIds = new Set(node ? [node.id, ...(node.linkedEntityIds || []), ...(node.parentExperienceIds || [])] : []);
    if (node?.entityType === "FACT") {
      const experienceId = experienceIdByPositionKey.get(positionKey(node.x, node.y));
      if (experienceId) highlightedIds.add(experienceId);
    }
    trackedElements.forEach(({ element, node: elementNode, baseColor, baseOpacity, isStroke }) => {
      const highlighted = elementNode && highlightedIds.has(elementNode.id);
      const color = highlighted ? highlightColor : baseColor;
      if (isStroke) {
        element.setAttribute("stroke", color);
      } else {
        element.setAttribute("fill", color);
        element.setAttribute("fill-opacity", highlighted ? 1 : baseOpacity);
      }
    });
  }

  // Native scroll: the browser drives both the FACT dots and the sticky lane header, so the pane
  // needs no wheel/camera handling at all — just relaying its own scrollTop to the table (and vice
  // versa via setScrollTop below).
  const handleScroll = () => scrollSync?.onScroll(container.scrollTop);
  container.addEventListener("scroll", handleScroll, { passive: true });

  const restoredScrollTop =
    initialViewState && Number.isFinite(initialViewState.scrollTop) ? initialViewState.scrollTop : 0;
  container.scrollTop = restoredScrollTop;

  const disposeFn = () => {
    container.removeEventListener("scroll", handleScroll);
    container.textContent = "";
    container.style.overflowY = "";
    container.style.overflowX = "";
  };
  disposeFn.getViewState = () => ({ scrollTop: container.scrollTop });
  disposeFn.setScrollTop = (scrollTop) => { container.scrollTop = scrollTop; };
  // Lets the FACT table emphasize graph dots when a row is hovered.
  disposeFn.setHighlight = setHighlight;
  return disposeFn;
}
