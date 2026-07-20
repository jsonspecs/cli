#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { createReleasePackage } = require("./release-package");

const root = path.resolve(__dirname, "..");
const outputFlag = process.argv.indexOf("--output");
const outputDir = outputFlag >= 0 && process.argv[outputFlag + 1]
  ? path.resolve(process.argv[outputFlag + 1])
  : path.join(root, ".artifacts");
const rulesRoot = path.resolve(process.env.JSONSPECS_SOURCE || path.join(root, "..", "rules"));
const result = createReleasePackage({ root, rulesRoot, outputDir });

console.log(`[jsonspecs-cli] release package: ${result.tarball}`);
console.log(`[jsonspecs-cli] @jsonspecs/rules dependency: ^${result.rulesVersion}`);
