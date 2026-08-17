import { Cmd, Sub, asciiBytes } from "@native-sdk/core";
import { applyTextInputEvent, clampedInsertEvent, type TextEditState, type TextInputEvent } from "@native-sdk/core/text";
import { type AudioState } from "@native-sdk/core/events";
import { deezerSearchFallbackUrl, formatSeconds, octaveResolveUrl, octaveSearchUrl, parseDeezerSearch, parseOctaveResolve, parseOctaveSearch, type Bytes, type Track } from "./provider.ts";

export type Page = "home" | "search" | "library" | "lyrics" | "queue";
export type RepeatMode = "off" | "context" | "one";
export type SearchPhase = "idle" | "debouncing" | "loading_octave" | "loading_fallback" | "ready" | "failed";

export interface Draft {
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
  readonly errorText: Bytes;
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
  const anchorRaw = next.selection.anchor;
  const focusRaw = next.selection.focus;
  const anchor = anchorRaw >= 0 && anchorRaw <= MAX_SEARCH ? Math.trunc(anchorRaw) : 0;
  const focus = focusRaw >= 0 && focusRaw <= MAX_SEARCH ? Math.trunc(focusRaw) : anchor;
  // ScriptC currently loses the upper-bound proof through nullable composition offsets.
  // Committed text edits still flow normally; composition restarts on each dispatch.
  const compStart = -1;
  const compEnd = -1;
  return { bytes: next.text, anchor: anchor, focus: focus, compStart: compStart, compEnd: compEnd };
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
    errorText: new Uint8Array(0),
  };
}

