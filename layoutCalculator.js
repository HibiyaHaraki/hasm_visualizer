// Client-side 3D visualizer layout calculator, kept in parity with the Rust
// `calculate_layout` implementation in src-tauri/src/hasm/visualizer_commands.rs.
// Used wherever a Tauri backend isn't available (e.g. a plain web build).
export function computeVisualizerLayoutJS(model, filter) {
  const timeScaleMode = filter?.timeScaleMode || "Linear";
  const zScaleFactor = Number(filter?.zScaleFactor || 1.0);

  const zStepValue = getZStep(timeScaleMode, zScaleFactor);
  const nodes = [];
  const lines = [];
  const experienceFactZs = new Map();

  const experiences = model?.experiences || [];
  const branchPositions = calculateBranchPositions(experiences);
  experiences.forEach((experience) => {
    const id = String(experience.experience_id || experience.id);
    const [x, y] = branchPositions.get(id) || [0.0, 0.0];
    nodes.push({
      id,
      entityType: "EXPERIENCE",
      label: experience.experience_name || experience.name || "Experience",
      x,
      y,
      z: 0.0,
    });
  });

  const facts = [...(model?.facts || [])];
  facts.sort((left, right) => {
    const timeA = left.occurred_at || left.occurredAt || "";
    const timeB = right.occurred_at || right.occurredAt || "";
    if (timeA < timeB) return -1;
    if (timeA > timeB) return 1;
    const idA = String(left.fact_id || left.id || "");
    const idB = String(right.fact_id || right.id || "");
    return idA.localeCompare(idB);
  });

  const earliestTime = facts.length > 0 ? timeKey(facts[0].occurred_at || facts[0].occurredAt) : 0;

  facts.forEach((fact, index) => {
    const tKey = timeKey(fact.occurred_at || fact.occurredAt);
    const z = factZ(timeScaleMode, index, tKey, earliestTime, zStepValue);

    const expIds = fact.experience_ids || fact.experienceIds || [];
    const directExperienceIds = new Set(expIds.map(String));
    const reflectedExperiences = new Set();
    expIds.forEach((experienceId) => collectExperienceAndAncestors(String(experienceId), experiences, reflectedExperiences));
    const visibleBranches = reflectedExperiences.size > 0 ? reflectedExperiences : new Set([null]);

    visibleBranches.forEach((branchId) => {
      const [x, y] = branchId && branchPositions.has(branchId) ? branchPositions.get(branchId) : [0.0, 0.0];
      if (branchId) {
        experienceFactZs.set(branchId, [...(experienceFactZs.get(branchId) || []), z]);
      }
      nodes.push({
        id: String(fact.fact_id || fact.id),
        entityType: "FACT",
        label: fact.fact_name || fact.name || "Fact",
        x,
        y,
        z,
        // True only where the FACT is registered directly on this EXPERIENCE; false where it is
        // merely reflected onto an ancestor EXPERIENCE (recursive inheritance), which renders
        // transparent so the directly-registered instance reads as the "real" one.
        isDirectFact: !branchId || directExperienceIds.has(branchId),
      });
    });
  });

  const experienceRangeById = new Map();
  experiences.forEach((experience) => {
    const expId = String(experience.experience_id || experience.id);
    const [x, y] = branchPositions.has(expId) ? branchPositions.get(expId) : [0.0, 0.0];
    const factZs = experienceFactZs.get(expId) || [];
    const firstFactZ = factZs.length > 0 ? Math.min(...factZs) : 0.0;
    const lastFactZ = factZs.length > 0 ? Math.max(...factZs) : 0.0;
    experienceRangeById.set(expId, { x, y, firstZ: firstFactZ, lastZ: lastFactZ });
    if (factZs.length > 0) {
      lines.push({
        id: `branch-${expId}`,
        lineType: "BRANCH",
        from: [x, y, firstFactZ],
        to: [x, y, lastFactZ],
      });

      const parents = experience.parent_experience_ids || experience.parentExperienceIds || [];
      parents.forEach((parentIdRaw) => {
        const parentId = String(parentIdRaw);
        if (!branchPositions.has(parentId)) return;
        const [parentX, parentY] = branchPositions.get(parentId);
        const branchControl = midpointControl([parentX, parentY, firstFactZ], [x, y, firstFactZ]);
        const mergeControl = midpointControl([x, y, lastFactZ], [parentX, parentY, lastFactZ]);
        lines.push({
          id: `branch-${parentId}-${expId}`,
          lineType: "BRANCH_OUT",
          from: [parentX, parentY, firstFactZ],
          to: [x, y, firstFactZ],
          controlPoints: [branchControl],
        });
        lines.push({
          id: `merge-${expId}-${parentId}`,
          lineType: "BRANCH_MERGE",
          from: [x, y, lastFactZ],
          to: [parentX, parentY, lastFactZ],
          controlPoints: [mergeControl],
        });
      });
    }
  });

  const people = model?.people || [];
  people.forEach((person, index) => {
    nodes.push({
      id: String(person.person_id || person.id),
      entityType: "PERSON",
      label: person.person_name || person.name || "Person",
      x: -5.0,
      y: index * 2.0,
      z: 0.0,
    });
  });

  // A FACT can appear multiple times (once per ancestor EXPERIENCE it reflects onto), so keep
  // just the first instance per id as the representative endpoint for LINK geometry.
  const nodeById = new Map();
  nodes.forEach((node) => { if (!nodeById.has(node.id)) nodeById.set(node.id, node); });

  const links = model?.links || [];
  links.forEach((link) => {
    const linkId = String(link.link_id || link.id);
    const relatedIds = (link.related_ids || link.relatedIds || []).map(String);
    // A LINK is only drawn between endpoints that actually resolved to a rendered node (i.e. both
    // ends survived scoping/filtering); every unordered pair among related_ids gets its own line.
    for (let i = 0; i < relatedIds.length; i += 1) {
      for (let j = i + 1; j < relatedIds.length; j += 1) {
        const fromNode = nodeById.get(relatedIds[i]);
        const toNode = nodeById.get(relatedIds[j]);
        if (!fromNode || !toNode) continue;
        // PERSON nodes sit at an arbitrary fixed placeholder position (not real FACT/EXPERIENCE
        // geometry), so a LINK touching one renders as a stray, meaningless line/membrane -
        // PERSON-related LINKs are no longer visualized at all.
        if (fromNode.entityType === "PERSON" || toNode.entityType === "PERSON") continue;
        const isFactFact = fromNode.entityType === "FACT" && toNode.entityType === "FACT";
        const isExperienceExperience = fromNode.entityType === "EXPERIENCE" && toNode.entityType === "EXPERIENCE";
        const isFactExperience = (fromNode.entityType === "FACT" && toNode.entityType === "EXPERIENCE")
          || (fromNode.entityType === "EXPERIENCE" && toNode.entityType === "FACT");
        // An EXPERIENCE-EXPERIENCE LINK spans each branch's full lifetime, so its membrane is a
        // rectangle from each EXPERIENCE's first FACT to its last FACT rather than a single line.
        const fromRange = isExperienceExperience ? experienceRangeById.get(fromNode.id) : null;
        const toRange = isExperienceExperience ? experienceRangeById.get(toNode.id) : null;
        // A FACT-EXPERIENCE LINK's membrane is a triangle: the EXPERIENCE's start/end points plus
        // the FACT's own point.
        const factNode = isFactExperience ? (fromNode.entityType === "FACT" ? fromNode : toNode) : null;
        const experienceNode = isFactExperience ? (fromNode.entityType === "EXPERIENCE" ? fromNode : toNode) : null;
        const experienceRange = experienceNode ? experienceRangeById.get(experienceNode.id) : null;
        let linkShape = "LINE";
        const extra = {};
        if (fromRange && toRange) {
          linkShape = "RECT";
          extra.rect = { fromZStart: fromRange.firstZ, fromZEnd: fromRange.lastZ, toZStart: toRange.firstZ, toZEnd: toRange.lastZ };
        } else if (experienceRange && factNode) {
          linkShape = "TRIANGLE";
          extra.triangle = {
            expX: experienceRange.x, expY: experienceRange.y, expZStart: experienceRange.firstZ, expZEnd: experienceRange.lastZ,
            factX: factNode.x, factY: factNode.y, factZ: factNode.z,
          };
        }
        lines.push({
          id: `link-${linkId}-${relatedIds[i]}-${relatedIds[j]}`,
          lineType: "LINK",
          // FACT-FACT LINKs are thin lines always shown; any LINK touching an EXPERIENCE/PERSON
          // is a translucent "membrane" (rectangle for EXPERIENCE-EXPERIENCE, triangle for
          // FACT-EXPERIENCE, line otherwise).
          linkCategory: isFactFact ? "FACT_FACT" : "MEMBRANE",
          linkShape,
          fromId: fromNode.id,
          toId: toNode.id,
          from: [fromNode.x, fromNode.y, fromNode.z],
          to: [toNode.x, toNode.y, toNode.z],
          ...extra,
        });
      }
    }
  });

  return { nodes3d: nodes, lines3d: lines, warnings: [] };
}

