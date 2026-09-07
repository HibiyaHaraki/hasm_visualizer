import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

function hexToRgb(hexColor) {
  const hex = String(hexColor).replace("#", "");
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function mixHex(firstColor, secondColor, ratio) {
  const first = hexToRgb(firstColor);
  const second = hexToRgb(secondColor);
  const channel = (key) => Math.round(first[key] + (second[key] - first[key]) * ratio);
  return `#${[channel("r"), channel("g"), channel("b")].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

// WCAG relative luminance, used to derive the contrast ratio between two colors.
function relativeLuminance(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  const linear = [r, g, b].map((channel) => channel / 255).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(firstColor, secondColor) {
  const lighter = Math.max(relativeLuminance(firstColor), relativeLuminance(secondColor));
  const darker = Math.min(relativeLuminance(firstColor), relativeLuminance(secondColor));
  return (lighter + 0.05) / (darker + 0.05);
}

// Steps a color toward white or away from the background until it reads clearly against it (WCAG AA, ratio >= 4.5).
export function ensureReadableColor(color, backgroundColor, minRatio = 4.5) {
  if (contrastRatio(color, backgroundColor) >= minRatio) return color;
  const target = relativeLuminance(backgroundColor) < 0.5 ? "#ffffff" : "#000000";
  for (let step = 1; step <= 10; step += 1) {
    const candidate = mixHex(color, target, step / 10);
    if (contrastRatio(candidate, backgroundColor) >= minRatio) return candidate;
  }
  return target;
}

// Derives PERSON/EXPERIENCE/FACT accents from the active color pattern instead of fixed hex values, then
// nudges each toward readable contrast so a dark FACT commit never lands on a dark background (or vice versa).
// Shared with the 2D renderer so both modes display identical entity colors.
export function buildEntityColors(theme) {
  const background = theme.textBackgroundColor;
  return {
    EXPERIENCE: ensureReadableColor(theme.mainColor, background),
    FACT: ensureReadableColor(mixHex(theme.mainColor, theme.textColor, 0.5), background),
    LINK: ensureReadableColor(theme.mainColor, background),
  };
}

const GOLDEN_ANGLE_DEGREES = 137.508;

function hslToHex(hue, saturationPercent, lightnessPercent) {
  const s = saturationPercent / 100;
  const l = lightnessPercent / 100;
  const c = (1 - Math.abs((2 * l) - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - (c / 2);
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const toHex = (channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function positionKey(x, y) {
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}
export { positionKey };

// Spreads each EXPERIENCE around the hue wheel by the golden angle (hue_i = i * 137.508 deg mod 360), which
// keeps adjacent branches maximally distinguishable no matter how many EXPERIENCEs exist. FACT commits on a given
// EXPERIENCE reuse that same hue but blend toward the theme's text color, so they read as a related, lighter
// tint of their own branch rather than an identical or unrelated color.
// Shared with the 2D renderer so both modes display identical EXPERIENCE/FACT colors.
export function buildExperienceColorMaps(payload, theme) {
  const background = theme.textBackgroundColor;
  const trunkColorByPositionKey = new Map();
  const factColorByPositionKey = new Map();
  payload.nodes3d.filter((node) => node.entityType === "EXPERIENCE").forEach((node, index) => {
    const hue = (index * GOLDEN_ANGLE_DEGREES) % 360;
    const baseColor = hslToHex(hue, 58, 42);
    const trunkColor = ensureReadableColor(mixHex(baseColor, theme.mainColor, 0.25), background);
    const factColor = ensureReadableColor(mixHex(baseColor, theme.textColor, 0.4), background);
    const key = positionKey(node.x, node.y);
    trunkColorByPositionKey.set(key, trunkColor);
    factColorByPositionKey.set(key, factColor);
  });
  return { trunkColorByPositionKey, factColorByPositionKey };
}

// Number of Z-axis tick labels drawn at most. Each label is a canvas-backed sprite, so a package
// with thousands of distinct FACT timestamps would otherwise exhaust GPU memory on the axis alone.
const MAX_TIMELINE_TICKS = 60;

// Ceiling on FACT meshes handed to the scene, so a scoped large package degrades quickly instead of
// spending seconds constructing meshes the camera cannot inspect in one view.
export const DEFAULT_MAX_RENDERED_NODES = 1200;

const FOV_CULLING_MARGIN = 1.2;

/// Trims a layout payload to a renderable size, returning the payload plus a human-readable warning
/// when nodes were dropped. EXPERIENCE and PERSON nodes are always kept (branch geometry and LINK
/// endpoints depend on them); only FACT nodes are trimmed.
export function limitRenderedNodes(payload, maxNodes = DEFAULT_MAX_RENDERED_NODES) {
  const nodes = payload?.nodes3d || [];
  if (!Number.isFinite(maxNodes) || maxNodes <= 0 || nodes.length <= maxNodes) {
    return { payload, warning: "" };
  }
  const experienceNodes = nodes.filter((node) => node.entityType === "EXPERIENCE");
  const personNodes = nodes.filter((node) => node.entityType === "PERSON");
  const allFactNodes = nodes.filter((node) => node.entityType === "FACT");
  const factNodes = allFactNodes.slice(0, Math.max(maxNodes - experienceNodes.length - personNodes.length, 0));
  const dropped = allFactNodes.length - factNodes.length;
  const keptIds = new Set([...experienceNodes, ...personNodes, ...factNodes].map((node) => node.id));
  const lines3d = (payload.lines3d || []).filter((line) => {
    if (line.lineType !== "LINK") return true;
    return keptIds.has(line.fromId) && keptIds.has(line.toId);
  });
  return {
    payload: { ...payload, nodes3d: [...experienceNodes, ...personNodes, ...factNodes], lines3d },
    warning: `Showing ${factNodes.length} of ${allFactNodes.length} FACT nodes. Narrow the PERSON or EXPERIENCE scope to see the remaining ${dropped}.`,
  };
}

// Sprite textures are cached by text and color so repeated timeline labels reuse one GPU texture.
const labelTextureCache = new Map();

function labelTexture(text, color) {
  const cacheKey = `${color}|${text}`;
  const cached = labelTextureCache.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.font = "28px sans-serif";
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, 4, 32);
  const texture = new THREE.CanvasTexture(canvas);
  labelTextureCache.set(cacheKey, texture);
  return texture;
}

function createTimelineLabel(text, color) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, color), transparent: true, depthTest: false }));
  sprite.scale.set(3, 0.75, 1);
  return sprite;
}

// Replaces the xy-plane grid with a single Z-axis timeline. Tick positions come directly from the FACT z
// coordinates already computed by the selected TimeScaleMode, so the axis adapts to Linear/Logarithmic/SequentialIndex automatically.
function createTimelineAxis(scene, payload, factDatesById, color) {
  const disposables = [];
  const factNodes = payload.nodes3d.filter((node) => node.entityType === "FACT");
  if (factNodes.length === 0) return disposables;

  const axisX = -12;
  const axisY = 0;
  // Reduce instead of Math.max(...spread): the spread form throws past ~100k arguments.
  const maxZ = factNodes.reduce((highest, node) => Math.max(highest, node.z), 0);
  const axisGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(axisX, axisY, 0), new THREE.Vector3(axisX, axisY, maxZ)]);
  const axisMaterial = new THREE.LineBasicMaterial({ color });
  const axisLine = new THREE.Line(axisGeometry, axisMaterial);
  scene.add(axisLine);
  disposables.push(axisLine);

  const firstFactByZ = new Map();
  factNodes.forEach((node) => {
    if (!firstFactByZ.has(node.z)) firstFactByZ.set(node.z, node);
  });
  const allTickZValues = [...firstFactByZ.keys()].sort((left, right) => left - right);
  // Evenly sample the timeline when a package has more distinct timestamps than the tick budget.
  const tickStride = Math.max(1, Math.ceil(allTickZValues.length / MAX_TIMELINE_TICKS));
  const tickZValues = allTickZValues.filter((_value, index) => index % tickStride === 0);

  tickZValues.forEach((z, index) => {
    const tickGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(axisX - 0.4, axisY, z), new THREE.Vector3(axisX + 0.4, axisY, z)]);
    const tickMaterial = new THREE.LineBasicMaterial({ color });
    const tick = new THREE.Line(tickGeometry, tickMaterial);
    scene.add(tick);
    disposables.push(tick);

    const factAtZ = firstFactByZ.get(z);
    const label = factDatesById?.get(factAtZ?.id) || `#${(index * tickStride) + 1}`;
    const sprite = createTimelineLabel(label, color);
    sprite.position.set(axisX - 2.2, axisY, z);
    scene.add(sprite);
    disposables.push(sprite);
  });

  return disposables;
}

