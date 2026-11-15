import React, { useMemo } from 'react';
import { buildExperienceColorMaps, buildEntityColors, positionKey } from './threeCommitGraph.js';
import { experienceIdOf, factIdOf, linkIdOf } from './modelScope.js';

const ids = (entity, snake, camel) => (entity?.[snake] || entity?.[camel] || []).map(String);

// SEQ-MD-03: project each distinct LINK endpoint onto its directly associated EXPERIENCEs.
function distributionGeometry(payload, model) {
  const nodes = payload.nodes3d.filter((node) => node.entityType === 'EXPERIENCE');
  const byId = new Map(nodes.map((node) => [String(node.id), node]));
  const endpoints = new Map(nodes.map((node) => [String(node.id), [String(node.id)]]));
  (model?.facts || []).forEach((fact) => {
    endpoints.set(factIdOf(fact), [...new Set(ids(fact, 'experience_ids', 'experienceIds'))].filter((id) => byId.has(id)));
  });
  const parents = [];
  (model?.experiences || []).forEach((experience) => {
    const child = byId.get(experienceIdOf(experience));
    if (!child) return;
    ids(experience, 'parent_experience_ids', 'parentExperienceIds').forEach((id) => {
      const parent = byId.get(id);
      if (parent && parent.id !== child.id) parents.push({ parent, child });
    });
  });
  const links = [];
  (model?.links || []).forEach((link) => {
    const related = [...new Set(ids(link, 'related_ids', 'relatedIds'))];
    const seen = new Set();
    for (let i = 0; i < related.length; i += 1) {
      for (let j = i + 1; j < related.length; j += 1) {
        for (const from of endpoints.get(related[i]) || []) {
          for (const to of endpoints.get(related[j]) || []) {
            const key = JSON.stringify([from, to].sort());
            if (seen.has(key)) continue;
            seen.add(key);
            links.push({ id: linkIdOf(link), name: link.link_name || link.linkName, from: byId.get(from), to: byId.get(to), key });
          }
        }
      }
    }
  });
  const groups = new Map();
  links.forEach((link) => {
    const group = groups.get(link.key) || [];
    group.push(link);
    groups.set(link.key, group);
  });
  groups.forEach((group) => group.forEach((link, index) => {
    const { from, to } = link;
    if (from.id === to.id) {
      const size = 2 + index * 1.5;
      link.path = `M ${from.x} ${-from.y - 0.6} c ${-size} ${-size * 2} ${size} ${-size * 2} 0 0`;
      link.extent = [from.x - size, -from.y - size * 2, from.x + size, -from.y];
    } else {
      const direction = String(from.id) < String(to.id) ? 1 : -1;
      const dx = (to.x - from.x) * direction;
      const dy = (-to.y + from.y) * direction;
      const length = Math.hypot(dx, dy) || 1;
      const offset = (index - (group.length - 1) / 2) * 1.5;
      const cx = (from.x + to.x) / 2 - dy / length * offset;
      const cy = (-from.y - to.y) / 2 + dx / length * offset;
      link.path = `M ${from.x} ${-from.y} Q ${cx} ${cy} ${to.x} ${-to.y}`;
      link.extent = [cx, cy, cx, cy];
    }
  }));
  return { nodes, parents, links };
}

