# Spotify Native

A fast, native macOS music client with a Spotify-style desktop experience and Octave Streaming as the playback/catalog provider.

## What is implemented

- Spotify-style three-pane desktop layout with Home, Search, Your Library, Now Playing, Queue, Lyrics, Settings, What's New, Premium entry point, and a persistent player bar.
- Octave track search, trending discovery, quality-aware stream resolution, song radio, and Deezer-compatible search/preview fallback when the Octave search path is unavailable.
- Native play/pause, previous/next, seeking, volume, shuffle, repeat-one/repeat-context, autoplay, queue management, and current-track cover art.
- Persistent Liked Songs, a local My Playlist, audio quality, autoplay, and Now Playing sidebar preferences.
- Context actions for save/remove, queue, playlist add/remove, and direct playback from saved collections.
- Bounded collections and a single decoded Now Playing image slot to keep memory use predictable.
- No embedded browser is used for the player UI.

## Provider notes

The Octave endpoints used by the client are documented in `docs/octave-api.md`. They are based on the deployed Octave web client and are treated as an adapter boundary, because Octave does not publish this as a stable public API contract.

Synchronized lyrics, account-backed notifications, remote-device handoff, offline downloads, and account subscription checkout depend on provider/account capabilities that are not exposed by the currently observed Octave API. The UI keeps the corresponding Spotify surfaces where useful without pretending unsupported provider operations succeeded.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

The screenshot workflow builds an automation-enabled native binary at 1440×900 in dark appearance and captures `docs/screenshots/home.png` for visual review.
