#!/usr/bin/env node

const fs = require("fs");
const { preprocess } = require("./nvcc-pre");
const { tokenize } = require("./tokenizer");
const { parse } = require("./parser");
const { compile } = require("./compiler");

const path = process.argv[2];
if (!path) {
    console.error("Usage: nvc <file.nvcc>");
    process.exit(1);
}

let rawCode = fs.readFileSync(path, "utf8");

// Step 1: Preprocess (runs /?/ blocks)
rawCode = preprocess(rawCode);

// Step 2: Tokenize
const tokens = tokenize(rawCode);

// Step 3: Parse
const ast = parse(tokens);

// Step 4: Compile to NASM ASM
const asm = compile(ast);

// Step 5: Write .asm file
const asmPath = path.replace(/\.nvcc$/, ".asm");
fs.writeFileSync(asmPath, asm);

console.log(`✅ Compiled to ${asmPath}`);
