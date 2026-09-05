import * as THREE from "three";
import {
  buildEntityColors,
  buildExperienceColorMaps,
  ensureReadableColor,
  positionKey,
} from "./threeCommitGraph.js";
import {
  LANE_GAP,
  ROW_GAP,
  ROW_HEIGHT_PX,
  TABLE_HEADER_HEIGHT_PX,
  computeFactRowIndexById,
  computeLaneIndexByKey,
  laneX,
} from "./graph2DLayout.js";

// Git-Extensions-style 2D commit graph rendered with Three.js: an orthographic camera looks straight
// at the XY plane, EXPERIENCEs become vertical branch lanes with colored header chips at the top,
// and FACTs become commit dots snapped to a shared row grid. The row grid is shared with the HTML
// FACT table rendered beside this panel (see HasmVisualizerComponent), so every dot aligns with its
// title/time row. Colors come from the exact same helpers as the 3D renderer, so FACT and
// EXPERIENCE colors are identical between 2D and 3D modes.

const FACT_RADIUS = 0.28;
const BRANCH_RADIUS = 0.09;
const LABEL_HEIGHT = 0.55;
const LABEL_GAP = 0.35;
const TABLE_SPACE_RIGHT = 2; // world units of margin on the right; the FACT table lives in HTML next to this canvas

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

export function createCommitGraph2D(container, payload, theme, onSelect, onHover, factDatesById, initialViewState, scrollSync) {
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(container.clientHeight, 360);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.textBackgroundColor);
  const entityColors = buildEntityColors(theme);
  const { trunkColorByPositionKey, factColorByPositionKey } = buildExperienceColorMaps(payload, theme);
  const textColor = ensureReadableColor(theme.textColor, theme.textBackgroundColor);
  const highlightColor = ensureReadableColor(theme.textColor, theme.textBackgroundColor);

  // Lane assignment: one vertical lane per parallel EXPERIENCE branch (shared with the table split).
  const laneIndexByKey = computeLaneIndexByKey(payload);

  const experienceIdByPositionKey = new Map(payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .map((node) => [positionKey(node.x, node.y), node.id]));

  // Row grid shared with the HTML FACT table: newest fact at row 0 (top).
  const rowIndexById = computeFactRowIndexById(payload);
  const rowCount = rowIndexById.size || 1;
  const maxZ = Math.max(1, ...payload.nodes3d.map((node) => node.z));
  const totalGraphHeight = rowCount * ROW_GAP;
  const factRowY = (factId) => totalGraphHeight - (rowIndexById.get(factId) ?? 0) * ROW_GAP - ROW_GAP / 2;
  const zExtentY = (z) => totalGraphHeight - (z / maxZ) * totalGraphHeight;
  const to2d = (point) => new THREE.Vector3(laneX(laneIndexByKey, positionKey(point[0], point[1])), zExtentY(point[2]), 0);

  const graphWidth = Math.max(1, laneIndexByKey.size - 1) * LANE_GAP;
  const centerX = graphWidth / 2;
  const centerY = totalGraphHeight / 2;

  // The camera uses a constant world-per-pixel ratio (no zoom), so one grid row always renders
  // exactly ROW_HEIGHT_PX tall — keeping graph dots aligned with the HTML table rows while scrolling.
  const worldPerPixel = ROW_GAP / ROW_HEIGHT_PX;
  const applyCameraFrustum = () => {
    const viewWidth = Math.max(container.clientWidth, 320);
    const viewHeightPx = Math.max(container.clientHeight, 360);
    camera.left = (-viewWidth * worldPerPixel) / 2;
    camera.right = (viewWidth * worldPerPixel) / 2;
    camera.top = (viewHeightPx * worldPerPixel) / 2;
    camera.bottom = (-viewHeightPx * worldPerPixel) / 2;
    camera.updateProjectionMatrix();
  };
  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 1000);
  applyCameraFrustum();
  // Only restore a scroll offset captured by a previous, healthy 2D session.
  const restoredScrollTop =
    initialViewState && Number.isFinite(initialViewState.scrollTop) ? initialViewState.scrollTop : null;
  camera.position.set(centerX, centerY, 50);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // Vertical-scroll-only navigation: the wheel scrolls the shared time axis (and the FACT table
  // via onScroll); drag/zoom gestures are disabled so row alignment can never be broken.
  const viewportHeightWorld = () => camera.top - camera.bottom;
  const applyScrollTop = (scrollTop) => {
    const centeredScroll = scrollTop - (container.clientHeight - TABLE_HEADER_HEIGHT_PX) / 2;
    camera.position.y = totalGraphHeight - centeredScroll * worldPerPixel - viewportHeightWorld() / 2;
    renderer.render(scene, camera);
  };
  const currentScrollTop = () => {
    const centeredScroll = (totalGraphHeight - camera.position.y - viewportHeightWorld() / 2) / worldPerPixel;
    return centeredScroll + (container.clientHeight - TABLE_HEADER_HEIGHT_PX) / 2;
  };
  const handleWheel = (event) => {
    event.preventDefault();
    scrollSync?.onScroll(currentScrollTop() + event.deltaY);
  };
  renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

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
    }
  });

  // EXPERIENCE lane labels pinned to the scrollable header band at the top of each lane, aligned
  // with the FACT table's header row (like branch names in a git commit graph).
  const headerCenterY = totalGraphHeight + (TABLE_HEADER_HEIGHT_PX * worldPerPixel) / 2;
  payload.nodes3d
    .filter((node) => node.entityType === "EXPERIENCE")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const trunkColor = trunkColorByPositionKey.get(key) || entityColors.EXPERIENCE;
      const sprite = createTextSprite(node.label, trunkColor);
      sprite.position.set(laneX(laneIndexByKey, key) + LABEL_GAP, headerCenterY, 0);
      track(sprite);
    });

  // FACT commit dots snapped to their table row; labels live in the HTML table beside this panel.
  payload.nodes3d
    .filter((node) => node.entityType === "FACT")
    .forEach((node) => {
      const key = positionKey(node.x, node.y);
      const color = factColorByPositionKey.get(key) || entityColors.FACT;
      const opacity = node.isDirectFact ? 1 : 0.32;
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(FACT_RADIUS, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
      );
      mesh.position.set(laneX(laneIndexByKey, key), factRowY(node.id), 0);
      mesh.userData = { ...node, baseColor: color, baseOpacity: opacity };
      track(mesh);
      factMeshes.push(mesh);

      const meshes = factMeshesById.get(node.id) || [];
      meshes.push(mesh);
      factMeshesById.set(node.id, meshes);
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
    const scrollBefore = currentScrollTop();
    applyCameraFrustum();
    renderer.setSize(nextWidth, nextHeight);
    applyScrollTop(scrollBefore);
  };
  window.addEventListener("resize", resize);
  applyScrollTop(restoredScrollTop ?? 0);

  const disposeFn = () => {
    window.removeEventListener("resize", resize);
    renderer.domElement.removeEventListener("pointermove", handleMove);
    renderer.domElement.removeEventListener("click", handleClick);
    renderer.domElement.removeEventListener("wheel", handleWheel);
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
  disposeFn.getViewState = () => ({ scrollTop: currentScrollTop() });
  disposeFn.setScrollTop = applyScrollTop;
  return disposeFn;
}
