import React from 'react';
import { positionKey, ensureReadableColor } from './threeCommitGraph.js';

export function experienceAtNode(payload, node) {
  if (!node || node.entityType !== 'FACT') return null;
  const key = positionKey(node.x, node.y);
  return payload?.nodes3d.find((candidate) => candidate.entityType === 'EXPERIENCE'
    && positionKey(candidate.x, candidate.y) === key) || null;
}

export function ExperienceBadge({ experience, color, theme }) {
  if (!experience) return null;
  return <span className="badge HasmVisualizer_ExperienceBadge" title={experience.label}
    style={{ backgroundColor: color, color: ensureReadableColor(theme.textColor, color) }}>
    {experience.label}
  </span>;
}
