import { Cmd, Sub, asciiBytes } from "@native-sdk/core";
import { applyTextInputEvent, clampedInsertEvent, type TextEditState, type TextInputEvent } from "@native-sdk/core/text";
import { type AudioState, type ThemeState } from "@native-sdk/core/events";
import { deezerSearchFallbackUrl, formatSeconds, octaveLyricsBody, octaveLyricsUrl, octaveResolveUrlWithQuality, octaveSearchUrl, octaveTrackRadioUrl, octaveTrendingUrl, parseDeezerSearch, parseOctaveLyrics, parseOctaveResolve, parseOctaveSearch, type Bytes, type OctaveQuality, type Track } from "./provider.ts";
import { decodeState, encodeState, type PersistedState } from "./persistence.ts";

export type Page = "home" | "search" | "library" | "lyrics" | "artist" | "queue" | "settings" | "notifications" | "playlist" | "premium";

// Spotify is intentionally a fixed dark desktop experience. Keeping the scheme
// model-owned also makes CI screenshots deterministic instead of inheriting the
// runner account's macOS appearance.
export function themeState(_model: Model): ThemeState {
  return { pack: "geist", colorScheme: "dark", accent: "#1ED760" };
}
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
  readonly lyricsText: Bytes;
  readonly lyricsLoading: boolean;
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
  | { readonly kind: "open_now_artist" }
  | { readonly kind: "go_track_artist"; readonly artistTrackId: number }
  | { readonly kind: "go_queue" }
  | { readonly kind: "go_settings" }
  | { readonly kind: "go_notifications" }
  | { readonly kind: "go_playlist" }
  | { readonly kind: "go_premium" }
  | { readonly kind: "go_back" }
  | { readonly kind: "go_forward" }
  | { readonly kind: "search_edit"; readonly edit: TextInputEvent }
  | { readonly kind: "search_submit" }
  | { readonly kind: "search_fire" }
  | { readonly kind: "search_octave_done"; readonly ok: boolean; readonly status: number; readonly body: Bytes }
  | { readonly kind: "search_fallback_done"; readonly ok: boolean; readonly status: number; readonly body: Bytes }
  | { readonly kind: "search_pop" }
  | { readonly kind: "search_hiphop" }
  | { readonly kind: "search_chill" }
  | { readonly kind: "search_trending" }
  | { readonly kind: "search_indie" }
  | { readonly kind: "search_party" }
  | { readonly kind: "search_focus" }
  | { readonly kind: "search_workout" }
  | { readonly kind: "search_classical" }
  | { readonly kind: "play_track"; readonly trackId: number }
  | { readonly kind: "play_liked_track"; readonly likedTrackId: number }
  | { readonly kind: "play_playlist_track"; readonly playlistTrackId: number }
  | { readonly kind: "play_queue_track"; readonly queueTrackId: number }
  | { readonly kind: "toggle_play" }
  | { readonly kind: "prev_track" }
  | { readonly kind: "next_track" }
  | { readonly kind: "scrubbed"; readonly value: number }
  | { readonly kind: "volume_changed"; readonly value: number }
  | { readonly kind: "toggle_shuffle" }
  | { readonly kind: "cycle_repeat" }
  | { readonly kind: "toggle_now_playing" }
  | { readonly kind: "toggle_now_like" }
  | { readonly kind: "toggle_like"; readonly likeTrackId: number }
  | { readonly kind: "queue_now" }
  | { readonly kind: "queue_track"; readonly queueTrackId: number }
  | { readonly kind: "remove_queue_track"; readonly queueItemId: number }
  | { readonly kind: "clear_queue" }
  | { readonly kind: "create_playlist" }
  | { readonly kind: "add_now_to_playlist" }
  | { readonly kind: "add_to_playlist"; readonly playlistTrackId: number }
  | { readonly kind: "remove_playlist_track"; readonly playlistItemId: number }
  | { readonly kind: "clear_playlist" }
  | { readonly kind: "play_playlist" }
  | { readonly kind: "quality_128" }
  | { readonly kind: "quality_320" }
  | { readonly kind: "quality_lossless" }
  | { readonly kind: "toggle_autoplay" }
  | { readonly kind: "resolve_done"; readonly ok: boolean; readonly status: number; readonly body: Bytes }
  | { readonly kind: "radio_done"; readonly ok: boolean; readonly status: number; readonly body: Bytes }
  | { readonly kind: "cover_done"; readonly id: number; readonly state: ImageState }
  | { readonly kind: "lyrics_done"; readonly ok: boolean; readonly status: number; readonly body: Bytes }
  | { readonly kind: "audio_event"; readonly state: AudioState; readonly positionMs: number; readonly durationMs: number }
  | { readonly kind: "persist_loaded"; readonly ok: boolean; readonly data: Bytes }
  | { readonly kind: "persist_done"; readonly ok: boolean };

