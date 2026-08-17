const ORIGIN = "https://music.octavestreaming.com";
const TIMEOUT_MS = 8000;

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "OctaveNativeProbe/3.0" } });
    console.log(`FETCH ${r.status} ${r.url}`);
    return r.ok ? await r.text() : "";
  } catch (error) {
    console.log(`FETCH_ERROR ${url} ${error?.name ?? "Error"}`);
    return "";
  } finally { clearTimeout(timer); }
}

function absolute(url) { return new URL(url, ORIGIN).href; }
function collect(text, source, out) {
  const normalized = text.replaceAll("\\/", "/");
  for (const m of normalized.matchAll(/https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g)) {
    const v = m[0];
    if (/octave|deezer|dzcdn|lyrics|stream|media|api/i.test(v)) out.add(`URL ${v} <- ${source}`);
  }
  for (const m of normalized.matchAll(/["'`]((?:\/api\/|\/)(?:search|track|playlist|artist|album|radio|podcast|lyrics|stream|download|media|gateway|proxy)[^"'`\\ ]{0,160})["'`]/gi)) {
    out.add(`PATH ${m[1]} <- ${source}`);
  }
}

const html = await get(`${ORIGIN}/`);
if (!html) process.exit(1);
const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map(m => absolute(m[1]))
  .filter((v, i, a) => a.indexOf(v) === i)
  .slice(0, 40);
console.log(`SCRIPTS ${scriptUrls.length}`);
const texts = await Promise.all(scriptUrls.map(async url => [url, await get(url)]));
const found = new Set();
collect(html, "html", found);
for (const [url, text] of texts) if (text) collect(text, url.split("/").pop() ?? url, found);
console.log(`ROUTES ${found.size}`);
for (const item of [...found].filter(x => !x.includes("cdn-images.dzcdn.net")).sort()) console.log(item);

console.log("=== CONTRACT CONTEXT ===");
for (const [url, text] of texts) {
  if (!text) continue;
  const normalized = text.replaceAll("\\/", "/");
  for (const needle of ["https://api.octavestreaming.com", "/search/tracks?query=", "/track/${t}?quality=", "/lyrics"]) {
    const at = normalized.indexOf(needle);
    if (at >= 0) console.log(`CONTEXT ${needle} ${normalized.slice(Math.max(0, at - 700), Math.min(normalized.length, at + 1400)).replace(/\s+/g, " ")} <- ${url.split("/").pop()}`);
  }
}

console.log("=== LIVE CONTRACT ===");
const searchUrl = "https://api.octavestreaming.com/search/tracks?query=Daft%20Punk&limit=2";
const searchBody = await get(searchUrl);
console.log(`SEARCH_BODY ${searchBody.slice(0, 5000).replace(/\s+/g, " ")}`);
let firstTrackId = "";
try {
  const parsed = JSON.parse(searchBody);
  const candidates = Array.isArray(parsed) ? parsed : (parsed?.data ?? parsed?.tracks ?? parsed?.results ?? []);
  if (Array.isArray(candidates) && candidates.length) firstTrackId = String(candidates[0]?.id ?? candidates[0]?.track?.id ?? "");
} catch {}
console.log(`FIRST_TRACK_ID ${firstTrackId}`);
if (firstTrackId) {
  for (const quality of ["128", "320", "MP3_128", "MP3_320", "FLAC", "LOSSLESS"]) {
    const body = await get(`https://api.octavestreaming.com/track/${encodeURIComponent(firstTrackId)}?quality=${encodeURIComponent(quality)}`);
    console.log(`TRACK_${quality} ${body.slice(0, 2500).replace(/\s+/g, " ")}`);
  }
}
