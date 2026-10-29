# hasm_visualizer

Self-contained 3D commit-graph visualizer component shared by HASM projects.

## Project status

This is a public, early-stage project maintained as a solo development effort. The API and repository structure may change as the project matures. Contributions and pull requests are currently paused.

## License

This project is licensed under the [MIT License](LICENSE).

## Purpose

Centralizes the 3D visualizer so multiple HASM projects can reuse the same implementation instead of duplicating it.

## Layout

- `HasmVisualizerComponent.jsx` — React component entry point
- `threeCommitGraph.js` — Three.js commit graph renderer and render-budget helper
- `twoCommitGraph.js` — 2D commit graph renderer
- `modelScope.js` — PERSON / EXPERIENCE scope narrowing for large packages
- `layoutFilter.js` — layout filter/time-scale state helpers
- `layoutCalculator.js` — JS port of the Rust `calculate_layout` command
- `graph2DLayout.js` — row and lane math shared by the 2D graph and FACT table
- `linkGeometry.js` — viewport-aware LINK attachment points shared by both renderers
- [`doc/visualization.md`](doc/visualization.md) — entity rendering, LINK endpoints, and hover rules
- `sampleModels.js` — demo `.hasm` models for local development
- `visualizer-design.css` — component styles
- `index.js` — barrel export

## Dependencies

This folder only depends on sibling `hasm_color_pattern` and `hasm_logger` folders via relative imports (`../hasm_color_pattern`, `../hasm_logger`). When consuming this repo as a submodule, place it alongside those two at the same depth (e.g. `src/hasm_visualizer`, `src/hasm_color_pattern`, `src/hasm_logger`).

Controls in `HasmVisualizerComponent.jsx` also carry Bootstrap CSS utility class names (`form-select`, `form-range`, `btn`, `btn-outline-secondary`, `btn-group`) alongside the component's own `HasmVisualizer_*` classes, so it visually matches a host app that loads Bootstrap's CSS. This does not add a dependency: no `react-bootstrap`/`bootstrap` package is imported, the elements stay plain native `<select>`/`<button>`/`<input>`, and the Bootstrap class names are inert no-ops if the host never loads Bootstrap's CSS.

## Usage example

Standalone demo over the bundled sample packages:

```js
import HasmVisualizerComponent from './hasm_visualizer/HasmVisualizerComponent.jsx';

<HasmVisualizerComponent colorPattern="classic" />
```

Driving a host application's own package, with layout computed by a backend:

```jsx
<HasmVisualizerComponent
  colorPattern={activePatternId}
  model={model}
  computeLayout={(scopedModel, filter, { isFilterUpdate }) => invoke('compute_visualizer_layout', { model: scopedModel, filter })}
  onSelectNode={(node) => openTicket(node.entityType, node.id)}
  headerSlot={header}
  toolbarSlot={actions}
  overlaySlot={progressOverlay}
/>
```

### Props

| Prop | Default | Purpose |
| --- | --- | --- |
| `colorPattern` | `'classic'` | `hasm_color_pattern` id driving every derived color. |
| `labels` | built-in English | Overrides for toolbar labels (`personScope`, `experienceScope`, `selectAll`, `selectNone`, `clearScope`, `scopeHint`, `timeScale`, `zScale`, `sampleModel`, `viewMode`, `factTitle`, `factTime`) and the large-package `scopePrompt`. |
| `model` | `null` | External HASM model. When omitted, the bundled sample selector is shown instead. Accepts both camelCase and snake_case entity keys. |
| `computeLayout` | `null` | `(scopedModel, filter, { isFilterUpdate }) => payload \| Promise<payload>`. Defaults to the bundled `computeVisualizerLayoutJS`. Rejections are left to the host to present. |
| `onSelectNode` | `null` | Called on node click. When supplied, the built-in node inspector is suppressed. |
| `maxRenderedNodes` | `4000` | Render budget. Surplus FACT nodes are trimmed and a warning names how many were withheld. |
| `scopePromptThreshold` | `2000` | Above this entity count an unscoped model is not laid out; a PERSON/EXPERIENCE selection is requested first. |
| `factDatesById` | derived | `Map<factId, date>` used for Z-axis tick labels. |
| `headerSlot` / `toolbarSlot` / `overlaySlot` | `null` | Host chrome rendered above the toolbar, at the end of the toolbar, and over the graph stage. |

## Large package handling

Scope selection narrows the **model** before layout rather than trimming geometry afterwards, so neither the layout engine nor the GPU ever sees the whole package:

- Both scope controls are multi-select. A plain click **toggles** one entry and keeps the rest of the selection, so any number of PERSONs and EXPERIENCEs can be combined without holding Ctrl/Cmd. Modifier-click and keyboard range selection still behave natively, and each control has **All** / **None** buttons.
- The PERSON control is hidden when the package has fewer than two PERSONs; EXPERIENCE selection remains available.
- PERSON selection sets the pool; EXPERIENCE selection narrows within it. EXPERIENCE entries that stop belonging to any selected PERSON are dropped automatically.
- `scopeModel` keeps the selected EXPERIENCEs and their descendants, then adds ancestors for connectivity without expanding into siblings. FACTs follow the retained branches. PERSON-only FACTs are included only when no explicit EXPERIENCE selection is applied, so PERSON selection cannot override EXPERIENCE narrowing.
- The EXPERIENCE option list is filtered by the PERSON selection.
- Z-axis tick labels are sampled to at most 60 and their textures are cached; FACT markers share their geometries.

## Extended Commit Graph rendering

- 3D uses the XY plane for EXPERIENCE distribution and Z for time. EXPERIENCE branches stay at fixed XY positions; solid FACT markers are recorded events and hollow markers are recursive reflections on ancestor branches.
- 2D uses the horizontal axis for EXPERIENCE distribution and vertical rows for time, with the same solid/hollow FACT distinction.
- Both views draw every supported LINK as a straight dashed line. FACT-to-EXPERIENCE LINKs attach to the nearest visible timeline point; EXPERIENCE-to-EXPERIENCE LINKs start nearest the viewport center and attach to the nearest point on the other visible timeline. Attachments update when the view changes.
- Hovering a FACT highlights its endpoint LINKs even on a recursively reflected ancestor marker. See the [visualization specification](doc/visualization.md) for all entity and hover rules.
- The 2D graph width uses the shared lane geometry, placing the FACT/Time table immediately after the rightmost lane's label area. Many lanes cause horizontal scrolling rather than clipping or a percentage-based empty gap.
- Z scale multiplies 2D row height (30px at 1x) and the matching SVG coordinates together. Rows remain newest-first and equally spaced regardless of time mode; 3D continues to apply Z scale to the layout's time coordinates. A failed layout retains the previous row scale.
- PERSONs are used for ownership and scope selection, not rendered as graph nodes. PERSON-related LINKs are not drawn.
- If the host cannot initialize WebGL or loses its context, the component logs the failure and falls back to the SVG-based 2D view.

## Suggested integration after adding as submodule

1. Add this repository as a submodule at `src/hasm_visualizer` in the consuming project.
2. Ensure `src/hasm_color_pattern` and `src/hasm_logger` are present as siblings.
3. Import `HasmVisualizerComponent` from the submodule path.
