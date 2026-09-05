import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  buildEntityColors,
  buildExperienceColorMaps,
  ensureReadableColor,
  positionKey,
} from "./threeCommitGraph.js";

// Git-Extensions-style 2D commit graph rendered with Three.js: an orthographic camera looks straight
// at the XY plane, EXPERIENCEs become vertical branch lanes, FACTs become commit dots on a
// top-to-bottom timeline (newest at the top), and BRANCH_OUT/BRANCH_MERGE lines become curved
// connectors between lanes. Colors come from the exact same helpers as the 3D renderer, so FACT and
// EXPERIENCE colors are identical between 2D and 3D modes.

const LANE_GAP = 3;
const ROW_GAP = 2.2;
const FACT_RADIUS = 0.28;
const BRANCH_RADIUS = 0.09;
const LABEL_HEIGHT = 0.55;
const LABEL_GAP = 0.35;
const LABEL_SPACE_RIGHT = 10; // world units reserved on the right for commit message sprites

function createTextSprite(text, color) {
  const font = "42px sans-serif";
  const measureContext = document.createElement("canvas").getContext("2d");
  measureContext.font = font;
  const textWidth = Math.ceil(measureContext.measureText(text).width);
  const canvas = document.createElement("canvas");
  canvas.width = textWidth + 24;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.font = font;
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, 12, 34);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set((canvas.width / canvas.height) * LABEL_HEIGHT, LABEL_HEIGHT, 1);
  sprite.center.set(0, 0.5); // left-align so the label starts exactly at its position
  return sprite;
}

