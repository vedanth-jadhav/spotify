import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";

const roots = ["src", "app.zon"];
let sourceBytes = 0;
let webviewMentions = 0;

async function walk(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await walk(join(path, name));
    return;
  }
  const body = await readFile(path);
  sourceBytes += body.byteLength;
  webviewMentions += (body.toString("utf8").match(/<webview|kind\s*=\s*"webview"/g) ?? []).length;
}

for (const root of roots) await walk(root);
if (webviewMentions !== 0) throw new Error(`performance regression: ${webviewMentions} WebView surfaces found`);
if (sourceBytes > 600_000) throw new Error(`source budget exceeded: ${sourceBytes} bytes`);
console.log(`perf budget ok: ${sourceBytes} source bytes, zero WebViews`);
