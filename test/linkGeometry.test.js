import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createLinkGeometryResolver, linkHighlightIds } from "../linkGeometry.js";
import { computeVisualizerLayoutJS } from "../layoutCalculator.js";
import { limitRenderedNodes } from "../threeCommitGraph.js";

const node = (id, entityType, x, y, z = 0, extra = {}) => ({ id, entityType, x, y, z, ...extra });
const branch = (id, from, to) => ({ id: `branch-${id}`, lineType: "BRANCH", from, to });
const link = (fromId, toId) => ({ id: `${fromId}-${toId}`, lineType: "LINK", fromId, toId });
const viewport = { width: 200, height: 100, project: ([x, y, z]) => [x, y, z, 1] };
const close = (actual, expected) => actual.forEach((value, index) => {
  assert.ok(Math.abs(value - expected[index]) < 1e-8, `${actual} != ${expected}`);
});

function fixture() {
  return {
    nodes3d: [
      node("e1", "EXPERIENCE", -0.5, 0),
      node("e2", "EXPERIENCE", 0.5, 0),
      node("f1", "FACT", 0, 0.5, 0, { isDirectFact: true }),
      node("f2", "FACT", 0.7, -0.7, 0, { isDirectFact: true }),
    ],
    lines3d: [
      branch("e1", [-0.5, -4, 0], [-0.5, 4, 0]),
      branch("e2", [0.5, -0.2, 0], [0.5, 0.2, 0]),
    ],
  };
}

test("FACT-FACT connects recorded instances, never a later ancestor reflection", () => {
  const payload = fixture();
  payload.nodes3d.push(node("f1", "FACT", -0.5, 0.5, 0, { isDirectFact: false }));
  const result = createLinkGeometryResolver(payload)(link("f1", "f2"), viewport);
  close(result.from, [0, 0.5, 0]);
  close(result.to, [0.7, -0.7, 0]);
});

test("FACT-EXPERIENCE finds the nearest visible point in either endpoint order", () => {
  const resolve = createLinkGeometryResolver(fixture());
  close(resolve(link("f1", "e1"), viewport).to, [-0.5, 0.5, 0]);
  close(resolve(link("e1", "f1"), viewport).from, [-0.5, 0.5, 0]);
});

test("nearest point is clamped to the visible segment, not the full EXPERIENCE", () => {
  const payload = fixture();
  payload.nodes3d[2].y = 3;
  close(createLinkGeometryResolver(payload)(link("f1", "e1"), viewport).to, [-0.5, 1, 0]);
});

test("EXPERIENCE-EXPERIENCE starts nearest screen center and ends nearest that point", () => {
  const payload = fixture();
  payload.lines3d[1] = branch("e2", [0.5, 0.3, 0], [0.5, 0.7, 0]);
  const result = createLinkGeometryResolver(payload)(link("e1", "e2"), viewport);
  close(result.from, [-0.5, 0, 0]);
  close(result.to, [0.5, 0.3, 0]);
});

test("viewport movement recomputes endpoints without changing the layout", () => {
  const resolve = createLinkGeometryResolver(fixture());
  const moved = { ...viewport, project: ([x, y, z]) => [x, y - 2, z, 1] };
  assert.equal(resolve(link("e1", "e2"), moved), null);
  const result = resolve(link("f1", "e1"), moved);
  close(result.to, [-0.5, 1, 0]);
  close(resolve(link("e1", "e2"), viewport).from, [-0.5, 0, 0]);
});

test("offscreen, absent, and PERSON endpoints are not rendered", () => {
  const payload = fixture();
  payload.nodes3d.push(node("p", "PERSON", 0, 0));
  payload.lines3d[0] = branch("e1", [-2, -4, 0], [-2, 4, 0]);
  const resolve = createLinkGeometryResolver(payload);
  assert.equal(resolve(link("f1", "e1"), viewport), null);
  assert.equal(resolve(link("f1", "missing"), viewport), null);
  assert.equal(resolve(link("f1", "p"), viewport), null);
  payload.lines3d = [];
  assert.equal(createLinkGeometryResolver(payload)(link("f1", "e2"), viewport), null);
});

test("a one-FACT EXPERIENCE is a valid zero-length branch", () => {
  const payload = fixture();
  payload.lines3d[0] = branch("e1", [-0.5, 0.1, 0], [-0.5, 0.1, 0]);
  close(createLinkGeometryResolver(payload)(link("f1", "e1"), viewport).to, [-0.5, 0.1, 0]);
});

test("screen distance accounts for viewport aspect ratio", () => {
  const payload = fixture();
  payload.lines3d[0] = branch("e1", [-1, -1, 0], [1, 1, 0]);
  payload.nodes3d[2] = node("f1", "FACT", 1, -1);
  close(createLinkGeometryResolver(payload)(link("f1", "e1"), viewport).to, [0.6, 0.6, 0]);
});

test("perspective interpolation returns an on-branch point at the screen-space minimum", () => {
  const payload = fixture();
  payload.lines3d[0] = branch("e1", [-1, -1, -2], [1, 1, -6]);
  const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
  const perspective = {
    width: 200, height: 100,
    project: (point) => new THREE.Vector4(...point, 1).applyMatrix4(camera.projectionMatrix).toArray(),
  };
  const result = createLinkGeometryResolver(payload)(link("e1", "e2"), perspective);
  assert.equal(result, null); // e2 is on the camera plane, outside the near plane.
  payload.lines3d[1] = branch("e2", [0.5, -1, -4], [0.5, 1, -4]);
  const visible = createLinkGeometryResolver(payload)(link("e1", "e2"), perspective);
  close(visible.from, [0, 0, -4]);
});