function navigate(model: Model, page: Page): Model {
  if (model.page === page) return model;
  const rawIndex = model.historyIndex;
  const safeIndex = rawIndex >= 0 && rawIndex <= 99 ? Math.trunc(rawIndex) : 0;
  const kept = model.history.slice(0, safeIndex + 1);
  const history = kept.length >= 99 ? [...kept.slice(1), page] : [...kept, page];
  const nextRaw = history.length - 1;
  const nextIndex = nextRaw >= 0 && nextRaw <= 99 ? Math.trunc(nextRaw) : 0;
  return { ...model, page: page, history: history, historyIndex: nextIndex };
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
  const safeId = id >= 1 && id <= 30 ? Math.trunc(id) : 0;
  if (safeId === 0) return model;
  const secondsRaw = track.durationSec;
  const seconds = secondsRaw >= 0 && secondsRaw <= 86400 ? Math.trunc(secondsRaw) : 0;
  return {
    ...model,
    nowId: safeId,
    queue: dequeue(model, safeId),
    playing: true,
    buffering: false,
    loadPending: true,
    fallbackPlayback: fallback,
    audioReady: false,
    positionMs: 0,
    durationMs: seconds * 1000,
    errorText: new Uint8Array(0),
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
      const rawIndex = model.historyIndex;
      if (!(rawIndex > 0 && rawIndex <= 99)) return [model, Cmd.none];
      const index = Math.trunc(rawIndex) - 1;
      return [{ ...model, historyIndex: index, page: model.history[index] }, Cmd.none];
    }
    case "go_forward": {
      const rawIndex = model.historyIndex;
      if (!(rawIndex >= 0 && rawIndex < 99)) return [model, Cmd.none];
      const current = Math.trunc(rawIndex);
      if (current + 1 >= model.history.length) return [model, Cmd.none];
      const index = current + 1;
      return [{ ...model, historyIndex: index, page: model.history[index] }, Cmd.none];
    }
    case "search_edit": {
      const search = editDraft(model.search, msg.edit);
      if (search.bytes.length === 0) return [{ ...model, search: search, searchPhase: "idle", tracks: [], errorText: new Uint8Array(0) }, Cmd.cancel("search-debounce")];
      return [{ ...model, page: "search", search: search, searchPhase: "debouncing", errorText: new Uint8Array(0) }, Cmd.delay("search-debounce", 260, "search_fire")];
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
      if (parsed.length > 0) return [{ ...model, tracks: parsed, searchPhase: "ready", errorText: new Uint8Array(0) }, Cmd.none];
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
      if (parsed.length === 0) return [{ ...model, tracks: [], searchPhase: "failed", errorText: asciiBytes("No results available") }, Cmd.none];
      return [{ ...model, tracks: parsed, searchPhase: "ready", errorText: new Uint8Array(0) }, Cmd.none];
    }
    case "fallback_search_failed": return [{ ...model, tracks: [], searchPhase: "failed", errorText: msg.reason }, Cmd.none];
    case "resolve_track_done": {
      const track = currentTrack(model);
      if (track === undefined) return [{ ...model, playing: false, loadPending: false, audioReady: false }, Cmd.none];
      if (msg.status >= 200 && msg.status < 300) {
        const resolved = parseOctaveResolve(msg.body);
        if (resolved.url.length > 0) return [model, Cmd.audioPlay("player", { url: resolved.url }, { event: "audio_event" })];
        if (resolved.preview.length > 0) return [{ ...model, fallbackPlayback: true }, Cmd.audioPlay("player", { url: resolved.preview }, { event: "audio_event" })];
      }
      if (track.fallbackPreviewUrl.length > 0) return [{ ...model, fallbackPlayback: true }, Cmd.audioPlay("player", { url: track.fallbackPreviewUrl }, { event: "audio_event" })];
      return [{ ...model, playing: false, loadPending: false, audioReady: false, errorText: asciiBytes("Playback resolver returned no playable URL") }, Cmd.none];
    }
    case "resolve_track_failed": {
      const track = currentTrack(model);
      if (track !== undefined && track.fallbackPreviewUrl.length > 0) return [{ ...model, fallbackPlayback: true }, Cmd.audioPlay("player", { url: track.fallbackPreviewUrl }, { event: "audio_event" })];
      return [{ ...model, playing: false, loadPending: false, audioReady: false, errorText: msg.reason }, Cmd.none];
    }
    case "play_track": {
      const raw = msg.playTrackId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const id = Math.trunc(raw);
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
      if (model.queue.length >= MAX_QUEUE) return [model, Cmd.none];
      const raw = msg.queueTrackId;
      if (raw === 1) {
        if (model.queue.find((item) => item.id === 1) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 1 }] }, Cmd.none];
      }
      if (raw === 2) {
        if (model.queue.find((item) => item.id === 2) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 2 }] }, Cmd.none];
      }
      if (raw === 3) {
        if (model.queue.find((item) => item.id === 3) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 3 }] }, Cmd.none];
      }
      if (raw === 4) {
        if (model.queue.find((item) => item.id === 4) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 4 }] }, Cmd.none];
      }
      if (raw === 5) {
        if (model.queue.find((item) => item.id === 5) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 5 }] }, Cmd.none];
      }
      if (raw === 6) {
        if (model.queue.find((item) => item.id === 6) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 6 }] }, Cmd.none];
      }
      if (raw === 7) {
        if (model.queue.find((item) => item.id === 7) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 7 }] }, Cmd.none];
      }
      if (raw === 8) {
        if (model.queue.find((item) => item.id === 8) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 8 }] }, Cmd.none];
      }
      if (raw === 9) {
        if (model.queue.find((item) => item.id === 9) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 9 }] }, Cmd.none];
      }
      if (raw === 10) {
        if (model.queue.find((item) => item.id === 10) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 10 }] }, Cmd.none];
      }
      if (raw === 11) {
        if (model.queue.find((item) => item.id === 11) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 11 }] }, Cmd.none];
      }
      if (raw === 12) {
        if (model.queue.find((item) => item.id === 12) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 12 }] }, Cmd.none];
      }
      if (raw === 13) {
        if (model.queue.find((item) => item.id === 13) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 13 }] }, Cmd.none];
      }
      if (raw === 14) {
        if (model.queue.find((item) => item.id === 14) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 14 }] }, Cmd.none];
      }
      if (raw === 15) {
        if (model.queue.find((item) => item.id === 15) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 15 }] }, Cmd.none];
      }
      if (raw === 16) {
        if (model.queue.find((item) => item.id === 16) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 16 }] }, Cmd.none];
      }
      if (raw === 17) {
        if (model.queue.find((item) => item.id === 17) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 17 }] }, Cmd.none];
      }
      if (raw === 18) {
        if (model.queue.find((item) => item.id === 18) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 18 }] }, Cmd.none];
      }
      if (raw === 19) {
        if (model.queue.find((item) => item.id === 19) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 19 }] }, Cmd.none];
      }
      if (raw === 20) {
        if (model.queue.find((item) => item.id === 20) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 20 }] }, Cmd.none];
      }
      if (raw === 21) {
        if (model.queue.find((item) => item.id === 21) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 21 }] }, Cmd.none];
      }
      if (raw === 22) {
        if (model.queue.find((item) => item.id === 22) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 22 }] }, Cmd.none];
      }
      if (raw === 23) {
        if (model.queue.find((item) => item.id === 23) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 23 }] }, Cmd.none];
      }
      if (raw === 24) {
        if (model.queue.find((item) => item.id === 24) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 24 }] }, Cmd.none];
      }
      if (raw === 25) {
        if (model.queue.find((item) => item.id === 25) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 25 }] }, Cmd.none];
      }
      if (raw === 26) {
        if (model.queue.find((item) => item.id === 26) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 26 }] }, Cmd.none];
      }
      if (raw === 27) {
        if (model.queue.find((item) => item.id === 27) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 27 }] }, Cmd.none];
      }
      if (raw === 28) {
        if (model.queue.find((item) => item.id === 28) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 28 }] }, Cmd.none];
      }
      if (raw === 29) {
        if (model.queue.find((item) => item.id === 29) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 29 }] }, Cmd.none];
      }
      if (raw === 30) {
        if (model.queue.find((item) => item.id === 30) !== undefined) return [model, Cmd.none];
        return [{ ...model, queue: [...model.queue, { id: 30 }] }, Cmd.none];
      }
      return [model, Cmd.none];
    }
    case "toggle_like": {
      const raw = msg.likeTrackId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const id = Math.trunc(raw);
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
          return [{ ...model, playing: false, buffering: false, loadPending: false, audioReady: false, errorText: asciiBytes("Playback unavailable for this track") }, Cmd.none];
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