function midpointControl(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return [
    (from[0] + to[0]) / 2.0 - dy * 0.18,
    (from[1] + to[1]) / 2.0 + dx * 0.18,
    from[2],
  ];
}

function timeKey(value) {
  if (!value) return 0;
  const parts = String(value).split(/[^0-9]+/).map(Number).filter((n) => !isNaN(n));
  if (parts.length < 3) return 0;
  const [year, month, day] = parts;
  return year * 372 + month * 31 + day;
}

function calculateBranchPositions(experiences) {
  const generationGap = 6.0;
  const siblingGap = 4.0;
  const depths = new Map();

  experiences.forEach((experience) => {
    experienceDepth(String(experience.experience_id || experience.id), experiences, depths, new Set());
  });

  const orderedExperiences = [...experiences].sort((left, right) => {
    const leftId = String(left.experience_id || left.id);
    const rightId = String(right.experience_id || right.id);
    return (depths.get(leftId) || 0) - (depths.get(rightId) || 0);
  });
  const positions = new Map();
  const lanesByDepth = new Map();

  orderedExperiences.forEach((experience) => {
    const id = String(experience.experience_id || experience.id);
    const depth = depths.get(id) || 0;
    const parents = experience.parent_experience_ids || experience.parentExperienceIds || [];
    const parentLanes = parents
      .map((parentId) => positions.get(String(parentId)))
      .filter(Boolean)
      .map((position) => position[1]);
    const parentCenter = parentLanes.length > 0
      ? parentLanes.reduce((total, lane) => total + lane, 0) / parentLanes.length
      : 0.0;
    const siblingExperiences = experiences.filter((candidate) => {
      const candidateParents = candidate.parent_experience_ids || candidate.parentExperienceIds || [];
      return candidateParents.some((parentId) => parents.map(String).includes(String(parentId)));
    });
    const siblingIndex = Math.max(0, siblingExperiences.findIndex((candidate) => String(candidate.experience_id || candidate.id) === id));
    const desiredY = parentCenter + (siblingIndex - (Math.max(0, siblingExperiences.length - 1) / 2.0)) * siblingGap;
    const occupiedLanes = lanesByDepth.get(depth) || [];
    const y = nearestAvailableLane(desiredY, occupiedLanes, siblingGap);
    lanesByDepth.set(depth, occupiedLanes);
    positions.set(id, [depth * generationGap, y]);
  });

  return positions;
}

