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

// Git-Extensions-style 2D commit graph rendered as plain SVG — not Three.js. The pane never
// scrolls natively (no scrollbar, no rubber-band momentum of its own): it is a fixed-size overlay
// whose content is repositioned with a CSS transform driven by the same `scrollTop` value as the
// HTML FACT table beside it. The FACT table is the sole natively-scrollable element, so there is
// only ever one source of scroll physics and nothing left to fight over at the top/bottom edges.
// Colors come from the exact same helpers as the 3D renderer, so FACT and EXPERIENCE colors are
// identical between 2D and 3D modes. Native pointer events give real CSS `:hover` on nodes/branches.

const SVG_NS = "http://www.w3.org/2000/svg";
const FACT_RADIUS_PX = 7;
const BRANCH_STROKE_PX = 4;
const LINK_STROKE_PX = 1.5;
const MEMBRANE_STROKE_PX = 14;
const LANE_LABEL_GAP_PX = 10;
// Keeps lane 0's dots/branch lines/labels clear of the pane's left edge (a 0px-inset element would
// otherwise be half-clipped, hiding the first EXPERIENCE).
const LANE_LEFT_MARGIN_PX = FACT_RADIUS_PX + 14;

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
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.background = theme.textBackgroundColor;

  const entityColors = buildEntityColors(theme);
  const { trunkColorByPositionKey, factColorByPositionKey } = buildExperienceColorMaps(payload, theme);
  const highlightColor = ensureReadableColor(theme.textColor, theme.textBackgroundColor);
  const borderColor = readThemeVar(container, "--theme-border", "rgba(128,128,128,0.4)");

  const laneIndexByKey = computeLaneIndexByKey(payload);
  const laneXPx = (key) => laneX(laneIndexByKey, key) + LANE_LEFT_MARGIN_PX;
  const experienceIdByPositionKey = new Map(payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .map((node) => [positionKey(node.x, node.y), node.id]));

  // Prefer the FACT table's *actual* rendered header/row height (measured by the caller) over the
  // nominal constants, so this graph always matches whatever the table really painted at.
  const rowHeightPx = scrollSync?.rowHeightPx || ROW_HEIGHT_PX;
  const headerHeightPx = scrollSync?.headerHeightPx ?? TABLE_HEADER_HEIGHT_PX;

  // Row grid shared with the HTML FACT table: newest fact at row 0 (top).
  const rowIndexById = computeFactRowIndexById(payload);
  const rowCount = rowIndexById.size || 1;
  const maxZ = Math.max(1, ...payload.nodes3d.map((node) => node.z));
  const factRowCenterY = (factId) => rowCenterY(rowIndexById.get(factId) ?? 0, rowHeightPx, headerHeightPx);
  const zFallbackY = (z) => headerHeightPx + (1 - z / maxZ) * rowCount * rowHeightPx;
  // Branch endpoints are exact fact z values (firstFactZ/lastFactZ), so snapping z -> the fact's
  // grid row keeps EXPERIENCE lanes and connectors exactly on their FACT dots at any time scale.
  const rowYByZ = new Map();
  payload.nodes3d
    .filter((node) => node.entityType === "FACT")
    .forEach((node) => rowYByZ.set(node.z, factRowCenterY(node.id)));
  const toXY = (point) => ({
    x: laneXPx(positionKey(point[0], point[1])),
    y: rowYByZ.get(point[2]) ?? zFallbackY(point[2]),
  });

  const graphWidthPx = Math.max(1, laneIndexByKey.size) * LANE_WIDTH_PX + LANE_LEFT_MARGIN_PX + 40;
  const contentHeightPx = headerHeightPx + rowCount * rowHeightPx;

  // Scrollable content lives in a plain, non-scrolling wrapper moved by `transform: translateY`;
  // the sticky-look header is a separate overlay that never moves, so it needs no CSS `sticky`.
  const contentWrapper = document.createElement("div");
  contentWrapper.style.cssText = "position: absolute; top: 0; left: 0; will-change: transform;";
  container.appendChild(contentWrapper);

  const svg = svgEl("svg", {
    width: graphWidthPx,
    height: contentHeightPx,
    viewBox: `0 0 ${graphWidthPx} ${contentHeightPx}`,
    preserveAspectRatio: "none",
    // Presentation attributes alone can be overridden by a host app's own CSS (e.g. a common
    // `svg { max-width: 100%; height: auto }` reset), which would rescale every coordinate below
    // and desync the dots from the table rows. Pin the exact pixel box via `!important` inline
    // styles so no external stylesheet rule can stretch/shrink this element.
    style: `display: block !important; overflow: visible !important; width: ${graphWidthPx}px !important; height: ${contentHeightPx}px !important; max-width: none !important; max-height: none !important;`,
  });
  contentWrapper.appendChild(svg);

  const header = document.createElement("div");
  header.style.cssText = `position: absolute; top: 0; left: 0; right: 0; z-index: 2; height: ${headerHeightPx}px; background: ${theme.textBackgroundColor}; border-bottom: 1px solid ${borderColor}; box-sizing: border-box;`;
  payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const trunkColor = trunkColorByPositionKey.get(key) || entityColors.EXPERIENCE;
      const label = document.createElement("span");
      label.textContent = node.label;
      label.style.cssText = `position: absolute; left: ${laneXPx(key) + LANE_LABEL_GAP_PX}px; top: 50%; transform: translateY(-50%); color: ${trunkColor}; font-weight: 700; font-size: 0.78rem; white-space: nowrap;`;
      header.appendChild(label);
    });
  container.appendChild(header);

  const nodeById = new Map(payload.nodes3d.map((node) => [node.id, node]));
  const trackedElements = []; // { element, node, baseColor, baseOpacity, isStroke }
  const experienceElementsById = new Map();
  const factElementsById = new Map();

  const resolveLineColor = (line) => {
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

  payload.lines3d.filter((line) => line.lineType !== "LINK").forEach((line) => {
    const color = resolveLineColor(line);
    const from = toXY(line.from);
    const to = toXY(line.to);
    // Same perpendicular-offset control point as the 3D renderer's flat variant.
    const controlX = (from.x + to.x) / 2 - (to.y - from.y) * 0.18;
    const controlY = (from.y + to.y) / 2 + (to.x - from.x) * 0.18;
    const d = line.controlPoints?.length
      ? `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`
      : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    const element = svgEl("path", {
      d, fill: "none", stroke: color, "stroke-width": BRANCH_STROKE_PX, "stroke-linecap": "round",
    });
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

  // LINK entities: a FACT-FACT LINK is a thin dashed line shown at all times; any LINK touching an
  // EXPERIENCE/PERSON instead renders as a wide translucent "membrane" that stays invisible (opacity
  // 0, no pointer events) until one of its endpoints is hovered (toggled from setHighlight below).
  const linkElementsByEndpointId = new Map();
  const trackLinkElement = (id, ref) => {
    const list = linkElementsByEndpointId.get(id) || [];
    list.push(ref);
    linkElementsByEndpointId.set(id, list);
  };
  payload.lines3d.filter((line) => line.lineType === "LINK").forEach((line) => {
    const color = entityColors.LINK;
    const from = toXY(line.from);
    const to = toXY(line.to);
    const isFactFact = line.linkCategory === "FACT_FACT";
    const element = svgEl("line", isFactFact
      ? { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: color, "stroke-width": LINK_STROKE_PX, "stroke-dasharray": "6 5", opacity: 0.7 }
      : { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: color, "stroke-width": MEMBRANE_STROKE_PX, "stroke-linecap": "round", opacity: 0 });
    if (!isFactFact) element.style.pointerEvents = "none";
    svg.appendChild(element);
    const ref = { element, baseColor: color, baseOpacity: isFactFact ? 0.7 : 0, highlightOpacity: isFactFact ? 1 : 0.35 };
    trackLinkElement(line.fromId, ref);
    trackLinkElement(line.toId, ref);
  });


  // FACT commit dots snapped to their table row; labels live in the HTML table beside this panel.
  payload.nodes3d
    .filter((node) => node.entityType === "FACT")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const color = factColorByPositionKey.get(key) || entityColors.FACT;
      const opacity = node.isDirectFact ? 1 : 0.32;
      const circle = svgEl("circle", {
        cx: laneXPx(key), cy: factRowCenterY(node.id), r: FACT_RADIUS_PX,
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

    // LINK elements: emphasize (brighter color, fuller opacity) whenever a hovered endpoint owns
    // them; MEMBRANE-category LINKs are additionally revealed from fully transparent only then.
    const emphasizedLinkRefs = new Set();
    highlightedIds.forEach((id) => (linkElementsByEndpointId.get(id) || []).forEach((ref) => emphasizedLinkRefs.add(ref)));
    linkElementsByEndpointId.forEach((refs) => refs.forEach((ref) => {
      const emphasized = emphasizedLinkRefs.has(ref);
      ref.element.setAttribute("stroke", emphasized ? highlightColor : ref.baseColor);
      ref.element.setAttribute("opacity", emphasized ? ref.highlightOpacity : ref.baseOpacity);
    }));
  }

  // The FACT table owns real scrolling; this pane only mirrors its scrollTop via transform, so
  // scroll physics (momentum, rubber-banding) exist in exactly one place and can't fight themselves.
  let scrollTop = initialViewState && Number.isFinite(initialViewState.scrollTop) ? initialViewState.scrollTop : 0;
  const applyTransform = () => { contentWrapper.style.transform = `translateY(${-scrollTop}px)`; };
  const setScrollTop = (nextScrollTop) => {
    scrollTop = nextScrollTop;
    applyTransform();
  };
  applyTransform();

  // Forward wheel input to the shared scroll state (the table applies + clamps it); this pane has
  // no native scroll of its own so the browser would otherwise just ignore the wheel here.
  const handleWheel = (event) => {
    event.preventDefault();
    scrollSync?.onScroll(scrollTop + event.deltaY);
  };
  container.addEventListener("wheel", handleWheel, { passive: false });

  const disposeFn = () => {
    container.removeEventListener("wheel", handleWheel);
    container.textContent = "";
    container.style.overflow = "";
  };
  disposeFn.getViewState = () => ({ scrollTop });
  disposeFn.setScrollTop = setScrollTop;
  // Lets the FACT table emphasize graph dots when a row is hovered.
  disposeFn.setHighlight = setHighlight;
  return disposeFn;
}
