import { Cmd, Sub, asciiBytes } from "@native-sdk/core";
import { applyTextInputEvent, clampedInsertEvent, type TextEditState, type TextInputEvent } from "@native-sdk/core/text";
import { type AudioState } from "@native-sdk/core/events";
import { deezerSearchFallbackUrl, formatSeconds, octaveResolveUrl, octaveSearchUrl, parseDeezerSearch, parseOctaveResolve, parseOctaveSearch, type Bytes, type Track } from "./provider.ts";

export type Page = "home" | "search" | "library" | "lyrics" | "queue";
export type RepeatMode = "off" | "context" | "one";
export type SearchPhase = "idle" | "debouncing" | "loading_octave" | "loading_fallback" | "ready" | "failed";

interface Draft {
  readonly bytes: Bytes;
  readonly anchor: number;
  readonly focus: number;
  readonly compStart: number;
  readonly compEnd: number;
}

export interface QueueItem {
  readonly id: number;
}

export interface Model {
  readonly page: Page;
  readonly history: readonly Page[];
  readonly historyIndex: number;
  readonly search: Draft;
  readonly searchPhase: SearchPhase;
  readonly tracks: readonly Track[];
  readonly nowId: number;
  readonly queue: readonly QueueItem[];
  readonly playing: boolean;
  readonly buffering: boolean;
  readonly loadPending: boolean;
  readonly fallbackPlayback: boolean;
  readonly audioReady: boolean;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly volumePermille: number;
  readonly shuffle: boolean;
  readonly repeat: RepeatMode;
  readonly likedIds: readonly number[];
  readonly error: Bytes;
}

export interface TrackRow {
  readonly id: number;
  readonly title: Bytes;
  readonly artist: Bytes;
  readonly album: Bytes;
  readonly duration: Bytes;
  readonly active: boolean;
  readonly liked: boolean;
}

export type Msg =
  | { readonly kind: "go_home" }
  | { readonly kind: "go_search" }
  | { readonly kind: "go_library" }
  | { readonly kind: "go_lyrics" }
  | { readonly kind: "go_queue" }
  | { readonly kind: "go_back" }
  | { readonly kind: "go_forward" }
  | { readonly kind: "search_edit"; readonly edit: TextInputEvent }
  | { readonly kind: "search_fire"; readonly at: number }
  | { readonly kind: "octave_search_done"; readonly status: number; readonly body: Bytes }
  | { readonly kind: "octave_search_failed"; readonly reason: Bytes }
  | { readonly kind: "fallback_search_done"; readonly status: number; readonly body: Bytes }
  | { readonly kind: "fallback_search_failed"; readonly reason: Bytes }
  | { readonly kind: "resolve_track_done"; readonly status: number; readonly body: Bytes }
  | { readonly kind: "resolve_track_failed"; readonly reason: Bytes }
  | { readonly kind: "play_track"; readonly playTrackId: number }
  | { readonly kind: "toggle_play" }
  | { readonly kind: "next_track" }
  | { readonly kind: "prev_track" }
  | { readonly kind: "queue_track"; readonly queueTrackId: number }
  | { readonly kind: "toggle_like"; readonly likeTrackId: number }
  | { readonly kind: "toggle_shuffle" }
  | { readonly kind: "cycle_repeat" }
  | { readonly kind: "scrubbed"; readonly fraction: number }
  | { readonly kind: "volume_changed"; readonly fraction: number }
  | { readonly kind: "audio_event"; readonly state: AudioState; readonly positionMs: number; readonly durationMs: number; readonly playing: boolean; readonly buffering: boolean; readonly bands: Bytes }
  | { readonly kind: "clock_tick"; readonly at: number };

export const viewUnbound = [
  "search_fire", "octave_search_done", "octave_search_failed", "fallback_search_done", "fallback_search_failed", "resolve_track_done", "resolve_track_failed", "audio_event", "clock_tick",
] as const;

const MAX_SEARCH = 96;
const MAX_QUEUE = 100;
const CLOCK_MS = 250;
const SNAP_MS = 700;

function draftInit(): Draft {
  return { bytes: new Uint8Array(0), anchor: 0, focus: 0, compStart: -1, compEnd: -1 };
}

function draftState(draft: Draft): TextEditState {
  return {
    text: draft.bytes,
    selection: { anchor: draft.anchor, focus: draft.focus },
    composition: draft.compStart >= 0 ? { start: draft.compStart, end: draft.compEnd } : null,
  };
}

