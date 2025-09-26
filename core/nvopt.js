function optimizeNovaCode(code) {
  // First, split into lines for smarter processing
  const lines = code.split('\n');
  const usedVars = new Set();

  // 1. Detect used variables
  for (const line of lines) {
    const matches = line.match(/\b([a-zA-Z_]\w*)\b/g);
    if (!matches) continue;
    for (const word of matches) {
      if (!['var', 'if', 'while', 'repeat', 'print'].includes(word)) {
        usedVars.add(word);
      }
    }
  }

  // 2. Filter and rewrite
  const optimizedLines = lines.filter(line => {
    if (/repeat\s*\([^)]*\)\s*\{\s*\}/.test(line)) return false;
    if (/(if|while)\s*\([^)]*\)\s*\{\s*\}/.test(line)) return false;

    // Remove var declarations that aren't used later
    const varMatch = line.match(/^\s*var\s+(\w+)\s*=\s*[^;]+;/);
    if (varMatch && !usedVars.has(varMatch[1])) return false;

    // Remove self-assignment
    if (/\b(\w+)\s*=\s*\1\s*;/.test(line)) return false;

    // Remove +0 or *1 optimizations
    if (/\b(\w+)\s*=\s*\1\s*\+\s*0\s*;/.test(line)) return false;
    if (/\b(\w+)\s*=\s*\1\s*\*\s*1\s*;/.test(line)) return false;

    return true;
  });

  return optimizedLines.join('\n');
}

module.exports = optimizeNovaCode;