test("3D near-plane clipping does not produce NaN or behind-camera endpoints", () => {
  const payload = fixture();
  payload.lines3d[0] = branch("e1", [0, 0, 1], [0, 0, -5]);
  payload.nodes3d[2] = node("f1", "FACT", 0.1, 0.1, -2);
  const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
  const perspective = { ...viewport, project: (point) => new THREE.Vector4(...point, 1).applyMatrix4(camera.projectionMatrix).toArray() };
  const result = createLinkGeometryResolver(payload)(link("f1", "e1"), perspective);
  assert.ok(result.to.every(Number.isFinite));
  assert.ok(result.to[2] <= -0.1 + 1e-8);
  payload.nodes3d[2].z = 0;
  assert.equal(createLinkGeometryResolver(payload)(link("f1", "e1"), perspective), null);
});

test("2D coordinates are mapped before interpolation even with non-linear time spacing", () => {
  const payload = fixture();
  payload.lines3d[0] = branch("e1", [-0.5, 0, 0], [-0.5, 0, 100]);
  payload.nodes3d[2] = node("f1", "FACT", 0.5, 0, 1);
  const map = ([x, , z]) => [x, z === 100 ? 1 : z === 1 ? 0.5 : -1, 0];
  const result = createLinkGeometryResolver(payload, map)(link("f1", "e1"), viewport);
  close(result.to, [-0.5, 0.5, 0]);
});

test("legacy membrane metadata is ignored by the renderer geometry resolver", () => {
  const line = { ...link("e1", "e2"), linkCategory: "MEMBRANE", linkShape: "RECT", rect: {} };
  close(createLinkGeometryResolver(fixture())(line, viewport).from, [-0.5, 0, 0]);
});

test("recursive FACTs highlight exactly the same endpoint LINKs as directly recorded FACTs", () => {
  const direct = node("f1", "FACT", 1, 2, 3, { isDirectFact: true });
  const reflected = { ...direct, x: 4, y: 5, isDirectFact: false };
  assert.deepEqual(linkHighlightIds(direct), linkHighlightIds(reflected));
  assert.deepEqual([...linkHighlightIds(reflected)], ["f1"]);
  assert.deepEqual([...linkHighlightIds({ id: "l", linkedEntityIds: ["f1", "e1"] })], ["l", "f1", "e1"]);
  assert.equal(linkHighlightIds(null).size, 0);
});

test("layout outputs dashed-line metadata for every supported pair, including branch membership", () => {
  const payload = computeVisualizerLayoutJS({
    experiences: [{ id: "parent" }, { id: "child", parentExperienceIds: ["parent"] }],
    facts: [
      { id: "f1", experienceIds: ["child"], occurredAt: "2020-01-01" },
      { id: "f2", experienceIds: ["parent"], occurredAt: "2020-01-02" },
    ],
    links: [{ id: "l", relatedIds: ["f1", "f2", "child", "parent"] }],
  }, {});
  const links = payload.lines3d.filter((line) => line.lineType === "LINK");
  assert.equal(links.length, 6);
  assert.ok(links.every((line) => line.linkShape === "LINE" && !line.rect && !line.triangle));
  const instances = payload.nodes3d.filter((item) => item.id === "f1");
  assert.equal(instances.length, 2);
  assert.equal(instances.filter((item) => !item.isDirectFact).length, 1);
  const trimmed = limitRenderedNodes(payload, 3).payload;
  const ids = new Set(trimmed.nodes3d.map((item) => item.id));
  assert.ok(trimmed.lines3d.filter((line) => line.lineType === "LINK").every((line) => ids.has(line.fromId) && ids.has(line.toId)));
});

test("TC-03-LINK-MULTI-JS: camelCase multi-entity LINKs emit all six pairs and retain ticket identity", () => {
  const payload = computeVisualizerLayoutJS({
    people: [{ personId: "p" }],
    experiences: [
      { experienceId: "e1" },
      { experienceId: "e2", parentExperienceIds: ["e1"] },
      { experienceId: "empty" },
    ],
    facts: [
      { factId: "f1", experienceIds: ["e2"], occurredAt: "2020-01-01" },
      { factId: "f2", experienceIds: ["e1"], occurredAt: "2020-01-02" },
    ],
    links: [
      { linkId: "multi", relatedIds: ["p", "f1", "f2", "e1", "e2", "f1", "missing", "empty"] },
      { linkId: "person-only", relatedIds: ["p"] },
      { linkId: "person-fact", relatedIds: ["p", "f1"] },
    ],
  }, {});
  const links = payload.lines3d.filter((line) => line.lineType === "LINK");
  assert.equal(links.length, 6);
  assert.deepEqual(links.map((line) => [line.fromId, line.toId]), [
    ["f1", "f2"], ["f1", "e1"], ["f1", "e2"],
    ["f2", "e1"], ["f2", "e2"], ["e1", "e2"],
  ]);
  assert.ok(links.every((line) => line.id === "multi"));
  const resolve = createLinkGeometryResolver(payload);
  const wideViewport = { width: 800, height: 600, project: ([x, y, z]) => [x / 20, y / 20, z / 20, 1] };
  assert.ok(links.every((line) => resolve(line, wideViewport)));
});
