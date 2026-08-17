# Octave API contract observed by this client

Observed from Octave's deployed web client and verified against the live service on 2026-08-17. This is an implementation contract used by this project, not a promise that Octave considers these endpoints a stable public API.

## Base URL

`https://api.octavestreaming.com/api`

The deployed frontend stores `https://api.octavestreaming.com` as its service base and prepends `/api` to API paths.

## Search

- `GET /search/tracks?query=<encoded>&limit=<n>` -> `{ results: Track[] }`
- `GET /search/artists?...`
- `GET /search/albums?...`
- `GET /search?query=...`
- `GET /search/page?...`
- `GET /search/trending`
- `GET /suggest?...`

Track results use string IDs and include `title`, `artist`, `album`, `duration`, and `previewUrl`.

## Playback

- `GET /track/<id>?quality=128`
- `GET /track/<id>?quality=320`
- `GET /track/<id>?quality=lossless`

The resolver returns JSON containing a short-lived signed `url` and a `preview` fallback. The native player must resolve this endpoint first and then pass the returned media URL to Native SDK audio playback. It must not treat the JSON resolver endpoint itself as an audio stream.

Observed quality mapping from the deployed client:

- Low/data saver/normal: `128`
- High: `320`
- Max: `lossless`

This client defaults to `320`.

Other observed playback/track routes include:

- `GET /track/<id>/radio`
- `GET /track/<id>/credits`
- `GET /track/isrc/<isrc>`
- `GET /tracks/features?ids=...`
- `GET /playback-token`

## Lyrics

- `POST /lyrics`

The deployed frontend sends an object with `id`, `title`, `artist`, `album`, `duration`, and `source`. Direct CI requests can receive Cloudflare challenge responses, so the native client does not currently make successful lyrics availability a playback requirement.

## Artist, podcast, and radio routes observed

- `/artists?ids=...`
- `/artists/releases?ids=...`
- `/artist/<id>/top-songs`
- `/artist/<id>/discography?index=&limit=`
- `/artist/<id>/playlists`
- `/artist/<id>/radio`
- `/artist/<id>/concerts`
- `/podcasts`
- `/podcast/<id>`
- `/podcast/<id>/episodes?index=&limit=`
- `/podcasts/search?query=&limit=`
- `/radio`
- `/radio/genres`
- `/radio/lists`
- `/radio/<id>`
