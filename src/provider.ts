import { asciiBytes } from "@native-sdk/core";

export type Bytes = Uint8Array;
export type OctaveQuality = "128" | "320" | "lossless";

export interface Track {
  readonly remoteId: Bytes;
  readonly title: Bytes;
  readonly artist: Bytes;
  readonly album: Bytes;
  readonly durationSec: number;
  readonly coverUrl: Bytes;
  readonly fallbackPreviewUrl: Bytes;
}

export interface ResolvedTrack {
  readonly url: Bytes;
  readonly preview: Bytes;
}

export const OCTAVE_ORIGIN = asciiBytes("https://music.octavestreaming.com");
export const OCTAVE_API = asciiBytes("https://api.octavestreaming.com/api");
export const DEEZER_API = asciiBytes("https://api.deezer.com");
export const OCTAVE_DEFAULT_QUALITY: OctaveQuality = "320";

const HEX = asciiBytes("0123456789ABCDEF");

export function concatBytes(a: Bytes, b: Bytes): Bytes {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function concat3(a: Bytes, b: Bytes, c: Bytes): Bytes {
  return concatBytes(concatBytes(a, b), c);
}

function concat5(a: Bytes, b: Bytes, c: Bytes, d: Bytes, e: Bytes): Bytes {
  return concatBytes(concat3(a, b, c), concatBytes(d, e));
}

function safeQueryByte(ch: number): boolean {
  return (ch >= 0x41 && ch <= 0x5a) || (ch >= 0x61 && ch <= 0x7a) || (ch >= 0x30 && ch <= 0x39) || ch === 0x2d || ch === 0x2e || ch === 0x5f || ch === 0x7e;
}

export function percentEncode(input: Bytes): Bytes {
  let size = 0;
  for (const ch of input) size += safeQueryByte(ch) ? 1 : 3;
  const out = new Uint8Array(size);
  let at = 0;
  for (const ch of input) {
    if (safeQueryByte(ch)) {
      out[at] = ch;
      at += 1;
    } else {
      out[at] = 0x25;
      out[at + 1] = HEX[(ch >> 4) & 15];
      out[at + 2] = HEX[ch & 15];
      at += 3;
    }
  }
  return out;
}

function decimalBytes(value: number): Bytes {
  let rest = value >= 0 && value <= 9999 ? Math.trunc(value) : 0;
  const out = new Uint8Array(4);
  let size = 0;
  let thousands = 0;
  while (rest >= 1000) { rest -= 1000; thousands += 1; }
  let hundreds = 0;
  while (rest >= 100) { rest -= 100; hundreds += 1; }
  let tens = 0;
  while (rest >= 10) { rest -= 10; tens += 1; }
  if (thousands > 0) { out[size] = 0x30 + thousands; size += 1; }
  if (size > 0 || hundreds > 0) { out[size] = 0x30 + hundreds; size += 1; }
  if (size > 0 || tens > 0) { out[size] = 0x30 + tens; size += 1; }
  out[size] = 0x30 + rest;
  size += 1;
  return out.slice(0, size);
}

/** Production routes extracted from Octave's deployed Next.js client. */
export function octaveSearchUrl(query: Bytes): Bytes {
  return concat5(OCTAVE_API, asciiBytes("/search/tracks?query="), percentEncode(query), asciiBytes("&limit="), asciiBytes("30"));
}

export function deezerSearchFallbackUrl(query: Bytes): Bytes {
  return concat3(DEEZER_API, asciiBytes("/search?limit=30&q="), percentEncode(query));
}

export function octaveResolveUrl(remoteId: Bytes): Bytes {
  return octaveResolveUrlWithQuality(remoteId, OCTAVE_DEFAULT_QUALITY);
}

export function octaveResolveUrlWithQuality(remoteId: Bytes, quality: OctaveQuality): Bytes {
  const segment = quality === "128" ? asciiBytes("128") : quality === "lossless" ? asciiBytes("lossless") : asciiBytes("320");
  return concat5(OCTAVE_API, asciiBytes("/track/"), remoteId, asciiBytes("?quality="), segment);
}

export function octaveTrackRadioUrl(remoteId: Bytes): Bytes {
  return concat3(OCTAVE_API, asciiBytes("/track/"), concatBytes(remoteId, asciiBytes("/radio")));
}

export function octaveTrendingUrl(): Bytes {
  return concatBytes(OCTAVE_API, asciiBytes("/search/trending"));
}

export function octaveLyricsUrl(): Bytes {
  return concatBytes(OCTAVE_API, asciiBytes("/lyrics"));
}

function bytesEqualAt(haystack: Bytes, at: number, needle: Bytes): boolean {
  if (at < 0 || at + needle.length > haystack.length) return false;
  for (let i = 0; i < needle.length; i += 1) if (haystack[at + i] !== needle[i]) return false;
  return true;
}

function findFrom(haystack: Bytes, needle: Bytes, from: number): number {
  if (needle.length === 0) return from;
  for (let i = Math.max(0, from); i + needle.length <= haystack.length; i += 1) if (bytesEqualAt(haystack, i, needle)) return i;
  return -1;
}

function parseUnsignedAt(bytes: Bytes, at: number): number {
  let value = 0;
  let i = at;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x3a)) i += 1;
  let seen = false;
  while (i < bytes.length && bytes[i] >= 0x30 && bytes[i] <= 0x39) {
    seen = true;
    value = value * 10 + (bytes[i] - 0x30);
    if (value > 9007199254740991) return 0;
    i += 1;
  }
  return seen ? Math.trunc(value) : 0;
}

