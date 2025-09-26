# Nova Language & Runtime

Nova is a dynamic scripting language for automation, scripting, and rapid prototyping. It features expressive syntax, extensible keywords, custom operators, prefix functions, built-in maps, and integration with Node.js and system tools.

---

## Table of Contents

- [Keywords](#keywords)
- [Operators](#operators)
- [Prefix Functions](#prefix-functions)
- [Built-in Maps & Modules](#built-in-maps--modules)
- [Built-in Functions](#built-in-functions)
- [Examples](#examples)
- [Special Syntax](#special-syntax)
- [Extending Nova](#extending-nova)
- [Keyword Syntax Reference](#keyword-syntax-reference)

---

## Keywords

Nova supports a rich set of keywords for control flow, data structures, I/O, and more.  
Below is a syntax help and description for each keyword.

### Keyword Syntax Reference

| Keyword         | Syntax Example | Description |
|-----------------|---------------|-------------|
| `var`           | `var x = 10;` | Declare a new variable. Error if already exists. |
| `let`           | `let y = 5;` | Declare or update a variable. |
| `const`         | `const PI = 3.14;` | Declare a constant (read-only). |
| `array`         | `array nums { 1, 2, 3 }` | Declare an array. |
| `enum`          | `enum Colors { Red, Green, Blue }` | Declare an enum. |
| `map`           | `map person { name = "Alice"; age = 30 }` | Declare a map/object. |
| `struct`        | `struct Point { x = 0; y = 0 }` | Declare a struct type. |
| `type`          | `type User { name = string; age = int }` | Declare a type. |
| `func`          | `func add(a, b) => { give a + b; };` | Define a function. |
| `function`      | `function foo(x) { ... }` | Define a function. |
| `ifunc`         | `ifunc double(x) { ... }` | Define an inline function. |
| `defunc`        | `defunc mydef { ... } { ... } ;` | Define a function with custom blocks. |
| `lambda`        | `lambda (x) => { give x * x; };` | Define a lambda function. |
| `block`         | `block myBlock { ... } ;` | Define a code block. |
| `snippet`       | `snippet greet { print("Hi"); } ;` | Define a snippet. |
| `template`      | `template t1(name:string) { print(name); } ;` | Define a template with typed params. |
| `keyfunc`       | `keyfunc myKeyFunc(params) { ... } { ... } { ... }` | Define a key function. |
| `implements`    | `implements MyInterface { ... } ;` | Implement an interface. |
| `interface`     | `interface MyInterface { foo(); bar(); } ;` | Define an interface. |
| `print`         | `print("Hello");` | Print to console. |
| `println`       | `println("Hello");` | Print inline (no newline). |
| `log`           | `log("Debug");` | Log to console. |
| `logln`         | `logln("Debug");` | Log inline. |
| `logO`          | `logO;` | Log last result output. |
| `banner`        | `banner("Title");` | Print ASCII banner. |
| `windowUI`      | `windowUI({ ... });` | Show Electron window UI. |
| `UI`            | `UI({ ... }) as json;` | Render console UI from JSON/Keol. |
| `input`         | `input("Prompt") => name;` | Prompt for input. |
| `getpress`      | `getpress("Press a key") => key;` | Get keypress. |
| `beep`          | `beep;` | Beep sound. |
| `term`          | `term("ls") bash;` | Run shell command. |
| `execFile`      | `execFile("file.nova");` | Execute file. |
| `createFile`    | `createFile("file.txt"), ("Hello");` | Create file. |
| `deleteFile`    | `deleteFile("file.txt");` | Delete file. |
| `listFiles`     | `listFiles(".");` | List files in directory. |
| `readFile`      | `readFile myText = ("file.txt");` | Read file into variable. |
| `delete`        | `delete x;` | Delete variable. |
| `addto`         | `addto arr (val);` | Add to array or map. |
| `foreach`       | `foreach(map, key) { ... } ;` | Iterate keys of map. |
| `repeat`        | `repeat(5) { ... } ;` | Repeat block N times. |
| `while`         | `while(cond) { ... } ;` | While loop. |
| `until`         | `until(cond) { ... } ;` | Loop until condition true. |
| `for`           | `for(init; cond; inc) { ... } ;` | Classic for loop. |
| `loop`          | `loop i in [1,2,3] => { ... } ;` | Loop over array. |
| `break`         | `break;` | Break loop. |
| `continue`      | `continue;` | Continue loop. |
| `return`/`give` | `return x;` | Return value from function. |
| `try`           | `try { ... } catch("err") { ... } finally { ... } ;` | Try/catch/finally. |
| `throw`         | `throw "Error";` | Throw error. |
| `Terminate`     | `Terminate;` | Exit program. |
| `exit`          | `exit(0);` | Exit with code. |
| `expect`        | `expect 5 from (2+3);` | Assert value. |
| `expt`          | `expt 5 from { ... };` | Assert block output. |
| `match`         | `match x do { 1) ... ; 2) ... ; _Last) ... ; }` | Match/case block. |
| `switch`        | `switch(x) { case 1 { ... } ; default { ... } ; } ;` | Switch/case. |
| `if`            | `if(cond) { ... } else { ... } ;` | If/else. |
| `unless`        | `unless(cond) { ... } ;` | If not. |
| `do`            | `do { ... } if (cond);` | Do block if condition. |
| `when`          | `when cond do { ... } ;` | When condition true. |
| `with`          | `with(map) { ... } ;` | Run block with map context. |
| `session`       | `session("name") { ... } ;` | Define session. |
| `enter`         | `enter session sets;` | Interactive session entry. |
| `backup`        | `backup val name = expr;` | Backup variable. |
| `retrieve`      | `backup retrieve name;` | Restore backup. |
| `namespace`     | `namespace macro ("code");` | Define macro. |
| `export`        | `export { name = { ... } ; } ;` | Export block to file. |
| `error`         | `error("msg");` | Throw error. |
| `warn`          | `warn("msg");` | Warn message. |
| `info`          | `info("msg");` | Info message. |
| `assert`        | `assert(cond);` | Assert condition. |
| `resu`          | `resu name(params) => { ... }, { ... } ;` | Define result block. |
| `type`          | `type T { ... } ;` | Define type. |
| `classify`      | `classify(map, class);` | Classify map as class. |
| `implements`    | `implements Interface { ... } ;` | Implement interface. |
| `loadKeol`      | `loadKeol("file.keol") => var;` | Load Keol file. |
| `keol`          | `keol("file.keol") => var;` | Parse Keol file. |
| `import`        | `import("file.nova");` | Import file. |
| `plugin`        | `plugin("plugin.json");` | Load plugin. |
| `server`        | `server(3000) { get("/") { ... } ; } ;` | Start HTTP server. |
| `invoke`        | `invoke("env");` | Import environment variables. |
| `sleep`         | `sleep(1000);` | Sleep for ms. |
| `wait`          | `wait(1000);` | Wait for ms. |
| `py`            | `py("print(1)");` | Run Python code. |
| `infer`         | `infer("model") => var : { prompt } ;` | Run AI model. |
| `op`            | `op multiply => (a, b) { give a * b; }` | Define custom operator. |
| `prefix`        | `prefix not => (x) { give !x; }` | Define prefix function. |
| `date`          | `date => var;` | Store current date. |
| `jsonParse`     | `jsonParse(var);` | Parse JSON string. |
| `jsonStringify` | `jsonStringify(var);` | Stringify object to JSON. |
| `uuid`          | `uuid => var;` | Generate UUID. |
| `b$`            | `b$ { ... } ;` | Run block. |
| `k$`            | `k$ { ... } ;` | Run Keol block. |
| `tk$`           | `tk$ { ... } ;` | Run trimmed Keol block. |
| `js$`           | `js$ { ... } ;` | Run JS block. |
| `tjs$`          | `tjs$ { ... } ;` | Run trimmed JS block. |
| `p$`            | `p$ ( ... ) ;` | Run paren block. |
| `l$`            | `l$ |==> ... [] ;` | Run lined block. |
| `e$`            | `e$ expr ;` | Evaluate math expr. |
| `stream`        | `stream(",") name;` | Define stream. |
| `istream`       | `istream(",") name => "a,b,c";` | Define input stream. |
| `fnstream`      | `fnstream(",") name => "a,b,c";` | Define function stream. |
| `pattern`       | `pattern(x, y) name { ... } ;` | Define pattern. |
| `math`          | `math(expr) => var;` | Evaluate math expr. |
| `random`        | `random(1,100) => var;` | Generate random int. |
| `chars`         | `chars("abc") => var;` | Split string to chars. |
| `reverse`       | `reverse(arr) => var;` | Reverse array. |
| `ascii`         | `ascii("abc") => var;` | Get ASCII codes. |
| `sum`           | `sum(arr) => var;` | Sum array. |
| `keys`          | `keys(obj) => var;` | Get object keys. |
| `range`         | `range(1,10) => var;` | Range array. |
| `foreach`       | `foreach(map, key) { ... } ;` | Iterate map keys. |
| `engage`        | `engage gear1 >> gear2;` | Run gears in loop. |
| `backup`        | `backup val name = expr;` | Backup variable. |
| `gear`          | `gear(1000) name { ... } ;` | Define gear. |
| `invoke`        | `invoke("env");` | Import env vars. |
| `sleep`         | `sleep(1000);` | Sleep ms. |
| `envkeys`       | `envkeys;` | Store env keys. |
| `cwd`           | `cwd;` | Store current dir. |
| `py`            | `py("print(1)");` | Run Python code. |
| `infer`         | `infer("model") => var : { prompt } ;` | Run AI model. |
| `server`        | `server(3000) { get("/hello") { ... } ; } ;` | Start HTTP server. |
| `require`       | `require name as type;` | Require variable/function/module. |
| `continue`      | `continue` | redo the code |

---

## Operators

- Arithmetic: `+`, `-`, `*`, `/`, `%`, `**`, `pow`
- Comparison: `==`, `!=`, `===`, `!==`, `<`, `>`, `<=`, `>=`
- Assignment: `=`
- Logical: `&&`, `||`, `not`, `or`
- Range: `..`, `...` (inclusive/exclusive)
- Increment/Decrement: `++`, `--`
- Custom: Define with `op` keyword (e.g. `op <> (a, b) { ... }`)
- Dot access: `.`
- Bracket access: `[index]`
- Ternary: `if ... else ...`
- Other: `in`, `instanceof`

---

## Prefix Functions

Define custom prefix operators using the `prefix` keyword:

```nova
prefix not => (x) { give !x; };
not true; // false
```

Built-in prefixes include:  
`not`, `typeof`, `isnull`, `defined`, `keys`, `run`, `typeis`, `default`, `range`, `new`, `rp`

---

## Built-in Maps & Modules

Nova provides built-in maps for math, string, utils, time, json, fs, code, rand, regex, path, log, and more.

**Math:**  
`add`, `sub`, `mul`, `div`, `mod`, `pow`, `floor`, `ceil`, `round`, `rand`, `pi`, `log10`

**String:**  
`upper`, `lower`, `reverse`, `length`, `split`, `trim`, `substring`, `slice`, `charAt`, `charCodeAt`, `indexOf`, `lastIndexOf`, `includes`, `startsWith`, `endsWith`, `replace`, `repeat`, `padStart`, `padEnd`, `ltrim`, `rtrim`

**Utils:**  
`closestMatch`, `rngstr`, `ArrayMatch`, `remove`, `join`, `isDigit`, `isLetter`, `isAlphaNumeric`, `stripChars`, `count`

**Time:**  
`now`, `iso`, `ms`

**JSON:**  
`parse`, `stringify`

**FS:**  
`read`, `write`, `exists`, `delete`, `mkdir`, `rmdir`, `stat`, `readdir`, `list`

**Code:**  
`exec`, `eval`

**Rand:**  
`int`, `bool`

**Regex:**  
`test`, `exec`

**Path:**  
`join`, `basename`, `extname`

**Log:**  
`text`, `banner`, `error`, `warn`, `info`, `debug`, `table`

---

## Built-in Functions

Nova supports built-in variable methods for types:

- `string`: `upper`, `lower`, `reverse`, `length`, `split`, `match`, `trim`, `includes`, `startsWith`, `endsWith`, `repeat`, `replace`, `charAt`, `codePointAt`, `slice`
- `number`: `toFixed`, `toString`, `abs`, `floor`, `ceil`, `round`, `sqrt`, `pow`, `sin`, `cos`, `tan`, `log`
- `object`: `keys`, `length`, `values`, `entries`, `has`, `get`, `set`, `delete`, `clone`
- `array`: `length`, `push`, `pop`, `shift`, `unshift`, `join`, `reverse`, `sort`, `includes`, `indexOf`, `map`, `filter`
- `files`: `read`, `write`, `exists`, `append`, `delete`, `mkdir`, `rmdir`, `stat`, `readdir`
- `boolean`: `not`, `toString`, `toggle`
- `global`: `toString`, `parseInt`, `parseFloat`, `typeOf`, `defined`, `isnull`

---

## Examples

### dynamics

- **Dynamic function:** a dynamic nova function with full control over its syntax by implementing it in node js 
```nova
DYNAMIC FUNCTION NAME=myDynamic BODY: {
`let name = next(); let body = parseParen(); expect(';'); 
this.enums[name] = new Set(this.parseArray(body));`}
myDynamic myEnum (1,2,3,4,5);
log(myEnum); // Set(5) { 1, 2, 3, 4, 5 }
```
keep in mind that you can put the bodies (e,g.. let name = next(); let body = parseParen(); expect(';'); this.enums[name] = new Set(this.parseArray(body));) in a file in $HOME/nova_plugins/ with the filename of the desired function name, make sure it has no extension
- **Keyfuncs & defuncs:** a nova implemented function that takes a body/body-and-parentheses as args, dont worry it'll make sense in a second.

```nova
defunc infloop { act } {
  while(true) {
    act //the name that indicates the args in the block
  }
}

keyfunc since(cond) { act } {
  if (cond) {
    infloop {
      act
    }
  }
}
// eg usage of these

for (i = 10;i < 1000; i++;) {
    i++;
  since(i === 78) {
    print('i is now 78.. and this will never stop printing...');
  }
}
```

## custom comments
- nova allows for custom comments

```nova
comment line using "🍊" {
  type = [(line) => {
    print('Vitamin bomd dropped: ' + line);
  }, lineComment];
  
  replace = [true, (line) => {
    give line + ';';
  }];
};
```
comment types include 'lineComment' with line, 'blockComment' with block,
if you dont want to add functionality to them, then just dont make the 'type' an array, just the name
blockComments require a start and end, while line ones just need a start

### Variables & Data

```nova
var x = 10;
let y = 1, 2, 3;
const PI = 3.1415;
array nums { 1, 2, 3, 4 }
enum Colors { Red, Green, Blue }
map person { name = "Alice"; age = 30 }
```

### Functions

```nova
func add(a, b) => { give a + b; };
log(add(2, 3)); // 5

lambda (x) => { give x * x; };
log(llmbd);
```

### Custom Operator

```nova
op mpo => (a, b) { give a * b + 1; }
2 mpo 3; // 7
```

### Prefix Function

```nova
prefix not => (x) { give !x; }
not true; // false
```

### Control Flow

```nova
if (x > 5) { print("Big"); } else { print("Small"); }
while (x < 10) { x = x + 1; }
repeat (5) { print("Hello"); }
```

### File I/O

```nova
readFile myText = ("file.txt");
print(myText);
createFile ("new.txt"), ("Hello World");
deleteFile ("old.txt");
listFiles ("./");
```

### System/Termux

```nova
notify("Title", "Message");
toast("Hello!");
vibrate(500);
clipboard("Copied text");
open("https://example.com");
```

### Math & Utils

```nova
math(2 + 3 * 4) => result;
print(result); // 14

random(1, 100) => lucky;
print(lucky);
```

### Streams & Patterns

```nova
stream(",") myStream;
myStream('1,2,3') >> a >> b >> c; //a = 1, b = 2, c = 3
istream(",") myInput => ("a,b,c");
myInput >> q >> s >> n; //n = 'c', s = 'b', q = 'a'
pattern(x, y) myPattern { print(x + y); };
myPattern(1,2); // 3
```

### Server

```nova
server(3000) {
  get("/hello") { print("Hello World"); };
  post("/data") { print(req); };
};
```

---

## Special Syntax

- **Range:** `1..10` (inclusive), `1...10` (exclusive)
- **Spread:** `...arr` in arrays/maps
- **String Interpolation:** `"Hello \&[^name]"`, `` `Hello &{name}` ``
- **Comments:** `//`, `/* ... */`, `/!/` (kill line), `/?/` (run & remove)
- **Macros:** `namespace myMacro ("code")`
- **Escapes:** `__n` (newline), `__t` (tab), etc.

---
## Currency Units

Nova automatically converts values expressed with specific currency units into their numerical equivalents (like 1ms becomes 0.001). This allows for natural arithmetic operations with time values.

---

## Extending Nova

- **Dynamic Keywords:** Place scripts in `~/nova_plugins` to auto-load as new keywords.
- **Custom Operators:** Use `op` keyword.
- **Custom Prefixes:** Use `prefix` keyword.
- **Built-in Maps:** Extend `this.maps` in nova.js.
- **Variable Methods:** Extend `this.varMethods`.
- **Keep in mind:** some in code methods to define methods and currencies are going to be added.

---

## Error Handling

- Use `try { ... } catch("err") { ... } finally { ... }`
- Use `throw "Error message";`
- Use `assert(condition);`

---

## Advanced Features

- **REPL:** Interactive shell with `runREPLNovaCode`.
- **Keol Integration:** Parse Keol files with `keol` and `loadKeol`.
- **Sandbox:** Run JS code in a VM with `sandbox`.
- **Plugin System:** Load external plugins via `plugin("path")`.
- **Using a nova fn in node js:** To intergrate a nova function in node js, require nvlang as nvlang, then: `nvlang.nova.fn([argsArray],'nova body')` to make a new one or to do it using an object: `nvlang.nova.extract(body)` just make sure that it has an args and body methods, and to get an existing nova function use `nvlang.nova.attract('fnName')`

---

## License

MIT

---

## Author

Nova Language by PURCWIX

---

**For more details, see the code in `nova.js`.**
