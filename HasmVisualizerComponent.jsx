import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createCommitGraph, buildEntityColors, buildExperienceColorMaps, positionKey, limitRenderedNodes, DEFAULT_MAX_RENDERED_NODES } from './threeCommitGraph.js';
import { createCommitGraph2D } from './twoCommitGraph.js';
import { computeFactRowIndexById, computeLaneIndexByKey, ROW_HEIGHT_PX, TABLE_HEADER_HEIGHT_PX } from './graph2DLayout.js';
import { DEFAULT_LAYOUT_FILTER, nextLayoutFilter, TIME_SCALE_MODES } from './layoutFilter.js';
import { computeVisualizerLayoutJS } from './layoutCalculator.js';
import { SAMPLE_HASM_MODELS } from './sampleModels.js';
import {
  EMPTY_SCOPE,
  countModelEntities,
  factIdOf,
  isEmptyScope,
  listExperienceOptions,
  listPersonOptions,
  scopeModel,
} from './modelScope.js';
import { getPatternById } from '../hasm_color_pattern/src/index.js';
import { createLogger } from '../hasm_logger/src/react/logger.js';
import './visualizer-design.css';

const logger = createLogger('hasm-3d-visualizer');

// Above this entity count an unscoped model is not laid out at all; the user is asked for a
// PERSON / EXPERIENCE selection first, so a 60,000-entity package cannot freeze the UI.
const DEFAULT_SCOPE_PROMPT_THRESHOLD = 2000;

const selectedValues = (element) => Array.from(element.selectedOptions, (option) => option.value).filter(Boolean);