function editDraft(draft: Draft, edit: TextInputEvent): Draft {
  const state = draftState(draft);
  let next = applyTextInputEvent(state, edit, MAX_SEARCH);
  if (next === null) {
    const clamped = clampedInsertEvent(state, edit, MAX_SEARCH);
    if (clamped === null) return draft;
    next = applyTextInputEvent(state, clamped, MAX_SEARCH);
    if (next === null) return draft;
  }
  const compStart = next.composition === null ? -1 : next.composition.start;
  const compEnd = next.composition === null ? -1 : next.composition.end;
  return { bytes: next.text, anchor: next.selection.anchor, focus: next.selection.focus, compStart: compStart, compEnd: compEnd };
}

export function initialModel(): Model {
  return {
    page: "home",
    history: ["home"],
    historyIndex: 0,
    search: draftInit(),
    searchPhase: "idle",
    tracks: [],
    nowId: 0,
    queue: [],
    playing: false,
    buffering: false,
    loadPending: false,
    fallbackPlayback: false,
    audioReady: false,
    positionMs: 0,
    durationMs: 0,
    volumePermille: 760,
    shuffle: false,
    repeat: "off",
    likedIds: [],
    error: new Uint8Array(0),
  };
}

function navigate(model: Model, page: Page): Model {
  if (model.page === page) return model;
  const kept = model.history.slice(0, model.historyIndex + 1);
  return { ...model, page: page, history: [...kept, page], historyIndex: kept.length };
}

function trackById(model: Model, id: number): Track | undefined {
  if (id <= 0) return undefined;
  const index = id - 1;
  if (index < 0 || index >= model.tracks.length) return undefined;
  return model.tracks[index];
}

function currentTrack(model: Model): Track | undefined {
  return trackById(model, model.nowId);
}

function isLiked(model: Model, id: number): boolean {
  return model.likedIds.includes(id);
}

function nextId(model: Model): number {
  if (model.queue.length > 0) return model.queue[0].id;
  if (model.tracks.length === 0) return 0;
  if (model.repeat === "one" && model.nowId > 0) return model.nowId;
  if (model.nowId <= 0) return 1;
  if (model.shuffle && model.tracks.length > 1) {
    let next = model.nowId + 2;
    while (next > model.tracks.length) next -= model.tracks.length;
    if (next === model.nowId) {
      next += 1;
      if (next > model.tracks.length) next = 1;
    }
    return next;
  }
  if (model.nowId < model.tracks.length) return model.nowId + 1;
  return model.repeat === "context" ? 1 : 0;
}

function previousId(model: Model): number {
  if (model.tracks.length === 0) return 0;
  if (model.nowId <= 1) return model.repeat === "context" ? model.tracks.length : 1;
  return model.nowId - 1;
}

function dequeue(model: Model, id: number): readonly QueueItem[] {
  if (model.queue.length > 0 && model.queue[0].id === id) return model.queue.slice(1);
  return model.queue;
}

function startTrack(model: Model, id: number, track: Track, fallback: boolean): Model {
  const secondsRaw = track.durationSec;
  const seconds = secondsRaw >= 0 && secondsRaw <= 86400 ? Math.trunc(secondsRaw) : 0;
  return {
    ...model,
    nowId: id,
    queue: dequeue(model, id),
    playing: true,
    buffering: false,
    loadPending: true,
    fallbackPlayback: fallback,
    audioReady: false,
    positionMs: 0,
    durationMs: seconds * 1000,
    error: new Uint8Array(0),
  };
}

