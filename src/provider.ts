import { asciiBytes } from "@native-sdk/core";

export type Bytes = Uint8Array;
export type OctaveQuality = "q128" | "q320" | "lossless";

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
export const OCTAVE_DEFAULT_QUALITY: OctaveQuality = "q320";

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
  const segment = quality === "q128" ? asciiBytes("128") : quality === "lossless" ? asciiBytes("lossless") : asciiBytes("320");
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
  const start = Math.max(0, from);
  if (needle.length === 0) return start <= haystack.length ? start : -1;
  for (let i = start; i + needle.length <= haystack.length; i += 1) if (bytesEqualAt(haystack, i, needle)) return i;
  return -1;
}

function decodeHex(ch: number): number {
  if (ch >= 0x30 && ch <= 0x39) return ch - 0x30;
  if (ch >= 0x41 && ch <= 0x46) return 10 + ch - 0x41;
  if (ch >= 0x61 && ch <= 0x66) return 10 + ch - 0x61;
  return -1;
}

function jsonStringAt(bytes: Bytes, quoteAt: number): Bytes {
  if (quoteAt < 0 || quoteAt >= bytes.length || bytes[quoteAt] !== 0x22) return new Uint8Array(0);
  const out = new Uint8Array(bytes.length - quoteAt);
  let size = 0;
  let escaped = false;
  for (let i = quoteAt + 1; i < bytes.length; i += 1) {
    const ch = bytes[i];
    if (!escaped && ch === 0x22) return out.slice(0, size);
    if (!escaped && ch === 0x5c) { escaped = true; continue; }
    if (escaped) {
      if (ch === 0x6e) out[size] = 0x0a;
      else if (ch === 0x72) out[size] = 0x0d;
      else if (ch === 0x74) out[size] = 0x09;
      else if (ch === 0x62) out[size] = 0x08;
      else if (ch === 0x66) out[size] = 0x0c;
      else if (ch === 0x75 && i + 4 < bytes.length) {
        const h0 = decodeHex(bytes[i + 1]); const h1 = decodeHex(bytes[i + 2]); const h2 = decodeHex(bytes[i + 3]); const h3 = decodeHex(bytes[i + 4]);
        if (h0 >= 0 && h1 >= 0 && h2 >= 0 && h3 >= 0) {
          const code = h0 * 4096 + h1 * 256 + h2 * 16 + h3;
          if (code < 0x80) out[size] = code;
          else out[size] = 0x3f;
          i += 4;
        } else out[size] = 0x3f;
      } else out[size] = ch;
      size += 1;
      escaped = false;
      continue;
    }
    out[size] = ch;
    size += 1;
  }
  return new Uint8Array(0);
}

function jsonStringAfter(body: Bytes, key: Bytes, from: number): Bytes {
  const at = findFrom(body, key, from);
  if (at < 0) return new Uint8Array(0);
  let cursor = at + key.length;
  while (cursor < body.length && (body[cursor] === 0x20 || body[cursor] === 0x09 || body[cursor] === 0x0a || body[cursor] === 0x0d)) cursor += 1;
  return jsonStringAt(body, cursor);
}

function parseUnsignedAt(body: Bytes, from: number): number {
  let cursor = from;
  while (cursor < body.length && (body[cursor] === 0x20 || body[cursor] === 0x09 || body[cursor] === 0x0a || body[cursor] === 0x0d)) cursor += 1;
  let value = 0;
  let digits = 0;
  while (cursor < body.length) {
    const ch = body[cursor];
    if (ch < 0x30 || ch > 0x39) break;
    value = value * 10 + (ch - 0x30);
    digits += 1;
    cursor += 1;
  }
  return digits > 0 ? value : -1;
}

function unsignedBytesAt(body: Bytes, from: number): Bytes {
  let cursor = from;
  while (cursor < body.length && (body[cursor] === 0x20 || body[cursor] === 0x09 || body[cursor] === 0x0a || body[cursor] === 0x0d)) cursor += 1;
  if (cursor >= body.length) return new Uint8Array(0);
  if (body[cursor] === 0x22) return jsonStringAt(body, cursor);
  const start = cursor;
  while (cursor < body.length && body[cursor] >= 0x30 && body[cursor] <= 0x39) cursor += 1;
  return cursor > start ? body.slice(start, cursor) : new Uint8Array(0);
}

function jsonEscaped(input: Bytes): Bytes {
  let extra = 0;
  for (const ch of input) if (ch === 0x22 || ch === 0x5c || ch === 0x0a || ch === 0x0d || ch === 0x09) extra += 1;
  const out = new Uint8Array(input.length + extra);
  let at = 0;
  for (const ch of input) {
    if (ch === 0x22 || ch === 0x5c) { out[at] = 0x5c; out[at + 1] = ch; at += 2; }
    else if (ch === 0x0a) { out[at] = 0x5c; out[at + 1] = 0x6e; at += 2; }
    else if (ch === 0x0d) { out[at] = 0x5c; out[at + 1] = 0x72; at += 2; }
    else if (ch === 0x09) { out[at] = 0x5c; out[at + 1] = 0x74; at += 2; }
    else { out[at] = ch; at += 1; }
  }
  return out;
}