// [REQ-03-FUNC-513] Selectable XY projection of EXPERIENCEs and projected LINKs.
export default function ExperienceDistribution({ payload, model, theme, onSelect, onHover }) {
  const { nodes, parents, links } = useMemo(() => distributionGeometry(payload, model), [payload, model]);
  const { colors, linkColor } = useMemo(() => ({
    colors: buildExperienceColorMaps(payload, theme, model).trunkColorByPositionKey,
    linkColor: buildEntityColors(theme).LINK,
  }), [payload, theme, model]);
  const { labels, viewBox } = useMemo(() => {
    const labelBounds = [];
    const labels = nodes.map((node) => {
      const full = node.label || 'Untitled EXPERIENCE';
      const text = full.length > 18 ? `${full.slice(0, 15)}...` : full;
      const width = text.length * 0.72;
      let box;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const offset = attempt % 2 === 0 ? 1.8 + attempt * 0.7 : -1.2 - (attempt - 1) * 0.7;
        const y = -node.y + offset;
        box = { minX: node.x - width / 2, maxX: node.x + width / 2, minY: y - 0.9, maxY: y + 0.3, y };
        if (!labelBounds.some((other) => box.minX < other.maxX && box.maxX > other.minX
          && box.minY < other.maxY && box.maxY > other.minY)) break;
      }
      labelBounds.push(box);
      return { full, text, y: box.y };
    });
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    nodes.forEach((node) => {
      bounds.minX = Math.min(bounds.minX, node.x);
      bounds.maxX = Math.max(bounds.maxX, node.x);
      bounds.minY = Math.min(bounds.minY, -node.y);
      bounds.maxY = Math.max(bounds.maxY, -node.y);
    });
    links.forEach(({ extent }) => {
      bounds.minX = Math.min(bounds.minX, extent[0]);
      bounds.minY = Math.min(bounds.minY, extent[1]);
      bounds.maxX = Math.max(bounds.maxX, extent[2]);
      bounds.maxY = Math.max(bounds.maxY, extent[3]);
    });
    labelBounds.forEach((box) => {
      bounds.minX = Math.min(bounds.minX, box.minX);
      bounds.maxX = Math.max(bounds.maxX, box.maxX);
      bounds.minY = Math.min(bounds.minY, box.minY);
      bounds.maxY = Math.max(bounds.maxY, box.maxY);
    });
    const { minX, maxX, minY, maxY } = bounds;
    return { labels, viewBox: nodes.length ? `${minX - 9} ${minY - 5} ${maxX - minX + 18} ${maxY - minY + 10}` : '-9 -5 18 10' };
  }, [nodes, links]);
  const activate = (event, node) => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(node);
  };
  return (
    <svg className="HasmVisualizer_Distribution" viewBox={viewBox} role="group" aria-label="EXPERIENCE distribution">
      {parents.map(({ parent, child }, index) => (
        <line key={`parent-${index}`} x1={parent.x} y1={-parent.y} x2={child.x} y2={-child.y}
          stroke={theme.textColor} strokeOpacity="0.5" strokeWidth="0.12" />
      ))}
      {links.map(({ id, name, from, to, path }, index) => {
        const node = { id, entityType: 'LINK', label: name || `${from.label} \u2194 ${to.label}`, x: from.x, y: from.y, z: 0,
          linkedEntityIds: [from.id, to.id] };
        return (
          <g key={`${id}-${index}`} role="button" tabIndex="0" aria-label={`Open LINK: ${node.label}`}
            onClick={(event) => activate(event, node)} onKeyDown={(event) => activate(event, node)}
            onMouseEnter={(event) => onHover(node, event)} onMouseLeave={(event) => onHover(null, event)}>
            <path d={path} fill="none" stroke="transparent" strokeWidth="1.2" />
            <path d={path} fill="none" stroke={linkColor} strokeWidth="0.22" strokeDasharray="0.5 0.35" pointerEvents="none" />
          </g>
        );
      })}
      {nodes.map((node, index) => {
        const label = labels[index];
        return (
          <g key={node.id} role="button" tabIndex="0" aria-label={`Open EXPERIENCE: ${label.full}`}
            onClick={(event) => activate(event, node)} onKeyDown={(event) => activate(event, node)}
            onMouseEnter={(event) => onHover(node, event)} onMouseLeave={(event) => onHover(null, event)}>
            <title>{label.full}</title>
            <circle cx={node.x} cy={-node.y} r="0.65" fill={colors.get(positionKey(node.x, node.y))} />
            <text x={node.x} y={label.y} textAnchor="middle" fill={theme.textColor} fontSize="0.9">
              {label.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
