import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packagePath = path.join(root, "node_modules", "@native-sdk", "cli", "package.json");
const emitterPath = path.join(root, "node_modules", "@native-sdk", "cli", "tools", "corewire", "emit.zig");
const uiAppPath = path.join(root, "node_modules", "@native-sdk", "cli", "src", "runtime", "ui_app.zig");

if (!fs.existsSync(packagePath) || !fs.existsSync(emitterPath) || !fs.existsSync(uiAppPath)) {
  throw new Error("Native SDK CLI is not installed or its verified v0.8.3 source layout changed");
}

const nativePackage = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (nativePackage.version !== "0.8.3") {
  throw new Error(`Native SDK compatibility patches are pinned to 0.8.3, found ${nativePackage.version}`);
}

const marker = "            \\comptime {{\n            \\    // The union and the tag table are emitted from one arm list;";
const patchedMarker = "            \\comptime {{\n            \\    @setEvalBranchQuota(20_000);\n            \\    // The union and the tag table are emitted from one arm list;";

let emitterSource = fs.readFileSync(emitterPath, "utf8");
if (!emitterSource.includes(patchedMarker)) {
  if (!emitterSource.includes(marker)) {
    throw new Error("Native SDK corewire emitter changed; refusing to apply an unverified patch");
  }
  emitterSource = emitterSource.replace(marker, patchedMarker);
  fs.writeFileSync(emitterPath, emitterSource);
  console.log("Patched Native SDK 0.8.3 corewire comptime quota to 20,000 branches");
} else {
  console.log("Native SDK corewire comptime quota patch already applied");
}

// Spotify Desktop owns a permanently dark application chrome. Native SDK 0.8.3
// otherwise follows the host OS appearance, which makes a Spotify clone flip to
// a light theme on light-mode Macs and on CI runners. Preserve contrast and
// reduced-motion from the host, but force only the color-scheme axis to dark.
const defaultAppearance = "        system_appearance: platform.Appearance = .{},";
const darkDefaultAppearance = "        system_appearance: platform.Appearance = .{ .color_scheme = .dark },";
const appearanceAssignment = "                    self.system_appearance = appearance;";
const darkAppearanceAssignment = "                    self.system_appearance = appearance;\n                    self.system_appearance.color_scheme = .dark;";

let uiSource = fs.readFileSync(uiAppPath, "utf8");
let uiChanged = false;
if (!uiSource.includes(darkDefaultAppearance)) {
  if (!uiSource.includes(defaultAppearance)) {
    throw new Error("Native SDK UiApp default appearance changed; refusing to apply an unverified dark-theme patch");
  }
  uiSource = uiSource.replace(defaultAppearance, darkDefaultAppearance);
  uiChanged = true;
}
if (!uiSource.includes(darkAppearanceAssignment)) {
  if (!uiSource.includes(appearanceAssignment)) {
    throw new Error("Native SDK UiApp appearance handler changed; refusing to apply an unverified dark-theme patch");
  }
  uiSource = uiSource.replace(appearanceAssignment, darkAppearanceAssignment);
  uiChanged = true;
}
if (uiChanged) {
  fs.writeFileSync(uiAppPath, uiSource);
  console.log("Patched Native SDK 0.8.3 to keep Spotify surfaces dark while preserving accessibility axes");
} else {
  console.log("Native SDK Spotify dark-theme patch already applied");
}