export function octaveLyricsBody(track: Track): Bytes {
  const q = asciiBytes("\"");
  const comma = asciiBytes(",");
  const id = concat3(asciiBytes("{\"id\":"), q, concatBytes(jsonEscaped(track.remoteId), q));
  const title = concat5(comma, asciiBytes("\"title\":"), q, jsonEscaped(track.title), q);
  const artist = concat5(comma, asciiBytes("\"artist\":"), q, jsonEscaped(track.artist), q);
  const album = concat5(comma, asciiBytes("\"album\":"), q, jsonEscaped(track.album), q);
  const duration = concat3(comma, asciiBytes("\"duration\":"), decimalBytes(track.durationSec));
  return concatBytes(concatBytes(concatBytes(id, title), concatBytes(artist, album)), concatBytes(duration, asciiBytes(",\"source\":\"deezer\"}")));
}

function isLrcTimestampTag(input: Bytes, start: number, end: number): boolean {
  if (end <= start + 1 || end - start > 18) return false;
  let sawColon = false;
  let sawDigit = false;
  for (let i = start + 1; i < end; i += 1) {
    const ch = input[i];
    if (ch >= 0x30 && ch <= 0x39) { sawDigit = true; continue; }
    if (ch === 0x3a) { sawColon = true; continue; }
    if (ch === 0x2e) continue;
    return false;
  }
  return sawDigit && sawColon;
}

export function stripLrcTimestamps(input: Bytes): Bytes {
  if (input.length === 0) return input;
  const out = new Uint8Array(input.length);
  let size = 0;
  let i = 0;
  while (i < input.length) {
    if (input[i] === 0x5b) {
      let close = i + 1;
      const limit = Math.min(input.length, i + 20);
      while (close < limit && input[close] !== 0x5d) close += 1;
      if (close < limit && input[close] === 0x5d && isLrcTimestampTag(input, i, close)) {
        i = close + 1;
        if (i < input.length && input[i] === 0x20) i += 1;
        continue;
      }
    }
    out[size] = input[i];
    size += 1;
    i += 1;
  }
  return out.slice(0, size);
}

export function parseOctaveLyrics(body: Bytes): Bytes {
  const synced = jsonStringAfter(body, asciiBytes("\"syncedLyrics\":"), 0);
  if (synced.length > 0) return stripLrcTimestamps(synced);
  const plain = jsonStringAfter(body, asciiBytes("\"plainLyrics\":"), 0);
  if (plain.length > 0) return plain;
  const lyrics = jsonStringAfter(body, asciiBytes("\"lyrics\":"), 0);
  if (lyrics.length > 0) return lyrics;
  return jsonStringAfter(body, asciiBytes("\"text\":"), 0);
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
    const parsedDuration = parseUnsignedAt(body, durationAt + durationKey.length);
    const duration = parsedDuration >= 0 && parsedDuration <= 9007199254740991 ? Math.trunc(parsedDuration) : 0;
    if (remoteId.length > 0 && title.length > 0) {
      out.push({ remoteId: remoteId, title: title, artist: artist, album: album, durationSec: duration, coverUrl: cover, fallbackPreviewUrl: preview });
    }
    cursor = previewAt + previewKey.length;
  }
  return out;
}

export function parseDeezerSearch(body: Bytes): readonly Track[] {
  const idKey = asciiBytes("\"id\":");
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
    const idAt = findFrom(body, idKey, cursor);
    if (idAt < 0) break;
    const titleAt = findFrom(body, titleKey, idAt);
    const durationAt = findFrom(body, durationKey, titleAt);
    const previewAt = findFrom(body, previewKey, durationAt);
    const artistAt = findFrom(body, artistKey, previewAt);
    const albumAt = findFrom(body, albumKey, artistAt);
    if (titleAt < 0 || durationAt < 0 || previewAt < 0 || artistAt < 0 || albumAt < 0) break;
    const remoteId = unsignedBytesAt(body, idAt + idKey.length);
    const title = jsonStringAfter(body, titleKey, titleAt);
    const artist = jsonStringAfter(body, nameKey, artistAt);
    const album = jsonStringAfter(body, titleKey, albumAt);
    const cover = jsonStringAfter(body, coverKey, albumAt);
    const preview = jsonStringAfter(body, previewKey, previewAt);
    const parsedDuration = parseUnsignedAt(body, durationAt + durationKey.length);
    const duration = parsedDuration >= 0 && parsedDuration <= 9007199254740991 ? Math.trunc(parsedDuration) : 0;
    if (remoteId.length > 0 && title.length > 0) out.push({ remoteId, title, artist, album, durationSec: duration, coverUrl: cover, fallbackPreviewUrl: preview });
    cursor = albumAt + albumKey.length;
  }
  return out;
}

export function parseOctaveResolve(body: Bytes): ResolvedTrack | undefined {
  const url = jsonStringAfter(body, asciiBytes("\"url\":"), 0);
  if (url.length === 0) return undefined;
  const preview = jsonStringAfter(body, asciiBytes("\"preview\":"), 0);
  return { url, preview };
}

export function formatSeconds(durationSeconds: number): Bytes {
  const safe = durationSeconds >= 0 && durationSeconds <= 86400 ? Math.trunc(durationSeconds) : 0;
  const minutes = Math.trunc(safe / 60);
  const seconds = safe - minutes * 60;
  const prefix = asciiBytes(`${minutes}:`);
  const suffix = seconds < 10 ? asciiBytes(`0${seconds}`) : asciiBytes(`${seconds}`);
  return concatBytes(prefix, suffix);
}
