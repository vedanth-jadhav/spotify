import { asciiBytes } from "@native-sdk/core";
import { type Bytes, type OctaveQuality, type Track } from "./provider.ts";

export interface PersistedState {
  readonly quality: OctaveQuality;
  readonly autoplay: boolean;
  readonly showNowPlaying: boolean;
  readonly playlistCreated: boolean;
  readonly likedTracks: readonly Track[];
  readonly playlistTracks: readonly Track[];
}

const MAGIC = asciiBytes("SPOT1");
const MAX_TRACKS = 30;
const MAX_FIELD = 1024;

function sameAt(bytes: Bytes, at: number, expected: Bytes): boolean {
  if (at < 0 || at + expected.length > bytes.length) return false;
  for (let i = 0; i < expected.length; i += 1) if (bytes[at + i] !== expected[i]) return false;
  return true;
}

function boundedLength(bytes: Bytes): number {
  return bytes.length >= 0 && bytes.length <= MAX_FIELD ? Math.trunc(bytes.length) : MAX_FIELD;
}

function trackSize(track: Track): number {
  return 4
    + 2 + boundedLength(track.remoteId)
    + 2 + boundedLength(track.title)
    + 2 + boundedLength(track.artist)
    + 2 + boundedLength(track.album)
    + 2 + boundedLength(track.coverUrl)
    + 2 + boundedLength(track.fallbackPreviewUrl);
}

function writeU16(out: Uint8Array, at: number, value: number): number {
  const safe = value >= 0 && value <= 65535 ? Math.trunc(value) : 0;
  out[at] = (safe >>> 8) & 255;
  out[at + 1] = safe & 255;
  return at + 2;
}

function writeU32(out: Uint8Array, at: number, value: number): number {
  const safe = value >= 0 && value <= 4294967295 ? Math.trunc(value) : 0;
  out[at] = (safe >>> 24) & 255;
  out[at + 1] = (safe >>> 16) & 255;
  out[at + 2] = (safe >>> 8) & 255;
  out[at + 3] = safe & 255;
  return at + 4;
}

function writeBytes(out: Uint8Array, at: number, bytes: Bytes): number {
  const length = boundedLength(bytes);
  let cursor = writeU16(out, at, length);
  for (let i = 0; i < length; i += 1) out[cursor + i] = bytes[i];
  return cursor + length;
}

function writeTrack(out: Uint8Array, at: number, track: Track): number {
  let cursor = writeU32(out, at, track.durationSec);
  cursor = writeBytes(out, cursor, track.remoteId);
  cursor = writeBytes(out, cursor, track.title);
  cursor = writeBytes(out, cursor, track.artist);
  cursor = writeBytes(out, cursor, track.album);
  cursor = writeBytes(out, cursor, track.coverUrl);
  cursor = writeBytes(out, cursor, track.fallbackPreviewUrl);
  return cursor;
}

export function encodeState(state: PersistedState): Bytes {
  const likedCount = state.likedTracks.length >= 0 && state.likedTracks.length <= MAX_TRACKS ? Math.trunc(state.likedTracks.length) : MAX_TRACKS;
  const playlistCount = state.playlistTracks.length >= 0 && state.playlistTracks.length <= MAX_TRACKS ? Math.trunc(state.playlistTracks.length) : MAX_TRACKS;
  let size = MAGIC.length + 6;
  for (let i = 0; i < likedCount; i += 1) size += trackSize(state.likedTracks[i]);
  for (let i = 0; i < playlistCount; i += 1) size += trackSize(state.playlistTracks[i]);
  const out = new Uint8Array(size);
  for (let i = 0; i < MAGIC.length; i += 1) out[i] = MAGIC[i];
  let at = MAGIC.length;
  out[at] = state.quality === "128" ? 0 : state.quality === "lossless" ? 2 : 1;
  out[at + 1] = state.autoplay ? 1 : 0;
  out[at + 2] = state.showNowPlaying ? 1 : 0;
  out[at + 3] = state.playlistCreated ? 1 : 0;
  out[at + 4] = likedCount;
  out[at + 5] = playlistCount;
  at += 6;
  for (let i = 0; i < likedCount; i += 1) at = writeTrack(out, at, state.likedTracks[i]);
  for (let i = 0; i < playlistCount; i += 1) at = writeTrack(out, at, state.playlistTracks[i]);
  return out;
}

interface ReadBytesResult { readonly bytes: Bytes; readonly next: number; readonly ok: boolean; }
interface ReadTrackResult { readonly track: Track; readonly next: number; readonly ok: boolean; }

