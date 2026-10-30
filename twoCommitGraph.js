import {
  buildEntityColors,
  buildExperienceColorMaps,
  ensureReadableColor,
  positionKey,
} from "./threeCommitGraph.js";
import {
  LANE_WIDTH_PX,
  LANE_LEFT_MARGIN_PX,
  ROW_HEIGHT_PX,
  TABLE_HEADER_HEIGHT_PX,
  computeFactRowIndexById,
  computeLaneIndexByKey,
  graphWidthForLaneCount,
  laneX,
  rowCenterY,
  TIME_AXIS_WIDTH_PX,
  computeTimeLayout,
} from "./graph2DLayout.js";
import { createLinkGeometryResolver, linkHighlightIds } from "./linkGeometry.js";

// Git-Extensions-style 2D commit graph rendered as plain SVG — not Three.js. In SequentialIndex
// the pane never scrolls natively: it is a fixed-size overlay
// whose content is repositioned with a CSS transform driven by the same `scrollTop` value as the
// HTML FACT table beside it. The FACT table is the sole natively-scrollable element, so there is
// only ever one source of scroll physics and nothing left to fight over at the top/bottom edges.
// Colors come from the exact same helpers as the 3D renderer, so FACT and EXPERIENCE colors are
// identical between 2D and 3D modes. Linear/Logarithmic instead scroll natively along a time Y-axis.
// Native pointer events give real CSS `:hover` on nodes/branches.

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
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.background = theme.textBackgroundColor;

  const entityColors = buildEntityColors(theme);
  const { trunkColorByPositionKey, factColorByPositionKey } = buildExperienceColorMaps(payload, theme);
  const highlightColor = ensureReadableColor(theme.textColor, theme.textBackgroundColor);
  const borderColor = readThemeVar(container, "--theme-border", "rgba(128,128,128,0.4)");
  const isTimeline = scrollSync?.timeScaleMode === "Linear" || scrollSync?.timeScaleMode === "Logarithmic";
  if (isTimeline) container.style.overflowY = "auto";

  const laneIndexByKey = computeLaneIndexByKey(payload);
  const laneXPx = (key) => laneX(laneIndexByKey, key) + LANE_LEFT_MARGIN_PX + (isTimeline ? TIME_AXIS_WIDTH_PX : 0);
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
  const timeLayout = isTimeline ? computeTimeLayout(payload, rowHeightPx, headerHeightPx, container.clientHeight) : null;
  const maxZ = Math.max(1, ...payload.nodes3d.map((node) => node.z));
  const factRowCenterY = (factId) => rowCenterY(rowIndexById.get(factId) ?? 0, rowHeightPx, headerHeightPx);
  const zFallbackY = (z) => headerHeightPx + (1 - z / maxZ) * rowCount * rowHeightPx;
  // SequentialIndex branch endpoints snap to the same grid as their FACT table rows.
  const rowYByZ = new Map();
  payload.nodes3d
    .filter((node) => node.entityType === "FACT")
    .forEach((node) => rowYByZ.set(node.z, factRowCenterY(node.id)));
  const toXY = (point) => ({
    x: laneXPx(positionKey(point[0], point[1])),
    y: timeLayout ? timeLayout.toY(point[2]) : (rowYByZ.get(point[2]) ?? zFallbackY(point[2])),
  });

  const graphWidthPx = graphWidthForLaneCount(laneIndexByKey.size) + (isTimeline ? TIME_AXIS_WIDTH_PX : 0);
  const contentHeightPx = timeLayout?.contentHeightPx ?? (headerHeightPx + rowCount * rowHeightPx);

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
  if (timeLayout?.ticks.length) {
    const axisX = TIME_AXIS_WIDTH_PX - 1;
    svg.appendChild(svgEl("line", {
      x1: axisX, x2: axisX,
      y1: timeLayout.toY(timeLayout.ticks[0].z),
      y2: timeLayout.toY(timeLayout.ticks.at(-1).z),
      stroke: highlightColor, "stroke-width": 1,
    }));
    let lastLabelY = -Infinity;
    timeLayout.ticks.forEach((node) => {
      const y = timeLayout.toY(node.z);
      svg.appendChild(svgEl("line", {
        x1: axisX - 5, x2: axisX, y1: y, y2: y, stroke: highlightColor,
      }));
      // Dense dates retain their exact ticks; omit overlapping labels, not geometry.
      if (y - lastLabelY < 22) return;
      const label = svgEl("text", {
        x: axisX - 9, y, fill: highlightColor,
        "text-anchor": "end", "dominant-baseline": "middle", "font-size": 11,
      });
      label.textContent = factDatesById?.get(node.id) || String(node.z);
      svg.appendChild(label);
      lastLabelY = y;
    });
  }

  const header = document.createElement("div");
  header.style.cssText = `position: absolute; top: 0; left: 0; right: 0; z-index: 2; height: ${headerHeightPx}px; background: ${theme.textBackgroundColor}; border-bottom: 1px solid ${borderColor}; box-sizing: border-box;`;
  if (isTimeline) {
    const axisLabel = document.createElement("span");
    axisLabel.textContent = `${scrollSync.timeLabel || "Time"} (${scrollSync.timeScaleMode})`;
    axisLabel.style.cssText = `position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: ${highlightColor}; font-size: 0.78rem;`;
    header.appendChild(axisLabel);
  }
  payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const trunkColor = trunkColorByPositionKey.get(key) || entityColors.EXPERIENCE;
      const label = document.createElement("span");
      label.textContent = node.label;
      label.title = node.label;
      // Long names must never overlap into a neighboring lane's label and visually cover it (the
      // later-appended label paints on top): clip to this lane's own width instead, full text is
      // still available via the title tooltip.
      label.style.cssText = `position: absolute; left: ${laneXPx(key) + LANE_LABEL_GAP_PX}px; top: 50%; transform: translateY(-50%); color: ${trunkColor}; font-weight: 700; font-size: 0.78rem; white-space: nowrap; max-width: ${Math.max(LANE_WIDTH_PX - LANE_LABEL_GAP_PX, 40)}px; overflow: hidden; text-overflow: ellipsis;`;
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

  const resolveLinkGeometry = createLinkGeometryResolver(payload, (point) => {
    const { x, y } = toXY(point);
    return [x, y, 0];
  });
  const linkRecords = [];
  const linkElementsByEndpointId = new Map();
  const trackLinkElement = (id, ref) => {
    const list = linkElementsByEndpointId.get(id) || [];
    list.push(ref);
    linkElementsByEndpointId.set(id, list);
  };
  payload.lines3d.filter((line) => line.lineType === "LINK").forEach((line) => {
    const color = entityColors.LINK;
    const element = svgEl("path", {
      fill: "none",
      stroke: color,
      "stroke-width": LINK_STROKE_PX,
      "stroke-dasharray": "6 5",
      opacity: 0.7,
    });
    element.style.cursor = "pointer";
    svg.appendChild(element);
    const ref = { element, colorAttr: "stroke", baseColor: color, baseOpacity: 0.7, highlightOpacity: 1 };
    linkRecords.push({ line, element });
    trackLinkElement(line.fromId, ref);
    trackLinkElement(line.toId, ref);
    const fromLabel = nodeById.get(line.fromId)?.label || line.fromId;
    const toLabel = nodeById.get(line.toId)?.label || line.toId;
    const linkNode = {
      entityType: "LINK",
      id: line.id,
      label: `${fromLabel} \u2194 ${toLabel}`,
      linkedEntityIds: [line.fromId, line.toId],
    };
    attachHover(element, () => linkNode);
  });

  // FACT dots use either SequentialIndex rows or the selected time projection.
  payload.nodes3d
    .filter((node) => node.entityType === "FACT")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const color = factColorByPositionKey.get(key) || entityColors.FACT;
      const circle = svgEl("circle", {
        cx: laneXPx(key), cy: timeLayout ? timeLayout.toY(node.z) : factRowCenterY(node.id), r: FACT_RADIUS_PX,
        fill: node.isDirectFact ? color : "none",
        stroke: color,
        "stroke-width": node.isDirectFact ? 0 : 2,
        "pointer-events": "all",
      });
      circle.style.cursor = "pointer";
      svg.appendChild(circle);
      attachHover(circle, () => node);
      trackedElements.push({ element: circle, node, baseColor: color });

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
    trackedElements.forEach(({ element, node: elementNode, baseColor, isStroke }) => {
      const highlighted = elementNode && highlightedIds.has(elementNode.id);
      const color = highlighted ? highlightColor : baseColor;
      if (isStroke) {
        element.setAttribute("stroke", color);
      } else if (elementNode && !elementNode.isDirectFact) {
        element.setAttribute("stroke", color);
        element.setAttribute("fill", highlighted ? color : "none");
      } else {
        element.setAttribute("fill", color);
      }
    });

    const emphasizedLinkRefs = new Set();
    linkHighlightIds(node).forEach((id) => (linkElementsByEndpointId.get(id) || []).forEach((ref) => emphasizedLinkRefs.add(ref)));
    linkElementsByEndpointId.forEach((refs) => refs.forEach((ref) => {
      const emphasized = emphasizedLinkRefs.has(ref);
      ref.element.setAttribute(ref.colorAttr, emphasized ? highlightColor : ref.baseColor);
      ref.element.setAttribute("opacity", emphasized ? ref.highlightOpacity : ref.baseOpacity);
    }));
  }

  // SequentialIndex mirrors the table via transform; timeline modes own native graph scrolling.
  let scrollTop = initialViewState && Number.isFinite(initialViewState.scrollTop) ? initialViewState.scrollTop : 0;
  const updateLinkGeometry = () => {
    const bounds = container.getBoundingClientRect();
    let left = Math.max(bounds.left, 0);
    let right = Math.min(bounds.right, window.innerWidth);
    let top = Math.max(bounds.top + headerHeightPx, 0);
    let bottom = Math.min(bounds.bottom, window.innerHeight);
    for (let parent = container.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const rect = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        left = Math.max(left, rect.left);
        right = Math.min(right, rect.right);
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        top = Math.max(top, rect.top);
        bottom = Math.min(bottom, rect.bottom);
      }
    }
    const viewportWidth = Math.max(1, right - left);
    const viewportHeight = Math.max(1, bottom - top);
    const viewport = {
      width: viewportWidth,
      height: viewportHeight,
      project: ([x, y]) => [
        2 * (x - (left - bounds.left)) / viewportWidth - 1,
        1 - 2 * (y - scrollTop - (top - bounds.top)) / viewportHeight,
        0, 1,
      ],
    };
    linkRecords.forEach(({ line, element }) => {
      const endpoints = right > left && bottom > top ? resolveLinkGeometry(line, viewport) : null;
      element.style.display = endpoints ? "" : "none";
      if (!endpoints) return;
      const [fromX, fromY] = endpoints.from;
      const [toX, toY] = endpoints.to;
      element.setAttribute("d", `M ${fromX} ${fromY} L ${toX} ${toY}`);
    });
  };
  const applyTransform = () => {
    if (isTimeline) header.style.top = `${scrollTop}px`;
    else contentWrapper.style.transform = `translateY(${-scrollTop}px)`;
    updateLinkGeometry();
  };
  const setScrollTop = (nextScrollTop) => {
    if (isTimeline) {
      container.scrollTop = nextScrollTop;
      scrollTop = container.scrollTop;
      applyTransform();
      return;
    }
    scrollTop = nextScrollTop;
    applyTransform();
  };
  const handleScroll = () => {
    scrollTop = container.scrollTop;
    applyTransform();
  };
  setScrollTop(scrollTop);

  // Forward wheel input to the shared scroll state (the table applies + clamps it); this pane has
  // no native scroll of its own so the browser would otherwise just ignore the wheel here.
  const handleWheel = (event) => {
    event.preventDefault();
    scrollSync?.onScroll(scrollTop + event.deltaY);
  };
  if (isTimeline) container.addEventListener("scroll", handleScroll);
  else container.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("resize", updateLinkGeometry);
  window.addEventListener("scroll", updateLinkGeometry, true);
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateLinkGeometry);
  resizeObserver?.observe(container);

  const disposeFn = () => {
    container.removeEventListener("wheel", handleWheel);
    container.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", updateLinkGeometry);
    window.removeEventListener("scroll", updateLinkGeometry, true);
    resizeObserver?.disconnect();
    container.textContent = "";
    container.style.overflow = "";
    container.style.overflowY = "";
  };
  disposeFn.getViewState = () => ({ scrollTop });
  disposeFn.setScrollTop = setScrollTop;
  // Lets the FACT table emphasize graph dots when a row is hovered.
  disposeFn.setHighlight = setHighlight;
  return disposeFn;
}
