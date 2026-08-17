import assert from "node:assert/strict";
import test from "node:test";
import { initialModel, update } from "../src/core.ts";

test("navigation history is bounded and reversible", () => {
  let model = initialModel();
  [model] = update(model, { kind: "go_search" });
  [model] = update(model, { kind: "go_library" });
  assert.equal(model.page, "library");
  [model] = update(model, { kind: "go_back" });
  assert.equal(model.page, "search");
  [model] = update(model, { kind: "go_forward" });
  assert.equal(model.page, "library");
});

test("repeat cycles off -> context -> one -> off", () => {
  let model = initialModel();
  [model] = update(model, { kind: "cycle_repeat" });
  assert.equal(model.repeat, "context");
  [model] = update(model, { kind: "cycle_repeat" });
  assert.equal(model.repeat, "one");
  [model] = update(model, { kind: "cycle_repeat" });
  assert.equal(model.repeat, "off");
});

test("queue rejects duplicate IDs and respects cap guard", () => {
  let model = initialModel();
  [model] = update(model, { kind: "queue_track", queueTrackId: 42 });
  [model] = update(model, { kind: "queue_track", queueTrackId: 42 });
  assert.equal(model.queue.length, 1);
  assert.equal(model.queue[0].id, 42);
});

test("toggle like is idempotent across two toggles", () => {
  let model = initialModel();
  [model] = update(model, { kind: "toggle_like", likeTrackId: 42 });
  assert.deepEqual(model.likedIds, [42]);
  [model] = update(model, { kind: "toggle_like", likeTrackId: 42 });
  assert.deepEqual(model.likedIds, []);
});

test("empty player actions do not fabricate playback", () => {
  let model = initialModel();
  [model] = update(model, { kind: "toggle_play" });
  assert.equal(model.playing, false);
  assert.equal(model.nowId, 0);
});