function jsonStringAfter(bytes: Bytes, key: Bytes, from: number): Bytes {
  const keyAt = findFrom(bytes, key, from);
  if (keyAt < 0) return new Uint8Array(0);
  let i = keyAt + key.length;
  while (i < bytes.length && bytes[i] !== 0x22) i += 1;
  if (i >= bytes.length) return new Uint8Array(0);
  i += 1;
  const out = new Uint8Array(4096);
  let size = 0;
  while (i < bytes.length && size < out.length) {
    const ch = bytes[i];
    if (ch === 0x22) return out.slice(0, size);
    if (ch === 0x5c && i + 1 < bytes.length) {
      const escaped = bytes[i + 1];
      if (escaped === 0x22 || escaped === 0x5c || escaped === 0x2f) out[size] = escaped;
      else if (escaped === 0x6e) out[size] = 0x0a;
      else if (escaped === 0x72) out[size] = 0x0d;
      else if (escaped === 0x74) out[size] = 0x09;
      else if (escaped === 0x75 && i + 5 < bytes.length) {
        const h0 = bytes[i + 2]; const h1 = bytes[i + 3]; const h2 = bytes[i + 4]; const h3 = bytes[i + 5];
        const validHex = (h0 >= 0x30 && h0 <= 0x39 || h0 >= 0x41 && h0 <= 0x46 || h0 >= 0x61 && h0 <= 0x66)
          && (h1 >= 0x30 && h1 <= 0x39 || h1 >= 0x41 && h1 <= 0x46 || h1 >= 0x61 && h1 <= 0x66)
          && (h2 >= 0x30 && h2 <= 0x39 || h2 >= 0x41 && h2 <= 0x46 || h2 >= 0x61 && h2 <= 0x66)
          && (h3 >= 0x30 && h3 <= 0x39 || h3 >= 0x41 && h3 <= 0x46 || h3 >= 0x61 && h3 <= 0x66);
        out[size] = 0x3f;
        size += 1;
        i += validHex ? 6 : 2;
        continue;
      }
      else out[size] = 0x3f;
      size += 1;
      i += 2;
    } else {
      out[size] = ch;
      size += 1;
      i += 1;
    }
  }
  return new Uint8Array(0);
}

function unsignedBytesAt(bytes: Bytes, at: number): Bytes {
  let start = at;
  while (start < bytes.length && (bytes[start] === 0x20 || bytes[start] === 0x3a)) start += 1;
  let end = start;
  while (end < bytes.length && bytes[end] >= 0x30 && bytes[end] <= 0x39) end += 1;
  return end > start ? bytes.slice(start, end) : new Uint8Array(0);
}

function idBefore(bytes: Bytes, before: number): Bytes {
  const key = asciiBytes("\"id\":");
  const start = Math.max(0, before - 180);
  let found = -1;
  let cursor = start;
  while (cursor < before) {
    const next = findFrom(bytes, key, cursor);
    if (next < 0 || next >= before) break;
    found = next;
    cursor = next + key.length;
  }
  return found < 0 ? new Uint8Array(0) : unsignedBytesAt(bytes, found + key.length);
}