function experienceDepth(experienceId, experiences, depths, visiting) {
  if (depths.has(experienceId)) return depths.get(experienceId);
  if (visiting.has(experienceId)) return 0;
  visiting.add(experienceId);
  const experience = experiences.find((candidate) => String(candidate.experience_id || candidate.id) === experienceId);
  const parents = experience?.parent_experience_ids || experience?.parentExperienceIds || [];
  const depth = experience
    ? parents.reduce((maximum, parentId) => Math.max(maximum, experienceDepth(String(parentId), experiences, depths, visiting) + 1), 0)
    : 0;
  visiting.delete(experienceId);
  depths.set(experienceId, depth);
  return depth;
}

function collectExperienceAndAncestors(experienceId, experiences, collected) {
  if (collected.has(experienceId)) return;
  collected.add(experienceId);
  const experience = experiences.find((candidate) => String(candidate.experience_id || candidate.id) === experienceId);
  const parents = experience?.parent_experience_ids || experience?.parentExperienceIds || [];
  parents.forEach((parentId) => collectExperienceAndAncestors(String(parentId), experiences, collected));
}

function nearestAvailableLane(desiredY, occupiedLanes, gap) {
  for (let step = 0; step <= occupiedLanes.length; step += 1) {
    const offset = step * gap;
    for (const candidate of [desiredY + offset, desiredY - offset]) {
      if (occupiedLanes.every((lane) => Math.abs(candidate - lane) >= gap)) {
        occupiedLanes.push(candidate);
        return candidate;
      }
    }
  }
  throw new Error("Unable to find an available EXPERIENCE lane");
}

function factZ(mode, index, time, earliestTime, zStepVal) {
  const delta = Math.max(0, time - earliestTime);
  switch (mode) {
    case "Logarithmic":
      return Math.max(1.0, Math.log10(delta + 1.0)) * zStepVal;
    case "SequentialIndex":
      return (index + 1.0) * zStepVal;
    default: // Linear
      return Math.max(1.0, delta / 30.0) * zStepVal;
  }
}

function getZStep(mode, scale) {
  const normalizedScale = Math.max(0.1, scale);
  switch (mode) {
    case "Logarithmic":
      return 2.0 * normalizedScale;
    case "SequentialIndex":
      return 3.0 * normalizedScale;
    default:
      return 4.0 * normalizedScale;
  }
}
