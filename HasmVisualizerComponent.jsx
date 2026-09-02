import React, { useEffect, useRef, useState } from 'react';
import { createCommitGraph } from './threeCommitGraph.js';
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
  const viewStateRef = useRef(null);

  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [filter, setFilter] = useState(DEFAULT_LAYOUT_FILTER);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const currentSample = SAMPLE_HASM_MODELS[selectedModelIndex] || SAMPLE_HASM_MODELS[0];

  useEffect(() => {
    if (!sceneRef.current) return;

    logger.debug('Rendering 3D commit graph', {
      modelName: currentSample.fileName,
      filter,
      pattern: colorPattern,
    });

    // Compute layout using the client-side JS implementation kept in parity with the Rust backend.
    const layoutPayload = computeVisualizerLayoutJS(currentSample.model, filter);

    // Get theme color palette
    const themeColors = getPatternById(colorPattern).colors;

    // Capture previous camera view position/target before cleanup
    if (typeof disposeSceneRef.current?.getViewState === 'function') {
      viewStateRef.current = disposeSceneRef.current.getViewState();
    }

    // Clean up previous Three.js instance
    disposeSceneRef.current();

    // Instantiate the 3D graph via the Three.js engine
    disposeSceneRef.current = createCommitGraph(
      sceneRef.current,
      layoutPayload,
      themeColors,
      (node) => {
        setSelectedNode(node);
        logger.info('Selected 3D node', { node });
      },
      (node, event) => {
        if (node) {
          setHoveredNode({ ...node, x: event.clientX, y: event.clientY });
        } else {
          setHoveredNode(null);
        }
      },
      undefined,
      viewStateRef.current
    );

    return () => {
      if (typeof disposeSceneRef.current?.getViewState === 'function') {
        viewStateRef.current = disposeSceneRef.current.getViewState();
      }
      disposeSceneRef.current();
    };
  }, [selectedModelIndex, filter, colorPattern, currentSample]);

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
                viewStateRef.current = null;
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

      {/* 3D GRAPH STAGE */}
      <div className="graph-stage HasmVisualizer_Stage" aria-label="3D Commit Graph">
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
          💡 Drag to rotate, scroll to zoom, click node to inspect
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
