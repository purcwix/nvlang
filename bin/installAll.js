#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// ✅ Node.js built-ins list (roughly complete)
const builtIns = new Set([
  "fs", "path", "os", "http", "https", "stream", "url", "crypto", "child_process", "util", "vm", "events", "assert", "readline", "zlib", "tty", "console", "dns", "querystring", "net", "timers", "buffer", "module", "process", "repl", "string_decoder", "perf_hooks"
]);

const projectRoot = path.resolve(process.env.HOME, "nova_project");
const packages = new Set();

function walk(dir, callback) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, callback);
    else callback(fullPath);
  });
}

function scanFileForRequires(filePath) {
  if (!filePath.match(/\.(js|nova|nvp|ny)$/)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const regex = /require\s*\(\s*['"`](.+?)['"`]\s*\)/g;
  let match;

  while ((match = regex.exec(content))) {
    const name = match[1];
    if (
      !name.startsWith(".") &&
      !builtIns.has(name)
    ) {
      packages.add(name);
    }
  }
}

// 🔍 Start scan
walk(projectRoot, scanFileForRequires);

// 📦 Install all detected packages
if (packages.size > 0) {
  console.log("📦 Installing detected npm packages:");
  console.log([...packages].map(p => `  - ${p}`).join("\n"));
  const { execSync } = require("child_process");
  execSync(`npm install ${[...packages].join(" ")}`, { stdio: "inherit" });
} else {
  console.log("✅ No external npm packages found.");
}
