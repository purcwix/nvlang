const vm = require("vm");

function preprocess(code) {
    // Run all /?/ ... /!/ blocks one by one
    let match;
    const regex = /\/\?\/([\s\S]*?)\/!\/?/g;

    while ((match = regex.exec(code)) !== null) {
        const rawScript = match[1];
        let replacement = "";

        const sandbox = {
            inject: (snippet) => {
                replacement = snippet;
            },
            print: (...args) => console.log("[NVC:Pre]", ...args),
        };

        try {
            vm.createContext(sandbox);
            const script = new vm.Script(rawScript);
            script.runInContext(sandbox);
        } catch (err) {
            console.error("🔥 Error in /?/ block:", err);
            process.exit(1);
        }

        // Replace the matched /?/ ... /!/ block with the result
        code = code.replace(match[0], `${replacement}\n`);
        regex.lastIndex = 0; // Reset in case code changed
    }

    return code;
}

module.exports = { preprocess };
