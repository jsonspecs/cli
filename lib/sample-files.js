"use strict";

const fs = require("node:fs");
const path = require("node:path");

function listSampleFiles(samplesDir) {
  if (!fs.existsSync(samplesDir)) return [];
  const files = [];
  walk(samplesDir, samplesDir, files);
  return files.sort((left, right) => compareUtf16(left.file, right.file));
}

function walk(root, dir, files) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => compareUtf16(left.name, right.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, full, files);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
    files.push({
      file: path.relative(root, full).split(path.sep).join("/"),
      full,
    });
  }
}

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

module.exports = { listSampleFiles };
