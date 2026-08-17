import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packagePath = path.join(root, "node_modules", "@native-sdk", "cli", "package.json");
const emitterPath = path.join(root, "node_modules", "@native-sdk", "cli", "tools", "corewire", "emit.zig");

if (!fs.existsSync(packagePath) || !fs.existsSync(emitterPath)) {
  throw new Error("Native SDK CLI is not installed; cannot apply the v0.8.3 corewire quota patch");
}

const nativePackage = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (nativePackage.version !== "0.8.3") {
  throw new Error(`Native SDK corewire quota patch is pinned to 0.8.3, found ${nativePackage.version}`);
}

const marker = "            \\\\comptime {{\n            \\\\    // The union and the tag table are emitted from one arm list;";
const patchedMarker = "            \\\\comptime {{\n            \\\\    @setEvalBranchQuota(20_000);\n            \\\\    // The union and the tag table are emitted from one arm list;";

const source = fs.readFileSync(emitterPath, "utf8");
if (source.includes(patchedMarker)) {
  console.log("Native SDK corewire comptime quota patch already applied");
  process.exit(0);
}
if (!source.includes(marker)) {
  throw new Error("Native SDK corewire emitter changed; refusing to apply an unverified patch");
}

fs.writeFileSync(emitterPath, source.replace(marker, patchedMarker));
console.log("Patched Native SDK 0.8.3 corewire comptime quota to 20,000 branches");
