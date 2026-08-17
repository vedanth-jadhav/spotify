import { Cmd, Sub, asciiBytes } from "@native-sdk/core";
import { applyTextInputEvent, clampedInsertEvent, type TextEditState, type TextInputEvent } from "@native-sdk/core/text";
import { type AudioState } from "@native-sdk/core/events";
import { deezerSearchFallbackUrl, formatSeconds, octaveSearchUrl, parseDeezerSearch, type Bytes, type Track } from "./provider.ts";

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
  "search_fire", "octave_search_done", "octave_search_failed", "fallback_search_done", "fallback_search_failed", "audio_event", "clock_tick",
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
  return model.tracks.find((track) => track.id === id);
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
  const at = model.tracks.findIndex((track) => track.id === model.nowId);
  if (at < 0) return model.tracks[0].id;
  if (model.repeat === "one") return model.nowId;
  if (model.shuffle && model.tracks.length > 1) {
    const candidate = (at * 1103515245 + 12345 + model.positionMs) % model.tracks.length;
    const index = candidate === at ? (candidate + 1) % model.tracks.length : candidate;
    return model.tracks[index].id;
  }
  if (at + 1 < model.tracks.length) return model.tracks[at + 1].id;
  return model.repeat === "context" ? model.tracks[0].id : 0;
}

function previousId(model: Model): number {
  if (model.tracks.length === 0) return 0;
  const at = model.tracks.findIndex((track) => track.id === model.nowId);
  if (at <= 0) return model.repeat === "context" ? model.tracks[model.tracks.length - 1].id : model.tracks[0].id;
  return model.tracks[at - 1].id;
}

function dequeue(model: Model, id: number): readonly QueueItem[] {
  if (model.queue.length > 0 && model.queue[0].id === id) return model.queue.slice(1);
  return model.queue;
}

function startTrack(model: Model, track: Track, fallback: boolean): Model {
  return {
    ...model,
    nowId: track.id,
    queue: dequeue(model, track.id),
    playing: true,
    buffering: false,
    loadPending: true,
    fallbackPlayback: fallback,
    positionMs: 0,
    durationMs: track.durationSec * 1000,
    error: new Uint8Array(0),
  };
}

function playCommand(track: Track, fallback: boolean): Cmd<Msg> {
  return Cmd.audioPlay("player", { url: fallback ? track.fallbackPreviewUrl : track.streamUrl }, { event: "audio_event" });
}

function startById(model: Model, id: number): [Model, Cmd<Msg>] {
  const track = trackById(model, id);
  if (track === undefined) return [model, Cmd.none];
  return [startTrack(model, track, false), playCommand(track, false)];
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
      const parsed = msg.status >= 200 && msg.status < 300 ? parseDeezerSearch(msg.body) : [];
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
    case "play_track": return startById(model, msg.playTrackId);
    case "toggle_play": {
      if (model.nowId === 0) return model.tracks.length > 0 ? startById(model, model.tracks[0].id) : [model, Cmd.none];
      if (model.playing) return [{ ...model, playing: false }, Cmd.audioPause("player")];
      return [{ ...model, playing: true }, Cmd.audioResume("player")];
    }
    case "next_track": {
      const id = nextId(model);
      return id === 0 ? [{ ...model, playing: false }, Cmd.audioStop("player")] : startById(model, id);
    }
    case "prev_track": {
      if (model.positionMs > 4000) return [{ ...model, positionMs: 0 }, Cmd.audioSeek("player", 0)];
      const id = previousId(model);
      return id === 0 ? [model, Cmd.none] : startById(model, id);
    }
    case "queue_track": {
      if (model.queue.length >= MAX_QUEUE || model.queue.find((item) => item.id === msg.queueTrackId) !== undefined) return [model, Cmd.none];
      return [{ ...model, queue: [...model.queue, { id: msg.queueTrackId }] }, Cmd.none];
    }
    case "toggle_like": {
      const exists = model.likedIds.includes(msg.likeTrackId);
      return [{ ...model, likedIds: exists ? model.likedIds.filter((id) => id !== msg.likeTrackId) : [...model.likedIds, msg.likeTrackId] }, Cmd.none];
    }
    case "toggle_shuffle": return [{ ...model, shuffle: !model.shuffle }, Cmd.none];
    case "cycle_repeat": return [{ ...model, repeat: model.repeat === "off" ? "context" : model.repeat === "context" ? "one" : "off" }, Cmd.none];
    case "scrubbed": {
      if (model.durationMs <= 0) return [model, Cmd.none];
      let permille = 0;
      let acc = 0.001;
      while (permille < 1000 && acc <= msg.fraction) { acc += 0.001; permille += 1; }
      const target = Math.trunc((model.durationMs / 1000) * permille);
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
        case "loaded": return [{ ...model, loadPending: false, playing: msg.playing, buffering: msg.buffering, positionMs: Math.trunc(msg.positionMs), durationMs: msg.durationMs > 0 ? Math.trunc(msg.durationMs) : model.durationMs }, Cmd.none];
        case "position": {
          if (model.loadPending) return [model, Cmd.none];
          const pos = Math.trunc(msg.positionMs);
          if (model.playing && !msg.buffering && pos <= model.positionMs && model.positionMs - pos <= SNAP_MS) return [{ ...model, buffering: msg.buffering }, Cmd.none];
          return [{ ...model, positionMs: pos, durationMs: msg.durationMs > 0 ? Math.trunc(msg.durationMs) : model.durationMs, buffering: msg.buffering }, Cmd.none];
        }
        case "spectrum": return [model, Cmd.none];
        case "completed": {
          const id = nextId(model);
          return id === 0 ? [{ ...model, playing: false, positionMs: model.durationMs }, Cmd.none] : startById(model, id);
        }
        case "failed":
        case "rejected": {
          const track = currentTrack(model);
          if (track !== undefined && !model.fallbackPlayback && track.fallbackPreviewUrl.length > 0) return [startTrack(model, track, true), playCommand(track, true)];
          return [{ ...model, playing: false, buffering: false, loadPending: false, error: asciiBytes("Playback unavailable for this track") }, Cmd.none];
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
  return model.tracks.map((track) => ({ id: track.id, title: track.title, artist: track.artist, album: track.album, duration: formatSeconds(track.durationSec), active: track.id === model.nowId, liked: isLiked(model, track.id) }));
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
