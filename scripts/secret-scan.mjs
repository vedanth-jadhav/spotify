import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const ignored = new Set([".git", "node_modules", ".native", "zig-cache", "zig-out"]);
const pattern = /(api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/i;
let findings = 0;

async function walk(path) {
  const info = await stat(path);
  if (info.isDirectory()) {
    for (const name of await readdir(path)) if (!ignored.has(name)) await walk(join(path, name));
    return;
  }
  if (path.endsWith(".md")) return;
  const body = await readFile(path, "utf8");
  if (pattern.test(body)) {
    console.error(`potential credential in ${path}`);
    findings += 1;
  }
}

await walk(".");
if (findings > 0) process.exit(1);
console.log("no obvious committed credentials detected");
