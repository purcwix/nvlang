#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(process.env.HOME, "nova_project");

function walk(dir, callback) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, callback);
    } else {
      callback(fullPath);
    }
  });
}

function findRequires(filePath) {
  if (!filePath.endsWith(".js") && !filePath.endsWith(".nova") && !filePath.endsWith(".ny") && !filePath.endsWith(".nvp")) return;

  const content = fs.readFileSync(filePath, "utf8");
  const regex = /require\s*\(\s*['"`](.+?)['"`]\s*\)/g;
  let match;
  let found = false;

  while ((match = regex.exec(content))) {
    if (!found) {
      console.log(`📄 ${filePath}`);
      found = true;
    }
    console.log(`   → require('${match[1]}')`);
  }
}

console.log("🔎 Scanning for require() in nova_project...\n");
walk(projectRoot, findRequires);
