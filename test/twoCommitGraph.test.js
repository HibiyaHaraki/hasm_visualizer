import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommitGraph2D } from "../twoCommitGraph.js";
import { computeVisualizerLayoutJS } from "../layoutCalculator.js";
import { computeTimeLayout } from "../graph2DLayout.js";

test("TC-03-2D-TIME-001 time projection handles empty, coincident, and scaled coordinates", () => {
  const empty = computeTimeLayout({ nodes3d: [] }, 30, 37, 400);
  assert.deepEqual(empty.ticks, []);
  assert.equal(empty.contentHeightPx, 400);
  assert.ok(Number.isFinite(empty.toY(0)));
  const payload = {
    nodes3d: [0, 0, 1, 10].map((z, index) => ({ id: String(index), entityType: "FACT", z })),
  };
  const base = computeTimeLayout(payload, 30, 37);
  assert.deepEqual(base.ticks.map((node) => node.z), [10, 1, 0]);
  assert.equal((base.toY(0) - base.toY(1)) / (base.toY(0) - base.toY(10)), 0.1);
  for (const scale of [0.5, 2]) {
    const scaled = computeTimeLayout(payload, 30 * scale, 37);
    assert.equal(scaled.toY(0) - scaled.toY(10), (base.toY(0) - base.toY(10)) * scale);
  }
  const coincident = computeTimeLayout({ nodes3d: payload.nodes3d.slice(0, 2) }, 30, 37);
  assert.equal(coincident.ticks.length, 1);
  assert.equal(coincident.toY(0), 52);
});

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.style = {};
    this.listeners = new Map();
    this.classList = { add() {} };
    this.clientWidth = 230;
    this.clientHeight = 260;
  }
  set textContent(value) {
    this.text = value;
    this.children = [];
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  appendChild(child) { this.children.push(child); child.parentElement = this; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  removeEventListener(name) { this.listeners.delete(name); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 230, bottom: 260 }; }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
}

test("SVG renders dashed LINKs, follows scrolling, and highlights LINKs from hollow FACT centers", () => {
  const saved = new Map(["document", "window", "getComputedStyle"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = new Map();
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
  };
  globalThis.window = {
    innerWidth: 1000, innerHeight: 1000,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "", overflowX: "visible", overflowY: "visible" });
  let dispose;
  try {
    const payload = computeVisualizerLayoutJS({
      experiences: [
        { id: "parent", name: "Parent" },
        { id: "child", name: "Child", parentExperienceIds: ["parent"] },
        { id: "other", name: "Other" },
      ],
      facts: Array.from({ length: 16 }, (_, index) => ({
        id: `f${index}`, experienceIds: [index % 2 ? "other" : "child"],
        occurredAt: `2020-01-${String(index + 1).padStart(2, "0")}`,
      })),
      links: [
        { id: "ff", relatedIds: ["f0", "f1"] },
        { id: "ef", relatedIds: ["f0", "other"] },
        { id: "ee", relatedIds: ["parent", "other"] },
        { id: "multi", relatedIds: ["f14", "f15", "child", "other"] },
      ],
    }, { timeScaleMode: "SequentialIndex" });
    const container = new Element("div");
    const theme = { mainColor: "#3377aa", textColor: "#eeeeee", textBackgroundColor: "#111111" };
    let hovered;
    let selected;
    dispose = createCommitGraph2D(container, payload, theme, (node) => { selected = node; }, (node) => { hovered = node; });
    const elements = container.descendants();
    const links = elements.filter((element) => element.getAttribute("stroke-dasharray"));
    assert.equal(links.length, 9);
    assert.ok(links.slice(3).every((element) => element.style.display !== "none" && element.getAttribute("d")));
    links.slice(3).forEach((element) => {
      element.listeners.get("click")();
      assert.equal(selected.entityType, "LINK");
      assert.equal(selected.id, "multi");
    });
    assert.ok(links.every((element) => element.getAttribute("fill") === "none"
      && !element.getAttribute("d").includes("Z")));
    const before = links[2].getAttribute("d");
    dispose.setScrollTop(120);
    assert.notEqual(links[2].getAttribute("d"), before);

    const circles = elements.filter((element) => element.tagName === "circle");
    const factNodes = payload.nodes3d.filter((node) => node.entityType === "FACT");
    const directIndex = factNodes.findIndex((node) => node.id === "f0" && node.isDirectFact);
    const reflectedIndex = factNodes.findIndex((node) => node.id === "f0" && !node.isDirectFact);
    const reflected = circles[reflectedIndex];
    assert.equal(reflected.getAttribute("fill"), "none");
    assert.equal(reflected.getAttribute("pointer-events"), "all");
    circles[directIndex].listeners.get("pointerenter")({});
    const directOpacities = links.map((element) => element.getAttribute("opacity"));
    circles[directIndex].listeners.get("pointerleave")({});
    assert.ok(links.every((element) => element.getAttribute("opacity") === "0.7"));
    reflected.listeners.get("pointerenter")({});
    assert.equal(hovered.id, "f0");
    assert.equal(hovered.isDirectFact, false);
    assert.deepEqual(links.map((element) => element.getAttribute("opacity")), directOpacities);
    assert.deepEqual(directOpacities, ["1", "1", "0.7", ...Array(6).fill("0.7")]);
    reflected.listeners.get("pointerleave")({});
    assert.equal(hovered, null);
    assert.equal(reflected.getAttribute("fill"), "none");
    dispose.setHighlight(factNodes[directIndex]);
    assert.equal(links[0].getAttribute("opacity"), "1");
    dispose.setHighlight(null);
    dispose();
    dispose = null;
    assert.equal(listeners.size, 0);
    assert.equal(container.children.length, 0);
  } finally {
    dispose?.();
    saved.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
});
