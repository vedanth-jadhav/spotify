const ORIGIN = "https://music.octavestreaming.com";

function absolute(url) {
  return new URL(url, ORIGIN).href;
}

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "OctaveNativeProbe/1.0" },
    });
    console.log(`FETCH ${response.status} ${response.url} ${response.headers.get("content-type") ?? ""}`);
    if (!response.ok) return "";
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

const html = await get(`${ORIGIN}/`);
if (!html) process.exit(1);

const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map((match) => absolute(match[1]))
  .filter((url, index, all) => all.indexOf(url) === index);

console.log(`SCRIPTS ${scripts.length}`);
for (const script of scripts) console.log(`SCRIPT ${script}`);

const needles = [
  "/api/", "fetch(", "deezer", "stream", "lyrics", "search", "track", "playlist",
  "artist", "album", "radio", "podcast", "download", "gateway", "proxy", "media",
];
const candidates = new Set();

function collect(text, source) {
  for (const match of text.matchAll(/https?:\\?\/[\\/]?[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g)) {
    const value = match[0].replaceAll("\\/", "/");
    if (/deezer|dzcdn|octave|stream|lyrics|api/i.test(value)) candidates.add(`URL ${value} <- ${source}`);
  }
  for (const match of text.matchAll(/["'`]((?:\\.|[^"'`]){1,180})["'`]/g)) {
    const raw = match[1].replaceAll("\\/", "/");
    if (/^\/(?:api|search|track|playlist|artist|album|radio|podcast|lyrics|stream|download|media|gateway|proxy)\b/i.test(raw)) {
      candidates.add(`PATH ${raw} <- ${source}`);
    }
  }
  const lower = text.toLowerCase();
  for (const needle of needles) {
    let at = 0;
    while ((at = lower.indexOf(needle.toLowerCase(), at)) !== -1) {
      const start = Math.max(0, at - 180);
      const end = Math.min(text.length, at + needle.length + 260);
      const context = text.slice(start, end).replace(/\s+/g, " ");
      candidates.add(`CTX ${needle} ${context} <- ${source}`);
      at += needle.length;
      if (candidates.size > 1200) break;
    }
  }
}

collect(html, "html");
for (const script of scripts) {
  const js = await get(script);
  if (js) collect(js, script.split("/").pop() ?? script);
}

console.log(`CANDIDATES ${candidates.size}`);
for (const item of [...candidates].sort()) console.log(item);
