import { Cmd, Sub, asciiBytes } from "@native-sdk/core";
import { applyTextInputEvent, clampedInsertEvent, type TextEditState, type TextInputEvent } from "@native-sdk/core/text";
import { type AudioState } from "@native-sdk/core/events";
import { deezerSearchFallbackUrl, formatSeconds, octaveResolveUrlWithQuality, octaveSearchUrl, octaveTrackRadioUrl, octaveTrendingUrl, parseDeezerSearch, parseOctaveResolve, parseOctaveSearch, type Bytes, type OctaveQuality, type Track } from "./provider.ts";
import { decodeState, encodeState, type PersistedState } from "./persistence.ts";

export type Page = "home" | "search" | "library" | "lyrics" | "queue" | "settings" | "notifications" | "playlist" | "premium";
export type RepeatMode = "off" | "context" | "one";
export type SearchPhase = "idle" | "debouncing" | "loading_octave" | "loading_fallback" | "ready" | "failed";
export type ImageState =
  | "loaded" | "rejected" | "not_found" | "io_failed" | "connect_failed"
  | "tls_failed" | "protocol_failed" | "timed_out" | "http_status"
  | "cancelled" | "too_large" | "unsupported" | "decode_failed" | "registry_full"
  | "alloc_failed";

export interface Draft {
  readonly bytes: Bytes;
  readonly anchor: number;
  readonly focus: number;
  readonly compStart: number;
  readonly compEnd: number;
}

export interface QueueItem {
  readonly id: number;
  readonly track: Track;
}