export function update(model: Model, msg: Msg): [Model, Cmd<Msg>] {
  switch (msg.kind) {
    case "go_home": return [navigate(model, "home"), Cmd.none];
    case "go_search": return [navigate(model, "search"), Cmd.none];
    case "go_library": return [navigate(model, "library"), Cmd.none];
    case "go_lyrics": return [navigate(model, "lyrics"), Cmd.none];
    case "go_queue": return [navigate(model, "queue"), Cmd.none];
    case "go_back": {
      if (model.historyIndex <= 0) return [model, Cmd.none];
      const index = model.historyIndex - 1;
      return [{ ...model, historyIndex: index, page: model.history[index] }, Cmd.none];
    }
    case "go_forward": {
      if (model.historyIndex + 1 >= model.history.length) return [model, Cmd.none];
      const index = model.historyIndex + 1;
      return [{ ...model, historyIndex: index, page: model.history[index] }, Cmd.none];
    }
    case "search_edit": {
      const search = editDraft(model.search, msg.edit);
      if (search.bytes.length === 0) return [{ ...model, search: search, searchPhase: "idle", tracks: [], error: new Uint8Array(0) }, Cmd.cancel("search-debounce")];
      return [{ ...model, page: "search", search: search, searchPhase: "debouncing", error: new Uint8Array(0) }, Cmd.delay("search-debounce", 260, "search_fire")];
    }
    case "search_fire": {
      if (model.search.bytes.length === 0) return [model, Cmd.none];
      return [
        { ...model, searchPhase: "loading_octave" },
        Cmd.fetch({ url: octaveSearchUrl(model.search.bytes), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "octave_search_done", err: "octave_search_failed" }),
      ];
    }
    case "octave_search_done": {
      const parsed = msg.status >= 200 && msg.status < 300 ? parseOctaveSearch(msg.body) : [];
      if (parsed.length > 0) return [{ ...model, tracks: parsed, searchPhase: "ready", error: new Uint8Array(0) }, Cmd.none];
      return [
        { ...model, searchPhase: "loading_fallback" },
        Cmd.fetch({ url: deezerSearchFallbackUrl(model.search.bytes), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "fallback_search_done", err: "fallback_search_failed" }),
      ];
    }
    case "octave_search_failed":
      return [
        { ...model, searchPhase: "loading_fallback" },
        Cmd.fetch({ url: deezerSearchFallbackUrl(model.search.bytes), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "fallback_search_done", err: "fallback_search_failed" }),
      ];
    case "fallback_search_done": {
      const parsed = msg.status >= 200 && msg.status < 300 ? parseDeezerSearch(msg.body) : [];
      if (parsed.length === 0) return [{ ...model, tracks: [], searchPhase: "failed", error: asciiBytes("No results available") }, Cmd.none];
      return [{ ...model, tracks: parsed, searchPhase: "ready", error: new Uint8Array(0) }, Cmd.none];
    }
    case "fallback_search_failed": return [{ ...model, tracks: [], searchPhase: "failed", error: msg.reason }, Cmd.none];
    case "resolve_track_done": {
      const track = currentTrack(model);
      if (track === undefined) return [{ ...model, playing: false, loadPending: false, audioReady: false }, Cmd.none];
      if (msg.status >= 200 && msg.status < 300) {
        const resolved = parseOctaveResolve(msg.body);
        if (resolved.url.length > 0) return [model, Cmd.audioPlay("player", { url: resolved.url }, { event: "audio_event" })];
        if (resolved.preview.length > 0) return [{ ...model, fallbackPlayback: true }, Cmd.audioPlay("player", { url: resolved.preview }, { event: "audio_event" })];
      }
      if (track.fallbackPreviewUrl.length > 0) return [{ ...model, fallbackPlayback: true }, Cmd.audioPlay("player", { url: track.fallbackPreviewUrl }, { event: "audio_event" })];
      return [{ ...model, playing: false, loadPending: false, audioReady: false, error: asciiBytes("Playback resolver returned no playable URL") }, Cmd.none];
    }
    case "resolve_track_failed": {
      const track = currentTrack(model);
      if (track !== undefined && track.fallbackPreviewUrl.length > 0) return [{ ...model, fallbackPlayback: true }, Cmd.audioPlay("player", { url: track.fallbackPreviewUrl }, { event: "audio_event" })];
      return [{ ...model, playing: false, loadPending: false, audioReady: false, error: msg.reason }, Cmd.none];
    }
    case "play_track": {
      const raw = msg.playTrackId;
      const id = raw >= 0 && raw <= 9007199254740991 ? Math.trunc(raw) : 0;
      if (id === 0) return [model, Cmd.none];
      const track = trackById(model, id);
      if (track === undefined) return [model, Cmd.none];
      return [startTrack(model, id, track, false), Cmd.fetch({ url: octaveResolveUrl(track.remoteId), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
    }
    case "toggle_play": {
      if (model.nowId === 0) {
        if (model.tracks.length === 0) return [model, Cmd.none];
        const track = trackById(model, 1);
        if (track === undefined) return [model, Cmd.none];
        return [startTrack(model, 1, track, false), Cmd.fetch({ url: octaveResolveUrl(track.remoteId), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      if (model.loadPending) return [model, Cmd.none];
      if (model.playing) return [{ ...model, playing: false }, Cmd.audioPause("player")];
      if (!model.audioReady) {
        const track = currentTrack(model);
        if (track === undefined) return [model, Cmd.none];
        return [{ ...model, playing: true, loadPending: true }, Cmd.fetch({ url: octaveResolveUrl(track.remoteId), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      return [{ ...model, playing: true }, Cmd.audioResume("player")];
    }
    case "next_track": {
      const id = nextId(model);
      if (id === 0) return [{ ...model, playing: false, audioReady: false }, Cmd.audioStop("player")];
      const track = trackById(model, id);
      if (track === undefined) return [{ ...model, playing: false, audioReady: false }, Cmd.audioStop("player")];
      return [startTrack(model, id, track, false), Cmd.fetch({ url: octaveResolveUrl(track.remoteId), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
    }
    case "prev_track": {
      if (model.positionMs > 4000) return [{ ...model, positionMs: 0 }, Cmd.audioSeek("player", 0)];
      const id = previousId(model);
      if (id === 0) return [model, Cmd.none];
      const track = trackById(model, id);
      if (track === undefined) return [model, Cmd.none];
      return [startTrack(model, id, track, false), Cmd.fetch({ url: octaveResolveUrl(track.remoteId), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
    }
    case "queue_track": {
      const raw = msg.queueTrackId;
      const id = raw >= 0 && raw <= 9007199254740991 ? Math.trunc(raw) : 0;
      if (id === 0 || model.queue.length >= MAX_QUEUE || model.queue.find((item) => item.id === id) !== undefined) return [model, Cmd.none];
      return [{ ...model, queue: [...model.queue, { id: id }] }, Cmd.none];
    }
    case "toggle_like": {
      const raw = msg.likeTrackId;
      const id = raw >= 0 && raw <= 9007199254740991 ? Math.trunc(raw) : 0;
      if (id === 0) return [model, Cmd.none];
      const exists = model.likedIds.includes(id);
      return [{ ...model, likedIds: exists ? model.likedIds.filter((likedId) => likedId !== id) : [...model.likedIds, id] }, Cmd.none];
    }
    case "toggle_shuffle": return [{ ...model, shuffle: !model.shuffle }, Cmd.none];
    case "cycle_repeat": return [{ ...model, repeat: model.repeat === "off" ? "context" : model.repeat === "context" ? "one" : "off" }, Cmd.none];
    case "scrubbed": {
      if (model.durationMs <= 0) return [model, Cmd.none];
      let permille = 0;
      let acc = 0.001;
      while (permille < 1000 && acc <= msg.fraction) { acc += 0.001; permille += 1; }
      let thousandth = 0;
      let rest = model.durationMs;
      while (rest >= 1000) { rest -= 1000; thousandth += 1; }
      const scaled = thousandth * permille;
      const target = scaled >= 0 && scaled <= 9007199254740991 ? Math.trunc(scaled) : 0;
      return [{ ...model, positionMs: target }, Cmd.audioSeek("player", target)];
    }
    case "volume_changed": {
      let permille = 0;
      let acc = 0.001;
      while (permille < 1000 && acc <= msg.fraction) { acc += 0.001; permille += 1; }
      return [{ ...model, volumePermille: permille }, Cmd.audioSetVolume("player", msg.fraction)];
    }
    case "audio_event": {
      switch (msg.state) {
        case "loaded": {
          const posRaw = msg.positionMs;
          const durationRaw = msg.durationMs;
          const pos = posRaw >= 0 && posRaw <= 9007199254740991 ? Math.trunc(posRaw) : 0;
          const duration = durationRaw > 0 && durationRaw <= 9007199254740991 ? Math.trunc(durationRaw) : model.durationMs;
          return [{ ...model, loadPending: false, audioReady: true, playing: msg.playing, buffering: msg.buffering, positionMs: pos, durationMs: duration }, Cmd.none];
        }
        case "position": {
          if (model.loadPending) return [model, Cmd.none];
          const posRaw = msg.positionMs;
          const durationRaw = msg.durationMs;
          const pos = posRaw >= 0 && posRaw <= 9007199254740991 ? Math.trunc(posRaw) : 0;
          const duration = durationRaw > 0 && durationRaw <= 9007199254740991 ? Math.trunc(durationRaw) : model.durationMs;
          if (model.playing && !msg.buffering && pos <= model.positionMs && model.positionMs - pos <= SNAP_MS) return [{ ...model, buffering: msg.buffering }, Cmd.none];
          return [{ ...model, positionMs: pos, durationMs: duration, buffering: msg.buffering }, Cmd.none];
        }
        case "spectrum": return [model, Cmd.none];
        case "completed": {
          const id = nextId(model);
          if (id === 0) return [{ ...model, playing: false, audioReady: false, positionMs: model.durationMs }, Cmd.none];
          const track = trackById(model, id);
          if (track === undefined) return [{ ...model, playing: false }, Cmd.none];
          return [startTrack(model, id, track, false), Cmd.fetch({ url: octaveResolveUrl(track.remoteId), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
        }
        case "failed":
        case "rejected": {
          const track = currentTrack(model);
          if (track !== undefined && !model.fallbackPlayback && track.fallbackPreviewUrl.length > 0) return [startTrack(model, model.nowId, track, true), Cmd.audioPlay("player", { url: track.fallbackPreviewUrl }, { event: "audio_event" })];
          return [{ ...model, playing: false, buffering: false, loadPending: false, audioReady: false, error: asciiBytes("Playback unavailable for this track") }, Cmd.none];
        }
      }
    }
    case "clock_tick": {
      if (!model.playing || model.buffering || model.loadPending) return [model, Cmd.none];
      const next = model.positionMs + CLOCK_MS;
      return [{ ...model, positionMs: model.durationMs > 0 && next > model.durationMs ? model.durationMs : next }, Cmd.none];
    }
  }
}

export function subscriptions(model: Model): Sub<Msg> {
  return model.playing && !model.buffering && !model.loadPending ? Sub.timer("player-clock", CLOCK_MS, "clock_tick") : Sub.none;
}

export function searchText(model: Model): Bytes { return model.search.bytes; }
export function searchLoading(model: Model): boolean { return model.searchPhase === "debouncing" || model.searchPhase === "loading_octave" || model.searchPhase === "loading_fallback"; }
export function searchFailed(model: Model): boolean { return model.searchPhase === "failed"; }
export function searchReady(model: Model): boolean { return model.searchPhase === "ready"; }
export function trackRows(model: Model): readonly TrackRow[] {
  return model.tracks.map((track, indexRaw) => {
    const index = indexRaw >= 0 && indexRaw <= 9007199254740990 ? Math.trunc(indexRaw) : 0;
    const id = index + 1;
    return { id: id, title: track.title, artist: track.artist, album: track.album, duration: formatSeconds(track.durationSec), active: id === model.nowId, liked: isLiked(model, id) };
  });
}
export function likedRows(model: Model): readonly TrackRow[] { return trackRows(model).filter((row) => row.liked); }
export function queueRows(model: Model): readonly TrackRow[] { return model.queue.map((item) => trackRows(model).find((row) => row.id === item.id)).filter((row) => row !== undefined); }
export function hasNow(model: Model): boolean { return model.nowId !== 0; }
export function nowTitle(model: Model): Bytes { const track = currentTrack(model); return track === undefined ? asciiBytes("Not playing") : track.title; }
export function nowArtist(model: Model): Bytes { const track = currentTrack(model); return track === undefined ? asciiBytes("Choose something to play") : track.artist; }
export function nowAlbum(model: Model): Bytes { const track = currentTrack(model); return track === undefined ? new Uint8Array(0) : track.album; }
export function nowLiked(model: Model): boolean { return isLiked(model, model.nowId); }
export function playIcon(model: Model): Bytes { return model.playing ? asciiBytes("pause") : asciiBytes("play"); }
export function repeatLabel(model: Model): Bytes { return model.repeat === "one" ? asciiBytes("Repeat 1") : model.repeat === "context" ? asciiBytes("Repeat") : asciiBytes("Repeat off"); }
export function positionLabel(model: Model): Bytes { return formatSeconds(Math.trunc(model.positionMs / 1000)); }
export function durationLabel(model: Model): Bytes { return formatSeconds(Math.trunc(model.durationMs / 1000)); }
export function seekFraction(model: Model): number { return model.durationMs > 0 ? model.positionMs / model.durationMs : 0; }
export function volumeFraction(model: Model): number { return model.volumePermille / 1000; }
export function pageHome(model: Model): boolean { return model.page === "home"; }
export function pageSearch(model: Model): boolean { return model.page === "search"; }
export function pageLibrary(model: Model): boolean { return model.page === "library"; }
export function pageLyrics(model: Model): boolean { return model.page === "lyrics"; }
export function pageQueue(model: Model): boolean { return model.page === "queue"; }