export function createCommitGraph(container, payload, theme, onSelect, onHover, factDatesById, initialViewState) {
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(container.clientHeight, 360);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.textBackgroundColor);
  const entityColors = buildEntityColors(theme);
  const { trunkColorByPositionKey, factColorByPositionKey } = buildExperienceColorMaps(payload, theme);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  const restore3D = initialViewState && initialViewState.position && initialViewState.quaternion;
  if (restore3D) {
    camera.position.copy(initialViewState.position);
    camera.quaternion.copy(initialViewState.quaternion);
  } else {
    camera.position.set(13, 11, 20);
    camera.lookAt(0, 0, 5);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  const controls = new OrbitControls(camera, renderer.domElement);
  if (restore3D && initialViewState.target) { controls.target.copy(initialViewState.target); } else { controls.target.set(0, 0, 5); }
  controls.enableDamping = false;
  controls.enablePan = true;
  controls.minDistance = 4;
  controls.maxDistance = 80;
  controls.update();

  scene.add(new THREE.AmbientLight(theme.textColor, 1.5));
  const keyLight = new THREE.DirectionalLight(theme.mainColor, 2);
  keyLight.position.set(8, 12, 10);
  scene.add(keyLight);

  const timelineAxisObjects = createTimelineAxis(scene, payload, factDatesById, entityColors.FACT);

  const nodeById = new Map(payload.nodes3d.map((node) => [node.id, node]));
  const experienceIdByPositionKey = new Map(payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .map((node) => [positionKey(node.x, node.y), node.id]));
  const timelineLines = [];
  const lineMeshes = [];
  const fovCulledMeshes = [];
  const experienceMeshesById = new Map();
  const factMeshesById = new Map();
  const highlightColor = ensureReadableColor(theme.textColor, theme.textBackgroundColor);
  // BRANCH_OUT lands on the child EXPERIENCE (`to`); BRANCH_MERGE departs from it (`from`); everything else uses `to`.
  const resolveLineColor = (line) => {
    const endpoint = line.lineType === "BRANCH_MERGE" ? line.from : line.to;
    return trunkColorByPositionKey.get(positionKey(endpoint[0], endpoint[1])) || entityColors.EXPERIENCE;
  };
  payload.lines3d.filter((line) => line.lineType !== "LINK").forEach((line) => {
    const from = new THREE.Vector3(...line.from);
    const to = new THREE.Vector3(...line.to);
    const points = line.controlPoints?.length
      ? new THREE.QuadraticBezierCurve3(from, new THREE.Vector3(...line.controlPoints[0]), to).getPoints(24)
      : [from, to];
    const color = resolveLineColor(line);
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, Math.max(points.length - 1, 1), 0.075, 8, false);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });
    const mesh = new THREE.Mesh(geometry, material);
    const nodeId = line.lineType === "BRANCH" ? line.id.replace("branch-", "") : null;
    const node = nodeId ? nodeById.get(nodeId) : null;
    mesh.userData = { ...node, baseColor: color, baseOpacity: 1 };
    if (node) {
      timelineLines.push(mesh);
      experienceMeshesById.set(node.id, mesh);
    }
    lineMeshes.push(mesh);
    fovCulledMeshes.push(mesh);
    scene.add(mesh);
  });

  // LINK entities: a FACT-FACT LINK is a thin line shown at all times; any LINK touching an
  // EXPERIENCE/PERSON instead renders as a translucent "membrane" always visible at high
  // transmittance (very low opacity), which brightens when one of its endpoints is hovered
  // (toggled from setHighlight below, not FOV-culled).
  const linkMeshesByEndpointId = new Map();
  const trackLinkMesh = (id, mesh) => {
    const list = linkMeshesByEndpointId.get(id) || [];
    list.push(mesh);
    linkMeshesByEndpointId.set(id, list);
  };
  payload.lines3d.filter((line) => line.lineType === "LINK").forEach((line) => {
    const from = new THREE.Vector3(...line.from);
    const to = new THREE.Vector3(...line.to);
    const color = entityColors.LINK;
    let mesh;
    if (line.linkCategory === "FACT_FACT") {
      const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
      mesh = new THREE.Line(geometry, material);
      mesh.userData = { baseColor: color, baseOpacity: 0.6, highlightOpacity: 1 };
    } else {
      const curve = new THREE.CatmullRomCurve3([from, to]);
      const geometry = new THREE.TubeGeometry(curve, 1, 0.18, 8, false);
      const material = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false });
      mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { baseColor: color, baseOpacity: 0.08, highlightOpacity: 0.5 };
    }
    scene.add(mesh);
    lineMeshes.push(mesh);
    trackLinkMesh(line.fromId, mesh);
    trackLinkMesh(line.toId, mesh);
  });

  // One shared geometry for every FACT commit: allocating a BoxGeometry per node costs a separate
  // GPU buffer each, which is the dominant memory cost on large packages.
  const factGeometry = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  const nodes = payload.nodes3d.filter((node) => node.entityType === "FACT").map((node) => {
    const color = factColorByPositionKey.get(positionKey(node.x, node.y)) || entityColors.FACT;
    const opacity = node.isDirectFact ? 1 : 0.32;
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, transparent: true, opacity, depthWrite: node.isDirectFact });
    const mesh = new THREE.Mesh(factGeometry, material);
    mesh.position.set(node.x, node.y, node.z);
    mesh.userData = { ...node, baseColor: color, baseOpacity: opacity };
    const meshes = factMeshesById.get(node.id) || [];
    meshes.push(mesh);
    factMeshesById.set(node.id, meshes);
    scene.add(mesh);
    fovCulledMeshes.push(mesh);
    return mesh;
  });

  const frustum = new THREE.Frustum();
  const projectionMatrix = new THREE.Matrix4();
  const cullingSphere = new THREE.Sphere();
  const updateFovSelection = () => {
    camera.updateMatrixWorld();
    projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projectionMatrix);
    fovCulledMeshes.forEach((mesh) => {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      cullingSphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
      cullingSphere.radius *= FOV_CULLING_MARGIN;
      mesh.visible = frustum.intersectsSphere(cullingSphere);
    });
  };

  const renderVisibleScene = () => {
    updateFovSelection();
    renderer.render(scene, camera);
  };

  const setHighlight = (node) => {
    const highlightedIds = new Set(node ? [node.id, ...(node.linkedEntityIds || []), ...(node.parentExperienceIds || [])] : []);
    if (node?.entityType === "FACT") {
      const experienceId = experienceIdByPositionKey.get(positionKey(node.x, node.y));
      if (experienceId) highlightedIds.add(experienceId);
    }
    experienceMeshesById.forEach((mesh, id) => {
      mesh.material.color.set(highlightedIds.has(id) ? highlightColor : mesh.userData.baseColor);
    });
    factMeshesById.forEach((meshes, id) => {
      meshes.forEach((mesh) => {
        const highlighted = highlightedIds.has(id);
        mesh.material.color.set(highlighted ? highlightColor : mesh.userData.baseColor);
        mesh.material.opacity = highlighted ? 1 : mesh.userData.baseOpacity;
      });
    });
    // LINK meshes are always visible; emphasize (brighter color, higher opacity) whenever a
    // hovered node owns one of their endpoints.
    const emphasizedLinkMeshes = new Set();
    highlightedIds.forEach((id) => (linkMeshesByEndpointId.get(id) || []).forEach((mesh) => emphasizedLinkMeshes.add(mesh)));
    linkMeshesByEndpointId.forEach((meshes) => meshes.forEach((mesh) => {
      const emphasized = emphasizedLinkMeshes.has(mesh);
      mesh.material.color.set(emphasized ? highlightColor : mesh.userData.baseColor);
      mesh.material.opacity = emphasized ? mesh.userData.highlightOpacity : mesh.userData.baseOpacity;
    }));
    renderVisibleScene();
  };

  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = 0.3;
  const pointer = new THREE.Vector2();
  let lastHoverAt = 0;
  const pointerPosition = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };
  const intersectEntity = (event) => {
    pointerPosition(event);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects([...nodes, ...timelineLines].filter((mesh) => mesh.visible))[0]?.object.userData;
  };
  const handleMove = (event) => {
    if (performance.now() - lastHoverAt < 100) return;
    lastHoverAt = performance.now();
    const node = intersectEntity(event) || null;
    setHighlight(node);
    onHover(node, event);
  };
  const handleClick = (event) => {
    const node = intersectEntity(event);
    if (node) onSelect(node);
  };
  renderer.domElement.addEventListener("pointermove", handleMove);
  renderer.domElement.addEventListener("click", handleClick);

  const resize = () => {
    const nextWidth = Math.max(container.clientWidth, 320);
    const nextHeight = Math.max(container.clientHeight, 360);
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight);
    renderVisibleScene();
  };
  window.addEventListener("resize", resize);
  controls.addEventListener("change", renderVisibleScene);
  renderVisibleScene();

  const disposeFn = () => {
    window.removeEventListener("resize", resize);
    renderer.domElement.removeEventListener("pointermove", handleMove);
    renderer.domElement.removeEventListener("click", handleClick);
    controls.dispose();
    factGeometry.dispose();
    nodes.forEach((node) => { node.material.dispose(); });
    lineMeshes.forEach((line) => { line.geometry.dispose(); line.material.dispose(); });
    timelineAxisObjects.forEach((object) => {
      object.geometry?.dispose();
      // Label textures live in a process-wide cache and are deliberately not disposed here.
      object.material?.dispose();
    });
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  };
  disposeFn.getViewState = () => ({
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: controls.target.clone(),
  });
  return disposeFn;
}
