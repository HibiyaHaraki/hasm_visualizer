# Entity visualization and hover behavior

This specification covers both renderers in `hasm_visualizer`. Geometry is
shared even when a host supplies a layout through `computeLayout`.

## Entities

| Entity | 3D | 2D |
| --- | --- | --- |
| PERSON | Not drawn. Used for ownership and scope selection. | Same. |
| EXPERIENCE | A colored timeline at a fixed XY position, with time along Z. The name is displayed at the branch start. | A colored vertical lane with its name in the fixed header. |
| FACT | A solid sphere on each directly registered EXPERIENCE; a hollow ring on every recursively inherited ancestor EXPERIENCE. | A solid circle for direct registration and a hollow circle for ancestor reflection, aligned with the corresponding FACT table row. |
| LINK | A straight dashed line between the endpoints described below. | The same rule, using SVG paths without a filled surface. |

EXPERIENCE timelines run from their earliest to latest reflected or direct FACT.
A timeline with one FACT has a zero-length span; an EXPERIENCE without FACTs
has no timeline to attach a LINK to. Parent/child branch-out and merge connectors
remain solid curves and are not LINKs.

Each recursively reflected FACT retains the original FACT ID and timestamp.
Reflections are not additional events. A FACT without an EXPERIENCE uses the
fallback lane. PERSON-related LINKs are not drawn.

Colors derive from the supplied HASM theme, with readable contrast and a
distinct hue per EXPERIENCE. Direct and reflected FACTs use their lane's hue.
3D time coordinates follow the selected time scale and Z scale. 2D always uses
equally spaced, newest-first FACT rows; Z scale changes the row height.

## LINK endpoints

Every unordered pair of distinct renderable FACT/EXPERIENCE IDs in a LINK's
`related_ids` / `relatedIds` is rendered independently. Duplicate IDs are
collapsed in first-appearance order. PERSON, missing IDs, and EXPERIENCEs
without timelines are excluded without discarding other valid pairs.
Four eligible endpoints therefore produce six segments. Each segment keeps
the original LINK ID so selection opens the same ticket from any segment.
The first entry in each pair is the source and the second is the target.
Endpoint order is stable, including for EXPERIENCE–EXPERIENCE pairs.

“Nearest” means minimum distance **on the displayed screen**, measured in
pixels, not distance in the unprojected 3D model.

| Pair | Endpoints |
| --- | --- |
| FACT–FACT | Connect a directly registered instance of each FACT. Ancestor reflections do not move the line's endpoints. |
| EXPERIENCE–FACT (either order) | Connect the FACT to the nearest point on the visible portion of the EXPERIENCE timeline. |
| EXPERIENCE–EXPERIENCE | Start at the point on the source's visible timeline nearest the center of the drawing viewport. End at the point on the target's visible timeline nearest that starting point. |

Endpoints can be anywhere along a timeline, not just at FACT markers. If there
are multiple equally near points, the first point along the timeline is used.
If a FACT has multiple direct registrations, the last direct instance in the
layout is the representative. If only reflected instances survive the render
budget, the first surviving reflection is used instead.

The visible portion is clipped to the current viewport:

- In 3D this includes the camera's side, near, and far planes. Perspective
  interpolation keeps the chosen point on the actual timeline.
- In 2D this excludes the fixed header and accounts for synchronized vertical
  scrolling and clipping/horizontal scrolling by containing panels.
- Camera changes, scrolling, and resizing recompute the attachment points.
- If a required EXPERIENCE timeline is missing or entirely outside the viewport,
  the LINK is hidden until it becomes visible. A FACT on or behind the 3D camera
  plane cannot supply a screen-space target for an EXPERIENCE attachment.
- Missing/scoped-out endpoints are not drawn. FACT–FACT lines are clipped by
  the renderer normally.

No triangles, rectangles, membranes, or artificial lateral offsets are used,
even for older backend payloads containing `RECT`, `TRIANGLE`, or `MEMBRANE`
metadata. Timelines in the payload (`BRANCH` lines) are authoritative. Coincident
endpoints produce a zero-length line, not a fabricated offset or surface.

## Hover and selection

| Hover target | Highlight behavior |
| --- | --- |
| EXPERIENCE timeline | Highlight that EXPERIENCE and every LINK with its ID as an endpoint. |
| Direct FACT | Highlight all displayed instances of the same FACT, the timeline under the hovered marker, and all LINKs with that FACT ID as an endpoint. |
| Recursively reflected FACT | Exactly the same FACT/LINK highlighting as the direct instance, including FACT–FACT and EXPERIENCE–FACT LINKs. The timeline under the reflected marker is highlighted, not an unrelated direct-registration timeline. |
| LINK | Highlight its endpoint entities and the LINKs attached to those entities. |
| FACT table row (2D) | Highlight the FACT's displayed instances and endpoint LINKs as for a marker. The representative FACT's timeline is highlighted. |

LINK highlighting uses entity IDs, never marker position or `isDirectFact`.
Highlighting a FACT's supporting timeline does not additionally highlight
unrelated LINKs attached only to that EXPERIENCE.

Highlights use the theme's readable text color. LINK opacity increases from
0.7 to 1. In 2D a hovered hollow FACT circle is temporarily filled; in 3D its
ring shape remains unchanged. Leaving a marker/timeline/LINK clears highlighting;
leaving the 3D canvas clears it as well.
The hollow center of a reflected marker is also a FACT hit target in both views,
so its supporting timeline cannot intercept that hover.

Hover tooltips show entity type/name and endpoint LINK descriptions. Pointer
screen coordinates are stored separately from model coordinates so showing a
tooltip cannot change which EXPERIENCE is highlighted. Clicking invokes the
host's `onSelectNode`, or shows the built-in inspector when no callback exists.
EXPERIENCE header labels and PERSON scope entries are not graph hover targets.

## Scope and compatibility

Scope selection happens before layout. Ancestors are retained for connectivity,
and FACTs propagate recursively through those retained ancestors. The 3D render
budget may withhold FACT instances and LINKs whose endpoint IDs no longer exist.
These limits do not turn LINKs into membranes or duplicate reflected events.

Hosts can translate toolbar, tooltip-adjacent, and legend copy using the existing
`labels` prop. The default LINK legend describes dashed lines; host-provided
`labels.linkLegend` should describe the same behavior.

## Validation

From a consuming project's root with React and Three.js installed:

```sh
node --test src/hasm_visualizer/test/*.test.js
```

Tests cover viewport clipping, perspective and aspect-ratio correctness,
non-linear-time to 2D-row mapping, legacy layout input, recursive FACT hover,
scroll updates, and dashed-only SVG output.
