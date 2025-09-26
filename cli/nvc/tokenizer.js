function tokenize(code) {
    const tokens = [];
    const chars = [...code];
    let i = 0;

    const isWhitespace = c => /\s/.test(c);
    const isLetter = c => /[a-zA-Z_]/.test(c);
    const isDigit = c => /[0-9]/.test(c);

    while (i < chars.length) {
        const c = chars[i];

        if (isWhitespace(c)) {
            i++; continue;
        }

        // Identifier / Keyword
        if (isLetter(c)) {
            let id = '';
            while (isLetter(chars[i]) || isDigit(chars[i])) {
                id += chars[i++];
            }
            if (id === "var" || id === "print") {
                tokens.push({ type: "keyword", value: id });
            } else {
                tokens.push({ type: "identifier", value: id });
            }
            continue;
        }

        // Number
        if (isDigit(c)) {
            let num = '';
            while (isDigit(chars[i])) {
                num += chars[i++];
            }
            tokens.push({ type: "number", value: parseInt(num) });
            continue;
        }

        // String literal support
if (c === '"') {
    i++; // skip opening quote
    let str = '';
    while (i < chars.length && chars[i] !== '"') {
        if (chars[i] === '\\' && chars[i+1]) {
            // Handle escaped chars
            str += chars[i++] + chars[i++];
        } else {
            str += chars[i++];
        }
    }
    if (chars[i] !== '"') throw new Error("Unterminated string");
    i++; // skip closing quote
    tokens.push({ type: "string", value: str });
    continue;
}

        // Operators
        if ("=+-*/".includes(c)) {
            tokens.push({ type: "operator", value: c });
            i++; continue;
        }

        // Punctuation
        if ("();".includes(c)) {
            tokens.push({ type: "punctuation", value: c });
            i++; continue;
        }

        throw new Error("Unknown character: " + c);
    }

    return tokens;
}

module.exports = { tokenize };