function readU16(bytes: Bytes, at: number): number {
  if (at < 0 || at + 2 > bytes.length) return -1;
  return bytes[at] * 256 + bytes[at + 1];
}

function readU32(bytes: Bytes, at: number): number {
  if (at < 0 || at + 4 > bytes.length) return -1;
  return bytes[at] * 16777216 + bytes[at + 1] * 65536 + bytes[at + 2] * 256 + bytes[at + 3];
}

function readBytes(bytes: Bytes, at: number): ReadBytesResult {
  const length = readU16(bytes, at);
  if (length < 0 || length > MAX_FIELD || at + 2 + length > bytes.length) return { bytes: new Uint8Array(0), next: at, ok: false };
  return { bytes: bytes.slice(at + 2, at + 2 + length), next: at + 2 + length, ok: true };
}

function readTrack(bytes: Bytes, at: number): ReadTrackResult {
  const duration = readU32(bytes, at);
  if (duration < 0 || duration > 86400) return { track: emptyTrack(), next: at, ok: false };
  let cursor = at + 4;
  const remote = readBytes(bytes, cursor); if (!remote.ok) return { track: emptyTrack(), next: at, ok: false }; cursor = remote.next;
  const title = readBytes(bytes, cursor); if (!title.ok) return { track: emptyTrack(), next: at, ok: false }; cursor = title.next;
  const artist = readBytes(bytes, cursor); if (!artist.ok) return { track: emptyTrack(), next: at, ok: false }; cursor = artist.next;
  const album = readBytes(bytes, cursor); if (!album.ok) return { track: emptyTrack(), next: at, ok: false }; cursor = album.next;
  const cover = readBytes(bytes, cursor); if (!cover.ok) return { track: emptyTrack(), next: at, ok: false }; cursor = cover.next;
  const preview = readBytes(bytes, cursor); if (!preview.ok) return { track: emptyTrack(), next: at, ok: false }; cursor = preview.next;
  if (remote.bytes.length === 0 || title.bytes.length === 0) return { track: emptyTrack(), next: at, ok: false };
  return { track: { remoteId: remote.bytes, title: title.bytes, artist: artist.bytes, album: album.bytes, durationSec: Math.trunc(duration), coverUrl: cover.bytes, fallbackPreviewUrl: preview.bytes }, next: cursor, ok: true };
}

function emptyTrack(): Track {
  return { remoteId: new Uint8Array(0), title: new Uint8Array(0), artist: new Uint8Array(0), album: new Uint8Array(0), durationSec: 0, coverUrl: new Uint8Array(0), fallbackPreviewUrl: new Uint8Array(0) };
}

export function decodeState(bytes: Bytes): PersistedState | undefined {
  if (bytes.length < MAGIC.length + 6 || !sameAt(bytes, 0, MAGIC)) return undefined;
  let at = MAGIC.length;
  const qualityByte = bytes[at];
  const autoplayByte = bytes[at + 1];
  const showNowPlayingByte = bytes[at + 2];
  const playlistCreatedByte = bytes[at + 3];
  if ((qualityByte !== 0 && qualityByte !== 1 && qualityByte !== 2)
    || (autoplayByte !== 0 && autoplayByte !== 1)
    || (showNowPlayingByte !== 0 && showNowPlayingByte !== 1)
    || (playlistCreatedByte !== 0 && playlistCreatedByte !== 1)) return undefined;
  const autoplay = autoplayByte === 1;
  const showNowPlaying = showNowPlayingByte === 1;
  const playlistCreated = playlistCreatedByte === 1;
  const likedCount = bytes[at + 4];
  const playlistCount = bytes[at + 5];
  if (likedCount > MAX_TRACKS || playlistCount > MAX_TRACKS) return undefined;
  at += 6;
  const liked: Track[] = [];
  const playlist: Track[] = [];
  for (let i = 0; i < likedCount; i += 1) {
    const read = readTrack(bytes, at);
    if (!read.ok) return undefined;
    liked.push(read.track);
    at = read.next;
  }
  for (let i = 0; i < playlistCount; i += 1) {
    const read = readTrack(bytes, at);
    if (!read.ok) return undefined;
    playlist.push(read.track);
    at = read.next;
  }
  return { quality: qualityByte === 0 ? "128" : qualityByte === 2 ? "lossless" : "320", autoplay: autoplay, showNowPlaying: showNowPlaying, playlistCreated: playlistCreated, likedTracks: liked, playlistTracks: playlist };
}
