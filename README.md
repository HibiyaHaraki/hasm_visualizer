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
- `threeCommitGraph.js` — Three.js commit graph renderer
- `layoutFilter.js` — layout filter/time-scale state helpers
- `layoutCalculator.js` — JS port of the Rust `calculate_layout` command
- `sampleModels.js` — demo `.hasm` models for local development
- `visualizer-design.css` — component styles
- `index.js` — barrel export

## Dependencies

This folder only depends on sibling `hasm_color_pattern` and `hasm_logger` folders via relative imports (`../hasm_color_pattern`, `../hasm_logger`). When consuming this repo as a submodule, place it alongside those two at the same depth (e.g. `src/hasm_visualizer`, `src/hasm_color_pattern`, `src/hasm_logger`).

## Usage example

```js
import HasmVisualizerComponent from './hasm_visualizer/HasmVisualizerComponent.jsx';
```

## Suggested integration after adding as submodule

1. Add this repository as a submodule at `src/hasm_visualizer` in the consuming project.
2. Ensure `src/hasm_color_pattern` and `src/hasm_logger` are present as siblings.
3. Import `HasmVisualizerComponent` from the submodule path.