export interface Model {
  readonly page: Page;
  readonly history: readonly Page[];
  readonly historyIndex: number;
  readonly search: Draft;
  readonly searchPhase: SearchPhase;
  readonly tracks: readonly Track[];
  readonly contextTracks: readonly Track[];
  readonly nowId: number;
  readonly nowTrack: Track;
  readonly coverImage: number;
  readonly coverRequestId: number;
  readonly queue: readonly QueueItem[];
  readonly showNowPlaying: boolean;
  readonly autoplay: boolean;
  readonly quality: OctaveQuality;
  readonly playlistCreated: boolean;
  readonly likedTracks: readonly Track[];
  readonly playlistTracks: readonly Track[];
  readonly playing: boolean;
  readonly buffering: boolean;
  readonly loadPending: boolean;
  readonly fallbackPlayback: boolean;
  readonly audioReady: boolean;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly volumePermille: number;
  readonly shuffle: boolean;
  readonly shuffleSeed: number;
  readonly repeat: RepeatMode;
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
  | { readonly kind: "go_settings" }
  | { readonly kind: "go_notifications" }
  | { readonly kind: "go_premium" }
  | { readonly kind: "go_playlist" }
  | { readonly kind: "go_back" }
  | { readonly kind: "go_forward" }
  | { readonly kind: "search_trending" }
  | { readonly kind: "search_pop" }
  | { readonly kind: "search_hiphop" }
  | { readonly kind: "search_chill" }
  | { readonly kind: "search_workout" }
  | { readonly kind: "search_party" }
  | { readonly kind: "search_focus" }
  | { readonly kind: "search_indie" }
  | { readonly kind: "search_classical" }
  | { readonly kind: "search_edit"; readonly edit: TextInputEvent }
  | { readonly kind: "search_fire"; readonly at: number }
  | { readonly kind: "octave_search_done"; readonly status: number; readonly body: Bytes }
  | { readonly kind: "octave_search_failed"; readonly reason: Bytes }
  | { readonly kind: "fallback_search_done"; readonly status: number; readonly body: Bytes }
  | { readonly kind: "fallback_search_failed"; readonly reason: Bytes }
  | { readonly kind: "resolve_track_done"; readonly status: number; readonly body: Bytes }
  | { readonly kind: "resolve_track_failed"; readonly reason: Bytes }
  | { readonly kind: "cover_done"; readonly id: number; readonly state: ImageState; readonly width: number; readonly height: number; readonly status: number }
  | { readonly kind: "start_radio" }
  | { readonly kind: "radio_done"; readonly status: number; readonly body: Bytes }
  | { readonly kind: "radio_failed"; readonly reason: Bytes }
  | { readonly kind: "state_loaded"; readonly body: Bytes }
  | { readonly kind: "state_load_failed"; readonly reason: Bytes }
  | { readonly kind: "state_saved" }
  | { readonly kind: "state_save_failed"; readonly reason: Bytes }
  | { readonly kind: "play_track"; readonly playTrackId: number }
  | { readonly kind: "toggle_play" }
  | { readonly kind: "play_liked" }
  | { readonly kind: "play_liked_track"; readonly likedTrackId: number }
  | { readonly kind: "play_playlist" }
  | { readonly kind: "play_playlist_track"; readonly playlistPlayId: number }
  | { readonly kind: "next_track" }
  | { readonly kind: "prev_track" }
  | { readonly kind: "queue_track"; readonly queueTrackId: number }
  | { readonly kind: "play_queue_track"; readonly queuePlayId: number }
  | { readonly kind: "clear_queue" }
  | { readonly kind: "remove_queue_track"; readonly queueRemoveId: number }
  | { readonly kind: "queue_now" }
  | { readonly kind: "create_playlist" }
  | { readonly kind: "add_to_playlist"; readonly playlistTrackId: number }
  | { readonly kind: "clear_playlist" }
  | { readonly kind: "remove_playlist_track"; readonly playlistRemoveId: number }
  | { readonly kind: "add_now_to_playlist" }
  | { readonly kind: "toggle_like"; readonly likeTrackId: number }
  | { readonly kind: "remove_liked_track"; readonly likedRemoveId: number }
  | { readonly kind: "toggle_now_like" }
  | { readonly kind: "toggle_shuffle" }
  | { readonly kind: "cycle_repeat" }
  | { readonly kind: "toggle_now_playing" }
  | { readonly kind: "toggle_autoplay" }
  | { readonly kind: "quality_128" }
  | { readonly kind: "quality_320" }
  | { readonly kind: "quality_lossless" }
  | { readonly kind: "scrubbed"; readonly fraction: number }
  | { readonly kind: "volume_changed"; readonly fraction: number }
  | { readonly kind: "audio_event"; readonly state: AudioState; readonly positionMs: number; readonly durationMs: number; readonly playing: boolean; readonly buffering: boolean; readonly bands: Bytes }
  | { readonly kind: "clock_tick"; readonly at: number };

export const viewUnbound = [
  "search_fire", "octave_search_done", "octave_search_failed", "fallback_search_done", "fallback_search_failed", "resolve_track_done", "resolve_track_failed", "cover_done", "radio_done", "radio_failed", "state_loaded", "state_load_failed", "state_saved", "state_save_failed", "audio_event", "clock_tick",
] as const;

const MAX_SEARCH = 96;
const MAX_QUEUE = 30;
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

function emptyTrack(): Track {
  return { remoteId: new Uint8Array(0), title: new Uint8Array(0), artist: new Uint8Array(0), album: new Uint8Array(0), durationSec: 0, coverUrl: new Uint8Array(0), fallbackPreviewUrl: new Uint8Array(0) };
}

function bytesSame(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function sameTrack(a: Track, b: Track): boolean {
  return a.remoteId.length > 0 && b.remoteId.length > 0 && bytesSame(a.remoteId, b.remoteId);
}

function trackIn(items: readonly Track[], track: Track): boolean {
  return items.find((item) => sameTrack(item, track)) !== undefined;
}

export function freshModel(): Model {
  return {
    page: "home",
    history: ["home"],
    historyIndex: 0,
    search: draftInit(),
    searchPhase: "idle",
    tracks: [],
    contextTracks: [],
    nowId: 0,
    nowTrack: emptyTrack(),
    coverImage: 0,
    coverRequestId: 0,
    queue: [],
    showNowPlaying: true,
    autoplay: true,
    quality: "320",
    playlistCreated: false,
    likedTracks: [],
    playlistTracks: [],
    playing: false,
    buffering: false,
    loadPending: false,
    fallbackPlayback: false,
    audioReady: false,
    positionMs: 0,
    durationMs: 0,
    volumePermille: 760,
    shuffle: false,
    shuffleSeed: 1,
    repeat: "off",
    errorText: new Uint8Array(0),
  };
}

function persisted(model: Model): PersistedState {
  return { quality: model.quality, autoplay: model.autoplay, showNowPlaying: model.showNowPlaying, playlistCreated: model.playlistCreated, likedTracks: model.likedTracks, playlistTracks: model.playlistTracks };
}

export function initialModel(): [Model, Cmd<Msg>] {
  return [freshModel(), Cmd.readFile(asciiBytes("spotify-state.bin"), { key: "state-load", ok: "state_loaded", err: "state_load_failed" })];
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

function contextTrackById(model: Model, id: number): Track | undefined {
  if (id <= 0) return undefined;
  const index = id - 1;
  if (index < 0 || index >= model.contextTracks.length) return undefined;
  return model.contextTracks[index];
}

function currentTrack(model: Model): Track | undefined {
  return model.nowTrack.remoteId.length > 0 ? model.nowTrack : undefined;
}

function isLiked(model: Model, id: number): boolean {
  const track = trackById(model, id);
  return track !== undefined && trackIn(model.likedTracks, track);
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = a >= 0 && a <= 30 ? Math.trunc(a) : 0;
  let y = b >= 0 && b <= 30 ? Math.trunc(b) : 0;
  while (y > 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x;
}

function nextId(model: Model): number {
  const countRaw = model.contextTracks.length;
  const count = countRaw >= 0 && countRaw <= 30 ? Math.trunc(countRaw) : 0;
  if (count === 0) return 0;
  if (model.repeat === "one" && model.nowId > 0) return model.nowId;
  if (model.nowId <= 0) return 1;
  if (model.shuffle && count > 1) {
    let step = model.shuffleSeed >= 1 && model.shuffleSeed <= 29 ? Math.trunc(model.shuffleSeed) : 1;
    while (step >= count) step -= count;
    if (step <= 0) step = 1;
    while (greatestCommonDivisor(step, count) !== 1) {
      step += 1;
      if (step >= count) step = 1;
    }
    let next = model.nowId + step;
    while (next > count) next -= count;
    return next;
  }
  if (model.nowId < count) return model.nowId + 1;
  return model.repeat === "context" || model.autoplay ? 1 : 0;
}

function previousId(model: Model): number {
  if (model.contextTracks.length === 0) return 0;
  if (model.nowId <= 1) return model.repeat === "context" ? model.contextTracks.length : 1;
  return model.nowId - 1;
}

function dequeue(model: Model, track: Track): readonly QueueItem[] {
  if (model.queue.length > 0 && sameTrack(model.queue[0].track, track)) return model.queue.slice(1);
  return model.queue;
}

function startTrack(model: Model, id: number, track: Track, context: readonly Track[], fallback: boolean): Model {
  const safeId = id >= 1 && id <= 30 ? Math.trunc(id) : 0;
  if (safeId === 0) return model;
  const secondsRaw = track.durationSec;
  const seconds = secondsRaw >= 0 && secondsRaw <= 86400 ? Math.trunc(secondsRaw) : 0;
  return {
    ...model,
    nowId: safeId,
    nowTrack: track,
    contextTracks: context,
    coverImage: sameTrack(model.nowTrack, track) ? model.coverImage : 0,
    coverRequestId: track.coverUrl.length > 0 ? 1 : 0,
    queue: dequeue(model, track),
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
    case "go_settings": return [navigate(model, "settings"), Cmd.none];
    case "go_notifications": return [navigate(model, "notifications"), Cmd.none];
    case "go_premium": return [navigate(model, "premium"), Cmd.none];
    case "go_playlist": return [navigate(model, "playlist"), Cmd.none];
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
    case "state_loaded": {
      const saved = decodeState(msg.body);
      if (saved === undefined) return [model, Cmd.none];
      return [{ ...model, quality: saved.quality, autoplay: saved.autoplay, showNowPlaying: saved.showNowPlaying, playlistCreated: saved.playlistCreated, likedTracks: saved.likedTracks, playlistTracks: saved.playlistTracks }, Cmd.none];
    }
    case "state_load_failed": return [model, Cmd.none];
    case "state_saved": return [model, Cmd.none];
    case "state_save_failed": return [{ ...model, errorText: msg.reason }, Cmd.none];
    case "search_trending": {
      const q = asciiBytes("Trending");
      return [{ ...model, page: "search", search: { bytes: q, anchor: 8, focus: 8, compStart: -1, compEnd: -1 }, searchPhase: "loading_octave", errorText: new Uint8Array(0) }, Cmd.fetch({ url: octaveTrendingUrl(), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "octave_search_done", err: "octave_search_failed" })];
    }
    case "search_pop": { const q = asciiBytes("Pop"); return [{ ...model, page: "search", search: { bytes: q, anchor: 3, focus: 3, compStart: -1, compEnd: -1 }, searchPhase: "loading_octave", errorText: new Uint8Array(0) }, Cmd.fetch({ url: octaveSearchUrl(q), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "octave_search_done", err: "octave_search_failed" })]; }
    case "search_hiphop": { const q = asciiBytes("Hip Hop"); return [{ ...model, page: "search", search: { bytes: q, anchor: 7, focus: 7, compStart: -1, compEnd: -1 }, searchPhase: "loading_octave", errorText: new Uint8Array(0) }, Cmd.fetch({ url: octaveSearchUrl(q), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "octave_search_done", err: "octave_search_failed" })]; }
    case "search_chill": { const q = asciiBytes("Chill"); return [{ ...model, page: "search", search: { bytes: q, anchor: 5, focus: 5, compStart: -1, compEnd: -1 }, searchPhase: "loading_octave", errorText: new Uint8Array(0) }, Cmd.fetch({ url: octaveSearchUrl(q), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "octave_search_done", err: "octave_search_failed" })]; }
    case "search_workout": { const q = asciiBytes("Workout"); return [{ ...model, page: "search", search: { bytes: q, anchor: 7, focus: 7, compStart: -1, compEnd: -1 }, searchPhase: "loading_octave", errorText: new Uint8Array(0) }, Cmd.fetch({ url: octaveSearchUrl(q), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "octave_search_done", err: "octave_search_failed" })]; }
    case "search_party": { const q = asciiBytes("Party"); return [{ ...model, page: "search", search: { bytes: q, anchor: 5, focus: 5, compStart: -1, compEnd: -1 }, searchPhase: "loading_octave", errorText: new Uint8Array(0) }, Cmd.fetch({ url: octaveSearchUrl(q), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "octave_search_done", err: "octave_search_failed" })]; }
    case "search_focus": { const q = asciiBytes("Focus"); return [{ ...model, page: "search", search: { bytes: q, anchor: 5, focus: 5, compStart: -1, compEnd: -1 }, searchPhase: "loading_octave", errorText: new Uint8Array(0) }, Cmd.fetch({ url: octaveSearchUrl(q), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "octave_search_done", err: "octave_search_failed" })]; }
    case "search_indie": { const q = asciiBytes("Indie"); return [{ ...model, page: "search", search: { bytes: q, anchor: 5, focus: 5, compStart: -1, compEnd: -1 }, searchPhase: "loading_octave", errorText: new Uint8Array(0) }, Cmd.fetch({ url: octaveSearchUrl(q), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "octave_search_done", err: "octave_search_failed" })]; }
    case "search_classical": { const q = asciiBytes("Classical"); return [{ ...model, page: "search", search: { bytes: q, anchor: 9, focus: 9, compStart: -1, compEnd: -1 }, searchPhase: "loading_octave", errorText: new Uint8Array(0) }, Cmd.fetch({ url: octaveSearchUrl(q), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "search", ok: "octave_search_done", err: "octave_search_failed" })]; }
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
    case "cover_done": {
      if (msg.id !== 1 || model.coverRequestId !== 1) {
        if (msg.state === "loaded" && msg.id === 1) return [model, Cmd.imageUnregister(1)];
        return [model, Cmd.none];
      }
      if (msg.state === "loaded") return [{ ...model, coverImage: 1, coverRequestId: 1 }, Cmd.none];
      return [{ ...model, coverImage: 0, coverRequestId: 0 }, Cmd.none];
    }
    case "start_radio": {
      const track = currentTrack(model);
      if (track === undefined) return [model, Cmd.none];
      return [{ ...model, searchPhase: "loading_octave", page: "search" }, Cmd.fetch({ url: octaveTrackRadioUrl(track.remoteId), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "radio", ok: "radio_done", err: "radio_failed" })];
    }
    case "radio_done": {
      const parsed = msg.status >= 200 && msg.status < 300 ? parseOctaveSearch(msg.body) : [];
      if (parsed.length === 0) return [{ ...model, searchPhase: "failed", errorText: asciiBytes("Song radio is unavailable") }, Cmd.none];
      const next: Model = { ...model, tracks: parsed, contextTracks: [], searchPhase: "ready", page: "search", queue: [], nowId: 0, nowTrack: emptyTrack(), coverImage: 0, coverRequestId: 0, playing: false, loadPending: false, audioReady: false, positionMs: 0, durationMs: 0, errorText: new Uint8Array(0) };
      if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.audioStop("player")])];
      if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.audioStop("player")])];
      return [next, Cmd.audioStop("player")];
    }
    case "radio_failed": return [{ ...model, searchPhase: "failed", errorText: msg.reason, page: "search" }, Cmd.none];
    case "play_track": {
      const raw = msg.playTrackId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const id = Math.trunc(raw);
      const track = trackById(model, id);
      if (track === undefined) return [model, Cmd.none];
      const next = startTrack(model, id, track, model.tracks, false);
      if (track.coverUrl.length === 0) {
        if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
    }
    case "toggle_play": {
      if (model.nowId === 0) {
        if (model.tracks.length === 0) return [model, Cmd.none];
        const track = trackById(model, 1);
        if (track === undefined) return [model, Cmd.none];
        const next = startTrack(model, 1, track, model.tracks, false);
        if (track.coverUrl.length === 0) {
          if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
          if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
          return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
        }
        if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
        if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      }
      if (model.loadPending) return [model, Cmd.none];
      if (model.playing) return [{ ...model, playing: false }, Cmd.audioPause("player")];
      if (!model.audioReady) {
        const track = currentTrack(model);
        if (track === undefined) return [model, Cmd.none];
        return [{ ...model, playing: true, loadPending: true }, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      return [{ ...model, playing: true }, Cmd.audioResume("player")];
    }
    case "play_liked": {
      if (model.likedTracks.length === 0) return [model, Cmd.none];
      const track = model.likedTracks[0];
      if (track === undefined) return [model, Cmd.none];
      const id = 1;
      const next = startTrack(model, id, track, model.likedTracks, false);
      if (track.coverUrl.length === 0) {
        if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
    }
    case "play_liked_track": {
      const raw = msg.likedTrackId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const id = Math.trunc(raw);
      const track = model.likedTracks[id - 1];
      if (track === undefined) return [model, Cmd.none];
      const next = startTrack(model, id, track, model.likedTracks, false);
      if (track.coverUrl.length === 0) {
        if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
    }
    case "play_playlist": {
      if (model.playlistTracks.length === 0) return [model, Cmd.none];
      const track = model.playlistTracks[0];
      if (track === undefined) return [model, Cmd.none];
      const id = 1;
      const next = startTrack(model, id, track, model.playlistTracks, false);
      if (track.coverUrl.length === 0) {
        if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
    }
    case "play_playlist_track": {
      const raw = msg.playlistPlayId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const id = Math.trunc(raw);
      const track = model.playlistTracks[id - 1];
      if (track === undefined) return [model, Cmd.none];
      const next = startTrack(model, id, track, model.playlistTracks, false);
      if (track.coverUrl.length === 0) {
        if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
    }
    case "next_track": {
      if (model.queue.length > 0) {
        const item = model.queue[0];
        if (item !== undefined) {
          const track = item.track;
          const contextId = model.nowId >= 1 && model.nowId <= 30 ? Math.trunc(model.nowId) : 1;
          const next = startTrack(model, contextId, track, model.contextTracks, false);
          if (track.coverUrl.length === 0) {
            if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
            if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
            return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
          }
          if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
          if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
          if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
          return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        }
      }
      const rawId = nextId(model);
      if (rawId === 0) return [{ ...model, playing: false, audioReady: false }, Cmd.audioStop("player")];
      if (!(rawId >= 1 && rawId <= 30)) return [model, Cmd.none];
      const id = Math.trunc(rawId);
      const track = contextTrackById(model, id);
      if (track === undefined) return [{ ...model, playing: false, audioReady: false }, Cmd.audioStop("player")];
      const next = startTrack(model, id, track, model.contextTracks, false);
      if (track.coverUrl.length === 0) {
        if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
    }
    case "prev_track": {
      if (model.positionMs > 4000) return [{ ...model, positionMs: 0 }, Cmd.audioSeek("player", 0)];
      const rawId = previousId(model);
      if (rawId === 0) return [model, Cmd.none];
      if (!(rawId >= 1 && rawId <= 30)) return [model, Cmd.none];
      const id = Math.trunc(rawId);
      const track = contextTrackById(model, id);
      if (track === undefined) return [model, Cmd.none];
      const next = startTrack(model, id, track, model.contextTracks, false);
      if (track.coverUrl.length === 0) {
        if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
    }
    case "queue_track": {
      if (model.queue.length >= MAX_QUEUE) return [model, Cmd.none];
      const raw = msg.queueTrackId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const id = Math.trunc(raw);
      const track = trackById(model, id);
      if (track === undefined || model.queue.find((item) => sameTrack(item.track, track)) !== undefined) return [model, Cmd.none];
      return [{ ...model, queue: [...model.queue, { id: id, track: track }] }, Cmd.none];
    }
    case "play_queue_track": {
      const raw = msg.queuePlayId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const index = Math.trunc(raw) - 1;
      const item = model.queue[index];
      if (item === undefined) return [model, Cmd.none];
      const track = item.track;
      const base = { ...model, queue: model.queue.slice(index + 1) };
      const contextId = model.nowId >= 1 && model.nowId <= 30 ? Math.trunc(model.nowId) : 1;
      const next = startTrack(base, contextId, track, model.contextTracks, false);
      if (track.coverUrl.length === 0) {
        if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      }
      if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
      if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
      return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
    }
    case "clear_queue": return [{ ...model, queue: [] }, Cmd.none];
    case "remove_queue_track": {
      const raw = msg.queueRemoveId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const index = Math.trunc(raw) - 1;
      if (index < 0 || index >= model.queue.length) return [model, Cmd.none];
      return [{ ...model, queue: [...model.queue.slice(0, index), ...model.queue.slice(index + 1)] }, Cmd.none];
    }
    case "queue_now": {
      const track = currentTrack(model);
      if (track === undefined || model.queue.length >= MAX_QUEUE || trackIn(model.queue.map((item) => item.track), track)) return [model, Cmd.none];
      return [{ ...model, queue: [...model.queue, { id: 1, track: track }] }, Cmd.none];
    }
    case "create_playlist": {
      const next = { ...navigate(model, "playlist"), playlistCreated: true };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "add_to_playlist": {
      const raw = msg.playlistTrackId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const id = Math.trunc(raw);
      const track = trackById(model, id);
      if (track === undefined) return [model, Cmd.none];
      if (trackIn(model.playlistTracks, track) || model.playlistTracks.length >= 30) {
        const next = { ...model, playlistCreated: true };
        return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
      }
      const next = { ...model, playlistCreated: true, playlistTracks: [...model.playlistTracks, track] };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "clear_playlist": {
      const next = { ...model, playlistTracks: [] };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "remove_playlist_track": {
      const raw = msg.playlistRemoveId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const index = Math.trunc(raw) - 1;
      if (index < 0 || index >= model.playlistTracks.length) return [model, Cmd.none];
      const next = { ...model, playlistTracks: [...model.playlistTracks.slice(0, index), ...model.playlistTracks.slice(index + 1)] };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "add_now_to_playlist": {
      const track = currentTrack(model);
      if (track === undefined) return [model, Cmd.none];
      if (trackIn(model.playlistTracks, track)) return [navigate({ ...model, playlistCreated: true }, "playlist"), Cmd.none];
      const tracks = model.playlistTracks.length >= 30 ? model.playlistTracks : [...model.playlistTracks, track];
      const next = navigate({ ...model, playlistCreated: true, playlistTracks: tracks }, "playlist");
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "toggle_like": {
      const raw = msg.likeTrackId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const id = Math.trunc(raw);
      const track = trackById(model, id);
      if (track === undefined) return [model, Cmd.none];
      const exists = trackIn(model.likedTracks, track);
      if (!exists && model.likedTracks.length >= 30) return [model, Cmd.none];
      const next = { ...model, likedTracks: exists ? model.likedTracks.filter((item) => !sameTrack(item, track)) : [...model.likedTracks, track] };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "remove_liked_track": {
      const raw = msg.likedRemoveId;
      if (!(raw >= 1 && raw <= 30)) return [model, Cmd.none];
      const index = Math.trunc(raw) - 1;
      if (index < 0 || index >= model.likedTracks.length) return [model, Cmd.none];
      const next = { ...model, likedTracks: [...model.likedTracks.slice(0, index), ...model.likedTracks.slice(index + 1)] };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "toggle_now_like": {
      const track = currentTrack(model);
      if (track === undefined) return [model, Cmd.none];
      const exists = trackIn(model.likedTracks, track);
      if (!exists && model.likedTracks.length >= 30) return [model, Cmd.none];
      const next = { ...model, likedTracks: exists ? model.likedTracks.filter((item) => !sameTrack(item, track)) : [...model.likedTracks, track] };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "toggle_shuffle": {
      const nextSeed = model.shuffle ? model.shuffleSeed : model.shuffleSeed >= 29 ? 1 : model.shuffleSeed + 1;
      return [{ ...model, shuffle: !model.shuffle, shuffleSeed: nextSeed }, Cmd.none];
    }
    case "cycle_repeat": return [{ ...model, repeat: model.repeat === "off" ? "context" : model.repeat === "context" ? "one" : "off" }, Cmd.none];
    case "toggle_now_playing": {
      const next = { ...model, showNowPlaying: !model.showNowPlaying };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "toggle_autoplay": {
      const next = { ...model, autoplay: !model.autoplay };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "quality_128": {
      const next: Model = { ...model, quality: "128" };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "quality_320": {
      const next: Model = { ...model, quality: "320" };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
    case "quality_lossless": {
      const next: Model = { ...model, quality: "lossless" };
      return [next, Cmd.writeFile(asciiBytes("spotify-state.bin"), encodeState(persisted(next)), { key: "state-save", ok: "state_saved", err: "state_save_failed" })];
    }
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
        if (model.queue.length > 0) {
          const item = model.queue[0];
          if (item !== undefined) {
            const track = item.track;
            const contextId = model.nowId >= 1 && model.nowId <= 30 ? Math.trunc(model.nowId) : 1;
            const next = startTrack(model, contextId, track, model.contextTracks, false);
            if (track.coverUrl.length === 0) {
              if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
              if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
              return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
            }
            if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
            if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
            if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
            return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
          }
        }
          const rawId = nextId(model);
          if (rawId === 0) return [{ ...model, playing: false, audioReady: false, positionMs: model.durationMs }, Cmd.none];
          if (!(rawId >= 1 && rawId <= 30)) return [{ ...model, playing: false }, Cmd.none];
          const id = Math.trunc(rawId);
          const track = contextTrackById(model, id);
          if (track === undefined) return [{ ...model, playing: false }, Cmd.none];
          const next = startTrack(model, id, track, model.contextTracks, false);
          if (track.coverUrl.length === 0) {
            if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
            if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
            return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
          }
          if (sameTrack(model.nowTrack, track) && (model.coverImage === 1 || model.coverRequestId === 1)) return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })];
          if (model.coverImage === 1) return [next, Cmd.batch([Cmd.imageUnregister(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
          if (model.coverRequestId === 1) return [next, Cmd.batch([Cmd.imageCancel(1), Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
          return [next, Cmd.batch([Cmd.imageLoad(1, { url: track.coverUrl }, { event: "cover_done" }), Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, model.quality), method: "GET", headers: { accept: "application/json" }, timeoutMs: 8000 }, { key: "play-resolve", ok: "resolve_track_done", err: "resolve_track_failed" })])];
        }
        case "failed":
        case "rejected": {
          const track = currentTrack(model);
          if (track !== undefined && !model.fallbackPlayback && track.fallbackPreviewUrl.length > 0) return [startTrack(model, model.nowId, track, model.contextTracks, true), Cmd.audioPlay("player", { url: track.fallbackPreviewUrl }, { event: "audio_event" })];
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
    return { id: id, title: track.title, artist: track.artist, album: track.album, duration: formatSeconds(track.durationSec), active: sameTrack(track, model.nowTrack), liked: isLiked(model, id) };
  });
}
export function likedRows(model: Model): readonly TrackRow[] {
  return model.likedTracks.map((track, indexRaw) => {
    const index = indexRaw >= 0 && indexRaw <= 29 ? Math.trunc(indexRaw) : 0;
    return { id: index + 1, title: track.title, artist: track.artist, album: track.album, duration: formatSeconds(track.durationSec), active: sameTrack(track, model.nowTrack), liked: true };
  });
}
export function queueRows(model: Model): readonly TrackRow[] {
  return model.queue.map((item, indexRaw) => {
    const index = indexRaw >= 0 && indexRaw <= 29 ? Math.trunc(indexRaw) : 0;
    return { id: index + 1, title: item.track.title, artist: item.track.artist, album: item.track.album, duration: formatSeconds(item.track.durationSec), active: sameTrack(item.track, model.nowTrack), liked: trackIn(model.likedTracks, item.track) };
  });
}
export function playlistRows(model: Model): readonly TrackRow[] {
  return model.playlistTracks.map((track, indexRaw) => {
    const index = indexRaw >= 0 && indexRaw <= 29 ? Math.trunc(indexRaw) : 0;
    return { id: index + 1, title: track.title, artist: track.artist, album: track.album, duration: formatSeconds(track.durationSec), active: sameTrack(track, model.nowTrack), liked: trackIn(model.likedTracks, track) };
  });
}
export function hasPlaylist(model: Model): boolean { return model.playlistCreated; }
export function searchIdle(model: Model): boolean { return model.searchPhase === "idle" && model.search.bytes.length === 0; }
export function quality128(model: Model): boolean { return model.quality === "128"; }
export function quality320(model: Model): boolean { return model.quality === "320"; }
export function qualityLossless(model: Model): boolean { return model.quality === "lossless"; }
export function hasNow(model: Model): boolean { return model.nowTrack.remoteId.length > 0; }
export function hasCover(model: Model): boolean { return model.coverImage > 0; }
export function repeatActive(model: Model): boolean { return model.repeat !== "off"; }
export function nowTitle(model: Model): Bytes { const track = currentTrack(model); return track === undefined ? asciiBytes("Not playing") : track.title; }
export function nowArtist(model: Model): Bytes { const track = currentTrack(model); return track === undefined ? asciiBytes("Choose something to play") : track.artist; }
export function nowAlbum(model: Model): Bytes { const track = currentTrack(model); return track === undefined ? new Uint8Array(0) : track.album; }
export function nowLiked(model: Model): boolean { const track = currentTrack(model); return track !== undefined && trackIn(model.likedTracks, track); }
export function playIcon(model: Model): Bytes { return model.playing ? asciiBytes("pause") : asciiBytes("play"); }
export function repeatLabel(model: Model): Bytes { return model.repeat === "one" ? asciiBytes("Repeat 1") : model.repeat === "context" ? asciiBytes("Repeat") : asciiBytes("Repeat off"); }
function formatMilliseconds(value: number): Bytes {
  let rest = value >= 0 && value <= 86400000 ? Math.trunc(value) : 0;
  let minutes = 0;
  while (rest >= 60000) { rest -= 60000; minutes += 1; }
  let seconds = 0;
  while (rest >= 1000) { rest -= 1000; seconds += 1; }
  return formatSeconds(minutes * 60 + seconds);
}

export function positionLabel(model: Model): Bytes { return formatMilliseconds(model.positionMs); }
export function durationLabel(model: Model): Bytes { return formatMilliseconds(model.durationMs); }
export function seekFraction(model: Model): number {
  if (model.durationMs <= 0) return 0;
  const scaledPosition = model.positionMs * 1000;
  let steps = 0;
  while (steps < 1000 && model.durationMs * (steps + 1) <= scaledPosition) steps += 1;
  if (steps === 0) return 0;
  let fraction = 0.001;
  let i = 1;
  while (i < steps) { fraction += 0.001; i += 1; }
  return fraction;
}
export function volumeFraction(model: Model): number {
  if (model.volumePermille <= 0) return 0;
  let fraction = 0.001;
  let i = 1;
  while (i < model.volumePermille && i < 1000) { fraction += 0.001; i += 1; }
  return fraction;
}
export function pageHome(model: Model): boolean { return model.page === "home"; }
export function pageSearch(model: Model): boolean { return model.page === "search"; }
export function pageLibrary(model: Model): boolean { return model.page === "library"; }
export function pageLyrics(model: Model): boolean { return model.page === "lyrics"; }
export function pageQueue(model: Model): boolean { return model.page === "queue"; }
export function pageSettings(model: Model): boolean { return model.page === "settings"; }
export function pageNotifications(model: Model): boolean { return model.page === "notifications"; }
export function pagePlaylist(model: Model): boolean { return model.page === "playlist"; }
export function pagePremium(model: Model): boolean { return model.page === "premium"; }
