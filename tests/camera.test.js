import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera, MAX_ZOOM } from '../src/ui/camera.js';

function camera(viewW = 800, viewH = 600, worldW = 800, worldH = 600, dpr = 1) {
  const cam = new Camera();
  cam.setWorld(worldW, worldH);
  cam.setView(viewW, viewH, dpr);
  return cam;
}

test('fit shows the whole map, centered', () => {
  const cam = camera(1000, 600, 800, 600);
  assert.equal(cam.zoom, 1);
  assert.equal(cam.left, 100);
  assert.equal(cam.top, 0);
  assert.deepEqual(cam.toCell(100.5, 0.5), { x: 0, y: 0 });
  assert.deepEqual(cam.toCell(899.5, 599.5), { x: 799, y: 599 });
});

test('a map bigger than the view fits by shrinking and fills it; one much smaller scales up by whole pixels', () => {
  assert.equal(camera(800, 600, 2000, 1500).zoom, 0.4);
  assert.equal(camera(1200, 900, 800, 600).zoom, 1.5);
  assert.equal(camera(1000, 700, 200, 150).zoom, 4);
  assert.equal(camera(1000, 700, 200, 150, 2).zoom, 4.5, 'whole device pixels on a sharper screen');
});

test('zooming keeps the point under the pointer in place', () => {
  const cam = camera();
  for (const factor of [2, 1.5, 3]) {
    const before = cam.toCell(300, 200);
    cam.zoomAt(factor, 300, 200);
    const after = cam.toCell(300, 200);
    assert.ok(Math.abs(after.x - before.x) <= 1 && Math.abs(after.y - before.y) <= 1, `${JSON.stringify([before, after])}`);
  }
  assert.ok(!cam.fitted);
});

test('zoom stops at the fit and at the maximum, and zooming out to the fit recenters', () => {
  const cam = camera();
  cam.zoomAt(1e6, 10, 10);
  assert.equal(cam.zoom, MAX_ZOOM);
  assert.equal(cam.zoomAt(0.5, 10, 10), true);
  cam.zoomAt(1e-6, 10, 10);
  assert.equal(cam.zoom, 1);
  assert.ok(cam.fitted);
  assert.equal(cam.left, 0);
  assert.equal(cam.zoomAt(0.5, 10, 10), false, 'already as far out as it goes');
});

test('zooming in far enough sticks to whole device pixels', () => {
  const cam = camera();
  cam.zoomAt(1.2, 400, 300);
  assert.equal(cam.zoom, 1.2);
  cam.zoomAt(4.3 / 1.2, 400, 300);
  assert.equal(cam.zoom, 4);
  const sharp = camera(800, 600, 800, 600, 2);
  sharp.zoomAt(2.6, 400, 300);
  assert.equal(sharp.zoom, 2.5);
});

test('a zoom button always moves, even where small steps would round away', () => {
  const cam = camera();
  const seen = [cam.zoom];
  for (let i = 0; i < 5; i++) {
    cam.zoomStep(1);
    assert.ok(cam.zoom > seen.at(-1));
    seen.push(cam.zoom);
  }
  while (!cam.fitted) {
    const z = cam.zoom;
    cam.zoomStep(-1);
    assert.ok(cam.zoom < z);
  }
});

test('panning moves the view and stops at the edges of the map', () => {
  const cam = camera();
  cam.zoomAt(4, 400, 300);
  const start = cam.toCell(400, 300);
  cam.pan(-40, 0);
  assert.equal(cam.toCell(400, 300).x, start.x + 10);
  cam.pan(1e6, 1e6);
  assert.deepEqual(cam.toCell(0, 0), { x: 0, y: 0 });
  cam.pan(-1e7, -1e7);
  assert.deepEqual(cam.toCell(799.5, 599.5), { x: 799, y: 599 });
});

test('zoomed in, resizing the view leaves what’s on screen where it is', () => {
  const cam = camera(800, 600, 800, 600, 2);
  cam.zoomAt(14, 400, 300);
  cam.pan(100, 60);
  const before = [cam.left, cam.top];
  cam.setView(800, 579, 2);
  assert.deepEqual([cam.left, cam.top], before, 'shorter');
  cam.setView(800, 600, 2);
  assert.deepEqual([cam.left, cam.top], before, 'and back');
  cam.setView(700, 600, 2);
  assert.deepEqual([cam.left, cam.top], before, 'narrower');
});

test('toView undoes toCell', () => {
  const cam = camera(800, 600, 400, 300, 2);
  cam.zoomAt(3, 200, 150);
  const { x, y } = cam.toCell(321, 123);
  const v = cam.toView(x + 0.5, y + 0.5);
  assert.deepEqual(cam.toCell(v.x, v.y), { x, y });
});

test('a resized view refits while fitted, and keeps the zoom once zoomed in', () => {
  const cam = camera();
  cam.setView(400, 300, 1);
  assert.equal(cam.zoom, 0.5);
  cam.setView(800, 600, 1);
  cam.zoomAt(4, 400, 300);
  const z = cam.zoom;
  cam.setView(700, 500, 1);
  assert.equal(cam.zoom, z);
  cam.setWorld(100, 100);
  assert.ok(cam.fitted, 'a different map starts fitted');
});
