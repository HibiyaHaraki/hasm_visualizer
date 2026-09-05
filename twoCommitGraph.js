import {
  buildEntityColors,
  buildExperienceColorMaps,
  ensureReadableColor,
  positionKey,
} from "./threeCommitGraph.js";

// Git-Extensions-style 2D commit graph: EXPERIENCEs become vertical branch lanes,
// FACTs become commit dots on a top-to-bottom timeline (newest at the top), and
// BRANCH_OUT/BRANCH_MERGE lines become curved connectors between lanes.
// Colors are computed with the exact same helpers as the 3D renderer, so FACT and
// EXPERIENCE colors are identical between 2D and 3D modes.

const SVG_NS = "http://www.w3.org/2000/svg";
const LANE_WIDTH = 110;
const ROW_HEIGHT = 30;
const TOP_PADDING = 48;
const BOTTOM_PADDING = 96;
const LEFT_PADDING = 40;
const LABEL_WIDTH = 280;
const FACT_RADIUS = 7;
const BRANCH_STROKE_WIDTH = 4;

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
}

export function createCommitGraph2D(container, payload, theme, onSelect, onHover, factDatesById, initialViewState) {
  const entityColors = buildEntityColors(theme);
  const { trunkColorByPositionKey, factColorByPositionKey } = buildExperienceColorMaps(payload, theme);
  const textColor = ensureReadableColor(theme.textColor, theme.textBackgroundColor);
  const highlightColor = ensureReadableColor(theme.textColor, theme.textBackgroundColor);

  // Lane assignment: one vertical lane per EXPERIENCE position (sorted by depth then lane),
  // plus fallback lanes for any other endpoint position (e.g. PERSON nodes used by LINK lines).
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

  const experienceIdByPositionKey = new Map(payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .map((node) => [positionKey(node.x, node.y), node.id]));

  const maxZ = Math.max(1, ...payload.nodes3d.map((node) => node.z));
  const laneX = (key) => LEFT_PADDING + (laneIndexByKey.get(key) ?? 0) * LANE_WIDTH;
  const zToY = (z) => TOP_PADDING + (maxZ - z) * ROW_HEIGHT; // newest commits at the top

  const width = LEFT_PADDING + Math.max(1, laneIndexByKey.size) * LANE_WIDTH + LABEL_WIDTH;
  const height = TOP_PADDING + maxZ * ROW_HEIGHT + BOTTOM_PADDING;

  container.style.overflow = "auto";
  const svg = createSvgElement("svg", {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "2D Commit Graph",
  });
  svg.style.display = "block";
  svg.style.background = theme.textBackgroundColor;
  container.appendChild(svg);

  // Same color resolution rule as the 3D renderer: BRANCH_OUT lands on the child EXPERIENCE (`to`);
  // BRANCH_MERGE departs from it (`from`); LINK uses the shared link accent.
  const resolveLineColor = (line) => {
    if (line.lineType === "LINK") return entityColors.LINK;
    const endpoint = line.lineType === "BRANCH_MERGE" ? line.from : line.to;
    return trunkColorByPositionKey.get(positionKey(endpoint[0], endpoint[1])) || entityColors.EXPERIENCE;
  };

  const lineElements = [];
  const factCircleById = new Map();
  const branchElementsByExperienceId = new Map();
  const interactiveTargets = [];

  payload.lines3d.forEach((line) => {
    const color = resolveLineColor(line);
    const fromX = laneX(positionKey(line.from[0], line.from[1]));
    const fromY = zToY(line.from[2]);
    const toX = laneX(positionKey(line.to[0], line.to[1]));
    const toY = zToY(line.to[2]);
    let element;
    if (line.lineType === "LINK") {
      element = createSvgElement("line", {
        x1: fromX, y1: fromY, x2: toX, y2: toY,
        stroke: color, "stroke-width": 1.5, "stroke-dasharray": "5 4", opacity: 0.7,
      });
    } else if (line.lineType === "BRANCH") {
      element = createSvgElement("line", {
        x1: fromX, y1: fromY, x2: toX, y2: toY,
        stroke: color, "stroke-width": BRANCH_STROKE_WIDTH, "stroke-linecap": "round",
      });
    } else {
      // BRANCH_OUT / BRANCH_MERGE: quadratic curve, control nudged perpendicular like the 3D midpoint control.
      const controlX = (fromX + toX) / 2 - (toY - fromY) * 0.18;
      const controlY = (fromY + toY) / 2 + (toX - fromX) * 0.18;
      element = createSvgElement("path", {
        d: `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`,
        fill: "none", stroke: color, "stroke-width": BRANCH_STROKE_WIDTH, "stroke-linecap": "round",
      });
    }
    svg.appendChild(element);
    lineElements.push(element);

    if (line.lineType === "BRANCH") {
      const experienceId = line.id.replace("branch-", "");
      const elements = branchElementsByExperienceId.get(experienceId) || [];
      elements.push(element);
      branchElementsByExperienceId.set(experienceId, elements);
      element.dataset.baseColor = color;
    }
  });

  // EXPERIENCE label chips at the bottom of each lane (like branch labels in git commit graphs).
  payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const trunkColor = trunkColorByPositionKey.get(key) || entityColors.EXPERIENCE;
      const chipTextColor = ensureReadableColor(theme.textColor, trunkColor);
      const centerX = laneX(key);
      const centerY = zToY(0) + 44;
      const chipWidth = Math.max(64, node.label.length * 7 + 20);
      const chip = createSvgElement("rect", {
        x: centerX - chipWidth / 2, y: centerY - 13, width: chipWidth, height: 26, rx: 8,
        fill: trunkColor, stroke: "none",
      });
      const label = createSvgElement("text", {
        x: centerX, y: centerY + 4, "text-anchor": "middle",
        "font-size": 12, "font-weight": 700, fill: chipTextColor, "pointer-events": "none",
      });
      label.textContent = node.label;
      svg.appendChild(chip);
      svg.appendChild(label);
      chip.dataset.baseColor = trunkColor;
      const elements = branchElementsByExperienceId.get(node.id) || [];
      elements.push(chip);
      branchElementsByExperienceId.set(node.id, elements);
      interactiveTargets.push({ element: chip, node });
    });

  // FACT commit dots with a commit-message label, mirroring a git commit graph row.
  payload.nodes3d
    .filter((node) => node.entityType === "FACT")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const color = factColorByPositionKey.get(key) || entityColors.FACT;
      const opacity = node.isDirectFact ? 1 : 0.32;
      const centerX = laneX(key);
      const centerY = zToY(node.z);
      const circle = createSvgElement("circle", {
        cx: centerX, cy: centerY, r: FACT_RADIUS,
        fill: color, opacity, stroke: theme.textBackgroundColor, "stroke-width": 1.5,
      });
      circle.style.cursor = "pointer";
      const label = createSvgElement("text", {
        x: centerX + FACT_RADIUS + 8, y: centerY + 4,
        "font-size": 12, fill: textColor, opacity, "pointer-events": "none",
      });
      const dateLabel = factDatesById?.get(node.id);
      label.textContent = dateLabel ? `${node.label} — ${dateLabel}` : node.label;
      svg.appendChild(circle);
      svg.appendChild(label);
      circle.dataset.baseColor = color;
      circle.dataset.baseOpacity = String(opacity);
      label.dataset.baseOpacity = String(opacity);
      const circles = factCircleById.get(node.id) || [];
      circles.push({ circle, label });
      factCircleById.set(node.id, circles);
      interactiveTargets.push({ element: circle, node });
    });

  // Highlight hovered node plus its linked entities / parent EXPERIENCEs (same rule as 3D).
  const setHighlight = (node) => {
    const highlightedIds = new Set(node ? [node.id, ...(node.linkedEntityIds || []), ...(node.parentExperienceIds || [])] : []);
    if (node?.entityType === "FACT") {
      const experienceId = experienceIdByPositionKey.get(positionKey(node.x, node.y));
      if (experienceId) highlightedIds.add(experienceId);
    }
    branchElementsByExperienceId.forEach((elements, id) => {
      elements.forEach((element) => {
        const highlighted = highlightedIds.has(id);
        element.setAttribute("fill", highlighted ? highlightColor : element.dataset.baseColor);
        if (element.tagName !== "rect") {
          element.setAttribute("stroke", highlighted ? highlightColor : element.dataset.baseColor);
        }
      });
    });
    factCircleById.forEach((entries, id) => {
      entries.forEach(({ circle, label }) => {
        const highlighted = highlightedIds.has(id);
        circle.setAttribute("fill", highlighted ? highlightColor : circle.dataset.baseColor);
        circle.setAttribute("opacity", highlighted ? "1" : circle.dataset.baseOpacity);
        label.setAttribute("opacity", highlighted ? "1" : label.dataset.baseOpacity);
      });
    });
  };

  interactiveTargets.forEach(({ element, node }) => {
    element.addEventListener("pointerenter", (event) => {
      setHighlight(node);
      onHover?.(node, event);
    });
    element.addEventListener("pointerleave", (event) => {
      setHighlight(null);
      onHover?.(null, event);
    });
    element.addEventListener("click", () => onSelect?.(node));
  });

  if (initialViewState && typeof initialViewState.scrollTop === "number") {
    container.scrollLeft = initialViewState.scrollLeft || 0;
    container.scrollTop = initialViewState.scrollTop || 0;
  }

  const disposeFn = () => {
    if (svg.parentNode === container) {
      container.removeChild(svg);
    }
    container.style.overflow = "";
  };
  disposeFn.getViewState = () => ({
    scrollLeft: container.scrollLeft,
    scrollTop: container.scrollTop,
  });
  return disposeFn;
}
