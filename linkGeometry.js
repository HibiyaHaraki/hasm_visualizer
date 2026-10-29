// linkGeometry.js: resolves LINK endpoints on visible EXPERIENCE segments in either view.
// Homogeneous clipping keeps endpoints inside the viewport, including the 3D near plane.
const interpolate = (from, to, t) => from.map((value, index) => value + (to[index] - value) * t);
const clamp = (value) => Math.max(0, Math.min(1, value));

function visibleSegment(segment, project) {
  const start = project(segment[0]);
  const end = project(segment[1]);
  let first = 0;
  let last = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    for (const sign of [-1, 1]) {
      const a = start[3] + sign * start[axis];
      const b = end[3] + sign * end[axis];
      if (a < 0 && b < 0) return null;
      if (a < 0) first = Math.max(first, a / (a - b));
      if (b < 0) last = Math.min(last, a / (a - b));
    }
  }
  if (first > last) return null;
  const clip = [interpolate(start, end, first), interpolate(start, end, last)];
  if (clip.some((point) => point[3] <= 0)) return null;
  return {
    points: [interpolate(...segment, first), interpolate(...segment, last)],
    clip,
  };
}

function screenPoint(point, viewport) {
  return [point[0] / point[3] * viewport.width / 2, point[1] / point[3] * viewport.height / 2];
}

function nearestPoint(segment, target, viewport) {
  const from = screenPoint(segment.clip[0], viewport);
  const to = screenPoint(segment.clip[1], viewport);
  const delta = to.map((value, index) => value - from[index]);
  const lengthSquared = delta[0] ** 2 + delta[1] ** 2;
  const s = lengthSquared === 0 ? 0 : clamp(
    ((target[0] - from[0]) * delta[0] + (target[1] - from[1]) * delta[1]) / lengthSquared,
  );
  // Screen-space interpolation is not affine in world space under a perspective camera.
  const t = s * segment.clip[0][3]
    / ((1 - s) * segment.clip[1][3] + s * segment.clip[0][3]);
  return interpolate(...segment.points, t);
}

export function createLinkGeometryResolver(payload, mapPoint = (point) => point) {
  const nodes = new Map();
  payload.nodes3d.forEach((node) => {
    if (!nodes.has(node.id) || node.isDirectFact) nodes.set(node.id, node);
  });
  const branches = new Map(payload.lines3d
    .filter((line) => line.lineType === "BRANCH")
    .map((line) => [line.id.slice("branch-".length), [mapPoint(line.from), mapPoint(line.to)]]));

  return (line, viewport) => {
    const fromNode = nodes.get(line.fromId);
    const toNode = nodes.get(line.toId);
    if (!fromNode || !toNode || fromNode.entityType === "PERSON" || toNode.entityType === "PERSON") return null;
    const pointOf = (node) => mapPoint([node.x, node.y, node.z]);
    const segmentOf = (node) => {
      const branch = branches.get(node.id);
      return branch ? visibleSegment(branch, viewport.project) : null;
    };
    const fromSegment = fromNode.entityType === "EXPERIENCE" ? segmentOf(fromNode) : null;
    const toSegment = toNode.entityType === "EXPERIENCE" ? segmentOf(toNode) : null;
    if ((fromNode.entityType === "EXPERIENCE" && !fromSegment)
      || (toNode.entityType === "EXPERIENCE" && !toSegment)) return null;
    let from = pointOf(fromNode);
    let to = pointOf(toNode);
    if ((fromSegment && !toSegment && viewport.project(to)[3] <= 0)
      || (toSegment && !fromSegment && viewport.project(from)[3] <= 0)) return null;
    if (fromSegment && toSegment) {
      from = nearestPoint(fromSegment, [0, 0], viewport);
      to = nearestPoint(toSegment, screenPoint(viewport.project(from), viewport), viewport);
    } else if (fromSegment) {
      from = nearestPoint(fromSegment, screenPoint(viewport.project(to), viewport), viewport);
    } else if (toSegment) {
      to = nearestPoint(toSegment, screenPoint(viewport.project(from), viewport), viewport);
    }
    return { from, to };
  };
}

export function linkHighlightIds(node) {
  return new Set(node ? [node.id, ...(node.linkedEntityIds || [])] : []);
}
