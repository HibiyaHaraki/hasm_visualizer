// Client-side 3D visualizer layout calculator, kept in parity with the Rust
// `calculate_layout` implementation in src-tauri/src/hasm/visualizer_commands.rs.
// Used wherever a Tauri backend isn't available (e.g. a plain web build).
import { experienceIdOf, factIdOf, linkIdOf, personIdOf } from "./modelScope.js";
import {
  buildExperienceHierarchy,
  buildExperienceRelationshipGraph,
  RELATIONSHIP_POSITION_WEIGHT,
} from "./relationshipGraph.js";

export function computeVisualizerLayoutJS(model, filter) {
  const timeScaleMode = filter?.timeScaleMode || "Linear";
  const zScaleFactor = Number(filter?.zScaleFactor || 1.0);

  const zStepValue = getZStep(timeScaleMode, zScaleFactor);
  const nodes = [];
  const lines = [];
  const experienceFactZs = new Map();

  const experiences = model?.experiences || [];
  const branchPositions = calculateBranchPositions(model);
  experiences.forEach((experience) => {
    const id = experienceIdOf(experience);
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
    const idA = factIdOf(left);
    const idB = factIdOf(right);
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
        id: factIdOf(fact),
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

  experiences.forEach((experience) => {
    const expId = experienceIdOf(experience);
    const [x, y] = branchPositions.has(expId) ? branchPositions.get(expId) : [0.0, 0.0];
    const factZs = experienceFactZs.get(expId) || [];
    const firstFactZ = factZs.length > 0 ? Math.min(...factZs) : 0.0;
    const lastFactZ = factZs.length > 0 ? Math.max(...factZs) : 0.0;
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
      id: personIdOf(person),
      entityType: "PERSON",
      label: person.person_name || person.name || "Person",
      x: -5.0,
      y: index * 2.0,
      z: 0.0,
    });
  });

  // Prefer a directly recorded FACT over an ancestor reflection for LINK geometry.
  const nodeById = new Map();
  nodes.forEach((node) => { if (!nodeById.has(node.id) || node.isDirectFact) nodeById.set(node.id, node); });

  const links = model?.links || [];
  links.forEach((link) => {
    const linkId = linkIdOf(link);
    const relatedIds = [...new Set((link.related_ids || link.relatedIds || []).map(String))];
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
        if ([fromNode, toNode].some((node) => node.entityType === "EXPERIENCE" && !experienceFactZs.has(node.id))) continue;
        const isFactFact = fromNode.entityType === "FACT" && toNode.entityType === "FACT";
        lines.push({
          id: linkId,
          lineType: "LINK",
          linkCategory: isFactFact ? "FACT_FACT" : "EXPERIENCE",
          linkShape: "LINE",
          fromId: fromNode.id,
          toId: toNode.id,
          from: [fromNode.x, fromNode.y, fromNode.z],
          to: [toNode.x, toNode.y, toNode.z],
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

function calculateBranchPositions(model) {
  const generationGap = 6.0;
  const baseLaneGap = 4.0;
  const minLaneGap = 2.0;
  const barycenterSweeps = 6;
  const experiences = model?.experiences || [];
  const experienceIds = [...new Set(experiences.map(experienceIdOf).filter(Boolean))].sort();
  const { adjacencyByExperienceId } = buildExperienceRelationshipGraph(model);
  const { depthByExperienceId, parentIdsByExperienceId } = buildExperienceHierarchy(model);
  const orderedIds = [...experienceIds].sort((firstId, secondId) => (
    (depthByExperienceId.get(firstId) || 0) - (depthByExperienceId.get(secondId) || 0)
    || firstId.localeCompare(secondId)
  ));
  const positions = new Map();
  let layerStart = 0;
  while (layerStart < orderedIds.length) {
    const depth = depthByExperienceId.get(orderedIds[layerStart]) || 0;
    let layerEnd = layerStart + 1;
    while (layerEnd < orderedIds.length
      && (depthByExperienceId.get(orderedIds[layerEnd]) || 0) === depth) layerEnd += 1;
    const layerOrder = orderedIds.slice(layerStart, layerEnd);
    const parentCenter = (id) => {
      const parentYs = (parentIdsByExperienceId.get(id) || [])
        .map((parentId) => positions.get(parentId)?.[1])
        .filter(Number.isFinite);
      return parentYs.length ? parentYs.reduce((sum, y) => sum + y, 0) / parentYs.length : null;
    };
    const parentCenters = layerOrder.map(parentCenter).filter(Number.isFinite);
    const layerCenter = parentCenters.length
      ? parentCenters.reduce((sum, y) => sum + y, 0) / parentCenters.length
      : 0;
    layerOrder.sort((firstId, secondId) => (
      (parentCenter(firstId) ?? layerCenter) - (parentCenter(secondId) ?? layerCenter)
      || firstId.localeCompare(secondId)
    ));

    const assignUniformLanes = () => layerOrder.forEach((id, index) => {
      const y = layerCenter + (index - ((layerOrder.length - 1) / 2)) * baseLaneGap;
      positions.set(id, [depth * generationGap, y]);
    });
    assignUniformLanes();

    for (let sweep = 0; sweep < barycenterSweeps; sweep += 1) {
      const scoreById = new Map();
      layerOrder.forEach((id) => {
        const parents = new Set(parentIdsByExperienceId.get(id) || []);
        let weightedY = 0;
        let totalWeight = 0;
        parents.forEach((parentId) => {
          const parentPosition = positions.get(parentId);
          if (!parentPosition) return;
          weightedY += RELATIONSHIP_POSITION_WEIGHT.PARENT_CHILD * parentPosition[1];
          totalWeight += RELATIONSHIP_POSITION_WEIGHT.PARENT_CHILD;
        });
        const neighbors = adjacencyByExperienceId.get(id) || new Map();
        [...neighbors.keys()].sort().forEach((neighborId) => {
          const neighborPosition = positions.get(neighborId);
          if (!neighborPosition) return;
          const weight = Math.max(0, neighbors.get(neighborId)
            - (parents.has(neighborId) ? RELATIONSHIP_POSITION_WEIGHT.PARENT_CHILD : 0));
          weightedY += weight * neighborPosition[1];
          totalWeight += weight;
        });
        scoreById.set(id, totalWeight ? weightedY / totalWeight : positions.get(id)[1]);
      });
      layerOrder.sort((firstId, secondId) => (
        scoreById.get(firstId) - scoreById.get(secondId) || firstId.localeCompare(secondId)
      ));
      assignUniformLanes();
    }

    const laneOffsets = [0];
    const laneGaps = [];
    let totalExtent = 0;
    for (let index = 0; index < layerOrder.length - 1; index += 1) {
      const firstId = layerOrder[index];
      const secondId = layerOrder[index + 1];
      const weight = adjacencyByExperienceId.get(firstId)?.get(secondId) || 0;
      const gap = minLaneGap + ((baseLaneGap - minLaneGap) / (1 + Math.log1p(weight)));
      laneGaps.push(gap);
      totalExtent += gap;
      laneOffsets.push(totalExtent);
    }
    const meanOffset = laneOffsets.reduce((sum, offset) => sum + offset, 0) / laneOffsets.length;
    let y = layerCenter - meanOffset;
    layerOrder.forEach((id, index) => {
      positions.set(id, [depth * generationGap, y]);
      y += laneGaps[index] || 0;
    });
    layerStart = layerEnd;
  }

  return positions;
}

function collectExperienceAndAncestors(experienceId, experiences, collected) {
  if (collected.has(experienceId)) return;
  collected.add(experienceId);
  const experience = experiences.find((candidate) => experienceIdOf(candidate) === experienceId);
  const parents = experience?.parent_experience_ids || experience?.parentExperienceIds || [];
  parents.forEach((parentId) => collectExperienceAndAncestors(String(parentId), experiences, collected));
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