export function parseOctaveSearch(body: Bytes): readonly Track[] {
  const idKey = asciiBytes("\"id\":");
  const titleKey = asciiBytes("\"title\":");
  const durationKey = asciiBytes("\"duration\":");
  const previewKey = asciiBytes("\"previewUrl\":");
  const artistKey = asciiBytes("\"artist\":{");
  const albumKey = asciiBytes("\"album\":{");
  const nameKey = asciiBytes("\"name\":");
  const coverKey = asciiBytes("\"cover_medium\":");
  const out: Track[] = [];
  let cursor = 0;
  while (out.length < 30) {
    const idAt = findFrom(body, idKey, cursor);
    if (idAt < 0) break;
    const titleAt = findFrom(body, titleKey, idAt);
    const artistAt = findFrom(body, artistKey, titleAt);
    const albumAt = findFrom(body, albumKey, artistAt);
    const durationAt = findFrom(body, durationKey, albumAt);
    const previewAt = findFrom(body, previewKey, durationAt);
    if (titleAt < 0 || artistAt < 0 || albumAt < 0 || durationAt < 0 || previewAt < 0) break;
    const idValueAt = idAt + idKey.length;
    const numericId = unsignedBytesAt(body, idValueAt);
    const remoteId = numericId.length > 0 ? numericId : jsonStringAfter(body, idKey, idAt);
    const title = jsonStringAfter(body, titleKey, titleAt);
    const artist = jsonStringAfter(body, nameKey, artistAt);
    const album = jsonStringAfter(body, titleKey, albumAt);
    const cover = jsonStringAfter(body, coverKey, albumAt);
    const preview = jsonStringAfter(body, previewKey, previewAt);
    const duration = parseUnsignedAt(body, durationAt + durationKey.length);
    if (remoteId.length > 0 && title.length > 0) {
      out.push({ remoteId: remoteId, title: title, artist: artist, album: album, durationSec: duration, coverUrl: cover, fallbackPreviewUrl: preview });
    }
    cursor = previewAt + previewKey.length;
  }
  return out;
}

export function parseDeezerSearch(body: Bytes): readonly Track[] {
  const titleKey = asciiBytes("\"title\":");
  const durationKey = asciiBytes("\"duration\":");
  const previewKey = asciiBytes("\"preview\":");
  const artistKey = asciiBytes("\"artist\":{");
  const albumKey = asciiBytes("\"album\":{");
  const nameKey = asciiBytes("\"name\":");
  const coverKey = asciiBytes("\"cover_medium\":");
  const out: Track[] = [];
  let cursor = 0;
  while (out.length < 30) {
    const titleAt = findFrom(body, titleKey, cursor);
    if (titleAt < 0) break;
    const artistAt = findFrom(body, artistKey, titleAt);
    const albumAt = findFrom(body, albumKey, titleAt);
    const durationAt = findFrom(body, durationKey, titleAt);
    const previewAt = findFrom(body, previewKey, titleAt);
    if (artistAt < 0 || albumAt < 0 || durationAt < 0 || previewAt < 0) break;
    const remoteId = idBefore(body, titleAt);
    const title = jsonStringAfter(body, titleKey, titleAt);
    const artist = jsonStringAfter(body, nameKey, artistAt);
    const album = jsonStringAfter(body, titleKey, albumAt);
    const cover = jsonStringAfter(body, coverKey, albumAt);
    const preview = jsonStringAfter(body, previewKey, previewAt);
    const duration = parseUnsignedAt(body, durationAt + durationKey.length);
    if (remoteId.length > 0 && title.length > 0) {
      out.push({ remoteId: remoteId, title: title, artist: artist, album: album, durationSec: duration, coverUrl: cover, fallbackPreviewUrl: preview });
    }
    cursor = Math.max(previewAt + previewKey.length, titleAt + titleKey.length);
  }
  return out;
}

export function parseOctaveResolve(body: Bytes): ResolvedTrack {
  const url = jsonStringAfter(body, asciiBytes("\"url\":"), 0);
  const preview = jsonStringAfter(body, asciiBytes("\"preview\":"), 0);
  return { url: url, preview: preview };
}

export function formatSeconds(value: number): Bytes {
  let seconds = value >= 0 && value < 86400 ? Math.trunc(value) : 0;
  let minutes = 0;
  while (seconds >= 60) { seconds -= 60; minutes += 1; }
  const left = decimalBytes(minutes);
  const right = seconds < 10 ? concatBytes(asciiBytes("0"), decimalBytes(seconds)) : decimalBytes(seconds);
  return concat3(left, asciiBytes(":"), right);
}
