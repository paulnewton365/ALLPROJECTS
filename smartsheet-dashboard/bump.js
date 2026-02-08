#!/usr/bin/env node
/**
 * Version bump script
 * Usage: node bump.js [major|minor|patch]
 * Default: patch
 */

const fs = require("fs");
const path = require("path");

const versionFile = path.join(__dirname, "VERSION");
const current = fs.readFileSync(versionFile, "utf-8").trim();
const [major, minor, patch] = current.split(".").map(Number);

const type = process.argv[2] || "patch";

let next;
switch (type) {
  case "major":
    next = `${major + 1}.0.0`;
    break;
  case "minor":
    next = `${major}.${minor + 1}.0`;
    break;
  case "patch":
  default:
    next = `${major}.${minor}.${patch + 1}`;
    break;
}

fs.writeFileSync(versionFile, next + "\n");
console.log(`${current} → ${next}`);
