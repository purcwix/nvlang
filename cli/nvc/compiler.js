function compile(ast) {
    const lines = [];

    const vars = {};
    const strings = [];
    let varCount = 0;
    let strCount = 0;

    // === DATA ===
    lines.push(".data");

    for (const node of ast.body) {
        if (node.type === "VariableDeclaration") {
            const label = `var${varCount++}`;
            vars[node.name] = label;
            lines.push(`${label}: .word ${node.value.value}`);
        }

        if (node.type === "PrintStatement" && node.argument.type === "Literal" && typeof node.argument.value === "string") {
            const label = `str${strCount++}`;
            strings.push({ label, value: node.argument.value });
            lines.push(`${label}: .asciz "${node.argument.value.replace(/"/g, '\\"')}"`);
        }
    }

    // === BSS buffer ===
    lines.push(".bss");
    lines.push(".align 3");
    lines.push("buf: .skip 32");
    lines.push("buf_end:");

    // === TEXT section ===
    lines.push(".text");

    // print_number subroutine
    lines.push("print_number:");
    lines.push("    mov x2, #0");
    lines.push("    mov x3, #10");
    lines.push("    ldr x4, =buf_end");
    lines.push("    mov w5, w0");

    lines.push(".print_loop:");
    lines.push("    udiv x6, x5, x3");
    lines.push("    msub x7, x6, x3, x5");
    lines.push("    add x7, x7, #'0'");
    lines.push("    sub x4, x4, #1");
    lines.push("    strb w7, [x4]");
    lines.push("    mov x5, x6");
    lines.push("    add x2, x2, #1");
    lines.push("    cmp x5, #0");
    lines.push("    b.ne .print_loop");

    lines.push("    mov x0, #1");
    lines.push("    mov x1, x4");
    lines.push("    mov x8, #64");
    lines.push("    svc 0");
    lines.push("    ret");

    lines.push(".global _start");
    lines.push("_start:");

    for (const node of ast.body) {
        if (node.type === "PrintStatement") {
            const arg = node.argument;

            if (arg.type === "Literal") {
                if (typeof arg.value === "number") {
                    // Load the number into w0 and call print_number
                    lines.push(`    mov w0, #${arg.value}`);
                    lines.push(`    bl print_number`);
                } else if (typeof arg.value === "string") {
                    const label = strings.find(s => s.value === arg.value).label;
                    lines.push(`    mov x0, #1`);
                    lines.push(`    ldr x1, =${label}`);
                    lines.push(`    mov x2, #${arg.value.length}`);
                    lines.push(`    mov x8, #64`);
                    lines.push(`    svc 0`);
                }
            }

            else if (arg.type === "Identifier") {
                const varName = vars[arg.name];
                if (!varName) throw new Error(`Undefined variable: ${arg.name}`);
                lines.push(`    ldr x1, =${varName}`);
                lines.push(`    ldr w0, [x1]`);
                lines.push(`    bl print_number`);
            }
        }
    }

    // Exit syscall
    lines.push("    mov x8, #93");
    lines.push("    mov x0, #0");
    lines.push("    svc 0");

    return lines.join("\n");
}

module.exports = { compile };
