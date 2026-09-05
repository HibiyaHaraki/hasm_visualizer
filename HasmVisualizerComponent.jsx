import React, { useEffect, useRef, useState } from 'react';
import { createCommitGraph } from './threeCommitGraph.js';
import { createCommitGraph2D } from './twoCommitGraph.js';
import { DEFAULT_LAYOUT_FILTER, nextLayoutFilter, TIME_SCALE_MODES } from './layoutFilter.js';
import { computeVisualizerLayoutJS } from './layoutCalculator.js';
import { SAMPLE_HASM_MODELS } from './sampleModels.js';
import { getPatternById } from '../hasm_color_pattern/src/index.js';
import { createLogger } from '../hasm_logger/src/react/logger.js';
import './visualizer-design.css';

const logger = createLogger('hasm-3d-visualizer');

// Self-contained 3D commit graph demo: computes layout client-side (no Tauri backend required),
// so copying this folder alongside src/hasm_color_pattern and src/hasm_logger is enough to
// reproduce the exact same 3D visualizer anywhere.
export function HasmVisualizerComponent({ colorPattern = 'classic', labels }) {
  const sceneRef = useRef(null);
  const disposeSceneRef = useRef(() => {});
  // Camera/view state is kept per view mode: 2D (orthographic zoom) and 3D (perspective
  // position/quaternion) states are incompatible, so each mode restores only its own state.
  const viewStateByModeRef = useRef({});
  const lastModeRef = useRef('3d');

  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [filter, setFilter] = useState(DEFAULT_LAYOUT_FILTER);
  const [viewMode, setViewMode] = useState('3d');
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const currentSample = SAMPLE_HASM_MODELS[selectedModelIndex] || SAMPLE_HASM_MODELS[0];

  useEffect(() => {
    if (!sceneRef.current) return;

    logger.debug(`Rendering ${viewMode.toUpperCase()} commit graph`, {
      modelName: currentSample.fileName,
      filter,
      pattern: colorPattern,
      viewMode,
    });

    // Compute layout using the client-side JS implementation kept in parity with the Rust backend.
    const layoutPayload = computeVisualizerLayoutJS(currentSample.model, filter);

    // Get theme color palette
    const themeColors = getPatternById(colorPattern).colors;

    // Capture previous camera view state before cleanup, keyed by the mode that created it.
    // Only keep complete states: a state captured from a broken/disposed graph must never be restored.
    if (typeof disposeSceneRef.current?.getViewState === 'function') {
      const captured = disposeSceneRef.current.getViewState();
      const isComplete2D = lastModeRef.current === '2d'
        && Number.isFinite(captured?.zoom)
        && Number.isFinite(captured?.position?.x) && Number.isFinite(captured?.position?.y)
        && Number.isFinite(captured?.target?.x) && Number.isFinite(captured?.target?.y);
      const isComplete3D = lastModeRef.current === '3d'
        && captured?.position && captured?.quaternion && captured?.target;
      if (isComplete2D || isComplete3D) {
        viewStateByModeRef.current[lastModeRef.current] = captured;
      }
    }

    // Clean up previous graph instance
    disposeSceneRef.current();
    lastModeRef.current = viewMode;

    // Instantiate the graph via the 3D or 2D Three.js engine; both share the same layout
    // payload and color derivation, so FACT/EXPERIENCE colors match across modes.
    const createGraph = viewMode === '2d' ? createCommitGraph2D : createCommitGraph;
    disposeSceneRef.current = createGraph(
      sceneRef.current,
      layoutPayload,
      themeColors,
      (node) => {
        setSelectedNode(node);
        logger.info(`Selected ${viewMode.toUpperCase()} node`, { node });
      },
      (node, event) => {
        if (node) {
          setHoveredNode({ ...node, x: event.clientX, y: event.clientY });
        } else {
          setHoveredNode(null);
        }
      },
      undefined,
      viewStateByModeRef.current[viewMode]
    );

    return () => {
      if (typeof disposeSceneRef.current?.getViewState === 'function') {
        const captured = disposeSceneRef.current.getViewState();
        const isComplete = viewMode === '2d'
          ? Number.isFinite(captured?.zoom) && captured?.position && captured?.target
          : Boolean(captured?.position && captured?.quaternion && captured?.target);
        if (isComplete) {
          viewStateByModeRef.current[viewMode] = captured;
        }
      }
      disposeSceneRef.current();
    };
  }, [selectedModelIndex, filter, colorPattern, currentSample, viewMode]);

  return (
    <main className="visualizer-page HasmVisualizer_Container">

      {/* TOOLBAR CONTROLS */}
      <div className="visualizer-toolbar HasmVisualizer_Toolbar">
        <div className="HasmVisualizer_ControlGroup">
          <label className="HasmVisualizer_Label">
            {labels?.sampleModel || 'Example .hasm Package'}:
            <select
              className="HasmVisualizer_Select"
              value={selectedModelIndex}
              onChange={(e) => {
                viewStateByModeRef.current = {};
                setSelectedModelIndex(Number(e.target.value));
                setSelectedNode(null);
              }}
            >
              {SAMPLE_HASM_MODELS.map((sample, idx) => (
                <option key={sample.fileName} value={idx}>
                  📂 {sample.fileName} — {sample.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="HasmVisualizer_ControlGroup">
          <span className="HasmVisualizer_Label">
            {labels?.viewMode || 'View Mode'}:
          </span>
          <div className="HasmVisualizer_ViewToggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`HasmVisualizer_ViewToggleButton${viewMode === '2d' ? ' is-active' : ''}`}
              onClick={() => setViewMode('2d')}
            >
              2D
            </button>
            <button
              type="button"
              className={`HasmVisualizer_ViewToggleButton${viewMode === '3d' ? ' is-active' : ''}`}
              onClick={() => setViewMode('3d')}
            >
              3D
            </button>
          </div>
        </div>

        <div className="HasmVisualizer_ControlGroup">
          <label className="HasmVisualizer_Label">
            {labels?.timeScale || 'Time Scale'}:
            <select
              className="HasmVisualizer_Select"
              value={filter.timeScaleMode}
              onChange={(e) => setFilter(nextLayoutFilter(filter, 'timeScaleMode', e.target.value))}
            >
              {TIME_SCALE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>

          <label className="HasmVisualizer_Label">
            {labels?.zScale || 'Z Scale'}:
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              className="HasmVisualizer_Input"
              value={filter.zScaleFactor}
              onChange={(e) => setFilter(nextLayoutFilter(filter, 'zScaleFactor', e.target.value))}
            />
            <span style={{ fontSize: '0.8rem', minWidth: '32px' }}>{filter.zScaleFactor}x</span>
          </label>
        </div>
      </div>

      {/* GRAPH STAGE (2D or 3D, both rendered with Three.js) */}
      <div className="graph-stage HasmVisualizer_Stage" aria-label={viewMode === '2d' ? '2D Commit Graph' : '3D Commit Graph'}>
        <div className="graph-canvas HasmVisualizer_Canvas" ref={sceneRef} />

        {hoveredNode && (
          <div
            className="graph-tooltip HasmVisualizer_Tooltip"
            style={{ left: hoveredNode.x, top: hoveredNode.y }}
          >
            [{hoveredNode.entityType}] {hoveredNode.label}
          </div>
        )}
      </div>

      {/* LEGEND */}
      <div className="HasmVisualizer_Legend">
        <div className="HasmVisualizer_LegendItem">
          <div className="HasmVisualizer_LegendDot" style={{ background: '#d6b25e' }} />
          PERSON (Box)
        </div>
        <div className="HasmVisualizer_LegendItem">
          <div className="HasmVisualizer_LegendDot" style={{ background: '#68a5d2' }} />
          EXPERIENCE (Box / Timeline Branch)
        </div>
        <div className="HasmVisualizer_LegendItem">
          <div className="HasmVisualizer_LegendDot" style={{ background: '#e08a65' }} />
          FACT (Sphere / Occurred Event)
        </div>
        <div style={{ marginLeft: 'auto', color: 'var(--theme-muted)', fontSize: '0.75rem', fontWeight: 'normal' }}>
          {viewMode === '2d'
            ? '💡 Drag to pan, scroll to zoom, click node to inspect'
            : '💡 Drag to rotate, scroll to zoom, click node to inspect'}
        </div>
      </div>

      {/* NODE INSPECTOR */}
      {selectedNode && (
        <div className="HasmVisualizer_Inspector">
          <div className="HasmVisualizer_InspectorTitle">
            [{selectedNode.entityType}] {selectedNode.label}
          </div>
          <div className="HasmVisualizer_InspectorMeta">
            <span>ID: {selectedNode.id}</span>
            <span>Position 3D: ({selectedNode.x.toFixed(1)}, {selectedNode.y.toFixed(1)}, {selectedNode.z.toFixed(1)})</span>
          </div>
        </div>
      )}
    </main>
  );
}

export default HasmVisualizerComponent;