// 3D commit graph surface. Without a `model` prop it runs as a self-contained demo over the bundled
// sample packages; with `model` and `computeLayout` it renders a host application's live package,
// so copying this folder alongside src/hasm_color_pattern and src/hasm_logger reproduces both.
export function HasmVisualizerComponent({
  colorPattern = 'classic',
  labels,
  model = null,
  computeLayout = null,
  onSelectNode = null,
  maxRenderedNodes = DEFAULT_MAX_RENDERED_NODES,
  scopePromptThreshold = DEFAULT_SCOPE_PROMPT_THRESHOLD,
  factDatesById = null,
  headerSlot = null,
  toolbarSlot = null,
  overlaySlot = null,
}) {
  const sceneRef = useRef(null);
  const disposeSceneRef = useRef(() => {});
  // Camera/view state is kept per view mode: 2D (orthographic zoom) and 3D (perspective
  // position/quaternion) states are incompatible, so each mode restores only its own state.
  const viewStateByModeRef = useRef({});
  const lastModeRef = useRef('3d');
  const hasComputedRef = useRef(false);

  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [filter, setFilter] = useState(DEFAULT_LAYOUT_FILTER);
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [viewMode, setViewMode] = useState('3d');
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const currentSample = SAMPLE_HASM_MODELS[selectedModelIndex] || SAMPLE_HASM_MODELS[0];
  const activeModel = model || currentSample.model;
  const showSampleSelector = !model;

  const personOptions = useMemo(() => listPersonOptions(activeModel), [activeModel]);
  const experienceOptions = useMemo(() => listExperienceOptions(activeModel, scope.personIds), [activeModel, scope.personIds]);
  const scopedModel = useMemo(() => scopeModel(activeModel, scope), [activeModel, scope]);
  const totalEntityCount = useMemo(() => countModelEntities(activeModel), [activeModel]);
  const scopedEntityCount = useMemo(() => countModelEntities(scopedModel), [scopedModel]);
  const needsScope = isEmptyScope(scope) && totalEntityCount > scopePromptThreshold;

  // Layout is computed once per model/filter/scope change and shared by the graph effect below and
  // the 2D FACT table, so the table rows stay aligned with the graph lanes.
  const [layoutPayload, setLayoutPayload] = useState(null);
  useEffect(() => {
    if (needsScope) {
      setLayoutPayload(null);
      return undefined;
    }
    logger.debug('Computing visualizer layout', { filter, scope, entityCount: scopedEntityCount });

    let active = true;
    const isFilterUpdate = hasComputedRef.current;
    // Compute layout through the host when supplied, otherwise via the client-side JS
    // implementation kept in parity with the Rust backend.
    const request = computeLayout
      ? computeLayout(scopedModel, filter, { isFilterUpdate })
      : computeVisualizerLayoutJS(scopedModel, filter);

    Promise.resolve(request)
      .then((payload) => {
        if (!active || !payload) return;
        hasComputedRef.current = true;
        setLayoutPayload(payload);
      })
      .catch((error) => {
        // The host owns error presentation and routing; keep the previous scene mounted.
        logger.error('Visualizer layout failed', error);
      });

    return () => { active = false; };
  }, [scopedModel, filter, needsScope, computeLayout, scopedEntityCount, scope]);

  const { payload: renderPayload, warning: budgetWarning } = useMemo(
    () => (layoutPayload ? limitRenderedNodes(layoutPayload, maxRenderedNodes) : { payload: null, warning: '' }),
    [layoutPayload, maxRenderedNodes],
  );

  // 2D-mode helpers: fact rows (newest first, matching graph rows) and the lane count that
  // drives the responsive left/right width split (more parallel EXPERIENCEs -> wider graph pane).
  const factRows = useMemo(() => {
    if (!renderPayload) return [];
    const factNodeById = new Map();
    renderPayload.nodes3d.forEach((node) => {
      if (node.entityType === 'FACT' && !factNodeById.has(node.id)) factNodeById.set(node.id, node);
    });
    const rows = [];
    computeFactRowIndexById(renderPayload).forEach((rowIndex, id) => {
      const node = factNodeById.get(id);
      if (node) rows[rowIndex] = node;
    });
    return rows.filter(Boolean);
  }, [renderPayload]);
  const laneCount = useMemo(() => (renderPayload ? computeLaneIndexByKey(renderPayload).size : 1), [renderPayload]);
  const graphPaneWidthPercent = Math.min(72, Math.max(30, laneCount * 12));

  // Shared vertical scroll offset between the 2D commit graph and the FACT table, so the dot for a
  // FACT and its table row stay at the same height no matter which pane is scrolled.
  const [scrollTop2D, setScrollTop2D] = useState(0);
  const factTableRef = useRef(null);
  const maxScrollTop2D = Math.max(
    0,
    factRows.length * ROW_HEIGHT_PX + TABLE_HEADER_HEIGHT_PX - 360
  );
  const clampScroll2D = (value) => Math.min(Math.max(value, 0), maxScrollTop2D);
  useEffect(() => {
    if (viewMode !== '2d') return;
    if (factTableRef.current) factTableRef.current.scrollTop = scrollTop2D;
    disposeSceneRef.current?.setScrollTop?.(scrollTop2D);
  }, [scrollTop2D, viewMode]);

  // Mirror table-row hover onto the 2D graph so the corresponding FACT dots are emphasized.
  useEffect(() => {
    if (viewMode !== '2d') return;
    disposeSceneRef.current?.setHighlight?.(hoveredNode ?? null);
  }, [hoveredNode, viewMode]);

  const themeColors = getPatternById(colorPattern).colors;
  const experienceColors = useMemo(() => {
    if (!renderPayload) return null;
    return {
      entityColors: buildEntityColors(themeColors),
      ...buildExperienceColorMaps(renderPayload, themeColors),
    };
  }, [renderPayload, colorPattern]);
  const resolvedFactDates = useMemo(() => {
    if (factDatesById) return factDatesById;
    const map = new Map();
    (activeModel?.facts || []).forEach((fact) => {
      map.set(factIdOf(fact), fact.occurred_at || fact.occurredAt || '');
    });
    return map;
  }, [activeModel, factDatesById]);

  const handleSelectNode = useCallback((node) => {
    setSelectedNode(node);
    if (onSelectNode) onSelectNode(node);
  }, [onSelectNode]);

  useEffect(() => {
    if (!sceneRef.current || !renderPayload) return undefined;

    logger.debug(`Rendering ${viewMode.toUpperCase()} commit graph`, {
      filter,
      pattern: colorPattern,
      viewMode,
    });

    // Capture previous camera view state before cleanup, keyed by the mode that created it.
    // Only keep complete states: a state captured from a broken/disposed graph must never be restored.
    if (typeof disposeSceneRef.current?.getViewState === 'function') {
      const captured = disposeSceneRef.current.getViewState();
      const isComplete2D = lastModeRef.current === '2d' && Number.isFinite(captured?.scrollTop);
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
      renderPayload,
      themeColors,
      handleSelectNode,
      (node, event) => {
        if (node) {
          setHoveredNode({ ...node, x: event.clientX, y: event.clientY });
        } else {
          setHoveredNode(null);
        }
      },
      resolvedFactDates,
      viewStateByModeRef.current[viewMode],
      { onScroll: (nextScrollTop) => setScrollTop2D(clampScroll2D(nextScrollTop)) }
    );

    return () => {
      if (typeof disposeSceneRef.current?.getViewState === 'function') {
        const captured = disposeSceneRef.current.getViewState();
        const isComplete = viewMode === '2d'
          ? Number.isFinite(captured?.scrollTop)
          : Boolean(captured?.position && captured?.quaternion && captured?.target);
        if (isComplete) {
          viewStateByModeRef.current[viewMode] = captured;
        }
      }
      disposeSceneRef.current();
    };
  }, [renderPayload, viewMode, colorPattern, handleSelectNode, resolvedFactDates]);

  const scopeSummary = isEmptyScope(scope)
    ? `${totalEntityCount} entities`
    : `${scopedEntityCount} of ${totalEntityCount} entities`;

  return (
    <main className="visualizer-page HasmVisualizer_Container">

      {headerSlot}

      {/* TOOLBAR CONTROLS */}
      <div className="visualizer-toolbar HasmVisualizer_Toolbar">
        {showSampleSelector && (
          <div className="HasmVisualizer_ControlGroup">
            <label className="HasmVisualizer_Label" htmlFor="hasm-visualizer-sample">
              {labels?.sampleModel || 'Example .hasm Package'}
            </label>
            <select
              id="hasm-visualizer-sample"
              className="HasmVisualizer_Select"
              value={selectedModelIndex}
              onChange={(e) => {
                viewStateByModeRef.current = {};
                setSelectedModelIndex(Number(e.target.value));
                setScope(EMPTY_SCOPE);
                setSelectedNode(null);
              }}
            >
              {SAMPLE_HASM_MODELS.map((sample, idx) => (
                <option key={sample.fileName} value={idx}>
                  📂 {sample.fileName} — {sample.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* SCOPE SELECTION: limits how much of a large package is laid out and rendered. */}
        <div className="HasmVisualizer_ControlGroup HasmVisualizer_ScopeGroup">
          <label className="HasmVisualizer_Label" htmlFor="hasm-visualizer-person-scope">
            {labels?.personScope || 'PERSON scope'}
          </label>
          <select
            id="hasm-visualizer-person-scope"
            className="HasmVisualizer_Select HasmVisualizer_ScopeSelect"
            multiple
            size={Math.min(Math.max(personOptions.length, 2), 5)}
            value={scope.personIds}
            onChange={(event) => {
              const personIds = selectedValues(event.currentTarget);
              const allowed = new Set(listExperienceOptions(activeModel, personIds).map((option) => option.id));
              setScope({ personIds, experienceIds: scope.experienceIds.filter((id) => allowed.has(id)) });
              setSelectedNode(null);
            }}
          >
            {personOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>

          <label className="HasmVisualizer_Label" htmlFor="hasm-visualizer-experience-scope">
            {labels?.experienceScope || 'EXPERIENCE scope'}
          </label>
          <select
            id="hasm-visualizer-experience-scope"
            className="HasmVisualizer_Select HasmVisualizer_ScopeSelect"
            multiple
            size={Math.min(Math.max(experienceOptions.length, 2), 5)}
            value={scope.experienceIds}
            onChange={(event) => {
              setScope({ ...scope, experienceIds: selectedValues(event.currentTarget) });
              setSelectedNode(null);
            }}
          >
            {experienceOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>

          <button
            type="button"
            className="HasmVisualizer_ViewToggleButton"
            onClick={() => { setScope(EMPTY_SCOPE); setSelectedNode(null); }}
            disabled={isEmptyScope(scope)}
          >
            {labels?.clearScope || 'Clear scope'}
          </button>
          <span className="HasmVisualizer_ScopeSummary" role="status">{scopeSummary}</span>
        </div>

        <div className="HasmVisualizer_ControlGroup">
          <span className="HasmVisualizer_Label">
            {labels?.viewMode || 'View Mode'}
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
          <label className="HasmVisualizer_Label" htmlFor="hasm-visualizer-time-scale">
            {labels?.timeScale || 'Time Scale'}
          </label>
          <select
            id="hasm-visualizer-time-scale"
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

          <label className="HasmVisualizer_Label" htmlFor="hasm-visualizer-z-scale">
            {labels?.zScale || 'Z Scale'}
          </label>
          <input
            id="hasm-visualizer-z-scale"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            className="HasmVisualizer_Input"
            value={filter.zScaleFactor}
            onChange={(e) => setFilter(nextLayoutFilter(filter, 'zScaleFactor', e.target.value))}
          />
          <span style={{ fontSize: '0.8rem', minWidth: '32px' }}>{filter.zScaleFactor}x</span>
        </div>

        {toolbarSlot}
      </div>

      {/* GRAPH STAGE (2D split view or 3D WebGL) */}
      <div className="graph-stage HasmVisualizer_Stage" aria-label={viewMode === '2d' ? '2D Commit Graph' : '3D Commit Graph'}>
        {needsScope ? (
          <p className="HasmVisualizer_ScopePrompt">
            {labels?.scopePrompt
              || `This package holds ${totalEntityCount} entities. Select a PERSON or EXPERIENCE scope above to visualize part of it.`}
          </p>
        ) : viewMode === '2d' ? (
          <div className="HasmVisualizer_Split2D">
            <div
              className="graph-canvas HasmVisualizer_Canvas HasmVisualizer_GraphPane2D"
              style={{ width: `${graphPaneWidthPercent}%` }}
              ref={sceneRef}
            />
            <div
              className="HasmVisualizer_FactTablePane"
              style={{ width: `${100 - graphPaneWidthPercent}%` }}
              ref={factTableRef}
              onScroll={(event) => setScrollTop2D(clampScroll2D(event.currentTarget.scrollTop))}
            >
              <table className="HasmVisualizer_FactTable">
                <thead>
                  <tr>
                    <th>{labels?.factTitle || 'FACT'}</th>
                    <th>{labels?.factTime || 'Time'}</th>
                  </tr>
                </thead>
                <tbody>
                  {factRows.map((row) => {
                    const rowColor =
                      experienceColors?.factColorByPositionKey.get(positionKey(row.x, row.y)) ||
                      experienceColors?.entityColors.FACT;
                    const isActive = hoveredNode?.id === row.id || selectedNode?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={isActive ? 'is-active' : ''}
                        onMouseEnter={(event) => setHoveredNode({ ...row, x: event.clientX, y: event.clientY })}
                        onMouseLeave={() => setHoveredNode(null)}
                        onClick={() => handleSelectNode(row)}
                      >
                        <td>
                          <span className="HasmVisualizer_FactDot" style={{ background: rowColor }} />
                          {row.label}
                        </td>
                        <td>{resolvedFactDates.get(row.id) || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="graph-canvas HasmVisualizer_Canvas" ref={sceneRef} />
        )}

        {budgetWarning ? <p className="graph-warning HasmVisualizer_BudgetWarning">{budgetWarning}</p> : null}

        {overlaySlot}

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
            ? '💡 Scroll to move along the time axis, click node to inspect'
            : '💡 Drag to rotate, scroll to zoom, click node to inspect'}
        </div>
      </div>

      {/* NODE INSPECTOR */}
      {selectedNode && !onSelectNode && (
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
