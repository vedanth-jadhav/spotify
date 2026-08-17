import assert from "node:assert/strict";
import test from "node:test";
import { octaveLyricsUrl, octaveResolveUrl, octaveResolveUrlWithQuality, octaveSearchUrl, octaveTrendingUrl, parseDeezerSearch, parseOctaveResolve, parseOctaveSearch, percentEncode, formatSeconds } from "../src/provider.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();
const b = (value: string) => enc.encode(value);
const s = (value: Uint8Array) => dec.decode(value);

test("percentEncode escapes UTF-8 and reserved query bytes", () => {
  assert.equal(s(percentEncode(b("daft punk & more"))), "daft%20punk%20%26%20more");
  assert.equal(s(percentEncode(b("Björk"))), "Bj%C3%B6rk");
});

test("Octave production routes match the deployed client contract", () => {
  assert.equal(s(octaveSearchUrl(b("Daft Punk"))), "https://api.octavestreaming.com/api/search/tracks?query=Daft%20Punk&limit=30");
  assert.equal(s(octaveResolveUrl(b("136889400"))), "https://api.octavestreaming.com/api/track/136889400?quality=320");
  assert.equal(s(octaveResolveUrlWithQuality(b("136889400"), "q128")), "https://api.octavestreaming.com/api/track/136889400?quality=128");
  assert.equal(s(octaveResolveUrlWithQuality(b("136889400"), "lossless")), "https://api.octavestreaming.com/api/track/136889400?quality=lossless");
  assert.equal(s(octaveTrendingUrl()), "https://api.octavestreaming.com/api/search/trending");
  assert.equal(s(octaveLyricsUrl()), "https://api.octavestreaming.com/api/lyrics");
});

test("parseOctaveSearch reads the live Octave search shape", () => {
  const fixture = b(JSON.stringify({ results: [{
    id: "136889400", title: "Starboy", artist: { id: "4050205", name: "The Weeknd" },
    album: { id: "14652356", title: "Starboy", cover_medium: "https://cdn-images.dzcdn.net/cover.jpg" },
    duration: 230, previewUrl: "https://cdnt-preview.dzcdn.net/preview.mp3", explicit: true, rank: 975897
  }] }));
  const tracks = parseOctaveSearch(fixture);
  assert.equal(tracks.length, 1);
  assert.equal(s(tracks[0].remoteId), "136889400");
  assert.equal(s(tracks[0].title), "Starboy");
  assert.equal(s(tracks[0].artist), "The Weeknd");
  assert.equal(s(tracks[0].album), "Starboy");
  assert.equal(tracks[0].durationSec, 230);
  assert.equal(s(tracks[0].coverUrl), "https://cdn-images.dzcdn.net/cover.jpg");
  assert.equal(s(tracks[0].fallbackPreviewUrl), "https://cdnt-preview.dzcdn.net/preview.mp3");
});

test("parseOctaveResolve returns the signed audio and preview URLs", () => {
  const resolved = parseOctaveResolve(b('{"url":"https://api.octavestreaming.com/audio/320?track=1&k=abc","preview":"https://preview/1.mp3","id":"1","quality":"q320"}'));
  assert.equal(s(resolved.url), "https://api.octavestreaming.com/audio/320?track=1&k=abc");
  assert.equal(s(resolved.preview), "https://preview/1.mp3");
});

test("Deezer fallback remains bounded and maps remote IDs without leaking them into native state", () => {
  const fixture = b(JSON.stringify({ data: [{
    id: 3135556, title: "Harder Better Faster Stronger", duration: 224, preview: "https://preview/3135556.mp3",
    artist: { name: "Daft Punk" }, album: { title: "Discovery", cover_medium: "https://cover/3135556.jpg" }
  }] }));
  const tracks = parseDeezerSearch(fixture);
  assert.equal(tracks.length, 1);
  assert.equal(s(tracks[0].remoteId), "3135556");
  assert.equal(s(tracks[0].title), "Harder Better Faster Stronger");
});

test("malformed payloads fail closed", () => {
  assert.deepEqual(parseOctaveSearch(b("not-json-ish")), []);
  const resolved = parseOctaveResolve(b("{}"));
  assert.equal(resolved.url.length, 0);
  assert.equal(resolved.preview.length, 0);
});


test("Octave parser accepts numeric remote IDs without stealing the title", () => {
  const fixture = b('{"results":[{"id":136889400,"title":"Björk \\u00e9","artist":{"name":"Björk"},"album":{"title":"Album","cover_medium":""},"duration":230,"previewUrl":"https://preview/1.mp3"}]}');
  const tracks = parseOctaveSearch(fixture);
  assert.equal(tracks.length, 1);
  assert.equal(s(tracks[0].remoteId), "136889400");
  assert.equal(s(tracks[0].title), "Björk ?");
});

test("Deezer parser caps catalog results at 30 tracks", () => {
  const data = Array.from({ length: 40 }, (_, i) => ({
    id: i + 10000, title: `Track ${i + 1}`, duration: 200, preview: `https://preview/${i}.mp3`,
    artist: { name: "Artist" }, album: { title: "Album", cover_medium: `https://cover/${i}.jpg` },
  }));
  assert.equal(parseDeezerSearch(b(JSON.stringify({ data }))).length, 30);
});

test("formatSeconds pads seconds and clamps invalid durations", () => {
  assert.equal(s(formatSeconds(230)), "3:50");
  assert.equal(s(formatSeconds(5)), "0:05");
  assert.equal(s(formatSeconds(-1)), "0:00");
});
