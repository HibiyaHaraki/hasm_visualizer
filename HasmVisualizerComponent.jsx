import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createCommitGraph, buildEntityColors, buildExperienceColorMaps, positionKey, limitRenderedNodes, DEFAULT_MAX_RENDERED_NODES } from './threeCommitGraph.js';
import { createCommitGraph2D } from './twoCommitGraph.js';
import { computeFactRowIndexById, computeLaneIndexByKey, graphWidthForLaneCount, ROW_HEIGHT_PX, TABLE_HEADER_HEIGHT_PX } from './graph2DLayout.js';
import { DEFAULT_LAYOUT_FILTER, nextLayoutFilter, TIME_SCALE_MODES } from './layoutFilter.js';
import { computeVisualizerLayoutJS } from './layoutCalculator.js';
import { SAMPLE_HASM_MODELS } from './sampleModels.js';
import {
  EMPTY_SCOPE,
  countModelEntities,
  experienceIdOf,
  factIdOf,
  isEmptyScope,
  listExperienceOptions,
  listPersonOptions,
  personIdOf,
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

function readIdList(entity, ...keys) {
  for (const key of keys) {
    const value = entity?.[key];
    if (Array.isArray(value)) return value.map(String);
  }
  return [];
}

function limitModelForLayout(model, maxFacts) {
  const facts = model?.facts || [];
  if (!Number.isFinite(maxFacts) || maxFacts <= 0 || facts.length <= maxFacts) {
    return { model, warning: '' };
  }

  const factLimit = Math.max(1, Math.floor(maxFacts));
  const keptFacts = facts.slice(0, factLimit);
  const keptFactIds = new Set(keptFacts.map(factIdOf));
  const keptExperienceIds = new Set(keptFacts.flatMap((fact) => readIdList(fact, 'experience_ids', 'experienceIds')));
  const keptPeopleIds = new Set(keptFacts.flatMap((fact) => readIdList(fact, 'person_ids', 'personIds')));

  const people = (model.people || []).filter((person) => keptPeopleIds.size === 0 || keptPeopleIds.has(personIdOf(person)));
  const experiences = (model.experiences || []).filter((experience) => keptExperienceIds.has(experienceIdOf(experience)));
  const keptEntityIds = new Set([
    ...people.map(personIdOf),
    ...experiences.map(experienceIdOf),
    ...keptFactIds,
  ]);
  const links = (model.links || []).filter((link) => {
    const relatedIds = readIdList(link, 'related_ids', 'relatedIds');
    return relatedIds.length > 0 && relatedIds.every((id) => keptEntityIds.has(id));
  });

  return {
    model: { ...model, people, experiences, facts: keptFacts, links },
    warning: `Loading ${keptFacts.length} of ${facts.length} FACT nodes to keep visualization responsive. Narrow the PERSON or EXPERIENCE scope to inspect more.`,
  };
}

// Native multi-selects only accumulate with Ctrl/Cmd-click, which is easy to miss and unavailable
// on touch. A plain click toggles just the clicked option and keeps the rest of the selection;
// modifier-clicks and keyboard interaction fall through to the browser's own behaviour.
function toggleOptionOnPlainClick(event, apply) {
  const option = event.target;
  if (option.tagName !== 'OPTION' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const select = event.currentTarget;
  event.preventDefault();
  select.focus();
  option.selected = !option.selected;
  apply(selectedValues(select));
}

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
  const lastModeRef = useRef('2d');
  const hasComputedRef = useRef(false);

  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [filter, setFilter] = useState(DEFAULT_LAYOUT_FILTER);
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeMenuRef = useRef(null);
  const scopeButtonRef = useRef(null);
  const scopePanelId = useId();
  const [viewMode, setViewMode] = useState('2d');
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isSceneRendering, setIsSceneRendering] = useState(false);
  const [renderError, setRenderError] = useState('');
  const rendererFallbackMessage = labels?.rendererFallback || '3D rendering is unavailable; switched to 2D.';
  const renderingFailedMessage = labels?.renderingFailed || 'The 2D graph could not be rendered.';

  useEffect(() => {
    if (!scopeOpen) return undefined;
    const dismissOutside = (event) => {
      if (!scopeMenuRef.current?.contains(event.target)) setScopeOpen(false);
    };
    const dismissOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setScopeOpen(false);
      scopeButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [scopeOpen]);

  const currentSample = SAMPLE_HASM_MODELS[selectedModelIndex] || SAMPLE_HASM_MODELS[0];
  const activeModel = model || currentSample.model;
  const showSampleSelector = !model;

  const personOptions = useMemo(() => listPersonOptions(activeModel), [activeModel]);
  const experienceOptions = useMemo(() => listExperienceOptions(activeModel, scope.personIds), [activeModel, scope.personIds]);
  const scopedModel = useMemo(() => scopeModel(activeModel, scope), [activeModel, scope]);
  const totalEntityCount = useMemo(() => countModelEntities(activeModel), [activeModel]);
  const scopedEntityCount = useMemo(() => countModelEntities(scopedModel), [scopedModel]);
  const usesRenderBudget = viewMode === '2d';
  const { model: layoutModel, warning: layoutBudgetWarning } = useMemo(
    () => (usesRenderBudget ? limitModelForLayout(scopedModel, maxRenderedNodes) : { model: scopedModel, warning: '' }),
    [scopedModel, maxRenderedNodes, usesRenderBudget],
  );
  const needsScope = isEmptyScope(scope) && totalEntityCount > scopePromptThreshold;

  // Layout is computed once per model/filter/scope change and shared by the graph effect below and
  // the 2D FACT table, so the table rows stay aligned with the graph lanes.
  const [layoutPayload, setLayoutPayload] = useState(null);
  const [renderedZScale, setRenderedZScale] = useState(DEFAULT_LAYOUT_FILTER.zScaleFactor);
  useEffect(() => {
    if (needsScope) {
      setLayoutPayload(null);
      return undefined;
    }
    logger.debug('[SEQ-MD-03][LAYOUT] Computing visualizer layout', { filter, scope, entityCount: scopedEntityCount });

    let active = true;
    const isFilterUpdate = hasComputedRef.current;
    // Compute layout through the host when supplied, otherwise via the client-side JS
    // implementation kept in parity with the Rust backend.
    const request = computeLayout
      ? computeLayout(layoutModel, filter, { isFilterUpdate })
      : computeVisualizerLayoutJS(layoutModel, filter);

    Promise.resolve(request)
      .then((payload) => {
        if (!active || !payload) return;
        hasComputedRef.current = true;
        setLayoutPayload(payload);
        setRenderedZScale(filter.zScaleFactor);
      })
      .catch((error) => {
        // The host owns error presentation and routing; keep the previous scene mounted.
        logger.error('Visualizer layout failed', error);
      });

    return () => { active = false; };
  }, [layoutModel, filter, needsScope, computeLayout, scopedEntityCount, scope]);

  const { payload: renderPayload, warning: budgetWarning } = useMemo(
    () => {
      if (!layoutPayload) return { payload: null, warning: '' };
      return usesRenderBudget ? limitRenderedNodes(layoutPayload, maxRenderedNodes) : { payload: layoutPayload, warning: '' };
    },
    [layoutPayload, maxRenderedNodes, usesRenderBudget],
  );
  const combinedBudgetWarning = [layoutBudgetWarning, budgetWarning].filter(Boolean).join(' ');

  // 2D-mode helpers: fact rows (newest first, matching graph rows) and the lane count that
  // drives the graph's pixel width so the FACT table follows the last EXPERIENCE lane.
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
  const graphPaneWidthPx = graphWidthForLaneCount(laneCount);
  const rowHeightPx = ROW_HEIGHT_PX * renderedZScale;

  // LINK descriptions keyed by each endpoint entity id, so hovering a FACT (or any other linked
  // entity) can surface "which LINK(s) touch this node" even if its other endpoint is off-screen.
  const linkDescriptionsByNodeId = useMemo(() => {
    const map = new Map();
    if (!renderPayload) return map;
    const nodeLabelById = new Map(renderPayload.nodes3d.map((node) => [node.id, node.label]));
    renderPayload.lines3d.filter((line) => line.lineType === 'LINK').forEach((line) => {
      const fromLabel = nodeLabelById.get(line.fromId) || line.fromId;
      const toLabel = nodeLabelById.get(line.toId) || line.toId;
      const description = `${fromLabel} \u2194 ${toLabel}`;
      [line.fromId, line.toId].forEach((id) => {
        const list = map.get(id) || [];
        list.push(description);
        map.set(id, list);
      });
    });
    return map;
  }, [renderPayload]);

  // Shared vertical scroll offset between the 2D commit graph and the FACT table, so the dot for a
  // FACT and its table row stay at the same height no matter which pane is scrolled. Kept as a ref
  // (not React state): syncing through setState+useEffect adds a render round trip between the two
  // panes updating, which is visible as jitter/shaking during fast or momentum scrolling.
  const scrollTop2DRef = useRef(0);
  const factTableRef = useRef(null);
  // Clamp against the FACT table's own measured scroll extent (not an assumed pane height), so the
  // graph and table can never be driven to different scroll ranges and lose row/dot alignment.
  const clampScroll2D = useCallback((value) => {
    const el = factTableRef.current;
    const maxScrollTop = el
      ? Math.max(0, el.scrollHeight - el.clientHeight)
      : Math.max(0, factRows.length * rowHeightPx + TABLE_HEADER_HEIGHT_PX);
    return Math.min(Math.max(value, 0), maxScrollTop);
  }, [factRows.length, rowHeightPx]);
  // Imperatively pushes a scroll offset to both panes in one synchronous call, so the table row and
  // graph dot move together on the very same frame instead of one lagging behind a React re-render.
  const syncScrollTop2D = useCallback((value) => {
    const clamped = clampScroll2D(value);
    scrollTop2DRef.current = clamped;
    if (factTableRef.current && factTableRef.current.scrollTop !== clamped) {
      factTableRef.current.scrollTop = clamped;
    }
    disposeSceneRef.current?.setScrollTop?.(clamped);
  }, [clampScroll2D]);

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

  const applyPersonIds = useCallback((personIds) => {
    // EXPERIENCE picks that no longer belong to any selected PERSON are dropped.
    const allowed = new Set(listExperienceOptions(activeModel, personIds).map((option) => option.id));
    setScope((current) => ({ personIds, experienceIds: current.experienceIds.filter((id) => allowed.has(id)) }));
    setSelectedNode(null);
  }, [activeModel]);

  const applyExperienceIds = useCallback((experienceIds) => {
    setScope((current) => ({ ...current, experienceIds }));
    setSelectedNode(null);
  }, []);

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

    // Both renderers share the same layout payload and color derivation; 2D is SVG and does
    // not require WebGL, so it remains available if the host cannot create a 3D context.
    setIsSceneRendering(true);
    let active = true;
    const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
    const cancel = window.cancelAnimationFrame || window.clearTimeout;
    const frameId = schedule(() => {
      if (!active || !sceneRef.current) return;
      // Measure what the FACT table actually rendered at (font metrics, host CSS, browser zoom can
      // all nudge this away from the nominal ROW_HEIGHT_PX/TABLE_HEADER_HEIGHT_PX constants), so the
      // 2D graph's row grid always matches the table pixel-for-pixel instead of merely by assumption.
      const tableEl = factTableRef.current?.querySelector('table');
      const measuredHeaderHeightPx = tableEl?.querySelector('thead th')?.getBoundingClientRect().height;
      const measuredRowHeightPx = tableEl?.querySelector('tbody tr')?.getBoundingClientRect().height;
      try {
        const onHover = (node, event) => {
          if (node) setHoveredNode({ ...node, screenX: event.clientX, screenY: event.clientY });
          else setHoveredNode(null);
        };
        if (viewMode === '2d') {
          disposeSceneRef.current = createCommitGraph2D(
            sceneRef.current,
            renderPayload,
            themeColors,
            handleSelectNode,
            onHover,
            resolvedFactDates,
            viewStateByModeRef.current[viewMode],
            {
              onScroll: (nextScrollTop) => syncScrollTop2D(nextScrollTop),
              rowHeightPx: measuredRowHeightPx || rowHeightPx,
              headerHeightPx: measuredHeaderHeightPx || TABLE_HEADER_HEIGHT_PX,
            },
          );
          // Keep the rebuilt graph at the FACT table's current shared scroll offset.
          syncScrollTop2D(scrollTop2DRef.current);
        } else {
          const handleThreeError = (error) => {
            logger.warn('Three.js rendering failed; switching to the 2D graph.', error);
            setRenderError(rendererFallbackMessage);
            setIsSceneRendering(false);
            setViewMode('2d');
          };
          disposeSceneRef.current = createCommitGraph(
            sceneRef.current,
            renderPayload,
            themeColors,
            handleSelectNode,
            onHover,
            resolvedFactDates,
            viewStateByModeRef.current[viewMode],
            handleThreeError,
          );
        }
        if (active) setIsSceneRendering(false);
      } catch (error) {
        setIsSceneRendering(false);
        if (viewMode === '3d') {
          logger.warn('3D graph rendering failed; switching to the 2D graph.', error);
          setRenderError(rendererFallbackMessage);
          setViewMode('2d');
        } else {
          logger.error('2D graph rendering failed.', error);
          setRenderError(renderingFailedMessage);
        }
      }
    });

    return () => {
      active = false;
      cancel(frameId);
      setIsSceneRendering(false);
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
  }, [renderPayload, viewMode, colorPattern, handleSelectNode, resolvedFactDates, rendererFallbackMessage, renderingFailedMessage, rowHeightPx]);

  const scopeSummary = isEmptyScope(scope)
    ? `${totalEntityCount} entities`
    : `${scopedEntityCount} of ${totalEntityCount} entities`;

  return (
    <main className="visualizer-page HasmVisualizer_Container">

      {headerSlot}

      <div className="visualizer-toolbar HasmVisualizer_Toolbar" role="region" aria-label={labels?.graphControls || 'Graph controls'}>
        {showSampleSelector && (
          <div className="HasmVisualizer_ControlGroup HasmVisualizer_SampleGroup">
            <label className="HasmVisualizer_Label" htmlFor="hasm-visualizer-sample">
              {labels?.sampleModel || 'Example .hasm Package'}
            </label>
            <select
              id="hasm-visualizer-sample"
              className="HasmVisualizer_Select form-select form-select-sm"
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

        <div className="HasmVisualizer_ControlGroup HasmVisualizer_ScopeMenu" ref={scopeMenuRef}>
          <span className="HasmVisualizer_Label">{labels?.scope || 'Scope'}</span>
          <button type="button" ref={scopeButtonRef}
            className="HasmVisualizer_ScopeTrigger HasmVisualizer_ViewToggleButton btn btn-sm btn-outline-secondary"
            aria-expanded={scopeOpen} aria-controls={scopePanelId}
            aria-label={`${labels?.scope || 'Scope'}: ${scopeSummary}`}
            onClick={() => setScopeOpen((open) => !open)}>
            <span>{isEmptyScope(scope) ? (labels?.allEntities || 'All entities') : `${scope.personIds.length + scope.experienceIds.length} ${labels?.selected || 'selected'}`}</span>
            <span className="HasmVisualizer_ScopeCount" role="status">{scopeSummary}</span>
            <span aria-hidden="true">{scopeOpen ? '\u2212' : '+'}</span>
          </button>
          <div id={scopePanelId} className="HasmVisualizer_ScopePanel" hidden={!scopeOpen}
            role="region" aria-label={labels?.scopeSelection || 'Scope selection'}>
            <div className="HasmVisualizer_PanelHeader">
              <h2>{labels?.scopeSelection || 'Scope selection'}</h2>
              <button type="button" className="HasmVisualizer_ViewToggleButton btn btn-sm btn-outline-secondary"
                onClick={() => { setScopeOpen(false); scopeButtonRef.current?.focus(); }}>
                {labels?.done || 'Done'}
              </button>
            </div>
            <p className="HasmVisualizer_ScopeHint">
              {labels?.scopeHint || 'Click to toggle. Select any number of entries.'}
            </p>
            <div className="HasmVisualizer_ScopeGroup">
              {personOptions.length > 1 && (
                <div className="HasmVisualizer_ScopeField">
                  <label className="HasmVisualizer_Label" htmlFor="hasm-visualizer-person-scope">
                    {labels?.personScope || 'PERSON scope'}
                  </label>
                  <select
                    id="hasm-visualizer-person-scope"
                    className="HasmVisualizer_Select HasmVisualizer_ScopeSelect form-select form-select-sm"
                    multiple
                    size={Math.min(Math.max(personOptions.length, 2), 8)}
                    value={scope.personIds}
                    onMouseDown={(event) => toggleOptionOnPlainClick(event, applyPersonIds)}
                    onChange={(event) => applyPersonIds(selectedValues(event.currentTarget))}
                  >
                    {personOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                  <div className="HasmVisualizer_ScopeActions">
                    <button
                      type="button"
                      className="HasmVisualizer_ViewToggleButton btn btn-sm btn-outline-secondary"
                      onClick={() => applyPersonIds(personOptions.map((option) => option.id))}
                      disabled={personOptions.length === 0 || scope.personIds.length === personOptions.length}
                    >
                      {labels?.selectAll || 'All'}
                    </button>
                    <button
                      type="button"
                      className="HasmVisualizer_ViewToggleButton btn btn-sm btn-outline-secondary"
                      onClick={() => applyPersonIds([])}
                      disabled={scope.personIds.length === 0}
                    >
                      {labels?.selectNone || 'None'}
                    </button>
                  </div>
                </div>
              )}
              <div className="HasmVisualizer_ScopeField">
                <label className="HasmVisualizer_Label" htmlFor="hasm-visualizer-experience-scope">
                  {labels?.experienceScope || 'EXPERIENCE scope'}
                </label>
                <select
                  id="hasm-visualizer-experience-scope"
                  className="HasmVisualizer_Select HasmVisualizer_ScopeSelect form-select form-select-sm"
                  multiple
                  size={Math.min(Math.max(experienceOptions.length, 2), 8)}
                  value={scope.experienceIds}
                  onMouseDown={(event) => toggleOptionOnPlainClick(event, applyExperienceIds)}
                  onChange={(event) => applyExperienceIds(selectedValues(event.currentTarget))}
                >
                  {experienceOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <div className="HasmVisualizer_ScopeActions">
                  <button
                    type="button"
                    className="HasmVisualizer_ViewToggleButton btn btn-sm btn-outline-secondary"
                    onClick={() => applyExperienceIds(experienceOptions.map((option) => option.id))}
                    disabled={experienceOptions.length === 0 || scope.experienceIds.length === experienceOptions.length}
                  >
                    {labels?.selectAll || 'All'}
                  </button>
                  <button
                    type="button"
                    className="HasmVisualizer_ViewToggleButton btn btn-sm btn-outline-secondary"
                    onClick={() => applyExperienceIds([])}
                    disabled={scope.experienceIds.length === 0}
                  >
                    {labels?.selectNone || 'None'}
                  </button>
                </div>
              </div>
            </div>
            <div className="HasmVisualizer_ScopeFooter">
              <button
                type="button"
                className="HasmVisualizer_ViewToggleButton btn btn-sm btn-outline-secondary"
                onClick={() => { setScope(EMPTY_SCOPE); setSelectedNode(null); }}
                disabled={isEmptyScope(scope)}
              >
                {labels?.clearScope || 'Clear scope'}
              </button>
            </div>
          </div>
        </div>

        <div className="HasmVisualizer_ControlGroup">
          <span className="HasmVisualizer_Label">
            {labels?.viewMode || 'View Mode'}
          </span>
          <div className="HasmVisualizer_ViewToggle btn-group" role="group" aria-label={labels?.viewMode || 'View mode'}>
            <button
              type="button"
              className={`HasmVisualizer_ViewToggleButton btn btn-sm btn-outline-secondary${viewMode === '2d' ? ' is-active active' : ''}`}
              aria-pressed={viewMode === '2d'}
              onClick={() => { setRenderError(''); setViewMode('2d'); }}
            >
              2D
            </button>
            <button
              type="button"
              className={`HasmVisualizer_ViewToggleButton btn btn-sm btn-outline-secondary${viewMode === '3d' ? ' is-active active' : ''}`}
              aria-pressed={viewMode === '3d'}
              onClick={() => { setRenderError(''); setViewMode('3d'); }}
            >
              3D
            </button>
          </div>
        </div>

        <div className="HasmVisualizer_ControlGroup HasmVisualizer_TimeGroup">
          <label className="HasmVisualizer_Label" htmlFor="hasm-visualizer-time-scale">
            {labels?.timeScale || 'Time Scale'}
          </label>
          <select
            id="hasm-visualizer-time-scale"
            className="HasmVisualizer_Select form-select form-select-sm"
            value={filter.timeScaleMode}
            onChange={(e) => setFilter(nextLayoutFilter(filter, 'timeScaleMode', e.target.value))}
          >
            {TIME_SCALE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>
        <div className="HasmVisualizer_ControlGroup HasmVisualizer_ScaleGroup">
          <label className="HasmVisualizer_Label" htmlFor="hasm-visualizer-z-scale">
            {labels?.zScale || 'Z Scale'}
          </label>
          <div className="HasmVisualizer_ScaleControl">
            <input
              id="hasm-visualizer-z-scale"
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              className="HasmVisualizer_Input form-range"
              value={filter.zScaleFactor}
              onChange={(e) => setFilter(nextLayoutFilter(filter, 'zScaleFactor', e.target.value))}
            />
            <output htmlFor="hasm-visualizer-z-scale" className="HasmVisualizer_ScaleValue">{filter.zScaleFactor}x</output>
          </div>
        </div>

        {toolbarSlot ? <div className="HasmVisualizer_ToolbarActions">{toolbarSlot}</div> : null}
      </div>

      {/* GRAPH STAGE (2D split view or 3D WebGL) */}
      <div className="graph-stage HasmVisualizer_Stage" aria-label={viewMode === '2d' ? '2D Commit Graph' : '3D Commit Graph'}>
        {needsScope ? (
          <p className="HasmVisualizer_ScopePrompt">
            {labels?.scopePrompt
              || `This package holds ${totalEntityCount} entities. Select a PERSON or EXPERIENCE scope above to visualize part of it.`}
          </p>
        ) : viewMode === '2d' ? (
          <div className="HasmVisualizer_Split2D" style={{ '--HasmVisualizer-row-height': `${rowHeightPx}px` }}>
            <div
              className="graph-canvas HasmVisualizer_Canvas HasmVisualizer_GraphPane2D"
              style={{ width: `${graphPaneWidthPx}px` }}
              ref={sceneRef}
            />
            <div
              className="HasmVisualizer_FactTablePane"
              ref={factTableRef}
              onScroll={(event) => syncScrollTop2D(event.currentTarget.scrollTop)}
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
                        onMouseEnter={(event) => setHoveredNode({ ...row, screenX: event.clientX, screenY: event.clientY })}
                        onMouseLeave={() => setHoveredNode(null)}
                        onClick={() => handleSelectNode(row)}
                      >
                        <td title={row.label}>
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

        {combinedBudgetWarning ? <p className="graph-warning HasmVisualizer_BudgetWarning">{combinedBudgetWarning}</p> : null}
        {renderError ? <p className="graph-warning HasmVisualizer_RenderError" role="alert">{renderError}</p> : null}

        {isSceneRendering ? (
          <div className="HasmVisualizer_RenderSpinner" role="status" aria-label={labels?.rendering || 'Rendering visualizer'}>
            <span className="HasmVisualizer_RenderSpinnerIcon" aria-hidden="true" />
          </div>
        ) : null}

        {overlaySlot}

        {hoveredNode && (
          <div
            className="graph-tooltip HasmVisualizer_Tooltip"
            style={{ left: hoveredNode.screenX, top: hoveredNode.screenY }}
          >
            [{hoveredNode.entityType}] {hoveredNode.label}
            {(linkDescriptionsByNodeId.get(hoveredNode.id) || []).map((description) => (
              <div key={description} className="HasmVisualizer_TooltipLink">LINK: {description}</div>
            ))}
          </div>
        )}
      </div>

      {/* LEGEND */}
      <div className="HasmVisualizer_Legend">
        <div className="HasmVisualizer_LegendItem">
          <span>{labels?.personLegend || 'PERSON (owner/group; not drawn as a node)'}</span>
        </div>
        <div className="HasmVisualizer_LegendItem">
          <span className="HasmVisualizer_LegendMark HasmVisualizer_LegendExperience" aria-hidden="true" />
          <span>{labels?.experienceLegend || 'EXPERIENCE (fixed-position timeline)'}</span>
        </div>
        <div className="HasmVisualizer_LegendItem">
          <span className="HasmVisualizer_LegendMark HasmVisualizer_LegendFact" aria-hidden="true" />
          <span>{labels?.factLegend || 'FACT (solid = recorded; hollow = reflected)'}</span>
        </div>
        <div className="HasmVisualizer_LegendItem">
          <span className="HasmVisualizer_LegendMark HasmVisualizer_LegendLink" aria-hidden="true" />
          <span>{labels?.linkLegend || 'LINK (dashed line)'}</span>
        </div>
        <div className="HasmVisualizer_LegendHint">
          {viewMode === '2d'
            ? (labels?.interaction2d || 'Scroll to move along time; click a marker to inspect.')
            : (labels?.interaction3d || 'Drag to rotate, scroll to zoom, and click a marker to inspect.')}
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