export function createCommitGraph2D(container, payload, theme, onSelect, onHover, factDatesById, initialViewState) {
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(container.clientHeight, 360);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.textBackgroundColor);
  const entityColors = buildEntityColors(theme);
  const { trunkColorByPositionKey, factColorByPositionKey } = buildExperienceColorMaps(payload, theme);
  const textColor = ensureReadableColor(theme.textColor, theme.textBackgroundColor);
  const highlightColor = ensureReadableColor(theme.textColor, theme.textBackgroundColor);

  // Lane assignment: one vertical lane per EXPERIENCE position (sorted by depth then lane),
  // plus fallback lanes for any other endpoint position (e.g. PERSON nodes used by LINK lines).
  const laneIndexByKey = new Map();
  payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .map((node) => ({ key: positionKey(node.x, node.y), x: node.x, y: node.y }))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y))
    .forEach(({ key }) => {
      if (!laneIndexByKey.has(key)) laneIndexByKey.set(key, laneIndexByKey.size);
    });
  payload.nodes3d.forEach((node) => {
    const key = positionKey(node.x, node.y);
    if (!laneIndexByKey.has(key)) laneIndexByKey.set(key, laneIndexByKey.size);
  });

  const experienceIdByPositionKey = new Map(payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .map((node) => [positionKey(node.x, node.y), node.id]));

  const maxZ = Math.max(1, ...payload.nodes3d.map((node) => node.z));
  const laneX = (key) => (laneIndexByKey.get(key) ?? 0) * LANE_GAP;
  const zToY = (z) => (maxZ - z) * ROW_GAP; // newest commits at the top
  const to2d = (point) => new THREE.Vector3(laneX(positionKey(point[0], point[1])), zToY(point[2]), 0);

  const graphWidth = Math.max(1, laneIndexByKey.size - 1) * LANE_GAP;
  const graphHeight = maxZ * ROW_GAP;
  const centerX = graphWidth / 2;
  const centerY = graphHeight / 2;

  // Orthographic frustum sized so the whole graph fits on first load.
  const aspect = width / height;
  const margin = 3;
  const viewHeight = Math.max(graphHeight + margin * 2, (graphWidth + LABEL_SPACE_RIGHT + margin * 2) / aspect, 6);
  const camera = new THREE.OrthographicCamera(
    (-viewHeight * aspect) / 2, (viewHeight * aspect) / 2, viewHeight / 2, -viewHeight / 2, 0.1, 1000
  );
  // Only restore view state that was captured by a previous, healthy 2D session; a 3D perspective
  // view state (or one missing fields) is incompatible and intentionally ignored.
  const has2DViewState = Boolean(
    initialViewState &&
    typeof initialViewState.zoom === "number" && Number.isFinite(initialViewState.zoom) &&
    initialViewState.position && Number.isFinite(initialViewState.position.x) && Number.isFinite(initialViewState.position.y) &&
    initialViewState.target && Number.isFinite(initialViewState.target.x) && Number.isFinite(initialViewState.target.y)
  );
  camera.position.set(has2DViewState ? initialViewState.position.x : centerX, has2DViewState ? initialViewState.position.y : centerY, 50);
  if (has2DViewState) {
    camera.zoom = initialViewState.zoom;
    camera.updateProjectionMatrix();
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate = false; // pan/zoom only: this view stays flat like a git commit graph
  controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.minZoom = 0.2;
  controls.maxZoom = 8;
  if (has2DViewState) {
    controls.target.set(initialViewState.target.x, initialViewState.target.y, 0);
  } else {
    controls.target.set(centerX, centerY, 0);
  }
  controls.update();

  const disposables = [];
  const track = (object) => {
    disposables.push(object);
    scene.add(object);
    return object;
  };

  // Same color resolution rule as the 3D renderer: BRANCH_OUT lands on the child EXPERIENCE (`to`);
  // BRANCH_MERGE departs from it (`from`); LINK uses the shared link accent.
  const resolveLineColor = (line) => {
    if (line.lineType === "LINK") return entityColors.LINK;
    const endpoint = line.lineType === "BRANCH_MERGE" ? line.from : line.to;
    return trunkColorByPositionKey.get(positionKey(endpoint[0], endpoint[1])) || entityColors.EXPERIENCE;
  };

  const nodeById = new Map(payload.nodes3d.map((node) => [node.id, node]));
  const branchMeshes = [];
  const factMeshes = [];
  const experienceMeshesById = new Map();
  const factMeshesById = new Map();
  const tipByExperienceId = new Map();

  payload.lines3d.forEach((line) => {
    const color = resolveLineColor(line);
    const from = to2d(line.from);
    const to = to2d(line.to);
    let mesh;
    if (line.lineType === "LINK") {
      const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
      const material = new THREE.LineDashedMaterial({ color, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.7 });
      mesh = new THREE.Line(geometry, material);
      mesh.computeLineDistances();
    } else {
      const points = line.controlPoints?.length
        ? new THREE.QuadraticBezierCurve3(
            from,
            // Flat variant of the 3D midpoint control, nudged perpendicular to the connector.
            new THREE.Vector3(
              (from.x + to.x) / 2 - (to.y - from.y) * 0.18,
              (from.y + to.y) / 2 + (to.x - from.x) * 0.18,
              0
            ),
            to
          ).getPoints(24)
        : [from, to];
      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, Math.max(points.length - 1, 1), BRANCH_RADIUS, 8, false);
      mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
    }
    track(mesh);
    if (line.lineType === "BRANCH") {
      const experienceId = line.id.replace("branch-", "");
      mesh.userData = { ...nodeById.get(experienceId), baseColor: color };
      const meshes = experienceMeshesById.get(experienceId) || [];
      meshes.push(mesh);
      experienceMeshesById.set(experienceId, meshes);
      branchMeshes.push(mesh);
      tipByExperienceId.set(experienceId, to); // `to` is the newest (top-most) end of the branch
    }
  });

  // EXPERIENCE lane labels next to each branch tip, like branch tags in a git commit graph.
  payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const trunkColor = trunkColorByPositionKey.get(key) || entityColors.EXPERIENCE;
      const tip = tipByExperienceId.get(node.id);
      const sprite = createTextSprite(node.label, trunkColor);
      sprite.position.set(
        (tip?.x ?? laneX(key)) + FACT_RADIUS + LABEL_GAP,
        (tip?.y ?? zToY(0)) + LABEL_HEIGHT,
        0
      );
      track(sprite);
    });

  // FACT commit dots with a commit-message label, mirroring a git commit graph row.
  payload.nodes3d
    .filter((node) => node.entityType === "FACT")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const color = factColorByPositionKey.get(key) || entityColors.FACT;
      const opacity = node.isDirectFact ? 1 : 0.32;
      const center = to2d([node.x, node.y, node.z]);
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(FACT_RADIUS, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
      );
      mesh.position.copy(center);
      mesh.userData = { ...node, baseColor: color, baseOpacity: opacity };
      track(mesh);
      factMeshes.push(mesh);

      const firstForId = !factMeshesById.has(node.id);
      const meshes = factMeshesById.get(node.id) || [];
      meshes.push(mesh);
      factMeshesById.set(node.id, meshes);

      // The layout emits one FACT node per visible lane; label only the first so text doesn't duplicate.
      if (firstForId) {
        const dateLabel = factDatesById?.get(node.id);
        const sprite = createTextSprite(dateLabel ? `${node.label} — ${dateLabel}` : node.label, textColor);
        sprite.material.opacity = opacity;
        sprite.position.set(center.x + FACT_RADIUS + LABEL_GAP, center.y, 0);
        track(sprite);
      }
    });

  // Highlight hovered node plus its linked entities / parent EXPERIENCEs (same rule as 3D).
  const setHighlight = (node) => {
    const highlightedIds = new Set(node ? [node.id, ...(node.linkedEntityIds || []), ...(node.parentExperienceIds || [])] : []);
    if (node?.entityType === "FACT") {
      const experienceId = experienceIdByPositionKey.get(positionKey(node.x, node.y));
      if (experienceId) highlightedIds.add(experienceId);
    }
    experienceMeshesById.forEach((meshes, id) => {
      meshes.forEach((mesh) => mesh.material.color.set(highlightedIds.has(id) ? highlightColor : mesh.userData.baseColor));
    });
    factMeshesById.forEach((meshes, id) => {
      meshes.forEach((mesh) => {
        const highlighted = highlightedIds.has(id);
        mesh.material.color.set(highlighted ? highlightColor : mesh.userData.baseColor);
        mesh.material.opacity = highlighted ? 1 : mesh.userData.baseOpacity;
      });
    });
    renderer.render(scene, camera);
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let lastHoverAt = 0;
  const intersectEntity = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects([...factMeshes, ...branchMeshes])[0]?.object.userData;
  };
  const handleMove = (event) => {
    if (performance.now() - lastHoverAt < 100) return;
    lastHoverAt = performance.now();
    const node = intersectEntity(event) || null;
    setHighlight(node);
    onHover?.(node, event);
  };
  const handleClick = (event) => {
    const node = intersectEntity(event);
    if (node) onSelect?.(node);
  };
  renderer.domElement.addEventListener("pointermove", handleMove);
  renderer.domElement.addEventListener("click", handleClick);

  const resize = () => {
    const nextWidth = Math.max(container.clientWidth, 320);
    const nextHeight = Math.max(container.clientHeight, 360);
    const nextAspect = nextWidth / nextHeight;
    camera.left = (-viewHeight * nextAspect) / 2;
    camera.right = (viewHeight * nextAspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight);
    renderer.render(scene, camera);
  };
  window.addEventListener("resize", resize);
  controls.addEventListener("change", () => renderer.render(scene, camera));
  renderer.render(scene, camera);

  const disposeFn = () => {
    window.removeEventListener("resize", resize);
    renderer.domElement.removeEventListener("pointermove", handleMove);
    renderer.domElement.removeEventListener("click", handleClick);
    controls.dispose();
    disposables.forEach((object) => {
      object.geometry?.dispose();
      object.material?.map?.dispose();
      object.material?.dispose();
    });
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  };
  disposeFn.getViewState = () => ({
    position: camera.position.clone(),
    zoom: camera.zoom,
    target: controls.target.clone(),
  });
  return disposeFn;
}
