import assert from "node:assert/strict";
import test from "node:test";
import { freshModel, initialModel, update } from "../src/core.ts";

const enc = new TextEncoder();
const b = (value: string) => enc.encode(value);

function modelWithTrack() {
  let model = freshModel();
  [model] = update(model, {
    kind: "octave_search_done",
    status: 200,
    body: b(JSON.stringify({ results: [{
      id: "136889400",
      title: "Starboy",
      artist: { name: "The Weeknd" },
      album: { title: "Starboy", cover_medium: "https://cdn-images.dzcdn.net/cover.jpg" },
      duration: 230,
      previewUrl: "https://cdnt-preview.dzcdn.net/preview.mp3"
    }] })),
  });
  return model;
}

test("boot model requests persisted state without mutating defaults", () => {
  const [model] = initialModel();
  assert.equal(model.page, "home");
  assert.equal(model.quality, "320");
});

test("navigation history is bounded and reversible", () => {
  let model = freshModel();
  [model] = update(model, { kind: "go_search" });
  [model] = update(model, { kind: "go_library" });
  [model] = update(model, { kind: "go_settings" });
  assert.equal(model.page, "settings");
  [model] = update(model, { kind: "go_back" });
  assert.equal(model.page, "library");
  [model] = update(model, { kind: "go_forward" });
  assert.equal(model.page, "settings");
});

test("repeat cycles off -> context -> one -> off", () => {
  let model = freshModel();
  [model] = update(model, { kind: "cycle_repeat" });
  assert.equal(model.repeat, "context");
  [model] = update(model, { kind: "cycle_repeat" });
  assert.equal(model.repeat, "one");
  [model] = update(model, { kind: "cycle_repeat" });
  assert.equal(model.repeat, "off");
});

test("queue snapshots a track, rejects duplicates, removes entries, and clears", () => {
  let model = modelWithTrack();
  [model] = update(model, { kind: "queue_track", queueTrackId: 1 });
  [model] = update(model, { kind: "queue_track", queueTrackId: 1 });
  assert.equal(model.queue.length, 1);
  assert.equal(model.queue[0].id, 1);
  assert.equal(new TextDecoder().decode(model.queue[0].track.title), "Starboy");
  [model] = update(model, { kind: "remove_queue_track", queueRemoveId: 1 });
  assert.equal(model.queue.length, 0);
  [model] = update(model, { kind: "queue_track", queueTrackId: 1 });
  [model] = update(model, { kind: "clear_queue" });
  assert.equal(model.queue.length, 0);
});

test("likes persist as track snapshots and saved rows can remove them", () => {
  let model = modelWithTrack();
  [model] = update(model, { kind: "toggle_like", likeTrackId: 1 });
  assert.equal(model.likedTracks.length, 1);
  [model] = update(model, { kind: "remove_liked_track", likedRemoveId: 1 });
  assert.equal(model.likedTracks.length, 0);
});

test("local playlist can be created, populated, and cleared", () => {
  let model = modelWithTrack();
  [model] = update(model, { kind: "create_playlist" });
  assert.equal(model.playlistCreated, true);
  assert.equal(model.page, "playlist");
  [model] = update(model, { kind: "add_to_playlist", playlistTrackId: 1 });
  [model] = update(model, { kind: "add_to_playlist", playlistTrackId: 1 });
  assert.equal(model.playlistTracks.length, 1);
  [model] = update(model, { kind: "remove_playlist_track", playlistRemoveId: 1 });
  assert.equal(model.playlistTracks.length, 0);
  [model] = update(model, { kind: "add_to_playlist", playlistTrackId: 1 });
  [model] = update(model, { kind: "clear_playlist" });
  assert.equal(model.playlistTracks.length, 0);
});

test("quality, autoplay, and now-playing view controls are deterministic", () => {
  let model = freshModel();
  assert.equal(model.quality, "320");
  [model] = update(model, { kind: "quality_lossless" });
  assert.equal(model.quality, "lossless");
  [model] = update(model, { kind: "quality_128" });
  assert.equal(model.quality, "128");
  const autoplay = model.autoplay;
  [model] = update(model, { kind: "toggle_autoplay" });
  assert.equal(model.autoplay, !autoplay);
  const showNowPlaying = model.showNowPlaying;
  [model] = update(model, { kind: "toggle_now_playing" });
  assert.equal(model.showNowPlaying, !showNowPlaying);
});

test("preset browse actions enter search loading state", () => {
  let model = freshModel();
  [model] = update(model, { kind: "search_trending" });
  assert.equal(model.page, "search");
  assert.equal(model.searchPhase, "loading_octave");
  [model] = update(freshModel(), { kind: "search_chill" });
  assert.equal(model.page, "search");
  assert.equal(model.searchPhase, "loading_octave");
});

test("current track snapshot survives replacement of search results", () => {
  let model = modelWithTrack();
  [model] = update(model, { kind: "play_track", playTrackId: 1 });
  assert.equal(new TextDecoder().decode(model.nowTrack.title), "Starboy");
  [model] = update(model, { kind: "fallback_search_done", status: 200, body: b('{"data":[]}') });
  assert.equal(new TextDecoder().decode(model.nowTrack.title), "Starboy");
});

test("current song can be queued, liked, and saved directly from Now Playing", () => {
  let model = modelWithTrack();
  [model] = update(model, { kind: "play_track", playTrackId: 1 });
  [model] = update(model, { kind: "queue_now" });
  assert.equal(model.queue.length, 1);
  [model] = update(model, { kind: "toggle_now_like" });
  assert.equal(model.likedTracks.length, 1);
  [model] = update(model, { kind: "add_now_to_playlist" });
  assert.equal(model.playlistCreated, true);
  assert.equal(model.playlistTracks.length, 1);
});

test("empty player actions do not fabricate playback", () => {
  let model = freshModel();
  [model] = update(model, { kind: "toggle_play" });
  assert.equal(model.playing, false);
  assert.equal(model.nowId, 0);
});
