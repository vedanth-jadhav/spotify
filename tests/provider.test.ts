import assert from "node:assert/strict";
import test from "node:test";
import { deezerSearchFallbackUrl, octaveLyricsUrl, octaveStreamUrl, parseDeezerSearch, percentEncode } from "../src/provider.ts";

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (value: Uint8Array) => new TextDecoder().decode(value);

test("percentEncode is UTF-8 byte safe", () => {
  assert.equal(text(percentEncode(bytes("A B/é"))), "A%20B%2F%C3%A9");
});

test("endpoint builders remain centralized and deterministic", () => {
  assert.equal(text(octaveStreamUrl(3135556)), "https://music.octavestreaming.com/api/stream/3135556");
  assert.equal(text(octaveLyricsUrl(3135556)), "https://music.octavestreaming.com/api/lyrics/3135556");
  assert.equal(text(deezerSearchFallbackUrl(bytes("Daft Punk"))), "https://api.deezer.com/search?limit=30&q=Daft%20Punk");
});

test("Deezer-compatible parser extracts playable search rows", () => {
  const fixture = bytes('{"data":[{"id":3135556,"readable":true,"title":"Harder Better Faster Stronger","duration":224,"preview":"https://cdn.example/preview.mp3","artist":{"id":27,"name":"Daft Punk"},"album":{"id":302127,"title":"Discovery","cover_medium":"https://cdn.example/cover.jpg"}}]}');
  const tracks = parseDeezerSearch(fixture);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].id, 3135556);
  assert.equal(text(tracks[0].artist), "Daft Punk");
  assert.equal(text(tracks[0].album), "Discovery");
  assert.equal(text(tracks[0].streamUrl), "https://music.octavestreaming.com/api/stream/3135556");
});

test("malformed payload degrades to an empty result", () => {
  assert.deepEqual(parseDeezerSearch(bytes("not json")), []);
});
