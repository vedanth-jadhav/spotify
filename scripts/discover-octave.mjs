const ORIGIN = "https://music.octavestreaming.com";
const TIMEOUT_MS = 8000;

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "OctaveNativeProbe/2.0" } });
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
  for (const m of normalized.matchAll(/(?:fetch|axios\.(?:get|post)|new URL)\s*\(\s*["'`]([^"'`]{1,220})["'`]/gi)) {
    out.add(`CALL ${m[1]} <- ${source}`);
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
for (const item of [...found].sort()) console.log(item);
