import { experienceIdOf, factIdOf, linkIdOf } from "./modelScope.js";

export const RELATIONSHIP_POSITION_WEIGHT = Object.freeze({
  PARENT_CHILD: 4,
  EXPERIENCE_LINK: 3,
  FACT_RELATION: 1,
});

function relatedIds(entity, snakeCaseKey, camelCaseKey) {
  const ids = entity?.[snakeCaseKey] ?? entity?.[camelCaseKey];
  return Array.isArray(ids) ? [...new Set(ids.map(String))] : [];
}

function addPositionWeight(adjacencyByExperienceId, firstId, secondId, weight) {
  if (firstId === secondId) return;
  const firstNeighbors = adjacencyByExperienceId.get(firstId);
  const secondNeighbors = adjacencyByExperienceId.get(secondId);
  if (!firstNeighbors || !secondNeighbors) return;
  firstNeighbors.set(secondId, (firstNeighbors.get(secondId) || 0) + weight);
  secondNeighbors.set(firstId, (secondNeighbors.get(firstId) || 0) + weight);
}

export function buildExperienceRelationshipGraph(model, visible = null) {
  const source = Array.isArray(model) ? { experiences: model } : model || {};
  const experiences = source.experiences || [];
  const facts = source.facts || [];
  const existingExperienceIds = new Set(experiences.map(experienceIdOf).filter(Boolean));
  const existingFactIds = new Set(facts.map(factIdOf).filter(Boolean));
  const visibleExperienceIds = visible?.experienceIds
    ? new Set([...visible.experienceIds].map(String))
    : existingExperienceIds;
  const visibleFactIds = visible?.factIds
    ? new Set([...visible.factIds].map(String))
    : existingFactIds;
  const relationshipCountByExperienceId = new Map([...visibleExperienceIds].map((id) => [id, 0]));
  const adjacencyByExperienceId = new Map([...visibleExperienceIds].map((id) => [id, new Map()]));
  const incrementCount = (id) => {
    if (relationshipCountByExperienceId.has(id)) {
      relationshipCountByExperienceId.set(id, relationshipCountByExperienceId.get(id) + 1);
    }
  };
  const addRelationship = (firstId, secondId, positionWeight) => {
    if (firstId === secondId) return;
    incrementCount(firstId);
    incrementCount(secondId);
    addPositionWeight(adjacencyByExperienceId, firstId, secondId, positionWeight);
  };

  const parentEdges = new Set();
  experiences.forEach((experience) => {
    const childId = experienceIdOf(experience);
    if (!visibleExperienceIds.has(childId) || !existingExperienceIds.has(childId)) return;
    relatedIds(experience, "parent_experience_ids", "parentExperienceIds").forEach((parentId) => {
      if (parentId === childId || !visibleExperienceIds.has(parentId) || !existingExperienceIds.has(parentId)) return;
      const edgeIds = [childId, parentId].sort();
      const edgeKey = JSON.stringify(edgeIds);
      if (parentEdges.has(edgeKey)) return;
      parentEdges.add(edgeKey);
      addRelationship(childId, parentId, RELATIONSHIP_POSITION_WEIGHT.PARENT_CHILD);
    });
  });

  const experienceIdsByFactId = new Map();
  facts.forEach((fact) => {
    const factId = factIdOf(fact);
    if (!visibleFactIds.has(factId) || !existingFactIds.has(factId)) return;
    const experienceIds = experienceIdsByFactId.get(factId) || new Set();
    relatedIds(fact, "experience_ids", "experienceIds").forEach((experienceId) => {
      if (visibleExperienceIds.has(experienceId) && existingExperienceIds.has(experienceId)) {
        experienceIds.add(experienceId);
      }
    });
    experienceIdsByFactId.set(factId, experienceIds);
  });
  experienceIdsByFactId.forEach((experienceIds) => {
    const owners = [...experienceIds].sort();
    owners.forEach(incrementCount);
    for (let first = 0; first < owners.length; first += 1) {
      for (let second = first + 1; second < owners.length; second += 1) {
        addPositionWeight(adjacencyByExperienceId, owners[first], owners[second], RELATIONSHIP_POSITION_WEIGHT.FACT_RELATION);
      }
    }
  });

  const visibleTypeById = new Map();
  [...visibleExperienceIds].forEach((id) => {
    if (existingExperienceIds.has(id)) visibleTypeById.set(id, "EXPERIENCE");
  });
  [...visibleFactIds].forEach((id) => {
    if (existingFactIds.has(id)) visibleTypeById.set(id, "FACT");
  });
  const linkEdges = new Set();
  (source.links || []).forEach((link, linkIndex) => {
    const linkId = linkIdOf(link) || String(linkIndex);
    const endpoints = relatedIds(link, "related_ids", "relatedIds")
      .filter((id) => visibleTypeById.has(id))
      .sort();
    for (let first = 0; first < endpoints.length; first += 1) {
      for (let second = first + 1; second < endpoints.length; second += 1) {
        const fromId = endpoints[first];
        const toId = endpoints[second];
        const edgeKey = JSON.stringify([linkId, fromId, toId]);
        if (linkEdges.has(edgeKey)) continue;
        const fromType = visibleTypeById.get(fromId);
        const toType = visibleTypeById.get(toId);
        if (fromType === "EXPERIENCE" && toType === "EXPERIENCE") {
          linkEdges.add(edgeKey);
          addRelationship(fromId, toId, RELATIONSHIP_POSITION_WEIGHT.EXPERIENCE_LINK);
        } else if (fromType === "FACT" && toType === "FACT") {
          const owners = new Set([
            ...(experienceIdsByFactId.get(fromId) || []),
            ...(experienceIdsByFactId.get(toId) || []),
          ]);
          if (owners.size === 0) continue;
          linkEdges.add(edgeKey);
          [...owners].forEach(incrementCount);
          const sortedOwners = [...owners].sort();
          for (let owner = 0; owner < sortedOwners.length; owner += 1) {
            for (let neighbor = owner + 1; neighbor < sortedOwners.length; neighbor += 1) {
              addPositionWeight(
                adjacencyByExperienceId,
                sortedOwners[owner],
                sortedOwners[neighbor],
                RELATIONSHIP_POSITION_WEIGHT.FACT_RELATION,
              );
            }
          }
        }
      }
    }
  });

  return { relationshipCountByExperienceId, adjacencyByExperienceId };
}