const EMPTY = new Uint8Array(0);
const EMPTY_TRACK: Track = { remoteId: EMPTY, title: EMPTY, artist: EMPTY, album: EMPTY, coverUrl: EMPTY, durationSeconds: 0 };
const SEARCH_DEBOUNCE_MS = 300;
const MAX_SEARCH = 512;
const MAX_QUEUE = 100;
const MAX_LIBRARY = 200;
const PERSIST_PATH = "spotify-state.json";
const PERSIST_KEY = "state";
const COVER_IMAGE_ID = 100;
const MAX_POSITION_MS = 1000 * 60 * 60 * 12;
const MAX_DURATION_MS = 1000 * 60 * 60 * 12;

function blankDraft(): Draft {
  return { bytes: EMPTY, anchor: 0, focus: 0, compStart: -1, compEnd: -1 };
}

export function initialModel(): Model {
  return {
    page: "home",
    history: ["home"],
    historyIndex: 0,
    search: blankDraft(),
    searchPhase: "idle",
    tracks: [],
    contextTracks: [],
    nowId: 0,
    nowTrack: EMPTY_TRACK,
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
    volumePermille: 800,
    shuffle: false,
    shuffleSeed: 0,
    repeat: "off",
    lyricsText: EMPTY,
    lyricsLoading: false,
    errorText: EMPTY,
  };
}

function draftState(draft: Draft): TextEditState {
  return { text: draft.bytes, selection: { start: draft.anchor, end: draft.focus }, composition: draft.compStart >= 0 ? { start: draft.compStart, end: draft.compEnd } : null };
}

function draftFromState(state: TextEditState): Draft {
  return { bytes: state.text, anchor: state.selection.start, focus: state.selection.end, compStart: state.composition === null ? -1 : state.composition.start, compEnd: state.composition === null ? -1 : state.composition.end };
}

function updateSearchDraft(model: Model, edit: TextInputEvent): Model {
  const next = applyTextInputEvent(draftState(model.search), edit);
  if (next.text.length > MAX_SEARCH) return model;
  return { ...model, search: draftFromState(next), searchPhase: next.text.length === 0 ? "idle" : "debouncing", errorText: EMPTY };
}

function trackKey(track: Track): Bytes {
  return track.remoteId.length > 0 ? track.remoteId : track.title;
}

