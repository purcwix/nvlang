#!/usr/bin/env node

const fs = require("fs");

// --- Tokenizer ---
function tokenizeNovaCode(code) {
  const tokens = [];
  const words = code.match(/\w+|".*?"|'.*?'|[^\s]/g) || [];

  for (const word of words) {
    if (/^\d+$/.test(word)) {
      tokens.push({ type: 'number', value: word });
    } else if (/^['"]/.test(word)) {
      tokens.push({ type: 'string', value: word });
    } else if (["var", "if", "else", "print"].includes(word)) {
      tokens.push({ type: "keyword", value: word });
    } else if (["=", "+", "-", "*", "/", "(", ")", "{", "}", ";", ">"].includes(word)) {
      tokens.push({ type: "operator", value: word });
    } else {
      tokens.push({ type: "identifier", value: word });
    }
  }

  return tokens;
}

// --- Optimizer: Constant Folding ---
function constantFold(tokens) {
  const output = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (
      t.type === "number" &&
      tokens[i + 1]?.type === "operator" &&
      ["+", "-", "*", "/"].includes(tokens[i + 1].value) &&
      tokens[i + 2]?.type === "number"
    ) {
      const a = Number(tokens[i].value);
      const op = tokens[i + 1].value;
      const b = Number(tokens[i + 2].value);
      const res = eval(`${a} ${op} ${b}`);
      output.push({ type: "number", value: String(res) });
      i += 2;
    } else {
      output.push(t);
    }
  }
  return output;
}

// --- Generator ---
function generateCode(tokens) {
  return tokens.map(t => t.value).join(" ");
}

// --- CLI Entry Point ---
const [, , inputFile, outputFile] = process.argv;
if (!inputFile || !outputFile) {
  console.error("Usage: nova-opt.js input.nv output.nv");
  process.exit(1);
}

const inputCode = fs.readFileSync(inputFile, "utf8");
let tokens = tokenizeNovaCode(inputCode);
tokens = constantFold(tokens);
const outputCode = generateCode(tokens);
fs.writeFileSync(outputFile, outputCode);
console.log(`✅ Optimized '${inputFile}' → '${outputFile}'`);
