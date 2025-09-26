function parse(tokens) {
    const ast = { type: "Program", body: [] };
    let i = 0;

    function eat(type, value = null) {
        const token = tokens[i];
        if (!token || token.type !== type || (value && token.value !== value)) {
            throw new Error(`Expected ${type} ${value || ''}, got ${token?.type} ${token?.value}`);
        }
        return tokens[i++];
    }

    function parseExpression() {
        const token = tokens[i];

        if (token.type === "number") {
            i++;
            return { type: "Literal", value: token.value };
        }

        if (token.type === "string") {
    i++;
    return { type: "Literal", value: token.value };
}

        if (token.type === "identifier") {
            i++;
            return { type: "Identifier", name: token.value };
        }

        throw new Error("Unknown expression: " + token.value);
    }

    function parseStatement() {
        const token = tokens[i];

        if (token.type === "keyword" && token.value === "var") {
            i++;
            const id = eat("identifier").value;
            eat("operator", "=");
            const value = parseExpression();
            eat("punctuation", ";");

            return {
                type: "VariableDeclaration",
                name: id,
                value
            };
        }

        if (token.type === "keyword" && token.value === "print") {
            i++;
            eat("punctuation", "(");
            const arg = parseExpression();
            eat("punctuation", ")");
            eat("punctuation", ";");

            return {
                type: "PrintStatement",
                argument: arg
            };
        }

        throw new Error("Unknown statement: " + token.value);
    }

    while (i < tokens.length) {
        ast.body.push(parseStatement());
    }

    return ast;
}

module.exports = { parse };