function bytesEqual(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function trackIn(items: readonly Track[], track: Track): boolean {
  const key = trackKey(track);
  for (const item of items) if (bytesEqual(trackKey(item), key)) return true;
  return false;
}

function removeTrack(items: readonly Track[], track: Track): readonly Track[] {
  const key = trackKey(track);
  return items.filter((item) => !bytesEqual(trackKey(item), key));
}

function clampLibrary(items: readonly Track[]): readonly Track[] {
  return items.length > MAX_LIBRARY ? items.slice(items.length - MAX_LIBRARY) : items;
}

function trackByRowId(model: Model, rowId: number): Track | undefined {
  const index = rowId - 1;
  return index >= 0 && index < model.tracks.length ? model.tracks[index] : undefined;
}

function likedByRowId(model: Model, rowId: number): Track | undefined {
  const index = rowId - 1;
  return index >= 0 && index < model.likedTracks.length ? model.likedTracks[index] : undefined;
}

function playlistByRowId(model: Model, rowId: number): Track | undefined {
  const index = rowId - 1;
  return index >= 0 && index < model.playlistTracks.length ? model.playlistTracks[index] : undefined;
}

function queueById(model: Model, id: number): QueueItem | undefined {
  return model.queue.find((item) => item.id === id);
}

function currentTrack(model: Model): Track | undefined {
  return model.nowTrack.remoteId.length > 0 || model.nowTrack.title.length > 0 ? model.nowTrack : undefined;
}

function queueSnapshot(model: Model, track: Track): Model {
  if (model.queue.length >= MAX_QUEUE) return model;
  const nextId = model.queue.length === 0 ? 1 : model.queue[model.queue.length - 1].id + 1;
  return { ...model, queue: [...model.queue, { id: nextId, track }] };
}

function qualityToken(model: Model): OctaveQuality {
  return model.quality;
}

function resolveTrack(model: Model, track: Track): readonly [Model, Cmd<Msg>] {
  if (track.remoteId.length === 0) return [{ ...model, errorText: asciiBytes("This result has no playable Octave id.") }, Cmd.none];
  const next: Model = { ...model, nowTrack: track, playing: false, buffering: true, loadPending: true, fallbackPlayback: false, audioReady: false, positionMs: 0, durationMs: Math.max(0, Math.min(MAX_DURATION_MS, track.durationSeconds * 1000)), errorText: EMPTY, lyricsText: EMPTY, lyricsLoading: false };
  return [next, Cmd.fetch({ url: octaveResolveUrlWithQuality(track.remoteId, qualityToken(model)), method: "GET" }, { event: "resolve_done" })];
}

function navigate(model: Model, page: Page): Model {
  if (model.page === page) return model;
  const nextHistory = model.history.slice(0, model.historyIndex + 1).concat([page]);
  return { ...model, page, history: nextHistory, historyIndex: nextHistory.length - 1 };
}

function persistSnapshot(model: Model): PersistedState {
  return {
    quality: model.quality,
    volumePermille: model.volumePermille,
    autoplay: model.autoplay,
    likedTracks: model.likedTracks,
    playlistCreated: model.playlistCreated,
    playlistTracks: model.playlistTracks,
  };
}

function persistCommand(model: Model): Cmd<Msg> {
  return Cmd.persistWrite(PERSIST_PATH, PERSIST_KEY, encodeState(persistSnapshot(model)), { event: "persist_done" });
}

function withPersist(model: Model): readonly [Model, Cmd<Msg>] {
  return [model, persistCommand(model)];
}

function replaceSearch(model: Model, q: Bytes): Model {
  const sizeRaw = q.length;
  let size = 0;
  if (sizeRaw >= 0 && sizeRaw <= MAX_SEARCH) size = sizeRaw;
  const search = { bytes: q, anchor: size, focus: size, compStart: -1, compEnd: -1 };
  const base = navigate(model, "search");
  return { ...base, search, searchPhase: "loading_octave", tracks: [], errorText: EMPTY };
}

function startSearch(model: Model): readonly [Model, Cmd<Msg>] {
  if (model.search.bytes.length === 0) return [{ ...model, searchPhase: "idle", tracks: [] }, Cmd.none];
  return [{ ...model, searchPhase: "loading_octave", errorText: EMPTY }, Cmd.fetch({ url: octaveSearchUrl(model.search.bytes), method: "GET" }, { event: "search_octave_done" })];
}

function playContext(model: Model, track: Track, context: readonly Track[]): readonly [Model, Cmd<Msg>] {
  const seeded = { ...model, contextTracks: context, nowId: 0 };
  return resolveTrack(seeded, track);
}

function loadCover(model: Model, track: Track): readonly [Model, Cmd<Msg>] {
  if (track.coverUrl.length === 0) return [{ ...model, coverImage: 0, coverRequestId: 0 }, Cmd.none];
  return [{ ...model, coverImage: 0, coverRequestId: COVER_IMAGE_ID }, Cmd.imageLoad(COVER_IMAGE_ID, { url: track.coverUrl }, { event: "cover_done" })];
}

function loadLyrics(model: Model, track: Track): readonly [Model, Cmd<Msg>] {
  if (track.title.length === 0) return [{ ...model, lyricsText: EMPTY, lyricsLoading: false }, Cmd.none];
  return [{ ...model, lyricsLoading: true, lyricsText: EMPTY }, Cmd.fetch({ url: octaveLyricsUrl(), method: "POST", headers: [{ name: asciiBytes("content-type"), value: asciiBytes("application/json") }], body: octaveLyricsBody(track) }, { event: "lyrics_done" })];
}

function findContextIndex(model: Model, track: Track): number {
  const key = trackKey(track);
  for (let i = 0; i < model.contextTracks.length; i++) if (bytesEqual(trackKey(model.contextTracks[i]), key)) return i;
  return -1;
}

function nextContextTrack(model: Model, direction: number): Track | undefined {
  if (model.contextTracks.length === 0) return undefined;
  const current = currentTrack(model);
  let index = current === undefined ? -1 : findContextIndex(model, current);
  if (direction > 0) index += 1; else index -= 1;
  if (model.repeat === "context") {
    if (index >= model.contextTracks.length) index = 0;
    if (index < 0) index = model.contextTracks.length - 1;
  }
  if (index < 0 || index >= model.contextTracks.length) return undefined;
  return model.contextTracks[index];
}

function nextQueue(model: Model): QueueItem | undefined {
  return model.queue.length > 0 ? model.queue[0] : undefined;
}

function removeFirstQueue(model: Model): Model {
  return model.queue.length === 0 ? model : { ...model, queue: model.queue.slice(1) };
}

function autoplayRadio(model: Model): readonly [Model, Cmd<Msg>] {
  const track = currentTrack(model);
  if (!model.autoplay || track === undefined || track.remoteId.length === 0) return [model, Cmd.none];
  return [{ ...model, buffering: true }, Cmd.fetch({ url: octaveTrackRadioUrl(track.remoteId), method: "GET" }, { event: "radio_done" })];
}

export function update(model: Model, msg: Msg): Model | readonly [Model, Cmd<Msg>] {
  switch (msg.kind) {
    case "go_home": return navigate(model, "home");
    case "go_search": return navigate(model, "search");
    case "go_library": return navigate(model, "library");
    case "go_queue": return navigate(model, "queue");
    case "go_settings": return navigate(model, "settings");
    case "go_notifications": return navigate(model, "notifications");
    case "go_playlist": return navigate(model, "playlist");
    case "go_premium": return navigate(model, "premium");
    case "go_back": {
      if (model.historyIndex <= 0) return model;
      const index = model.historyIndex - 1;
      return { ...model, page: model.history[index], historyIndex: index };
    }
    case "go_forward": {
      if (model.historyIndex + 1 >= model.history.length) return model;
      const index = model.historyIndex + 1;
      return { ...model, page: model.history[index], historyIndex: index };
    }
    case "go_lyrics": {
      const track = currentTrack(model);
      const base = navigate(model, "lyrics");
      if (track === undefined) return { ...base, lyricsText: EMPTY, lyricsLoading: false };
      return loadLyrics(base, track);
    }
    case "open_now_artist": {
      const track = currentTrack(model);
      if (track === undefined || track.artist.length === 0) return model;
      const base = replaceSearch(model, track.artist);
      return [navigate(base, "artist"), Cmd.fetch({ url: octaveSearchUrl(track.artist), method: "GET" }, { event: "search_octave_done" })];
    }
    case "go_track_artist": {
      const track = trackByRowId(model, msg.artistTrackId);
      if (track === undefined || track.artist.length === 0) return model;
      const base = replaceSearch(model, track.artist);
      return [navigate(base, "artist"), Cmd.fetch({ url: octaveSearchUrl(track.artist), method: "GET" }, { event: "search_octave_done" })];
    }
    case "search_edit": {
      const next = updateSearchDraft(model, msg.edit);
      if (next.search.bytes.length === 0) return next;
      return [next, Cmd.sleep(SEARCH_DEBOUNCE_MS, { event: "search_fire" })];
    }
    case "search_submit": return startSearch(model);
    case "search_fire": {
      if (model.searchPhase !== "debouncing") return model;
      return startSearch(model);
    }
    case "search_pop": return startSearch(replaceSearch(model, asciiBytes("pop")));
    case "search_hiphop": return startSearch(replaceSearch(model, asciiBytes("hip hop")));
    case "search_chill": return startSearch(replaceSearch(model, asciiBytes("chill")));
    case "search_trending": return startSearch(replaceSearch(model, asciiBytes("trending")));
    case "search_indie": return startSearch(replaceSearch(model, asciiBytes("indie")));
    case "search_party": return startSearch(replaceSearch(model, asciiBytes("party")));
    case "search_focus": return startSearch(replaceSearch(model, asciiBytes("focus")));
    case "search_workout": return startSearch(replaceSearch(model, asciiBytes("workout")));
    case "search_classical": return startSearch(replaceSearch(model, asciiBytes("classical")));
    case "search_octave_done": {
      if (!msg.ok || msg.status < 200 || msg.status >= 300) {
        return [{ ...model, searchPhase: "loading_fallback" }, Cmd.fetch({ url: deezerSearchFallbackUrl(model.search.bytes), method: "GET" }, { event: "search_fallback_done" })];
      }
      const parsed = parseOctaveSearch(msg.body);
      if (parsed.length === 0) return [{ ...model, searchPhase: "loading_fallback" }, Cmd.fetch({ url: deezerSearchFallbackUrl(model.search.bytes), method: "GET" }, { event: "search_fallback_done" })];
      return { ...model, tracks: parsed, searchPhase: "ready", errorText: EMPTY };
    }
    case "search_fallback_done": {
      if (!msg.ok || msg.status < 200 || msg.status >= 300) return { ...model, searchPhase: "failed", errorText: asciiBytes("Search is temporarily unavailable.") };
      const parsed = parseDeezerSearch(msg.body);
      if (parsed.length === 0) return { ...model, searchPhase: "failed", errorText: asciiBytes("No results found.") };
      return { ...model, tracks: parsed, searchPhase: "ready", errorText: EMPTY };
    }
    case "play_track": {
      const track = trackByRowId(model, msg.trackId);
      if (track === undefined) return model;
      return playContext(model, track, model.tracks);
    }
    case "play_liked_track": {
      const track = likedByRowId(model, msg.likedTrackId);
      if (track === undefined) return model;
      return playContext(model, track, model.likedTracks);
    }
    case "play_playlist_track": {
      const track = playlistByRowId(model, msg.playlistTrackId);
      if (track === undefined) return model;
      return playContext(model, track, model.playlistTracks);
    }
    case "play_queue_track": {
      const item = queueById(model, msg.queueTrackId);
      if (item === undefined) return model;
      return playContext(model, item.track, model.queue.map((q) => q.track));
    }
    case "toggle_play": {
      const track = currentTrack(model);
      if (track === undefined) {
        const source = model.tracks.length > 0 ? model.tracks : model.likedTracks.length > 0 ? model.likedTracks : model.playlistTracks;
        if (source.length === 0) return model;
        return playContext(model, source[0], source);
      }
      if (!model.audioReady && !model.loadPending) return resolveTrack(model, track);
      if (model.loadPending) return model;
      return [{ ...model, playing: !model.playing }, Cmd.audioControl(model.playing ? "pause" : "resume")];
    }
    case "prev_track": {
      const track = nextContextTrack(model, -1);
      return track === undefined ? model : playContext(model, track, model.contextTracks);
    }
    case "next_track": {
      const queued = nextQueue(model);
      if (queued !== undefined) return playContext(removeFirstQueue(model), queued.track, model.contextTracks);
      const track = nextContextTrack(model, 1);
      return track === undefined ? autoplayRadio(model) : playContext(model, track, model.contextTracks);
    }
    case "scrubbed": {
      if (!model.audioReady || model.durationMs <= 0) return model;
      const value = Math.max(0, Math.min(1, msg.value));
      const nextPosition = Math.trunc(value * model.durationMs);
      return [{ ...model, positionMs: nextPosition }, Cmd.audioControl("seek", nextPosition)];
    }
    case "volume_changed": {
      const value = Math.max(0, Math.min(1, msg.value));
      const permille = Math.trunc(value * 1000);
      const next = { ...model, volumePermille: permille };
      return [next, Cmd.batch([Cmd.audioControl("volume", permille), persistCommand(next)])];
    }
    case "toggle_shuffle": return { ...model, shuffle: !model.shuffle, shuffleSeed: model.shuffleSeed + 1 };
    case "cycle_repeat": return { ...model, repeat: model.repeat === "off" ? "context" : model.repeat === "context" ? "one" : "off" };
    case "toggle_now_playing": return { ...model, showNowPlaying: !model.showNowPlaying };
    case "toggle_now_like": {
      const track = currentTrack(model);
      if (track === undefined) return model;
      const likedTracks = trackIn(model.likedTracks, track) ? removeTrack(model.likedTracks, track) : clampLibrary([...model.likedTracks, track]);
      return withPersist({ ...model, likedTracks });
    }
    case "toggle_like": {
      const track = trackByRowId(model, msg.likeTrackId);
      if (track === undefined) return model;
      const likedTracks = trackIn(model.likedTracks, track) ? removeTrack(model.likedTracks, track) : clampLibrary([...model.likedTracks, track]);
      return withPersist({ ...model, likedTracks });
    }
    case "queue_now": {
      const track = currentTrack(model);
      return track === undefined ? model : queueSnapshot(model, track);
    }
    case "queue_track": {
      const track = trackByRowId(model, msg.queueTrackId);
      return track === undefined ? model : queueSnapshot(model, track);
    }
    case "remove_queue_track": return { ...model, queue: model.queue.filter((item) => item.id !== msg.queueItemId) };
    case "clear_queue": return { ...model, queue: [] };
    case "create_playlist": return withPersist({ ...model, playlistCreated: true });
    case "add_now_to_playlist": {
      const track = currentTrack(model);
      if (track === undefined) return model;
      if (trackIn(model.playlistTracks, track)) return model;
      return withPersist({ ...model, playlistCreated: true, playlistTracks: clampLibrary([...model.playlistTracks, track]) });
    }
    case "add_to_playlist": {
      const track = trackByRowId(model, msg.playlistTrackId);
      if (track === undefined || trackIn(model.playlistTracks, track)) return model;
      return withPersist({ ...model, playlistCreated: true, playlistTracks: clampLibrary([...model.playlistTracks, track]) });
    }
    case "remove_playlist_track": {
      const track = playlistByRowId(model, msg.playlistItemId);
      if (track === undefined) return model;
      return withPersist({ ...model, playlistTracks: removeTrack(model.playlistTracks, track) });
    }
    case "clear_playlist": return withPersist({ ...model, playlistTracks: [] });
    case "play_playlist": {
      if (model.playlistTracks.length === 0) return model;
      return playContext(model, model.playlistTracks[0], model.playlistTracks);
    }
    case "quality_128": return withPersist({ ...model, quality: "128" });
    case "quality_320": return withPersist({ ...model, quality: "320" });
    case "quality_lossless": return withPersist({ ...model, quality: "lossless" });
    case "toggle_autoplay": return withPersist({ ...model, autoplay: !model.autoplay });
    case "resolve_done": {
      if (!model.loadPending) return model;
      if (!msg.ok || msg.status < 200 || msg.status >= 300) return { ...model, loadPending: false, buffering: false, playing: false, errorText: asciiBytes("Playback resolve failed.") };
      const resolved = parseOctaveResolve(msg.body);
      if (resolved === undefined) return { ...model, loadPending: false, buffering: false, playing: false, errorText: asciiBytes("Playback metadata was invalid.") };
      const track = currentTrack(model);
      if (track === undefined) return model;
      const [covered, coverCmd] = loadCover({ ...model, loadPending: false, buffering: true, fallbackPlayback: resolved.fallback, durationMs: resolved.durationMs > 0 ? Math.min(MAX_DURATION_MS, resolved.durationMs) : model.durationMs }, track);
      return [covered, Cmd.batch([coverCmd, Cmd.audioPlay({ url: resolved.url, volumePermille: model.volumePermille, startPositionMs: 0 }, { event: "audio_event" })])];
    }
    case "radio_done": {
      if (!msg.ok || msg.status < 200 || msg.status >= 300) return { ...model, buffering: false };
      const parsed = parseOctaveSearch(msg.body);
      if (parsed.length === 0) return { ...model, buffering: false };
      return playContext({ ...model, buffering: false }, parsed[0], parsed);
    }
    case "cover_done": {
      if (msg.id !== model.coverRequestId) return model;
      if (msg.state === "loaded") return { ...model, coverImage: msg.id };
      return { ...model, coverImage: 0 };
    }
    case "lyrics_done": {
      if (!model.lyricsLoading) return model;
      if (!msg.ok || msg.status < 200 || msg.status >= 300) return { ...model, lyricsLoading: false, lyricsText: EMPTY, errorText: asciiBytes("Lyrics are unavailable for this track.") };
      const text = parseOctaveLyrics(msg.body);
      return { ...model, lyricsLoading: false, lyricsText: text, errorText: text.length === 0 ? asciiBytes("Lyrics are unavailable for this track.") : EMPTY };
    }
    case "audio_event": {
      const pos = msg.positionMs >= 0 && msg.positionMs <= MAX_POSITION_MS ? Math.trunc(msg.positionMs) : model.positionMs;
      const dur = msg.durationMs >= 0 && msg.durationMs <= MAX_DURATION_MS ? Math.trunc(msg.durationMs) : model.durationMs;
      if (msg.state === "playing") return { ...model, audioReady: true, buffering: false, playing: true, positionMs: pos, durationMs: dur };
      if (msg.state === "paused") return { ...model, audioReady: true, buffering: false, playing: false, positionMs: pos, durationMs: dur };
      if (msg.state === "buffering") return { ...model, buffering: true, positionMs: pos, durationMs: dur };
      if (msg.state === "ended") {
        if (model.repeat === "one") return [model, Cmd.audioControl("seek", 0)];
        const queued = nextQueue(model);
        if (queued !== undefined) return playContext(removeFirstQueue(model), queued.track, model.contextTracks);
        const track = nextContextTrack(model, 1);
        return track === undefined ? autoplayRadio(model) : playContext(model, track, model.contextTracks);
      }
      if (msg.state === "failed") return { ...model, audioReady: false, buffering: false, playing: false, errorText: asciiBytes("Playback failed.") };
      return { ...model, positionMs: pos, durationMs: dur };
    }
    case "persist_loaded": {
      if (!msg.ok || msg.data.length === 0) return model;
      const restored = decodeState(msg.data);
      return { ...model, quality: restored.quality, volumePermille: restored.volumePermille, autoplay: restored.autoplay, likedTracks: restored.likedTracks, playlistCreated: restored.playlistCreated, playlistTracks: restored.playlistTracks };
    }
    case "persist_done": return model;
  }
}

export function subscriptions(model: Model): Sub<Msg> {
  return model.searchPhase === "debouncing" ? Sub.none : Sub.none;
}

export function bootCommand(_model: Model): Cmd<Msg> {
  return Cmd.persistRead(PERSIST_PATH, PERSIST_KEY, { event: "persist_loaded" });
}

export function searchText(model: Model): Bytes { return model.search.bytes; }
export function searchIdle(model: Model): boolean { return model.search.bytes.length === 0 && model.searchPhase === "idle"; }
export function searchLoading(model: Model): boolean { return model.searchPhase === "loading_octave" || model.searchPhase === "loading_fallback" || model.searchPhase === "debouncing"; }
export function searchReady(model: Model): boolean { return model.searchPhase === "ready" && model.tracks.length > 0; }
export function searchFailed(model: Model): boolean { return model.searchPhase === "failed"; }
export function hasResults(model: Model): boolean { return model.tracks.length > 0; }
export function trackRows(model: Model): readonly TrackRow[] {
  return model.tracks.map((track, index) => ({ id: index + 1, title: track.title, artist: track.artist, album: track.album, duration: formatSeconds(track.durationSeconds), active: currentTrack(model) !== undefined && bytesEqual(trackKey(currentTrack(model)!), trackKey(track)), liked: trackIn(model.likedTracks, track) }));
}
export function likedRows(model: Model): readonly TrackRow[] {
  return model.likedTracks.map((track, index) => ({ id: index + 1, title: track.title, artist: track.artist, album: track.album, duration: formatSeconds(track.durationSeconds), active: currentTrack(model) !== undefined && bytesEqual(trackKey(currentTrack(model)!), trackKey(track)), liked: true }));
}
export function playlistRows(model: Model): readonly TrackRow[] {
  return model.playlistTracks.map((track, index) => ({ id: index + 1, title: track.title, artist: track.artist, album: track.album, duration: formatSeconds(track.durationSeconds), active: currentTrack(model) !== undefined && bytesEqual(trackKey(currentTrack(model)!), trackKey(track)), liked: trackIn(model.likedTracks, track) }));
}
export interface QueueRow { readonly id: number; readonly title: Bytes; readonly artist: Bytes; readonly duration: Bytes; }
export function queueRows(model: Model): readonly QueueRow[] { return model.queue.map((item) => ({ id: item.id, title: item.track.title, artist: item.track.artist, duration: formatSeconds(item.track.durationSeconds) })); }
export function hasQueue(model: Model): boolean { return model.queue.length > 0; }
export function likedCount(model: Model): number { return model.likedTracks.length; }
export function playlistCount(model: Model): number { return model.playlistTracks.length; }
export function playlistCreated(model: Model): boolean { return model.playlistCreated; }
export function hasPlaylist(model: Model): boolean { return model.playlistCreated; }
export function hasNow(model: Model): boolean { return currentTrack(model) !== undefined; }
export function hasCover(model: Model): boolean { return model.coverImage > 0; }
export function nowTitle(model: Model): Bytes { const track = currentTrack(model); return track === undefined ? asciiBytes("Not playing") : track.title; }
export function nowArtist(model: Model): Bytes { const track = currentTrack(model); return track === undefined ? asciiBytes("Choose something to play") : track.artist; }
export function nowAlbum(model: Model): Bytes { const track = currentTrack(model); return track === undefined ? new Uint8Array(0) : track.album; }
export function nowLiked(model: Model): boolean { const track = currentTrack(model); return track !== undefined && trackIn(model.likedTracks, track); }
export function playIcon(model: Model): Bytes { return model.playing ? asciiBytes("pause") : asciiBytes("play"); }
export function repeatLabel(model: Model): Bytes { return model.repeat === "one" ? asciiBytes("Repeat 1") : model.repeat === "context" ? asciiBytes("Repeat") : asciiBytes("Repeat off"); }
function formatMilliseconds(ms: number): Bytes {
  if (!Number.isFinite(ms) || ms <= 0) return asciiBytes("0:00");
  const seconds = Math.trunc(ms / 1000);
  const minutes = Math.trunc(seconds / 60);
  const rem = seconds - minutes * 60;
  return asciiBytes(`${minutes}:${rem < 10 ? "0" : ""}${rem}`);
}
export function positionLabel(model: Model): Bytes { return formatMilliseconds(model.positionMs); }
export function durationLabel(model: Model): Bytes { return formatMilliseconds(model.durationMs); }
export function seekFraction(model: Model): number {
  if (model.durationMs <= 0) return 0;
  const ratio = model.positionMs / model.durationMs;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 1;
  return ratio;
}
export function volumeFraction(model: Model): number {
  const ratio = model.volumePermille / 1000;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 1;
  return ratio;
}
export function quality128(model: Model): boolean { return model.quality === "128"; }
export function quality320(model: Model): boolean { return model.quality === "320"; }
export function qualityLossless(model: Model): boolean { return model.quality === "lossless"; }
export function repeatActive(model: Model): boolean { return model.repeat !== "off"; }
export function pageHome(model: Model): boolean { return model.page === "home"; }
export function pageSearch(model: Model): boolean { return model.page === "search"; }
export function pageLibrary(model: Model): boolean { return model.page === "library"; }
export function pageLyrics(model: Model): boolean { return model.page === "lyrics"; }
export function pageArtist(model: Model): boolean { return model.page === "artist"; }
export function artistName(model: Model): Bytes { return model.search.bytes.length > 0 ? model.search.bytes : nowArtist(model); }
export function hasLyrics(model: Model): boolean { return model.lyricsText.length > 0; }
export function pageQueue(model: Model): boolean { return model.page === "queue"; }
export function pageSettings(model: Model): boolean { return model.page === "settings"; }
export function pageNotifications(model: Model): boolean { return model.page === "notifications"; }
export function pagePlaylist(model: Model): boolean { return model.page === "playlist"; }
export function pagePremium(model: Model): boolean { return model.page === "premium"; }
