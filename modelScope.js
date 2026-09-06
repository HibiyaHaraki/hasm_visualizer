// Scope helpers for limiting a HASM model to a PERSON / EXPERIENCE selection before layout.
//
// Large packages (tens of thousands of entities) cannot be laid out or rendered whole, so the
// visualizer narrows the model first and only then computes geometry. Accessors read both the
// snake_case shape used by the bundled sample models and the camelCase shape returned by the
// Tauri backend, so the same component works in either host.

export const EMPTY_SCOPE = { personIds: [], experienceIds: [] };

function readId(entity, ...keys) {
  for (const key of keys) {
    const value = entity?.[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function readIdList(entity, ...keys) {
  for (const key of keys) {
    const value = entity?.[key];
    if (Array.isArray(value)) return value.map(String);
  }
  return [];
}

export const personIdOf = (person) => readId(person, "person_id", "personId", "id");
export const experienceIdOf = (experience) => readId(experience, "experience_id", "experienceId", "id");
export const factIdOf = (fact) => readId(fact, "fact_id", "factId", "id");
export const linkIdOf = (link) => readId(link, "link_id", "linkId", "id");

const personNameOf = (person) => readId(person, "person_name", "personName", "name") || personIdOf(person);
const experienceNameOf = (experience) => readId(experience, "experience_name", "experienceName", "name") || experienceIdOf(experience);
const ownerIdOf = (experience) => readId(experience, "person_id", "personId");
const parentIdsOf = (experience) => readIdList(experience, "parent_experience_ids", "parentExperienceIds");
const factExperienceIdsOf = (fact) => readIdList(fact, "experience_ids", "experienceIds");
const factPersonIdsOf = (fact) => readIdList(fact, "person_ids", "personIds");
const relatedIdsOf = (link) => readIdList(link, "related_ids", "relatedIds");

export function countModelEntities(model) {
  return (model?.people?.length || 0)
    + (model?.experiences?.length || 0)
    + (model?.facts?.length || 0)
    + (model?.links?.length || 0);
}

export function listPersonOptions(model) {
  return (model?.people || []).map((person) => ({ id: personIdOf(person), label: personNameOf(person) }));
}

/// EXPERIENCE options are narrowed by the PERSON selection so the two controls compose.
export function listExperienceOptions(model, personIds = []) {
  const owners = new Set(personIds.map(String));
  return (model?.experiences || [])
    .filter((experience) => owners.size === 0 || owners.has(ownerIdOf(experience)))
    .map((experience) => ({ id: experienceIdOf(experience), label: experienceNameOf(experience), personId: ownerIdOf(experience) }));
}

export function isEmptyScope(scope) {
  return !scope || ((scope.personIds?.length || 0) === 0 && (scope.experienceIds?.length || 0) === 0);
}

function expandExperienceSelection(experiences, seedIds) {
  const byId = new Map(experiences.map((experience) => [experienceIdOf(experience), experience]));
  const childrenByParent = new Map();
  experiences.forEach((experience) => {
    parentIdsOf(experience).forEach((parentId) => {
      const children = childrenByParent.get(parentId) || [];
      children.push(experienceIdOf(experience));
      childrenByParent.set(parentId, children);
    });
  });

  // Ancestors keep branch/merge lines connected; descendants keep the selected story whole.
  const selected = new Set();
  const pending = [...seedIds];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || selected.has(current)) continue;
    selected.add(current);
    parentIdsOf(byId.get(current)).forEach((parentId) => pending.push(parentId));
    (childrenByParent.get(current) || []).forEach((childId) => pending.push(childId));
  }
  return selected;
}

/// Returns a model narrowed to the selected PERSONs and EXPERIENCEs. An empty scope returns the
/// input model unchanged so callers can pass the result straight into layout either way.
export function scopeModel(model, scope) {
  if (!model || isEmptyScope(scope)) return model;

  const personIds = new Set((scope.personIds || []).map(String));
  const experiences = model.experiences || [];

  const seedExperienceIds = new Set((scope.experienceIds || []).map(String));
  if (personIds.size > 0 && seedExperienceIds.size === 0) {
    experiences.forEach((experience) => {
      if (personIds.has(ownerIdOf(experience))) seedExperienceIds.add(experienceIdOf(experience));
    });
  }
  const selectedExperienceIds = expandExperienceSelection(experiences, [...seedExperienceIds]);

  const scopedExperiences = experiences.filter((experience) => selectedExperienceIds.has(experienceIdOf(experience)));
  const scopedFacts = (model.facts || []).filter((fact) => {
    if (factExperienceIdsOf(fact).some((id) => selectedExperienceIds.has(id))) return true;
    return personIds.size > 0 && factPersonIdsOf(fact).some((id) => personIds.has(id));
  });

  const keptPersonIds = new Set(personIds);
  if (keptPersonIds.size === 0) {
    scopedExperiences.forEach((experience) => keptPersonIds.add(ownerIdOf(experience)));
    scopedFacts.forEach((fact) => factPersonIdsOf(fact).forEach((id) => keptPersonIds.add(id)));
  }
  const scopedPeople = (model.people || []).filter((person) => keptPersonIds.has(personIdOf(person)));

  const keptEntityIds = new Set([
    ...scopedPeople.map(personIdOf),
    ...scopedExperiences.map(experienceIdOf),
    ...scopedFacts.map(factIdOf),
  ]);
  const scopedLinks = (model.links || []).filter((link) => {
    const related = relatedIdsOf(link);
    return related.length > 0 && related.every((id) => keptEntityIds.has(id));
  });

  return { ...model, people: scopedPeople, experiences: scopedExperiences, facts: scopedFacts, links: scopedLinks };
}
