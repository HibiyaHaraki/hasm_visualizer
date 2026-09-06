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
- `sampleModels.js` — demo `.hasm` models for local development
- `visualizer-design.css` — component styles
- `index.js` — barrel export

## Dependencies

This folder only depends on sibling `hasm_color_pattern` and `hasm_logger` folders via relative imports (`../hasm_color_pattern`, `../hasm_logger`). When consuming this repo as a submodule, place it alongside those two at the same depth (e.g. `src/hasm_visualizer`, `src/hasm_color_pattern`, `src/hasm_logger`).

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
| `labels` | built-in English | Overrides for toolbar labels and the large-package scope prompt. |
| `model` | `null` | External HASM model. When omitted, the bundled sample selector is shown instead. Accepts both camelCase and snake_case entity keys. |
| `computeLayout` | `null` | `(scopedModel, filter, { isFilterUpdate }) => payload \| Promise<payload>`. Defaults to the bundled `computeVisualizerLayoutJS`. Rejections are left to the host to present. |
| `onSelectNode` | `null` | Called on node click. When supplied, the built-in node inspector is suppressed. |
| `maxRenderedNodes` | `4000` | Render budget. Surplus FACT nodes are trimmed and a warning names how many were withheld. |
| `scopePromptThreshold` | `2000` | Above this entity count an unscoped model is not laid out; a PERSON/EXPERIENCE selection is requested first. |
| `factDatesById` | derived | `Map<factId, date>` used for Z-axis tick labels. |
| `headerSlot` / `toolbarSlot` / `overlaySlot` | `null` | Host chrome rendered above the toolbar, at the end of the toolbar, and over the graph stage. |

## Large package handling

Scope selection narrows the **model** before layout rather than trimming geometry afterwards, so neither the layout engine nor the GPU ever sees the whole package:

- `scopeModel` keeps the selected EXPERIENCEs plus their ancestors and descendants, the FACTs on those branches, the owning PERSONs, and only LINKs fully inside the scope.
- The EXPERIENCE option list is filtered by the PERSON selection.
- Z-axis tick labels are sampled to at most 60 and their textures are cached; all FACT commits share one geometry.

## Suggested integration after adding as submodule

1. Add this repository as a submodule at `src/hasm_visualizer` in the consuming project.
2. Ensure `src/hasm_color_pattern` and `src/hasm_logger` are present as siblings.
3. Import `HasmVisualizerComponent` from the submodule path.
