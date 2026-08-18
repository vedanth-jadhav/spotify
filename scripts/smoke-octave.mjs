const API = "https://api.octavestreaming.com/api";

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

const search = await fetchWithTimeout(`${API}/search/tracks?query=Daft%20Punk&limit=1`, {
  headers: { accept: "application/json" },
});
if (!search.ok) {
  if ([401, 403, 429].includes(search.status) || search.status >= 500) {
    console.warn(`Octave live smoke skipped: CI request was rejected with ${search.status}; deterministic provider tests remain authoritative.`);
    process.exit(0);
  }
  throw new Error(`Octave search returned ${search.status}`);
}
const searchJson = await search.json();
const track = searchJson?.results?.[0];
if (!track?.id || !track?.title || !track?.previewUrl) throw new Error("Octave search response is missing the expected track fields");
console.log(`search ok: ${track.id} ${track.title}`);

const resolve = await fetchWithTimeout(`${API}/track/${encodeURIComponent(String(track.id))}?quality=320`, {
  headers: { accept: "application/json" },
});
if (!resolve.ok) throw new Error(`Octave track resolver returned ${resolve.status}`);
const resolved = await resolve.json();
if (typeof resolved?.url !== "string" || !resolved.url.startsWith("https://api.octavestreaming.com/audio/320?")) {
  throw new Error("Octave resolver did not return the expected signed 320 kbps media URL");
}
if (typeof resolved?.preview !== "string" || resolved.preview.length === 0) throw new Error("Octave resolver did not return a preview fallback");
console.log(`resolver ok: quality=${resolved.quality ?? "unknown"}`);

const media = await fetchWithTimeout(resolved.url, {
  headers: { Range: "bytes=0-255", accept: "audio/*,*/*" },
});
if (media.status !== 200 && media.status !== 206) throw new Error(`Signed Octave media URL returned ${media.status}`);
const contentType = media.headers.get("content-type") ?? "";
if (!contentType.includes("audio") && !contentType.includes("octet-stream")) {
  throw new Error(`Signed Octave media URL returned unexpected content type: ${contentType}`);
}
await media.body?.cancel();
console.log(`media ok: ${media.status} ${contentType}`);
