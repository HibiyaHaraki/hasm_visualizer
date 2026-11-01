import React from 'react';
import { positionKey, ensureReadableColor } from './threeCommitGraph.js';

export function experienceAtNode(payload, node) {
  if (!node || node.entityType !== 'FACT') return null;
  const key = positionKey(node.x, node.y);
  return payload?.nodes3d.find((candidate) => candidate.entityType === 'EXPERIENCE'
    && positionKey(candidate.x, candidate.y) === key) || null;
}

export function ExperienceBadge({ experience, color, theme, inline = false, href, onSelect }) {
  if (!experience) return null;
  const Tag = href ? 'a' : 'span';
  return <Tag className={`badge HasmVisualizer_ExperienceBadge${inline ? ' HasmVisualizer_ExperienceBadgeInline' : ''}`} title={experience.label}
    href={href} onClick={href && onSelect ? (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect(experience);
    } : undefined}
    style={{ backgroundColor: color, color: ensureReadableColor(theme.textColor, color) }}>
    {experience.label}
  </Tag>;
}
