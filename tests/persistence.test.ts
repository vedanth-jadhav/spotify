import assert from "node:assert/strict";
import test from "node:test";
import { decodeState, encodeState } from "../src/persistence.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();
const b = (value: string) => enc.encode(value);

const track = {
  remoteId: b("136889400"), title: b("Starboy"), artist: b("The Weeknd"), album: b("Starboy"), durationSec: 230,
  coverUrl: b("https://cdn-images.dzcdn.net/cover.jpg"), fallbackPreviewUrl: b("https://cdnt-preview.dzcdn.net/preview.mp3"),
};

test("library and settings persistence round-trips without JSON", () => {
  const encoded = encodeState({ quality: "lossless", autoplay: false, showNowPlaying: true, playlistCreated: true, likedTracks: [track], playlistTracks: [track] });
  const restored = decodeState(encoded);
  assert.ok(restored);
  assert.equal(restored.quality, "lossless");
  assert.equal(restored.autoplay, false);
  assert.equal(restored.playlistCreated, true);
  assert.equal(restored.likedTracks.length, 1);
  assert.equal(dec.decode(restored.likedTracks[0].title), "Starboy");
  assert.equal(restored.playlistTracks.length, 1);
});

test("persistence rejects truncated and unrelated data", () => {
  assert.equal(decodeState(b("nope")), undefined);
  const encoded = encodeState({ quality: "320", autoplay: true, showNowPlaying: true, playlistCreated: false, likedTracks: [track], playlistTracks: [] });
  assert.equal(decodeState(encoded.slice(0, 12)), undefined);
});
