const ORIGIN = "https://music.octavestreaming.com";
const API = "https://api.octavestreaming.com/api";
const TIMEOUT_MS = 8000;

const ALLOWED_ORIGINS = new Set([ORIGIN, "https://api.octavestreaming.com"]);

function allowedUrl(value, base = ORIGIN) {
  const parsed = new URL(value, base);
  if (parsed.protocol !== "https:" || !ALLOWED_ORIGINS.has(parsed.origin)) throw new Error(`unexpected origin: ${parsed.origin}`);
  return parsed.href;
}

async function get(input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let url = allowedUrl(input);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const r = await fetch(url, { signal: controller.signal, redirect: "manual", headers: { "user-agent": "OctaveNativeProbe/4.0", accept: "application/json,text/plain,*/*" } });
      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get("location");
        if (!location || redirects === 3) throw new Error("unexpected redirect");
        url = allowedUrl(location, url);
        continue;
      }
      console.log(`FETCH ${r.status} ${url}`);
      return { status: r.status, body: await r.text(), type: r.headers.get("content-type") ?? "" };
    }
    return { status: 0, body: "", type: "" };
  } catch (error) {
    console.log(`FETCH_ERROR ${input} ${error?.name ?? "Error"}`);
    return { status: 0, body: "", type: "" };
  } finally { clearTimeout(timer); }
}

function absolute(url) { return allowedUrl(url); }
const home = await get(`${ORIGIN}/`);
if (!home.body) process.exit(1);
const scriptUrls = [...home.body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map(m => absolute(m[1])).filter((v, i, a) => a.indexOf(v) === i).slice(0, 40);
const texts = await Promise.all(scriptUrls.map(async url => [url, (await get(url)).body]));
for (const [url, text] of texts) {
  if (!text.includes("QUALITY_SPECS")) continue;
  const at = text.indexOf("QUALITY_SPECS");
  console.log(`QUALITY_CONTEXT ${text.slice(Math.max(0, at - 1800), at + 2500).replace(/\s+/g, " ")} <- ${url.split("/").pop()}`);
}

console.log("=== LIVE SEARCH ===");
const search = await get(`${API}/search/tracks?query=Daft%20Punk&limit=2`);
console.log(`SEARCH_TYPE ${search.type}`);
console.log(`SEARCH_BODY ${search.body.slice(0, 7000).replace(/\s+/g, " ")}`);
let first = null;
try {
  const parsed = JSON.parse(search.body);
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  first = results[0] ?? null;
} catch {}
const id = first?.id == null ? "" : String(first.id);
console.log(`FIRST_TRACK ${id} ${first ? JSON.stringify(first).slice(0, 3500) : ""}`);

if (id) {
  console.log("=== LIVE RESOLVE ===");
  for (const quality of ["128", "320", "flac", "MP3_128", "MP3_320", "FLAC", "DATA_SAVER", "HIGH", "MAX"]) {
    const r = await get(`${API}/track/${encodeURIComponent(id)}?quality=${encodeURIComponent(quality)}`);
    console.log(`RESOLVE ${quality} STATUS ${r.status} TYPE ${r.type} BODY ${r.body.slice(0, 1800).replace(/\s+/g, " ")}`);
  }
  if (first?.title && first?.artist?.name && first?.album?.title) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${API}/lyrics`, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ id, title: first.title, artist: first.artist.name, album: first.album.title, duration: first.duration ?? 0, source: "deezer" }) });
      console.log(`LYRICS STATUS ${r.status} TYPE ${r.headers.get("content-type") ?? ""} BODY ${(await r.text()).slice(0, 3500).replace(/\s+/g, " ")}`);
    } catch (error) { console.log(`LYRICS_ERROR ${error?.name ?? "Error"}`); }
    finally { clearTimeout(timer); }
  }
}
