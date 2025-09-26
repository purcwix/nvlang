const path = require('path');
const fs = require('fs');
const ps = require('prompt-sync');
const os = require('os');
const prompt = ps();
const util = require('util');
const webfirm = require('../webfirm/webfirm.js');

const { KeolParser } = require('./keol');
const { execSync, spawn } = require('child_process');
const { isDate } = require('util/types');
const { isErrored } = require('stream');
const { clear } = require('console');
const { Interface } = require('readline');
const { disconnect } = require('process');

const tmp = os.tmpdir();



function defineFsum(obj, varName, linkedVars = [], initialValue = 0, total = 100) {
    if (obj[varName] !== undefined) throw new Error(`${varName} already exists`);

    // Internal storage for all variables
    const values = {};
    // Initialize the main variable
    values[varName] = initialValue;

    // Initialize linked variables equally if they don't exist
    const nLinked = linkedVars.length;
    linkedVars.forEach(v => values[v] = initialValue);

    // Helper to compute sum
    const sum = () => Object.values(values).reduce((a, b) => a + b, 0);

    // Function to adjust other variables proportionally
    function adjustOthers(changedVar) {
        const others = Object.keys(values).filter(k => k !== changedVar);
        const currentSum = sum();
        const excess = currentSum - total;

        if (others.length === 0) return; // nothing to adjust

        // Distribute excess proportionally
        let adjustable = others.filter(k => values[k] !== 0);
        if (adjustable.length === 0) adjustable = others; // fallback

        let totalAdjustable = adjustable.reduce((acc, k) => acc + values[k], 0);
        if (totalAdjustable === 0) totalAdjustable = adjustable.length; // avoid divide by 0

        adjustable.forEach(k => {
            const proportion = values[k] / totalAdjustable;
            values[k] -= excess * proportion;
        });
    }

    // Define property for the main variable
    Object.defineProperty(obj, varName, {
        get() { return values[varName]; },
        set(val) {
            values[varName] = val;
            adjustOthers(varName);
        },
        enumerable: true
    });

    // Define properties for linked variables
    linkedVars.forEach(v => {
        if (obj[v] !== undefined) throw new Error(`${v} already exists`);
        Object.defineProperty(obj, v, {
            get() { return values[v]; },
            set(val) {
                values[v] = val;
                adjustOthers(v);
            },
            enumerable: true
        });
    });

    // Return a helper to inspect internal values
    return () => ({ ...values });
}

function defineProportional(obj, constantName, k, varName, linkedVars, initialValue) {
    if (obj[constantName] !== undefined) throw new Error(`${constantName} already exists`);

    // Define the constant (read-only)
    Object.defineProperty(obj, constantName, {
        value: k,
        writable: false,
        enumerable: true
    });

    // Internal storage for variables
    const values = {};

    // Function to update linked variables
    function updateLinked(sourceVar) {
        linkedVars.forEach(v => {
            if (v !== sourceVar) {
                values[v] = values[varName] * k;
            }
        });
    }

    // Define the main variable
    Object.defineProperty(obj, varName, {
        get() {
            return values[varName];
        },
        set(val) {
            if (typeof val !== 'number') throw new TypeError(`${varName} must be a number`);
            values[varName] = val;
            updateLinked(varName);
        },
        enumerable: true
    });

    // Define all linked variables
    linkedVars.forEach(v => {
        Object.defineProperty(obj, v, {
            get() {
                return values[v];
            },
            set(val) {
                if (typeof val !== 'number') throw new TypeError(`${v} must be a number`);
                values[v] = val;
                // update main variable
                values[varName] = val / k;
                updateLinked(v);
            },
            enumerable: true
        });
    });

    // Initialize
    values[varName] = initialValue;
    updateLinked(varName);
}

function createFnum(obj, name, min, max, initial = min) {
  let _value = initial;

  Object.defineProperty(obj, name, {
    get() {
      return _value;
    },
    set(val) {
      if (typeof val !== 'number') {
        throw new TypeError(`${name} must be a number`);
      }
      _value = Math.max(min, Math.min(max, val));
    },
    enumerable: true,
    configurable: true
  });
}


function createListed(obj, name, val, list) {
  let _value = val;
  let _list = list;

  Object.defineProperty(obj, name, {
    get() {
      return _value in _list ? _value : (() => { if (type !== 'any') {throw 'invalid value for listed variable.'}; return _value; })();
    },
    set(v) {
     if (!(v in _list) && type !== 'any') throw 'invalid value for listed variable: ' + v;
     _value = v;
    },
    enumerable: true,
  });
}


function createTyped(obj, name, val, type, typeofn) {
  let _value = val;

  Object.defineProperty(obj, name, {
    get() {
      return (typeofn(_value) === type) ? _value : (() => { throw 'invalid type for var ' + name + '.'})();
    },
    set(v) {
     if (!(typeofn(v) === type)) throw 'invalid value for typed variable: ' + v + ', type: ' + type;
     _value = v;
    },
    enumerable: true,
  });
}

// ----------------- createFint -----------------
function createFint(obj, name, min, max, initial = min) {
    let _value = Math.round(initial);

    Object.defineProperty(obj, name, {
        get() {
            return _value;
        },
        set(val) {
            if (typeof val !== 'number') throw new TypeError(`${name} must be a number`);
            _value = Math.round(Math.max(min, Math.min(max, val)));
        },
        enumerable: true,
        configurable: true
    });
}

// ----------------- defineFproportial -----------------
function defineFproportial(obj, constantName, k, varName, linkedVars, min, max, initialValue = min) {
    if (obj[constantName] !== undefined) throw new Error(`${constantName} already exists`);

    // Constant (read-only)
    Object.defineProperty(obj, constantName, {
        value: k,
        writable: false,
        enumerable: true
    });

    // Internal storage
    const values = {};

    // Clamp helper
    const clamp = (val) => Math.max(min, Math.min(max, val));

    // Function to update linked variables
    function updateLinked(sourceVar) {
        linkedVars.forEach(v => {
            if (v !== sourceVar) {
                values[v] = clamp(values[varName] * k);
            }
        });
    }

    // Main variable
    Object.defineProperty(obj, varName, {
        get() { return values[varName]; },
        set(val) {
            if (typeof val !== 'number') throw new TypeError(`${varName} must be a number`);
            values[varName] = clamp(val);
            updateLinked(varName);
        },
        enumerable: true,
        configurable: true
    });

    // Linked variables
    linkedVars.forEach(v => {
        Object.defineProperty(obj, v, {
            get() { return values[v]; },
            set(val) {
                if (typeof val !== 'number') throw new TypeError(`${v} must be a number`);
                values[v] = clamp(val);
                // update main variable
                values[varName] = clamp(val / k);
                updateLinked(v);
            },
            enumerable: true,
            configurable: true
        });
    });

    // Initialize
    values[varName] = clamp(initialValue);
    updateLinked(varName);
}

Symbol.prototype.toString = function () {
  return `Symbol(${this.description ?? ""})`;
};

Symbol.prototype[Symbol.toPrimitive] = function (hint) {
  if (hint === "string") {
    return this.toString();
  }
  return this;
};

Array.prototype.appendTo = function(index, items) {
  if (!Array.isArray(items)) {
    throw new TypeError("Second argument must be an array");
  }
  this.splice(index, 0, ...items);
  return this; // optional, allows chaining
};

Array.prototype.shuffle = function() {
  for (let i = this.length - 1; i > 0; i--) {
    // Pick a random index from 0 to i
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements i and j
    [this[i], this[j]] = [this[j], this[i]];
  }
  return this; // return the shuffled array for chaining
};

function getStackFrames(skip = 0, length = Infinity) {
  const err = {};
  // Capture stack, skip this function itself
  Error.captureStackTrace(err, getStackFrames);
  const stack = err.stack || '';

  return stack
    .split('\n')
    .slice(1 + skip, 1 + skip + length) // skip + limit
    .map(line => {
      // Example line: "at bar (/path/to/file.js:6:15)"
      const match = line.match(/\s*at\s+(.*?)\s+\((.*):(\d+):(\d+)\)/) ||
                    line.match(/\s*at\s+(.*):(\d+):(\d+)/);
      if (!match) return { raw: line };

      if (match.length === 5) {
        return {
          functionName: match[1],
          file: match[2],
          line: Number(match[3]),
          column: Number(match[4])
        };
      } else {
        return {
          functionName: '<anonymous>',
          file: match[1],
          line: Number(match[2]),
          column: Number(match[3])
        };
      }
    });
}

let electron = null;
try {
  electron = require('electron');
} catch (err) {
  // Electron not installed, safe to ignore
  electron = null;
}
const Pointers = () => require('../natives/pointers');
const Utills = () => require('../natives/utils');

const Big = require('big.js');

const getGlobal = () => Object.getOwnPropertyNames(globalThis)
  .concat(Object.getOwnPropertySymbols(globalThis))
  .reduce((acc, key) => {
    acc[key] = globalThis[key];
    return acc;
  }, {});
function pi(n) {
  Big.DP = n + 2; // extra digits for rounding
  const C = new Big(426880).times(Big(10005).sqrt());
  let M = new Big(1);
  let L = new Big(13591409);
  let X = new Big(1);
  let K = new Big(6);
  let S = new Big(L);

  for (let i = 1; i < Math.ceil(n / 14); i++) {
    M = M.times(K.pow(3).minus(16 * K)).div(i ** 3);
    L = L.plus(545140134);
    X = X.times(-262537412640768000);
    S = S.plus(M.times(L).div(X));
    K = K.plus(12);
  }

  const pi = C.div(S);
  return pi.toFixed(n);
}


function denative(obj, _ctx) {
  if (Array.isArray(obj)) {
    // Preserve arrays as arrays
    return obj;
  }

  if (typeof obj === 'object' && obj !== null) {
    const result = {};

    for (const key in obj) {
      const val = obj[key];
      if (typeof val === 'object' && val !== null) {
        if (typeof val.native === 'function') {
          // Promote native function to this key
          result[key] = (...args) => val.native(_ctx, ...args);
        } else {
          // Recurse
          result[key] = denative(val, _ctx);
        }
      } else {
        result[key] = val;
      }
    }

    return result;
  }

  // Base case (non-object)
  return obj;
}

const { PythonShell } = require('python-shell');
function convertCase(str, target) {
  const words = str
    .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase → snake_case
    .replace(/[-\s]+/g, '_')             // kebab-case or spaces → snake_case
    .toLowerCase()
    .split('_');

  switch (target) {
    case 'snake':
      return words.join('_');
    case 'camel':
      return words.map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join('');
    case 'pascal':
      return words.map(w => w[0].toUpperCase() + w.slice(1)).join('');
    case 'kebab':
      return words.join('-');
    case 'space':
      return words.join(' ');
    case 'upper':
      return str.toUpperCase();
    case 'lower':
      return str.toLowerCase();
    case 'plain':
    case 'nocase':
      return words.join('');
    default:
      throw new Error(`Unknown case: ${target}`);
  }
}

class Line {
  constructor(start, end, direction) {
    this.start = start;
    this.end = end;
    this.direction = direction; // 'N', 'S', 'E', 'W'
    this._points = {};          // internal storage for points

    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in target._points) return target._points[prop];
        return target[prop];
      },
      set: (target, prop, value) => {
        if (prop in target._points || typeof prop === 'string') {
          target._points[prop] = value;
          return true;
        }
        target[prop] = value;
        return true;
      },
      has: (target, prop) => {
        return prop in target._points || prop in target;
      }
    });
  }

  mark(value, id) {
    this._points[id] = value;
    return this; // chainable
  }

  setMatchingPoint(value, id, otherLine) {
    if (otherLine[id] !== undefined) {
      this._points[id] = value;
    }
    return this;
  }

  getIds() {
    return { ...this._points };
  }
}

function simplifyPronounce(word) {
  let w = word.toLowerCase();

  // 1. Collapse repeats
  w = w.replace(/([a-z])\1{2,}/g, "$1$1");
  w = w.replace(/([^aeiou])\1+/g, "$1");

  // 2. Fix known ugly clusters (progressive)
  const passes = [
    [/qu/g, "kw"],
    [/ph/g, "f"],
    [/ght/g, "t"],
    [/kn/g, "n"],
    [/([^aeiou])u([^aeiou])/g, "$1$2"], // drop weak u in "dupuk" → "dupk"
    [/([bcdfghjklmnpqrstvwxyz])c([ei])/g, "$1s$2"], // "ce/ci" → "se/si"
    [/c(?=[aou])/g, "k"], // "ca/co/cu" → "ka/ko/ku"
    [/dg([ei])/g, "j$1"], // "dge" → "je"
    [/ch([bcdfghjklmnpqrstvwxyz])/g, "k$1"], // "chk" → "k"
    [/([bcdfghjklmnpqrstvwxyz])h([bcdfghjklmnpqrstvwxyz])/g, "$1$2"], // crush "h" between cons
    [/[^aeiou]{3,}/g, (m) => m.slice(0, 2)] // reduce triple consonants
  ];

  for (let [pattern, repl] of passes) {
    w = w.replace(pattern, repl);
  }

  // 3. Final polish
  w = w.replace(/(.)\1{2,}/g, "$1$1"); // squash leftovers
  w = w.replace(/[^a-z]/g, ""); // drop trash

  return w.charAt(0).toUpperCase() + w.slice(1);
}

function randomWord() {
  const vowels = "aeiou";
  const doubleVowels = ["aa", "ee", "oo", "ai", "ea", "ou"];
  const consonants = "bcdfghklmnprst";
  const rareCons = "vwyxzjq";
  const clusters = ["tr", "st", "pl", "gr", "dr", "cl", "sh", "ch", "br", "cr", "gl", "pr", "fr", "sn", "sm"];

  function pick(set) {
    return set[Math.floor(Math.random() * set.length)];
  }

  function consonantStart() {
    if (Math.random() < 0.25) {
      return clusters[Math.floor(Math.random() * clusters.length)];
    }
    return pick(consonants + (Math.random() < 0.1 ? rareCons : ""));
  }

  function vowelPart() {
    return Math.random() < 0.15
      ? doubleVowels[Math.floor(Math.random() * doubleVowels.length)]
      : pick(vowels);
  }

  function syllable() {
    let syl = "";
    if (Math.random() < 0.9) syl += consonantStart();
    syl += vowelPart();
    if (Math.random() < 0.6) syl += pick(consonants);
    return syl;
  }

  let word = "";
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) word += syllable();

  return simplifyPronounce(word);
}
function randomName() {
  const first = randomWord();
  const hasFamily = Math.random() < 0.5;
  return hasFamily ? `${first} ${randomWord()}` : first;
}

function extendsClass(child, parent) {
  if (typeof child !== "function" || typeof parent !== "function") {
    return false; // Not classes/constructors
  }

  let proto = child;
  while (proto) {
    if (proto === parent) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

function extendTo(Base, Super) {
  class Mixed extends Super { }
  Object.getOwnPropertyNames(Base.prototype)
    .filter(p => p !== "constructor")
    .forEach(p => {
      Mixed.prototype[p] = Base.prototype[p];
    });
  return Mixed;
}

// DigitNumber class same as before (handles tokenizing multi-char digits)
class DigitNumber {
  constructor(digits, digitSet) {
    this.digits = digits; // array of digit indices, least significant first
    this.digitSet = digitSet;
    this.base = digitSet.length;
  }

  static fromString(str, digitSet) {
    const digits = [];
    let i = str.length;
    while (i > 0) {
      let matched = false;
      for (let len = Math.min(i, 10); len > 0; len--) {
        let part = str.slice(i - len, i);
        let idx = digitSet.indexOf(part);
        if (idx !== -1) {
          digits.push(idx);
          i -= len;
          matched = true;
          break;
        }
      }
      if (!matched) throw new Error(`Invalid digit in input near "${str.slice(i - 10, i)}"`);
    }
    return new DigitNumber(digits, digitSet);
  }

  toDecimal() {
    let result = 0;
    let base = this.base;
    for (let i = 0; i < this.digits.length; i++) {
      result += this.digits[i] * Math.pow(base, i);
    }
    return result;
  }



  static fromDecimal(value, digitSet) {
    const base = digitSet.length;
    if (value === 0) return new DigitNumber([0], digitSet);
    let digits = [];
    while (value > 0) {
      digits.push(value % base);
      value = Math.floor(value / base);
    }
    return new DigitNumber(digits, digitSet);
  }

  toString() {
    return this.digits
      .slice()
      .reverse()
      .map(d => this.digitSet[d])
      .join('');
  }
}

const Memoize = (fn) => {
    const cache = new Map();

    const callable = (...args) => {
        const key = JSON.stringify(args);
        if (!cache.has(key)) {
            cache.set(key, fn(...args));
        }
        return cache.get(key);
    };

    callable.cache = cache;
    callable.original = fn;

    return new Proxy(callable, {
        get: (target, prop) => (prop in target ? target[prop] : undefined),
        set: (target, prop, value) => {
            target[prop] = value;
            return true;
        }
    });
};

const fengari = require("fengari");
const lua = fengari.lua;
const lauxlib = fengari.lauxlib;
const lualib = fengari.lualib;

const luaEnv = {
  lua: {
    eval: (code) => {
      const L = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(L);

      if (typeof code !== "string") {
        code = `return ${JSON.stringify(code)}`;
      }

      const status = lauxlib.luaL_dostring(L, fengari.to_luastring(code));

      if (status !== lua.LUA_OK) {
        const err = lua.lua_tojsstring(L, -1);
        lua.lua_close(L);
        throw new Error(`Lua Error: ${err}`);
      }

      // Convert top of stack to JS value (number, string, etc)
      let result;
      if (lua.lua_isnumber(L, -1)) {
        result = lua.lua_tonumber(L, -1);
      } else if (lua.lua_isstring(L, -1)) {
        result = lua.lua_tojsstring(L, -1);
      } else {
        result = null; // You can expand this to handle tables later
      }

      lua.lua_close(L);
      return result;
    },

    run: (code) => {
      const L = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(L);
      lauxlib.luaL_dostring(L, code);
    },

    state: () => {
      const L = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(L);
      return L;
    },

    injectGlobal: (L, name, jsFunc) => {
      lua.lua_pushjsfunction(L, jsFunc);
      lua.lua_setglobal(L, name);
    }
  }
};

function windowUI(options) {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(tmp, 'nova_windowui_config.json');
  fs.writeFileSync(configPath, JSON.stringify(options), 'utf8');
  spawn('npx', ['electron', path.join(__dirname, '../electron-ui/main.js'), configPath], {
    detached: true,
    stdio: 'ignore'
  }).unref();
}
// --- BigInt ---
BigInt.prototype.toJSON = function() {
  // Mark it specially so we can revive
  return this.toString() + "n";
};

// --- Function ---
Function.prototype.toJSON = function() {
  // Serialize as string with a special marker
  return this.toString() + "#func";
};

function reorderTokensByPrecedence(tokens) {
  return tokens;
}

function findTokenMatchInString(code, tokens) {
  const joinedTokens = tokens.join('');
  const compactCode = code.replace(/\s+/g, '');
  const index = compactCode.indexOf(joinedTokens);

  if (index === -1) return null;

  // Now find where in the original code that match lives
  let realStart = 0;
  let realEnd = 0;
  let stripped = '';

  for (let i = 0; i < code.length; i++) {
    if (/\s/.test(code[i])) continue;
    if (stripped.length === 0) realStart = i;
    stripped += code[i];
    if (stripped.length === index + joinedTokens.length) {
      realEnd = i + 1;
      break;
    }
  }

  return code.slice(realStart, realEnd);
}

function execTicks(tks, cd) {
  if (tks === 0) {
    return process.nextTick(cd);
  } else {
    tks--;
    execTicks(tks, cd);
  }
}


let PLUGIN_PATHS = [`${os.homedir()}/nova_plugins`]

const cloneDeep = require('clone-deep');

function generateConsoleUI(options = {}) {
  const {
    type = 'box',
    width = 40,
    height = 3,
    fillChar = '█',
    emptyChar = ' ',
    borderColor = '37', // White
    fillColor = '32', // Green
    textColor = '37', // White
    title = '',
    text = '',
    max = 100,
    progress = 0, // For progress bar, gauge
    // New options for table, form, chart
    headers = [], // For table
    data = [], // For table, chart, list, grid
    fields = [], // For form: [{ label: 'Name', type: 'text', value: '' }]
    barChar = '█', // For bar chart
    valueColor = '36', // Cyan for values
    // New options for list, menu
    items = [], // For list, menu: ['Item 1', 'Item 2'] or [{ label: 'Item 1', value: 'data1' }]
    selectedIndex = 0, // For list, menu
    // New options for grid
    gridData = [], // For grid: [[cell1, cell2], [cell3, cell4]]
    columnCount = 2, // For grid, default columns
    cellPadding = 1, // For grid
    // New options for alert, dialog
    alertType = 'info', // 'info', 'warn', 'error', 'success'
    message = '', // For alert, dialog
    // New options for spinner
    spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    spinnerFrame = 0,
    spinnerLabel = '',
    // NEW HTML-LIKE / GUI-PURPOSE OPTIONS
    buttonText = 'Click Me', // For button
    linkText = 'Visit Link', // For link
    canvasGrid = [], // For canvas: 2D array of characters/colors
    spriteChar = '★', // For sprite
    spriteColor = '33', // Yellow for sprite
    gaugeValue = 0, // For gauge
    keybindKeys = [], // For keybind: ['Ctrl', 'S']
    dialogActions = [], // For dialog: [{ label: 'OK', value: 'ok' }]
    dialogType = 'info', // For dialog: 'info', 'confirm', 'error'
    menuAlign = 'left', // For menu: 'left', 'center', 'right'
    menuIndicator = '>', // For menu selected item indicator
    // New for 'panel' type
    elements = [], // Array of UI configurations for 'panel'
    spacing = 1, // Lines of space between elements in a panel
  } = options;

  const resetColor = '\x1b[0m';
  const borderAnsi = `\x1b[${borderColor}m`;
  const fillAnsi = `\x1b[${fillColor}m`;
  const textAnsi = `\x1b[${textColor}m`;
  const valueAnsi = `\x1b[${valueColor}m`;

  let uiString = '';

  const padText = (str, len, align = 'center') => {
    str = String(str); // Ensure it's a string
    if (str.length >= len) {
      return str.substring(0, len);
    }
    const padding = len - str.length;
    if (align === 'left') {
      return str + emptyChar.repeat(padding);
    }
    if (align === 'right') {
      return emptyChar.repeat(padding) + str;
    }
    // Center alignment
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return emptyChar.repeat(leftPad) + str + emptyChar.repeat(rightPad);
  };

  // Helper for drawing horizontal lines (for tables/forms/etc.)
  const drawHorizontalLine = (len, char = '─', color = borderColor) => {
    return `\x1b[${color}m${char.repeat(len)}\x1b[0m`;
  };

  switch (type) {
    case 'panel':
      if (!Array.isArray(elements) || elements.length === 0) {
        uiString += `${borderAnsi}┌${drawHorizontalLine(width - 2, '─')}┐${resetColor}\n`;
        uiString += `${borderAnsi}│${padText("No elements defined for panel", width - 2, 'center')}|${resetColor}\n`;
        uiString += `${borderAnsi}└${drawHorizontalLine(width - 2, '─')}┘${resetColor}`;
        break;
      }

      elements.forEach((elementConfig, index) => {
        // Recursively call generateConsoleUI for each element
        // Pass relevant options, inheriting global ones but allowing element-specific overrides
        const mergedOptions = {
          ...options, // Inherit global options (like borderColor, fillChar)
          ...elementConfig, // Apply element-specific overrides
          // Crucially, force elements within a panel to use the panel's width
          // unless they explicitly define their own smaller width.
          // This helps in aligning elements visually.
          width: elementConfig.width || width,
        };

        uiString += generateConsoleUI(mergedOptions);
        if (index < elements.length - 1) {
          uiString += '\n'.repeat(spacing + 1); // Add spacing lines between elements
        }
      });
      break;

    case 'box':
      // Top border
      uiString += `${borderAnsi}${fillChar.repeat(width)}${resetColor}\n`;

      // Title line (if any)
      if (title) {
        const innerWidth = width - 2; // Account for side borders
        const paddedTitle = padText(` ${title} `, innerWidth, 'center');
        uiString += `${borderAnsi}${fillChar}${resetColor}${textAnsi}${paddedTitle}${borderAnsi}${fillChar}${resetColor}\n`;
      }

      // Middle lines (content)
      for (let i = 0; i < height - (title ? 2 : 1) - 1; i++) { // Adjust for title and bottom border
        const innerWidth = width - 2;
        let lineContent = '';
        if (i === Math.floor((height - (title ? 2 : 1) - 1) / 2)) { // Try to center text vertically
          lineContent = padText(text, innerWidth, 'center');
        } else {
          lineContent = emptyChar.repeat(innerWidth);
        }
        uiString += `${borderAnsi}${fillChar}${resetColor}${textAnsi}${lineContent}${borderAnsi}${fillChar}${resetColor}\n`;
      }

      // Bottom border
      uiString += `${borderAnsi}${fillChar.repeat(width)}${resetColor}`;
      break;

    case 'progressBar':
      // Ensure max is not zero to prevent division by zero
      const effectiveMax = max === 0 ? 1 : max;
      const currentProgress = Math.min(Math.max(progress, 0), effectiveMax); // Clamp progress
      const percentage = Math.floor((currentProgress * 100) / effectiveMax);
      const filledWidth = Math.floor((width * percentage) / 100);
      const emptyWidth = width - filledWidth;
      const percentageText = `${percentage}%`.padStart(4, emptyChar);

      // Main bar
      uiString += `${fillAnsi}${fillChar.repeat(filledWidth)}${resetColor}`;
      uiString += `${borderAnsi}${emptyChar.repeat(emptyWidth)}${resetColor}`;

      // Overlay percentage text (simple, assumes percentageText fits)
      // This places the percentage text at the end of the bar.
      // For a more centered look, you'd need to calculate the start position based on width.
      if (width >= percentageText.length) {
        uiString = uiString.substring(0, uiString.length - percentageText.length) +
          `${textAnsi}${percentageText}${resetColor}`;
      }
      break;

    case 'table':
      const availableWidth = width - 2; // Account for left/right borders '|'
      if (headers.length === 0 && data.length === 0) {
        uiString += `${borderAnsi}|${padText("No data", availableWidth, 'center')}|${resetColor}`;
        break;
      }

      // Calculate column widths
      const colCount = headers.length > 0 ? headers.length : (data[0] ? Object.keys(data[0]).length : 0);
      if (colCount === 0) {
        uiString += `${borderAnsi}|${padText("No data", availableWidth, 'center')}|${resetColor}`;
        break;
      }
      const colWidths = Array(colCount).fill(0);

      // Determine max width for each column from headers
      headers.forEach((h, i) => {
        colWidths[i] = Math.max(colWidths[i], String(h).length);
      });

      // Determine max width for each column from data
      data.forEach(row => {
        let rowValues = Array.isArray(row) ? row : Object.values(row);
        rowValues.forEach((cell, i) => {
          colWidths[i] = Math.max(colWidths[i], String(cell).length);
        });
      });

      // Distribute remaining width if necessary, or cap if too wide
      const totalMinColWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colCount - 1) * 3; // +3 for " | "
      let extraWidthPerCol = 0;
      if (totalMinColWidth < availableWidth) {
        extraWidthPerCol = Math.floor((availableWidth - totalMinColWidth) / colCount);
      }

      for (let i = 0; i < colCount; i++) {
        colWidths[i] += extraWidthPerCol;
      }

      // Adjust last column to absorb remainder
      const currentTotalWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colCount - 1) * 3;
      if (currentTotalWidth < availableWidth) {
        colWidths[colCount - 1] += (availableWidth - currentTotalWidth);
      }


      // Render Title (if any)
      if (title) {
        uiString += `${borderAnsi}┌${drawHorizontalLine(width - 2, '─')}┐${resetColor}\n`;
        const paddedTitle = padText(` ${title} `, width - 2, 'center');
        uiString += `${borderAnsi}│${resetColor}${textAnsi}${paddedTitle}${borderAnsi}│${resetColor}\n`;
      } else {
        uiString += `${borderAnsi}┌${drawHorizontalLine(width - 2, '─')}┐${resetColor}\n`;
      }


      // Render Headers
      if (headers.length > 0) {
        uiString += `${borderAnsi}│${resetColor}`;
        headers.forEach((h, i) => {
          uiString += `${textAnsi}${padText(h, colWidths[i], 'center')}${resetColor}`;
          if (i < headers.length - 1) {
            uiString += `${borderAnsi} │ ${resetColor}`;
          }
        });
        uiString += `${borderAnsi}│${resetColor}\n`;
        uiString += `${borderAnsi}├${drawHorizontalLine(width - 2, '─', borderColor)}┤${resetColor}\n`; // Separator: Simplified without colWidths, it's just the total line
      }

      // Render Data Rows
      data.slice(0, height - (headers.length > 0 ? 3 : 2) - (title ? 1 : 0)).forEach(row => { // Limit rows by height
        let rowValues = Array.isArray(row) ? row : Object.values(row);
        uiString += `${borderAnsi}│${resetColor}`;
        rowValues.forEach((cell, i) => {
          uiString += `${textAnsi}${padText(cell, colWidths[i], 'left')}${resetColor}`;
          if (i < colCount - 1) {
            uiString += `${borderAnsi} │ ${resetColor}`;
          }
        });
        uiString += `${borderAnsi}│${resetColor}\n`;
      });

      // Bottom border
      uiString += `${borderAnsi}└${drawHorizontalLine(width - 2, '─')}┘${resetColor}`;
      break;

    case 'form':
      const formWidth = width;
      const innerFormWidth = formWidth - 2;

      // Top border
      uiString += `${borderAnsi}┌${drawHorizontalLine(formWidth - 2, '─')}┐${resetColor}\n`;

      // Title
      if (title) {
        uiString += `${borderAnsi}│${resetColor}${textAnsi}${padText(` ${title} `, innerFormWidth, 'center')}${borderAnsi}│${resetColor}\n`;
        uiString += `${borderAnsi}├${drawHorizontalLine(formWidth - 2, '─')}┤${resetColor}\n`;
      }

      // Form fields
      fields.forEach(field => {
        const label = field.label || 'Field';
        const type = field.type || 'text';
        const value = String(field.value || ''); // Ensure value is a string

        let inputDisplay = '';
        const availableInputWidth = innerFormWidth - label.length - 3; // "Label: "

        switch (type) {
          case 'text':
          case 'password': // Just displays text for now, no masking
            inputDisplay = `[${padText(value, availableInputWidth, 'left')}]`;
            break;
          case 'checkbox':
            inputDisplay = `[${value ? 'x' : ' '}]`;
            break;
          case 'select': // Basic display of current value
            inputDisplay = `<${padText(value, availableInputWidth - 2, 'left')}>`;
            break;
          default:
            inputDisplay = `[${padText(value, availableInputWidth, 'left')}]`;
            break;
        }
        const fieldLine = `${textAnsi}${label}:${resetColor} ${valueAnsi}${inputDisplay}${resetColor}`;
        uiString += `${borderAnsi}│${resetColor}${padText(fieldLine, innerFormWidth, 'left')}${borderAnsi}│${resetColor}\n`;
      });

      // Bottom border
      uiString += `${borderAnsi}└${drawHorizontalLine(formWidth - 2, '─')}┘${resetColor}`;
      break;

    case 'chart': // Simple ASCII Bar Chart
      if (!Array.isArray(data) || data.length === 0) {
        uiString += `${borderAnsi}┌${drawHorizontalLine(width - 2, '─')}┐${resetColor}\n`;
        uiString += `${borderAnsi}│${padText("No chart data", width - 2, 'center')}|${resetColor}`;
        uiString += `${borderAnsi}└${drawHorizontalLine(width - 2, '─')}┘${resetColor}\n`;
        break;
      }

      const chartMaxHeight = height - (title ? 3 : 2); // Available height for bars

      // Find max value for scaling
      let maxValue = 0;
      data.forEach(item => {
        if (typeof item === 'object' && item !== null && 'value' in item) {
          maxValue = Math.max(maxValue, item.value);
        } else if (typeof item === 'number') {
          maxValue = Math.max(maxValue, item);
        }
      });
      maxValue = maxValue === 0 ? 1 : maxValue; // Avoid division by zero

      // Top border
      uiString += `${borderAnsi}┌${drawHorizontalLine(width - 2, '─')}┐${resetColor}\n`;

      // Title
      if (title) {
        uiString += `${borderAnsi}│${resetColor}${textAnsi}${padText(` ${title} `, width - 2, 'center')}${borderAnsi}│${resetColor}\n`;
        uiString += `${borderAnsi}├${drawHorizontalLine(width - 2, '─')}┤${resetColor}\n`;
      }

      // Chart area (iterate from top to bottom for bars)
      for (let h = 0; h < chartMaxHeight; h++) {
        uiString += `${borderAnsi}│${resetColor} `; // Left border and padding
        data.forEach(item => {
          const value = (typeof item === 'object' && item !== null && 'value' in item) ? item.value : item;

          const barHeight = Math.floor((value / maxValue) * chartMaxHeight);

          if (chartMaxHeight - h <= barHeight) { // If this row is part of the bar
            uiString += `${fillAnsi}${barChar}${resetColor}`;
          } else {
            uiString += `${emptyChar}`; // Empty space above bar
          }
          uiString += emptyChar; // Small gap between bars
        });
        uiString += emptyChar; // Right padding
        uiString += `${borderAnsi}│${resetColor}\n`;
      }

      // Labels below bars (simplified: only if data has labels and fits)
      if (chartMaxHeight > 0 && data.some(d => typeof d === 'object' && 'label' in d)) {
        uiString += `${borderAnsi}│${resetColor} `;
        data.forEach(item => {
          const label = (typeof item === 'object' && item !== null && 'label' in item) ? item.label : ' ';
          uiString += `${textAnsi}${label.substring(0, 1)}${resetColor}${emptyChar}`; // Use first char for label
        });
        uiString += emptyChar;
        uiString += `${borderAnsi}│${resetColor}\n`;
      }


      // Bottom border
      uiString += `${borderAnsi}└${drawHorizontalLine(width - 2, '─')}┘${resetColor}`;
      break;

    case 'list':
      const listInnerWidth = width - 2;

      // Top border
      uiString += `${borderAnsi}┌${drawHorizontalLine(width - 2, '─')}┐${resetColor}\n`;

      // Title
      if (title) {
        uiString += `${borderAnsi}│${resetColor}${textAnsi}${padText(` ${title} `, listInnerWidth, 'center')}${borderAnsi}│${resetColor}\n`;
        uiString += `${borderAnsi}├${drawHorizontalLine(width - 2, '─')}┤${resetColor}\n`;
      }

      // List items
      items.slice(0, height - (title ? 2 : 1)).forEach((item, index) => {
        let itemText = typeof item === 'object' && item !== null && 'label' in item ? item.label : String(item);
        const isSelected = index === selectedIndex;
        let displayItem = isSelected ? `${menuIndicator} ${itemText}` : `  ${itemText}`;
        if (displayItem.length > listInnerWidth) {
          displayItem = displayItem.substring(0, listInnerWidth - 3) + '...';
        }
        const itemColor = isSelected ? fillColor : textColor;
        uiString += `${borderAnsi}│${resetColor}${`\x1b[${itemColor}m`}${padText(displayItem, listInnerWidth, 'left')}${borderAnsi}│${resetColor}\n`;
      });

      // Fill remaining height with empty lines
      for (let i = items.length; i < height - (title ? 2 : 1); i++) {
        uiString += `${borderAnsi}│${emptyChar.repeat(listInnerWidth)}${borderAnsi}│${resetColor}\n`;
      }

      // Bottom border
      uiString += `${borderAnsi}└${drawHorizontalLine(width - 2, '─')}┘${resetColor}`;
      break;

    case 'grid':
      const gridInnerWidth = width - 2;

      // Top border
      uiString += `${borderAnsi}┌${drawHorizontalLine(width - 2, '─')}┐${resetColor}\n`;

      // Title
      if (title) {
        uiString += `${borderAnsi}│${resetColor}${textAnsi}${padText(` ${title} `, gridInnerWidth, 'center')}${borderAnsi}│${resetColor}\n`;
        uiString += `${borderAnsi}├${drawHorizontalLine(width - 2, '─')}┤${resetColor}\n`;
      }

      // Calculate column widths for grid
      let gridColWidths = Array(columnCount).fill(0);
      gridData.forEach(row => {
        row.forEach((cell, i) => {
          if (i < columnCount) { // Only consider up to `columnCount`
            gridColWidths[i] = Math.max(gridColWidths[i], String(cell).length);
          }
        });
      });

      // Distribute available width among columns
      const totalCellPadding = (columnCount - 1) * (cellPadding * 2 + 1); // For " | "
      let remainingGridWidth = gridInnerWidth - totalCellPadding;
      let sumCurrentColWidths = gridColWidths.reduce((a, b) => a + b, 0);

      if (sumCurrentColWidths < remainingGridWidth) {
        const extraPerCol = Math.floor((remainingGridWidth - sumCurrentColWidths) / columnCount);
        gridColWidths = gridColWidths.map(w => w + extraPerCol);
        // Adjust last column for remainder
        gridColWidths[columnCount - 1] += (remainingGridWidth - (gridColWidths.reduce((a, b) => a + b, 0)));
      } else {
        // If content is too wide, cap column widths
        const ratio = remainingGridWidth / sumCurrentColWidths;
        gridColWidths = gridColWidths.map(w => Math.floor(w * ratio));
        // Ensure total sum matches remainingGridWidth by adjusting last col
        gridColWidths[columnCount - 1] += (remainingGridWidth - (gridColWidths.reduce((a, b) => a + b, 0)));
      }


      // Render grid rows
      gridData.slice(0, height - (title ? 2 : 1)).forEach((row, rowIndex) => {
        uiString += `${borderAnsi}│${resetColor}`;
        row.forEach((cell, colIndex) => {
          if (colIndex < columnCount) {
            uiString += `${textAnsi}${padText(cell, gridColWidths[colIndex], 'center')}${resetColor}`;
            if (colIndex < columnCount - 1) {
              uiString += `${borderAnsi}${emptyChar.repeat(cellPadding)}|${emptyChar.repeat(cellPadding)}${resetColor}`;
            }
          }
        });
        // Pad the rest of the line if necessary
        const currentLineLength = 1 + row.slice(0, columnCount).reduce((sum, _, i) => sum + gridColWidths[i] + (i < columnCount - 1 ? (cellPadding * 2 + 1) : 0), 0);
        if (currentLineLength < gridInnerWidth + 1) {
          uiString += emptyChar.repeat(gridInnerWidth - currentLineLength + 1);
        }
        uiString += `${borderAnsi}│${resetColor}\n`;
        if (rowIndex < gridData.length - 1 && rowIndex < height - (title ? 2 : 1) - 1) {
          // Draw separator line between rows
          uiString += `${borderAnsi}├${resetColor}`;
          gridColWidths.forEach((colW, i) => {
            uiString += drawHorizontalLine(colW, '─', borderColor);
            if (i < columnCount - 1) {
              uiString += `${borderAnsi}${emptyChar.repeat(cellPadding)}┼${emptyChar.repeat(cellPadding)}${resetColor}`;
            }
          });
          // Close the separator line
          uiString += `${borderAnsi}┤${resetColor}\n`;
        }
      });

      // Fill remaining height with empty lines for grid
      for (let i = gridData.length; i < height - (title ? 2 : 1); i++) {
        uiString += `${borderAnsi}│${emptyChar.repeat(gridInnerWidth)}${borderAnsi}│${resetColor}\n`;
      }

      // Bottom border for grid
      uiString += `${borderAnsi}└${drawHorizontalLine(width - 2, '─')}┘${resetColor}`;
      break;

    case 'alert':
      const alertInnerWidth = width - 2;
      let alertBorderChar = '─';
      let alertCornerChar = '┌';
      let alertColor = textColor;
      let alertTitle = title || 'Alert';

      switch (alertType) {
        case 'info':
          alertColor = '34'; // Blue
          alertBorderChar = '─';
          alertCornerChar = '┌';
          alertTitle = title || 'Info';
          break;
        case 'warn':
          alertColor = '33'; // Yellow
          alertBorderChar = '═';
          alertCornerChar = '╔';
          alertTitle = title || 'Warning';
          break;
        case 'error':
          alertColor = '31'; // Red
          alertBorderChar = '─';
          alertCornerChar = '┌';
          alertTitle = title || 'Error';
          break;
        case 'success':
          alertColor = '32'; // Green
          alertBorderChar = '─';
          alertCornerChar = '┌';
          alertTitle = title || 'Success';
          break;
      }
      const alertAnsi = `\x1b[${alertColor}m`;

      // Top border
      uiString += `${alertAnsi}${alertCornerChar}${drawHorizontalLine(alertInnerWidth, alertBorderChar, alertColor)}${alertCornerChar.replace('┌', '┐').replace('╔', '╗')}${resetColor}\n`;

      // Title
      const paddedAlertTitle = padText(` ${alertTitle} `, alertInnerWidth, 'center');
      uiString += `${alertAnsi}│${resetColor}${textAnsi}${paddedAlertTitle}${alertAnsi}│${resetColor}\n`;
      uiString += `${alertAnsi}├${drawHorizontalLine(alertInnerWidth, alertBorderChar, alertColor)}${alertCornerChar.replace('┌', '┤').replace('╔', '╣')}${resetColor}\n`;


      // Message content
      const messageLines = message.match(new RegExp(`.{1,${alertInnerWidth}}`, 'g')) || [''];
      messageLines.slice(0, height - (title ? 4 : 3)).forEach(line => { // Adjust height
        uiString += `${alertAnsi}│${resetColor}${textAnsi}${padText(line, alertInnerWidth, 'left')}${alertAnsi}│${resetColor}\n`;
      });

      // Fill remaining height with empty lines
      for (let i = messageLines.length; i < height - (title ? 4 : 3); i++) {
        uiString += `${alertAnsi}│${emptyChar.repeat(alertInnerWidth)}${alertAnsi}│${resetColor}\n`;
      }

      // Bottom border
      uiString += `${alertAnsi}${alertCornerChar.replace('┌', '└').replace('╔', '╚')}${drawHorizontalLine(alertInnerWidth, alertBorderChar, alertColor)}${alertCornerChar.replace('┌', '┘').replace('╔', '╝')}${resetColor}`;
      break;

    case 'spinner':
      const currentSpinnerFrame = spinnerFrames[spinnerFrame % spinnerFrames.length];
      const spinnerContent = `${currentSpinnerFrame} ${spinnerLabel}`;
      uiString += `${textAnsi}${spinnerContent}${resetColor}`;
      break;

    // NEW HTML-LIKE / GUI-PURPOSE CASES

    case 'button':
      const buttonInnerWidth = width - 2;
      const buttonPaddedText = padText(` ${buttonText} `, buttonInnerWidth, 'center');

      uiString += `${borderAnsi}┌${drawHorizontalLine(buttonInnerWidth, '─')}┐${resetColor}\n`;
      uiString += `${borderAnsi}│${resetColor}${fillAnsi}${buttonPaddedText}${borderAnsi}│${resetColor}\n`;
      uiString += `${borderAnsi}└${drawHorizontalLine(buttonInnerWidth, '─')}┘${resetColor}`;
      break;

    case 'link':
      uiString += `${textAnsi}\x1b[4m${linkText}\x1b[0m`; // Underline for link effect
      break;

    case 'canvas':
      // Emulate a canvas by printing a grid of characters
      const canvasInnerWidth = width - 2;
      const canvasInnerHeight = height - 2;

      uiString += `${borderAnsi}┌${drawHorizontalLine(canvasInnerWidth, '─')}┐${resetColor}\n`;

      for (let y = 0; y < canvasInnerHeight; y++) {
        uiString += `${borderAnsi}│${resetColor}`;
        let line = '';
        for (let x = 0; x < canvasInnerWidth; x++) {
          if (canvasGrid[y] && canvasGrid[y][x]) {
            const cell = canvasGrid[y][x];
            if (typeof cell === 'object' && cell !== null && 'char' in cell) {
              const charColor = cell.color ? `\x1b[${cell.color}m` : textAnsi;
              line += `${charColor}${cell.char}${resetColor}`;
            } else {
              line += `${textAnsi}${String(cell).substring(0, 1)}${resetColor}`;
            }
          } else {
            line += emptyChar;
          }
        }
        uiString += `${line}${borderAnsi}│${resetColor}\n`;
      }

      uiString += `${borderAnsi}└${drawHorizontalLine(canvasInnerWidth, '─')}┘${resetColor}`;
      break;

    case 'sprite':
      const spriteAnsi = `\x1b[${spriteColor}m`;
      // Simple display of a character as a sprite
      // Can be expanded to draw small ASCII art sprites
      uiString += `${spriteAnsi}${spriteChar}${resetColor}`;
      if (spriteLabel) {
        uiString += ` ${textAnsi}${spriteLabel}${resetColor}`;
      }
      break;

    case 'gauge':
      const gaugeInnerWidth = width - 2;
      const effectiveGaugeMax = max === 0 ? 1 : max;
      const currentGaugeValue = Math.min(Math.max(gaugeValue, 0), effectiveGaugeMax);
      const gaugePercentage = (currentGaugeValue / effectiveGaugeMax);

      const filledGaugeWidth = Math.floor(gaugeInnerWidth * gaugePercentage);
      const emptyGaugeWidth = gaugeInnerWidth - filledGaugeWidth;

      uiString += `${borderAnsi}┌${drawHorizontalLine(gaugeInnerWidth, '─')}┐${resetColor}\n`;
      uiString += `${borderAnsi}│${fillAnsi}${fillChar.repeat(filledGaugeWidth)}${resetColor}${borderAnsi}${emptyChar.repeat(emptyGaugeWidth)}${borderAnsi}│${resetColor}\n`;
      uiString += `${borderAnsi}└${drawHorizontalLine(gaugeInnerWidth, '─')}┘${resetColor}`;
      // Optional: Add value text below or inside
      const gaugeValueText = `${currentGaugeValue}/${effectiveGaugeMax}`;
      if (width > gaugeValueText.length + 2) {
        uiString += `\n${padText(gaugeValueText, width, 'center')}`;
      }
      break;

    case 'keybind':
      const keybindText = keybindKeys.map(key => `[${key}]`).join('+');
      uiString += `${textAnsi}${keybindText}${resetColor}`;
      if (spriteLabel) { // Re-using spinnerLabel for a description
        uiString += ` ${spriteLabel}`;
      }
      break;

    case 'dialog':
      const dialogInnerWidth = width - 2;
      let dialogBorderChar = '─';
      let dialogCornerChar = '┌';
      let dialogColor = '37'; // Default white
      let dialogTitleText = title || 'Dialog';

      switch (dialogType) {
        case 'info':
          dialogColor = '34'; // Blue
          dialogTitleText = title || 'Info';
          break;
        case 'confirm':
          dialogColor = '33'; // Yellow
          dialogTitleText = title || 'Confirm';
          break;
        case 'error':
          dialogColor = '31'; // Red
          dialogTitleText = title || 'Error';
          break;
      }
      const dialogAnsi = `\x1b[${dialogColor}m`;

      // Top border
      uiString += `${dialogAnsi}${dialogCornerChar}${drawHorizontalLine(dialogInnerWidth, dialogBorderChar, dialogColor)}${dialogCornerChar.replace('┌', '┐').replace('╔', '╗')}${resetColor}\n`;

      // Title
      const paddedDialogTitle = padText(` ${dialogTitleText} `, dialogInnerWidth, 'center');
      uiString += `${dialogAnsi}│${resetColor}${textAnsi}${paddedDialogTitle}${dialogAnsi}│${resetColor}\n`;
      uiString += `${dialogAnsi}├${drawHorizontalLine(dialogInnerWidth, dialogBorderChar, dialogColor)}${dialogCornerChar.replace('┌', '┤').replace('╔', '╣')}${resetColor}\n`;

      // Message content
      const dialogMessageLines = message.match(new RegExp(`.{1,${dialogInnerWidth}}`, 'g')) || [''];
      dialogMessageLines.slice(0, height - (title ? 5 : 4) - (dialogActions.length > 0 ? 2 : 0)).forEach(line => {
        uiString += `${dialogAnsi}│${resetColor}${textAnsi}${padText(line, dialogInnerWidth, 'left')}${dialogAnsi}│${resetColor}\n`;
      });

      // Fill remaining height with empty lines before actions
      const filledMessageHeight = dialogMessageLines.length;
      const remainingHeightForMessage = height - (title ? 5 : 4) - (dialogActions.length > 0 ? 2 : 0) - filledMessageHeight;
      for (let i = 0; i < remainingHeightForMessage; i++) {
        uiString += `${dialogAnsi}│${emptyChar.repeat(dialogInnerWidth)}${dialogAnsi}│${resetColor}\n`;
      }

      // Actions (buttons)
      if (dialogActions.length > 0) {
        uiString += `${dialogAnsi}├${drawHorizontalLine(dialogInnerWidth, dialogBorderChar, dialogColor)}${dialogCornerChar.replace('┌', '┤').replace('╔', '╣')}${resetColor}\n`;
        let actionsLine = '';
        dialogActions.forEach((action, index) => {
          actionsLine += `[ ${action.label} ]`;
          if (index < dialogActions.length - 1) {
            actionsLine += ' '; // Small space between buttons
          }
        });
        uiString += `${dialogAnsi}│${resetColor}${padText(actionsLine, dialogInnerWidth, 'center')}${dialogAnsi}│${resetColor}\n`;
      }

      // Bottom border
      uiString += `${dialogAnsi}${dialogCornerChar.replace('┌', '└').replace('╔', '╚')}${drawHorizontalLine(dialogInnerWidth, dialogBorderChar, dialogColor)}${dialogCornerChar.replace('┌', '┘').replace('╔', '╝')}${resetColor}`;
      break;

    case 'menu':
      const menuInnerWidth = width - 2;

      // Top border
      uiString += `${borderAnsi}┌${drawHorizontalLine(width - 2, '─')}┐${resetColor}\n`;

      // Title
      if (title) {
        uiString += `${borderAnsi}│${resetColor}${textAnsi}${padText(` ${title} `, menuInnerWidth, 'center')}${borderAnsi}│${resetColor}\n`;
        uiString += `${borderAnsi}├${drawHorizontalLine(width - 2, '─')}┤${resetColor}\n`;
      }

      // Menu items
      items.slice(0, height - (title ? 2 : 1)).forEach((item, index) => {
        let itemText = typeof item === 'object' && item !== null && 'label' in item ? item.label : String(item);
        const isSelected = index === selectedIndex;
        let displayItem = isSelected ? `${menuIndicator} ${itemText}` : `  ${itemText}`;
        if (displayItem.length > menuInnerWidth) {
          displayItem = displayItem.substring(0, menuInnerWidth - 3) + '...';
        }
        const itemColor = isSelected ? fillColor : textColor;
        uiString += `${borderAnsi}│${resetColor}${`\x1b[${itemColor}m`}${padText(displayItem, menuInnerWidth, menuAlign)}${borderAnsi}│${resetColor}\n`;
      });

      // Fill remaining height with empty lines
      for (let i = items.length; i < height - (title ? 2 : 1); i++) {
        uiString += `${borderAnsi}│${emptyChar.repeat(menuInnerWidth)}${borderAnsi}│${resetColor}\n`;
      }

      // Bottom border
      uiString += `${borderAnsi}└${drawHorizontalLine(width - 2, '─')}┘${resetColor}`;
      break;

    default:
      uiString += `${borderAnsi}┌${drawHorizontalLine(width - 2, '─')}┐${resetColor}\n`;
      uiString += `${borderAnsi}│${padText(`Unknown type: ${type}`, width - 2, 'center')}|${resetColor}\n`;
      uiString += `${borderAnsi}└${drawHorizontalLine(width - 2, '─')}┘${resetColor}`;
      break;
  }

  return uiString;
}


function sleepSync(seconds) {
  if (process.platform === 'win32') {
    // For Windows, use the 'timeout' command
    // /T: timeout in seconds, /NOBREAK: ignore key presses
    // Note: timeout is in seconds, so convert ms. Minimum 1 second.
    execSync(`timeout /T ${Math.max(1, Math.ceil(seconds))} /NOBREAK`, { stdio: 'inherit' });
  } else {
    // For Unix-like systems (Linux, macOS), use the 'sleep' command
    // sleep can handle fractional seconds
    execSync(`sleep ${seconds}`);
  }
}

/**
 * Calculates the number of matching letters between two strings.
 * This is a custom metric, not a standard string similarity algorithm.
 * It counts common characters present in both strings, case-insensitive.
 *
 * @param {string} s1 The first string.
 * @param {string} s2 The second string.
 * @returns {number} The number of matching letters.
 */
function findClosestMatch(wordArray, wordToMatch) {
  if (
    !wordToMatch ||
    typeof wordToMatch !== 'string' ||
    !Array.isArray(wordArray) ||
    wordArray.length === 0
  ) {
    return wordToMatch;
  }

  const stringSimilarity = require('string-similarity');
  const matches = stringSimilarity.findBestMatch(wordToMatch, wordArray);
  const { rating, target } = matches.bestMatch;

  return rating > 0.4 ? target : wordToMatch;
}

function safeReadFile(filename) {
  // Remove quotes if present
  if (typeof filename === 'string') {
    filename = filename.trim();
    if ((filename.startsWith('"') && filename.endsWith('"')) ||
      (filename.startsWith("'") && filename.endsWith("'"))) {
      filename = filename.slice(1, -1);
    }
  }

  // Resolve relative paths from process.cwd()
  if (!path.isAbsolute(filename)) {
    filename = path.resolve(process.cwd(), filename);
  }

  // Check existence
  if (!fs.existsSync(filename)) {
    throw new Error(`File not found: ${filename}`);
  }

  // Try reading
  try {
    return fs.readFileSync(filename, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read file "${filename}": ${err.message}`);
  }
}

function parseKeol(code) {
  const parser = new KeolParser();
  parser.addCommand('eval_nova', ((args) => { runNovaCode(args) }));
  return parser.parse(code);
}


function runNovaCode(code) {
  try {
    env.run(code);
  } catch (e) { console.log(e) }
  env.maps = {};
  env.functions = {};
  env.enums = {};
  env.classes = {};
  env.ret = {};
  env.states = {};
  env.maps = {};
  env.macros = {};
  env.resus = {};
  env.defunctions = {};
  env.structs = {};
  env.blocks = {};
  env.loggable = true;
  env.snippets = {};
  env.interfaces = {};
  env.streams = {};
  env.types = {};
  env.keyfuncs = {};
  env.templates = {};
  env.resultOutput = "";
}

function runREPLNovaCode(code) {
if (!env.options?.throwErrs) {
  try {
    env.run(code);
  } catch (e) {
    console.log('nova runtime error: ' + e);
  }
} else { env.run(code); };
}

class nova {
  loggable = true;
  constructor() {
  // Backup the original JSON.parse
const originalParse = JSON.parse;
// Custom parse
JSON.parse = function(text, reviver) {
  const defaultReviver = (key, value) => {
    if (typeof value === "string") {
      // Handle functions
      if (value.endsWith("#func")) {
        const funcStr = value.slice(0, -5);
        try {
          return eval(`(${funcStr})`);
        } catch (e) {
          console.warn(`Failed to eval function for key "${key}":`, e);
          return value;
        }
      }

      // Handle BigInt
      if (/^\d+n$/.test(value)) {
        try {
          return BigInt(value.slice(0, -1));
        } catch (e) {
          console.warn(`Failed to convert BigInt for key "${key}":`, e);
          return value;
        }
      }
    }
    return value;
  };

  // Chain with user-provided reviver if exists
  const combinedReviver = reviver
    ? (key, value) => reviver(key, defaultReviver(key, value))
    : defaultReviver;

  return originalParse(text, combinedReviver);
};
    this._backups = {};
    this.extends = extendsClass;
    this.asyncQueqe = [];
    this.wrappers = {};
    this.breakFn = () => { throw 'k'; };
    this.contiFn = () => { throw 'k'; };
    this.OBJ_KEV = '=';
    this.NOVAL_ARR_DEV = ',';
    this.ARR_DEV = ',';
    this.OBJ_DEV = ';';
    this.extend = extendTo;
    this.ROUND_NUM = 5;
    this.HEX_BASE = 16;
    this.bridge = {};
    this.options = {};
    this.fnopts = {};
    this.blocks = {};
    this.expectedROP = "";
    this.import = (name) => {
      const tryRequire = (p) => {
        try { return require(p); } catch { return null; }
      };

      // --- Local (no .nvroot) check ---
      const localMap = tryRequire('./.nova_modules.js');
      const localEntry = localMap?.[name];
      if (localEntry) return localEntry.exports || this.run(localEntry.code);

      const localFile = (f) => path.resolve('./.nova_modules', f);
      const localPaths = [localFile(name), localFile(name)];
      for (const p of localPaths) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          const mod = tryRequire(p);
          if (mod) return mod.exports || mod;
        } else if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    const rootFile = path.join(p, "root.nv");
    if (fs.existsSync(rootFile)) {
      return this.run(fs.readFileSync(rootFile, "utf8"));
  }
}
      }

      // --- Fallback to .nvroot-based project lookup ---
      let dir = process.cwd();
      while (!fs.existsSync(path.join(dir, '.nvroot'))) {
        const parent = path.dirname(dir);
        if (parent === dir) throw new Error('No .nvroot found');
        dir = parent;
      }

      const rootMap = tryRequire(path.join(dir, '.nova_modules.js'));
      const rootEntry = rootMap?.[name];
      if (rootEntry) return rootEntry.exports || this.run(rootEntry.code);

      const dirs = ['.nova_modules', 'nova_modules'];
      for (const d of dirs) {
        const base = path.join(dir, d);
        const pathsToTry = [
          path.join(base, name + '.js'),
          path.join(base, name)
        ];
        for (const p of pathsToTry) {
if (fs.existsSync(p)) {
  if (fs.statSync(p).isFile()) {
    const mod = tryRequire(p);
    if (mod) return mod.exports || mod;
  }

  if (fs.statSync(p).isDirectory()) {
    const rootFile = path.join(p, "root.nv");
    if (fs.existsSync(rootFile)) {
      return this.run(fs.readFileSync(rootFile, "utf8"));
    }
  }
}
        }
      }

      throw new Error(`Module "${name}" not found`, { callStack: [localFile, localPaths] });
    };
    this.snippets = {};
    this.interfaces = {};
    this.defunctions = {};
    this.commands = {};
    this.resus = {};
    this.infuncs = {};
    this.patterns = {};
    this.streams = {};
    this.operators = {};
    this.prefs = {};
    this.castings = {
      rounding: (val) => { let res = Math.round(val / this.ROUND_NUM) * this.ROUND_NUM; this.ROUND_NUM = val; return res; },
      int: (val) => parseInt(val),
      hexbase: (val) => { this.HEX_BASE = val; return val; },
      deldepth: (val) => { this.delete_depth = val; return val;},
      float: (val) => parseFloat(val),
      double: (val) => parseFloat(val), // JS doesn't distinguish double
      num: (val) => parseFloat(val),    // default num = float

      bool: (val) => {
        if (this.typeof(val) === "string") return val.toLowerCase() === "true";
        return Boolean(val);
      },

      string: (val) => String(val),

      char: (val) => String(val)[0] || '',

      bigint: (val) => {
        try {
          return BigInt(val);
        } catch {
          return 0n;
        }
      },

      u8: (val) => parseInt(val) & 0xFF,
      u16: (val) => parseInt(val) & 0xFFFF,
      u32: (val) => parseInt(val) >>> 0, // force unsigned 32-bit
      i8: (val) => (parseInt(val) << 24) >> 24,
      i16: (val) => (parseInt(val) << 16) >> 16,
      i32: (val) => parseInt(val) | 0,

      f32: (val) => Math.fround(val),   // 32-bit float precision
      f64: (val) => parseFloat(val),    // default JS float (64-bit)
      dignum: (val) => DigitNumber.fromDecimal(val, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]).digits.reverse().join(''),
      json: val => JSON.stringify(val),
      json_obj: val => JSON.parse(val),
      value: val => this.evaluateExpr(val),
    };
    this.gears = {};
    this.backups = {};
    this.dynamicKeywords = {};
    this.istreams = {};
    this.fnstreams = {};
this.QAEs = {
  // numbers
  even: (a) => a % 2 === 0,
  odd: (a) => a % 2 !== 0,
  integer: (a) => Number.isInteger(a),
  float: (a) => typeof a === "number" && !Number.isInteger(a),
  positive: (a) => typeof a === "number" && a > 0,
  negative: (a) => typeof a === "number" && a < 0,
  zero: (a) => a === 0,
  finite: (a) => Number.isFinite(a),
  infinite: (a) => a === Infinity || a === -Infinity,

  // nullish
  isnull: (a) => a === null || a === undefined,
  defined: (a) => a !== undefined,
  nan: (a) => Number.isNaN(a),

  // strings
  trimable: (a) => typeof a === "string" && a.trim().length !== a.length,
  trim: (a) => typeof a === "string" ? a.trim() : a,
  uppercase: (a) => typeof a === "string" ? a.toUpperCase() : a,
  lowercase: (a) => typeof a === "string" ? a.toLowerCase() : a,
  numeric: (a) => typeof a === "string" && /^[0-9]+$/.test(a),
  alpha: (a) => typeof a === "string" && /^[a-zA-Z]+$/.test(a),
  alnum: (a) => typeof a === "string" && /^[a-zA-Z0-9]+$/.test(a),
  blank: (a) => typeof a === "string" && a.trim() === "",
  palindrome: (a) =>
    typeof a === "string" &&
    a.toLowerCase().replace(/\s+/g, "") ===
    a.toLowerCase().replace(/\s+/g, "").split("").reverse().join(""),

  // arrays / collections
  empty: (a) =>
    (Array.isArray(a) && a.length === 0) ||
    (typeof a === "string" && a.length === 0) ||
    (a && typeof a === "object" && Object.keys(a).length === 0),
  nonempty: (a) => !this.QAEs.empty(a),
  unique: (a, i, arr) => arr.indexOf(a) === i,
  first: (a) => Array.isArray(a) ? a[0] : null,
  last: (a) => Array.isArray(a) ? a[a.length - 1] : null,
  length: (a) => (a != null && (a.length !== undefined)) ? a.length : null,

  // booleans
  truthy: (a) => !!a,
  falsy: (a) => !a,

  // dates / time
  today: (a) => {
    if (!(a instanceof Date)) return false;
    const n = new Date();
    return a.toDateString() === n.toDateString();
  },
  past: (a) => a instanceof Date && a < new Date(),
  future: (a) => a instanceof Date && a > new Date(),
  weekend: (a) => a instanceof Date && [0,6].includes(a.getDay()),
  weekday: (a) => a instanceof Date && ![0,6].includes(a.getDay()),

  // types
  string: (a) => typeof a === "string",
  number: (a) => typeof a === "number",
  boolean: (a) => typeof a === "boolean",
  object: (a) => typeof a === "object" && a !== null && !Array.isArray(a),
  array: (a) => Array.isArray(a),
  function: (a) => typeof a === "function",
  date: (a) => a instanceof Date,
  regexp: (a) => a instanceof RegExp,

  // fun extras Nova can brag about
  prime: (a) => {
    if (typeof a !== "number" || a < 2) return false;
    for (let i = 2; i <= Math.sqrt(a); i++) if (a % i === 0) return false;
    return true;
  },
  composite: (a) => typeof a === "number" && a > 1 && !this.QAEs.prime(a),
  oddprime: (a) => this.QAEs.prime(a) && a % 2 !== 0,

  vowel: (a) => typeof a === "string" && /^[aeiou]$/i.test(a),
  consonant: (a) => typeof a === "string" && /^[bcdfghjklmnpqrstvwxyz]$/i.test(a),
};
    this.version = 3.0;
    this.delete_depth = 2;
    this.LAST_BU_ID = '0';
    this.branches = {};
    // ...existing code...
    this.keywordsArray = [
      // Control Flow
      'if', 'else', 'unless', 'while', 'do', 'repeat', 'for', 'loop', 'break', 'continue', 'return', 'give', 'try', 'catch', 'finally', 'throw', 'Terminate', 'exit', 'expect', 'expt', 'match', 'switch', 'until', 'when', 'with', 'foreach', 'engage', 'rate', 'cast', 'comment', 'end', 'call_code',

      // Variables & Data
      'var', 'let', 'const', 'array', 'enum', 'map', 'struct', 'type', 'classify' ,'macro', 'session', 'enter', 'backup', 'retrieve', 'delete', 'addto',

      // Functions & Blocks
      'func', 'function', 'ifunc', 'defunc', 'lambda', 'compose', 'partial', 'block', 'snippet', 'template', 'keyfunc', 'implements', 'interface',

      // I/O & System
      'print', 'println', 'log', 'logln', 'logO', 'banner', 'windowUI', 'UI', 'input', 'getpress', 'beep', 'term', 'exec', 'execFile', 'createFile', 'deleteFile', 'listFiles', 'readFile', 'write', 'require', 'import', 'plugin', 'server', 'invoke', 'sleep', 'wait', 'infer', "'IS CLI'",

      // Device/Termux Integration
      'notify', 'toast', 'vibrate', 'clipboard', 'copy', 'paste', 'open', 'ringtones', 'brightness', 'set_brightness', 'battery_status', 'sms_send', 'call_log', 'contact_list', 'camera', 'camera_photo', 'torch', 'wifi_info', 'location', 'microphone_record', 'microphone_stop', 'dialog',

      // Math & Utils
      'math', 'random', 'sum', 'range', 'reverse', 'ascii', 'chars', 'keys', 'uuid', 'jsonParse', 'jsonStringify', 'parseURL', 'sha256', 'randomBytes', 'sandbox', 'osPlatform', 'cpu', 'mem', 'userInfo', 'network', 'uptime', 'hostname', 'arch', 'load', 'tmpDir', 'pathDir', 'pathBase', 'pathExt', 'pathJoin', 'pid', 'cwd', 'env', 'platform', 'exists',

      // Streams & Patterns
      'stream', 'istream', 'fnstream', 'pattern',

      // Other
      'using', 'unuse', 'out.clear', 'out.loggable', 'out.reload', 'skip', 'tb$', 'b$', 'k$', 'tk$', 'js$', 'tjs$', 'p$', 'l$', 'e$'
    ];
    // Nova: comprehensive escape map.
    // Tip: in your parser, do: const key = name.toLowerCase();
    // Then look up `ESC[key]` (so \Tab == \tab).
    function color(n, isBg = false) {
      n = Math.max(0, Math.min(255, n | 0)); // clamp to [0,255]
      return `\x1b[${isBg ? 48 : 38};5;${n}m`;
    }

    function reset() {
      return "\x1b[0m";
    }
    this.escapes = {
      // --- core one-char escapes ---
      "\\": "\\",
      '"': '"',
      "'": "'",
      "`": "`",
      "/": "/",

      n: "\n", newline: "\n", lf: "\n",
      r: "\r", return: "\r", cr: "\r",
      t: "\t", tab: "\t", ht: "\t",
      b: "\b", backspace: "\b", bs: "\b",
      f: "\f", formfeed: "\f", ff: "\f",
      v: "\v", verticaltab: "\v", vt: "\v",

      "0": "\0", nul: "\0", null: "\0", zero: "\0",
      a: "\x07", bell: "\x07", alert: "\x07", bel: "\x07",
      e: "\x1B", esc: "\x1B", escape: "\x1B",

      s: " ", space: " ",
      nbsp: "\u00A0", zwsp: "\u200B", zwnj: "\u200C", zwj: "\u200D",
      bom: "\uFEFF",

      dq: '"', doublequote: '"',
      sq: "'", singlequote: "'",
      bslash: "\\", backslash: "\\",
      slash: "/",

      // --- line/paragraph separators ---
      ls: "\u2028", linesep: "\u2028",
      ps: "\u2029", parasep: "\u2029",

      // --- unicode/math/random functions ---
      u: (hex) => String.fromCodePoint(parseInt(hex, 16)),       // \u{XXXX}
      x: (hex) => String.fromCharCode(parseInt(hex, 16)),        // \xHH
      o: (oct) => String.fromCharCode(parseInt(oct, 8)),         // \oNNN
      c: (char) => String.fromCharCode(char.toUpperCase().charCodeAt(0) ^ 0x40), // \cA

      rand: (max) => String(Math.floor(Math.random() * (parseInt(max) || 100))), // \rand{100}
      hex: (num) => (parseInt(num) || 0).toString(16),          // \hex{255} => ff
      bin: (num) => (parseInt(num) || 0).toString(2),           // \bin{5} => 101
      octal: (num) => (parseInt(num) || 0).toString(8),         // \octal{64} => 100

      repeat: (arg) => {                                        // \repeat{n:text}
        const [n, text] = this.parseArr(arg, ':', true);
        return text.repeat(parseInt(n) || 1);
      },

      smile: () => "😏",
      heart: () => "❤️",
      star: () => "⭐",
      fire: () => "🔥",
      color: color,
      reset: reset(),
    };
    this.functions = {};
    this.enums = {};
    this.stripLC = function (char, code) {
      if (this.operators?.[char]) return code;

      return code
        .split('\n')
        .map((line) => {
          let inQuote = null;
          let escaped = false;

          for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            if (escaped) {
              escaped = false;
              continue;
            }

            if (ch === '\\') {
              escaped = true;
              continue;
            }

            if (inQuote) {
              if (ch === inQuote) inQuote = null;
            } else if (ch === '"' || ch === "'" || ch === '`') {
              inQuote = ch;
            } else if (ch === char) {
              // found the comment char outside of a string
              return line.slice(0, i).trimEnd();
            }
          }

          return line; // no comment char found outside of quotes
        })
        .join('\n');
    };
    this.structs = {};
    this.customComments = {};
    this.cctx = 'program';
    this.desarr = [];
    this.typenames = {};
    this.typeops = {};
    this.hiddens = {};
this.ref = {
  ref: undefined,

  set: (obj, key) => {
    this.ref.ref = { obj, key };
  },

  assign: (v) => {
    if (this.ref.ref) {
      this.ref.ref.obj[this.ref.ref.key] = v;
    }
  },

  get: () => {
    if (this.ref.ref) {
      return this.ref.ref.obj[this.ref.ref.key];
    }
    return undefined;
  }
};
    this.maps = {};
this.ptr = (ptr, val) => {
  let pointer = Pointers();
  let p = pointer.alloc(1000000000000000000000000000);

  let writers = {
   'integer': pointer.writeInt,
   'float': pointer.writeFloat,
   'string': pointer.writeString,
   'bool': pointer.writeBool,
   'array': pointer.writeArray,
  };

  let readers = {
   'integer': pointer.readInt,
   'float': pointer.readFloat,
   'string': pointer.readString,
   'bool': pointer.readBool,
   'array': pointer.readArray,
  }
  let classes = {
    'integer': Number,
    'float': Number,
    'string': String,
    'bool': Boolean,
    'array': Array,
  };
  let type = this.typeof(val);
  let writeFn = writers[type];
  let readFn = readers[type];
  writeFn(p, val);
   class PointerClass extends classes[type] {
    constructor(value, address) {
      super(value);
      this.address = address;
      this.__isPointerNumber = true;
      this.free = () => pointer.free(address);
    }
    valueOf() {
      return super.valueOf();          // return primitive safely
    }

    toString() {
      return super.toString();
    }

    [Symbol.toPrimitive](hint) {
      return super.valueOf();          // FIXED recursion
    }

    [util.inspect.custom]() {
      return super.valueOf();
    }
    static [Symbol.hasInstance](instance) { return instance && instance.__isPointerNumber === true; }
  }
let vv = typeof val === 'string' ? val.length : 100000000000;
  Object.defineProperty(this.maps, ptr, {
    get() {
      return new PointerClass(readFn(p, vv), p);
    },
    set(v) {
      if (typeof v === 'string') vv = v.length;
      writeFn(p, v);
    },
    configurable: true,
    enumerable: true
  });
};
    this.maps.nv = {
      deepClone: (obj) => cloneDeep(obj),
      generators: {
	 func: (func) => ((str) => (() => func(str))),
      },
      globalDecl: (a,b) => this._backups[this.LAST_BU_ID].maps[a] = b,
      pointer: () => Pointers(),
      natives: {
        utils: () => Utills(),
      },

      ncurses: () => require('../natives/ncurses'),

      convcase: (str, args) => convertCase(str, args),

      signals: () => require('../natives/signals'),
      typesys: () => require('../natives/types'),
      crout: () => require('../natives/coroutines'),
      dl: () => require('../natives/dl'),

      instance: (a, ...args) => new a(args),

      inspector: (a) => this[a],
meta: {
arr_obj: {
      OBJ_KEV: () => this.OBJ_KEV,
      OBJ_DEV: () => this.OBJ_DEV,
      NOVAL_ARR_DEV: () => this.NOVAL_ARR_DEV,
      ARR_DEV: () => this.ARR_DEV,
      SetKd: (cont, val, devOrKev) => {
    if (cont === 'arr') {
        this.ARR_DEV = val;
    } else if (cont === 'noval_arr') {
        this.NOVAL_ARR_DEV = val;
    } else if (cont === 'obj') {
        if (devOrKev === 'dev') {
            this.OBJ_DEV = val;
        } else if (devOrKev === 'kev') {
            this.OBJ_KEV = val;
        } else {
            throw new Error("For 'obj', devOrKev must be 'dev' or 'kev'");
        }
    } else {
        throw new Error("Invalid cont type. Must be 'arr', 'noval_arr', or 'obj'");
    }
},
},
},
      randoms: {
        name: () => randomName(),
        word: randomWord,
      },
      digitNumber: (...a) => new DigitNumber(...a),
      webfirm: webfirm,
      math: {
        add: { args: ['a', 'b'], body: 'give a + b;' },
        sub: { args: ['a', 'b'], body: 'give a - b;' },
        mul: { args: ['a', 'b'], body: 'give a * b;' },
        div: { args: ['a', 'b'], body: 'give a / b;' },
        mod: { args: ['a', 'b'], body: 'give a % b;' },
        pow: { native: (_ctx, a, b) => Math.pow(a, b) },
        floor: { native: (_ctx, a) => Math.floor(a) },
        ceil: { native: (_ctx, a) => Math.ceil(a) }, // Corrected Math.ciel to Math.ceil
        round: { native: (_ctx, a) => Math.round(a) },
        rand: { native: (_ctx, min = 0, max = 1) => Math.random() * (max - min) + min },
        static_pi: Math.PI,
        pi: (n) => pi(n),
        log2e: Math.LOG2E,
        log20e: Math.log(Math.E) / Math.log(20),
        loge_: (a) => Math.log(Math.E) / Math.log(a),
        sqrt1_2: Math.SQRT1_2,
        sqrt2: Math.SQRT2,
        log10e: Math.LOG10E,
        e: Math.E,
        ln2: Math.LN2,
        ln10: Math.LN10,
        abs: Math.abs,
        sign: Math.sign,
        trunc: Math.trunc,
        sqrt: Math.sqrt,
        cbrt: Math.cbrt,
        exp: Math.exp,
        log: Math.log,
        log2: Math.log2,
        log10: Math.log10,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        asin: Math.asin,
        acos: Math.acos,
        atan: Math.atan,
        atan2: Math.atan2,
        sinh: Math.sinh,
        cosh: Math.cosh,
        tanh: Math.tanh,
        asinh: Math.asinh,
        acosh: Math.acosh,
        atanh: Math.atanh,
        expm1: Math.expm1,
        fround: Math.fround,
        hypot: (a) => Math.hypot(...a),
        clz32: Math.clz32,
        imul: Math.imul,
        log1p: Math.log1p,
        min: (a) => Math.min(...a),
        max: (a) => Math.max(...a),
        sec: (x) => 1 / Math.cos(x),
        csc: (x) => 1 / Math.sin(x),
        cot: (x) => 1 / Math.tan(x),
        deg2rad: (deg) => deg * (Math.PI / 180),
        rad2deg: (rad) => rad * (180 / Math.PI),
        roundTo: (value, decimals = 0) => {
          const factor = 10 ** decimals;
          return Math.round(value * factor) / factor;
        },
        floorTo: (value, decimals = 0) => {
          const factor = 10 ** decimals;
          return Math.floor(value * factor) / factor;
        },
        ceilTo: (value, decimals = 0) => {
          const factor = 10 ** decimals;
          return Math.ceil(value * factor) / factor;
        },
        deg2grad: (deg) => deg * (200 / 180),
        grad2deg: (grad) => grad * (180 / 200),
        sec2: (x) => 1 / Math.cos(x),
        csc2: (x) => 1 / Math.sin(x),
        cot2: (x) => 1 / Math.tan(x),
        factorial: (n) => (n <= 1 ? 1 : n * math.factorial(n - 1)),
        isPrime: (n) => {
          if (n <= 1) return false;
          for (let i = 2; i <= Math.sqrt(n); i++) if (n % i === 0) return false;
          return true;
        },
        gcd: (a, b) => (!b ? a : math.gcd(b, a % b)),
        lcm: (a, b) => (a * b) / math.gcd(a, b),
        fib: (n) => {
          let a = 0, b = 1;
          while (n-- > 0) [a, b] = [b, a + b];
          return a;
        },
        randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
        clamp: (value, min, max) => Math.min(Math.max(value, min), max),
        lerp: (a, b, t) => a + (b - a) * t,
        invLerp: (a, b, v) => (v - a) / (b - a),
        smoothstep: (min, max, x) => {
          let t = math.clamp((x - min) / (max - min), 0, 1);
          return t * t * (3 - 2 * t);
        },
        sqr: (x) => x * x,
        cube: (x) => x * x * x,
        hypot3: (x, y, z) => Math.hypot(x, y, z),
        mean: (arr) => arr.reduce((s, v) => s + v, 0) / arr.length,
        median: (arr) => {
          const a = [...arr].sort((x, y) => x - y);
          const mid = Math.floor(a.length / 2);
          return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
        },
        factorialIter: (n) => {
          let res = 1;
          for (let i = 2; i <= n; i++) res *= i;
          return res;
        },
        perm: (n, r) => math.factorial(n) / math.factorial(n - r),
        comb: (n, r) => math.factorial(n) / (math.factorial(r) * math.factorial(n - r)),
        isEven: (n) => n % 2 === 0,
        isOdd: (n) => n % 2 !== 0,
        sum: (arr) => arr.reduce((a, b) => a + b, 0),
        prod: (arr) => arr.reduce((a, b) => a * b, 1),
        variance: (arr) => {
          const m = math.mean(arr);
          return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
        },
        stdDev: (arr) => Math.sqrt(math.variance(arr)),
        degrees: (rad) => rad * 180 / Math.PI,
        radians: (deg) => deg * Math.PI / 180,
        signum: (x) => (x > 0 ? 1 : x < 0 ? -1 : 0),
        negate: (x) => -x,
        reciprocal: (x) => 1 / x,
        hypot4: (a, b, c, d) => Math.hypot(a, b, c, d),
        roundExp: (x, n = 0) => +(x.toExponential(n)),
        sumSquares: (arr) => arr.reduce((s, v) => s + v * v, 0),
        prodSquares: (arr) => arr.reduce((p, v) => p * v * v, 1),
        cubeRoot: (x) => Math.cbrt(x),
        modulo: (a, b) => ((a % b) + b) % b,
      },

      // string map methods (called as string.upper("hello"), string.split("hello,world", ","))
      // These are utility functions that take the string as their first explicit argument.
      string: {
        upper: { native: (_ctx, str) => (str + '').toUpperCase() },
        lower: { native: (_ctx, str) => (str + '').toLowerCase() },
        reverse: { native: (_ctx, str) => (str + '').split('').reverse().join('') },
        length: { native: (_ctx, str) => (str + '').length },
        split: { native: (_ctx, str, sep) => (str + '').split(sep || '') },
        trim: { native: (_ctx, str) => (str + '').trim() },
        substring: { native: (_ctx, str, start, end) => (str + '').substring(start, end) },
        slice: { native: (_ctx, str, start, end) => (str + '').slice(start, end) },
        charAt: { native: (_ctx, str, index) => (str + '').charAt(index) },
        charCodeAt: { native: (_ctx, str, index) => (str + '').charCodeAt(index) },
        indexOf: { native: (_ctx, str, searchStr, fromIndex = 0) => (str + '').indexOf(searchStr, fromIndex) },
        lastIndexOf: { native: (_ctx, str, searchStr, fromIndex) => (str + '').lastIndexOf(searchStr, fromIndex === undefined ? (str + '').length - 1 : fromIndex) },
        includes: { native: (_ctx, str, searchStr) => (str + '').includes(searchStr) },
        startsWith: { native: (_ctx, str, searchStr, position = 0) => (str + '').startsWith(searchStr, position) },
        endsWith: { native: (_ctx, str, searchStr, length) => (str + '').endsWith(searchStr, length === undefined ? (str + '').length : length) },
        replace: { native: (_ctx, str, searchValue, replaceValue) => (str + '').replace(searchValue, replaceValue) }, // Replaces first occurrence
        replaceAll: {
          native: (_ctx, str, searchValue, replaceValue) => { // New: for global replacement
            let regex;
            if (searchValue instanceof RegExp) {
              regex = new RegExp(searchValue.source, searchValue.flags.includes('g') ? searchValue.flags : searchValue.flags + 'g');
            } else {
              const escapedSearchValue = (searchValue + '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              regex = new RegExp(escapedSearchValue, 'g');
            }
            return (str + '').replace(regex, replaceValue);
          }
        },
        repeat: { native: (_ctx, str, count) => (str + '').repeat(count) },
        padStart: { native: (_ctx, str, targetLength, padString = ' ') => (str + '').padStart(targetLength, padString) },
        padEnd: { native: (_ctx, str, targetLength, padString = ' ') => (str + '').padEnd(targetLength, padString) },
        ltrim: { native: (_ctx, str) => (str + '').replace(/^\s+/, '') },
        rtrim: { native: (_ctx, str) => (str + '').replace(/\s+$/, '') },

        // Regex-specific methods in maps.string (take string as arg)
        match: (str, pattern, flags = '') => {
            const regex = this.novaRegex(pattern, flags); // Use _ctx.novaRegex
            return (str + '').match(regex);
        },
        test: {
          native: (_ctx, str, pattern, flags = '') => {
            const regex = _ctx.novaRegex(pattern, flags); // Use _ctx.novaRegex
            return regex.test(str + '');
          }
        },
        search: { // Returns index of first match
          native: (_ctx, str, pattern, flags = '') => {
            const regex = _ctx.novaRegex(pattern, flags); // Use _ctx.novaRegex
            return (str + '').search(regex);
          }
        },
        // 'remove' in maps.utils already handles global replacement for string literals.
        // If you want a regex-based `string.remove` here, it would be redundant with replaceAll.
      },

      use: (e) => this.options[e] = true,

      int: (...f) => parseInt(...f),

      binutils: {
        toUtf32: (input, base = 'binary') => {
          let num;
          switch (base) {
            case 'binary':
              num = parseInt(input, 2);
              break;
            case 'hex':
              num = parseInt(input.replace(/^0x/, ''), 16);
              break;
            case 'decimal':
              num = Number(num);
              break;
            default:
              throw "unsupported base"
          }

          if (isNaN(num) || num < 0 || num > 0x10FFFF) {
            throw new RangeError('Invalid unicode Utf32 code point')
          };
          return String.fromCodePoint(num);
        }
      },

      utils: {
        closestMatch: (arr, word) => findClosestMatch(arr, word),
        rngstr: (arr) => arr[parseInt(Math.abs(Math.random() * arr.length))],
        ArrayMatch: (arr, str) => findTokenMatchInString(str, arr),
        // This 'remove' is in utils, not string varMethods, and is global.
        // It's fine to keep it here if it's meant as a general utility.
        remove: (str, bit) => (str + '').split(bit).join(''),
        join: (arr, separator = ',') => arr.join(separator),
        isDigit: (char) => /^\d$/.test(char + ''),
        isLetter: (char) => /^[a-zA-Z]$/.test(char + ''),
        isAlphaNumeric: (char) => /^[a-zA-Z0-9]$/.test(char + ''),
        stripChars: (str, charsToRemove) => {
          const pattern = new RegExp(`^[${charsToRemove}]+|[${charsToRemove}]+$`, 'g');
          return (str + '').replace(pattern, '');
        },
        count: (str, subStr) => {
          let count = 0;
          let idx = (str + '').indexOf(subStr);
          while (idx !== -1) {
            count++;
            idx = (str + '').indexOf(subStr, idx + subStr.length);
          }
          return count;
        }
      },

      bridge: this.bridge,

      time: {
        now: { native: () => Date.now() },
        iso: { native: () => new Date().toISOString() },
        ms: { native: () => (new Date()).getMilliseconds() }
      },

      json: {
        parse: { native: (_ctx, str, reviver) => { try { return JSON.parse(str, reviver); } catch (e) { return "❌ JSON error: " + e.message; } } },
        stringify: { native: (_ctx, obj, replacer, space) => { try { return JSON.stringify(obj, replacer, space); } catch (e) { return "❌ Stringify error: " + e.message; } } }
      },

      goblify: { leave: () => { return; } },

      fs: {
        read: (path) => { try { return fs.readFileSync(path, 'utf8'); } catch (e) { return "❌ Read error: " + e.message; } },
        write: { native: (_ctx, path, data) => { try { require('fs').writeFileSync(path, data + '', 'utf8'); return "✅ Written to " + path; } catch (e) { return "❌ Write error: " + e.message; } } },
        exists: { native: (_ctx, path) => { try { return require('fs').existsSync(path); } catch (e) { return "exists error: " + e.message; } } },
        delete: { native: (_ctx, path) => { try { require('fs').unlinkSync(path); return "✅ Deleted " + path; } catch (e) { return "❌ Delete error: " + e.message; } } },
        mkdir: { native: (_ctx, path) => { try { require('fs').mkdirSync(path, { recursive: true }); return "✅ Created directory " + path; } catch (e) { return "❌ Mkdir error: " + e.message; } } },
        rmdir: { native: (_ctx, path) => { try { require('fs').rmdirSync(path, { recursive: true }); return "✅ Removed directory " + path; } catch (e) { return "❌ Rmdir error: " + e.message; } } },
        stat: { native: (_ctx, path) => { try { return require('fs').statSync(path); } catch (e) { return "❌ Stat error: " + e.message; } } },
        readdir: { native: (_ctx, path) => { try { return require('fs').readdirSync(path); } catch (e) { return "❌ Readdir error: " + e.message; } } },
        list: { native: (_ctx, dir) => { try { const files = require('fs').readdirSync(dir); return files.map(file => { const filePath = require('path').join(dir, file);  }); } catch (e) { return "❌ List files error: " + e.message; } } },
        append: (f, data) => fs.appendFileSync(f, data),
      },

      describe: (expr) => this.desarr.push(expr),

      schedule: (fn, time) => {setTimeout(fn, time)},

      immediate: (fn) => {setImmediate(fn)},

      interval: (fn, time) => {setInterval(fn, time)},

      queqeTask: (fn) => {queqeMicrotask(fn)},

      nextTick: (fn) => {process.nextTick(fn)},  // Node-only, runs **before** all other microtasks

      promise: (fn) =>  {Promise.resolve().then(fn)}, // schedule as a microtask via Promise

      immediateInterval: (fn) => {
        const run = () => { fn(); setImmediate(run); };
        setImmediate(run);
      },

      argvs: process.argv.slice(2),
debug: {
  trace: (length = 5) => {
    const err = {};
    Error.captureStackTrace(err, this.maps.debug.trace);
    console.log((err.stack || '').split('\n').slice(1, 1 + length).join('\n'));
  },
  log: (...args) => this.debug(...args),
},
      code: {
        descrp: () => this.desarr.join(',\n'),
        stack: (...args) => getStackFrames(...args),
        exec: (str) => this.run(str),
        eval: (expr) => this.evaluateExpr(expr),
        tickOne: (code) => process.nextTick(() => this.run(code)),
        tick: (ticks, code) => execTicks(ticks, () => this.run(code)),
        await: (code, ticks = 0) => this.awaitSync(async () => this.run(code), ticks),
        defer: (code, ticks = 0) => this.awaitSync(async () => this.run(code), ticks),
        kill: (pid = process.pid, sig = "SIGINT") => process.kill(pid, sig),
        abort: () => process.abort(),
        addToGlobalEnv: (vname, value) => {
          globalThis[vname] = value;
        },
        repeat: (n, code) => {
          for (let i = 0; i < n; i++) {
            this.run(code);
          }
        },
        load: (src) => this.run(require('fs').readFileSync(src, 'utf8')),
      },

      node: {
        global: () => getGlobal(),
        require: (mod) => require(mod),

        run: (code) => {
          try {
            return eval(code);
          } catch (err) {
            console.error("[node.run error]", err);
          }
        },

        access: (name) => globalThis[name],

        assign: (name, val) => {
          globalThis[name] = val;
          return val;
        },

        has: (name) => typeof globalThis[name] !== 'undefined',

        entries: () => Object.entries(globalThis),
        keys: () => Object.keys(globalThis),
        values: () => Object.values(globalThis),

        async: (fn) => {
          if (typeof fn !== 'function') {
            throw new TypeError("node.async expects a function");
          }
          (async () => {
            try {
              await fn();
            } catch (e) {
              console.error("[node.async error]", e);
            }
          })();
        },

        execFile: (path) => {
          const fs = require("fs");
          if (!fs.existsSync(path)) throw new Error("File not found: " + path);
          return eval(fs.readFileSync(path, 'utf8'));
        },

        delay: (ms, code) => {
          setTimeout(() => {
            try {
              eval(code);
            } catch (e) {
              console.error("[node.delay error]", e);
            }
          }, ms);
        },

        nextTick: (code) => {
          process.nextTick(() => {
            try {
              eval(code);
            } catch (e) {
              console.error("[node.nextTick error]", e);
            }
          });
        },

        process: () => process,
        self: () => globalThis
      },

      lua: luaEnv.lua,
py: require('../natives/python'),
bf: require('../natives/bf'),
      wasm: WebAssembly,

      rand: {
        int: { native: (_ctx, min = 0, max = 100) => Math.floor(Math.random() * (max - min + 1)) + min },
        bool: { native: () => Math.random() < 0.5 }
      },
      regex: {
        // These are global regex utilities, might be redundant with varMethods.string.match/test
        test: (pattern, expr, flags = '') => {
          const regex = this.novaRegex(pattern, flags);
          return regex.test(expr);
        },
        match: (pattern, expr, flags = '') => {
          const regex = this.novaRegex(pattern, flags);
          return expr.match(regex);
        },
        exec: (pattern, expr, flags = '') => {
          const regex = this.novaRegex(pattern, flags);
          return regex.exec(expr);
        },
      },
      path: {
        join: { native: (_ctx, ...segments) => require('path').join(...segments) },
        basename: { native: (_ctx, p) => require('path').basename(p) },
        extname: { native: (_ctx, p) => require('path').extname(p) }
      },

      log: {
        text: { native: (_ctx, text) => { if (_ctx.loggable) { console.log(text); } return text; } },
        banner: { native: (_ctx, text) => { if (_ctx.loggable) { require('figlet').text(`\n=== ${text} ===\n`); } return text; } },
        error: { native: (_ctx, text) => { if (_ctx.loggable) { console.error(new Error(`${text}`)); } return text; } },
        warn: { native: (_ctx, text) => { if (_ctx.loggable) { console.warn(`${text}`); } return text; } },
        info: { native: (_ctx, text) => { if (_ctx.loggable) { console.info(`${text}`); } return text; } },
        debug: { native: (_ctx, text) => { if (_ctx.loggable) { console.debug(`${text}`); } return text; } },
        table: { native: (_ctx, data) => { if (_ctx.loggable) { console.table(data); } return data; } }
      },
      input: {
        read: (...args) => prompt(...args),
        obj: prompt
      },
RAII: (value, options = {}) => {
  // Create a RAII “object wrapper”
  const obj = {
resolver: true, resolvers: { val: value },
    _destructor: options.destructor || null,
    ttl: options.ttl || null,
    do_not: { delete: options.keep || false },
    __reassign: options.reassign || null,
  };
  return obj;
},
rctx: (...args) => this.restoreObject(...args),
gctxs: () => Object.keys(this._backups),
      outdex: {
        getfn: (ztr) => this.extractFn(ztr),
        secondTerm: (obj, exclude = []) => {
          const merged = {};
          for (const entry of Object.values(obj)) {
            for (const [key, value] of Object.entries(entry)) {
              if (!exclude.includes(key)) {
                merged[key] = value;
              }
            }
          }
          return merged;
        },
        linker: (name) => this.extract(name),
        setType: (val, name, opts = {}) => {
          return { value: val, getType: () => name, typeProperties: { isType: true, ...{ ...opts } }, ...{ ...opts?.metadata } };
        },
        setInvert: (fn, val = !fn()) => {
          return { typeProperties: { isType: true, toOpposite: fn }, toOpposite: fn, value: val };
        },
        Resolver: (v, otr = {}) => { return { ...{ ...otr }, resolver: true, resolvers: { val: v } }; },
      },
      module: {
        import: this.import,
        exists(name) {
          try {
            this.import(name);
            return true;
          } catch {
            return false;
          }
        },
	info: (name) => {
      const tryRequire = (p) => {
        try { return require(p); } catch { return null; }
      };

      // --- Local (no .nvroot) check ---
      const localMap = tryRequire('./.nova_modules.js');
      const localEntry = localMap?.[name];
      if (localEntry) return localEntry.info;

      const localFile = (f) => path.resolve('./.nova_modules', f);
      const localPaths = [localFile(name), localFile(name)];
      for (const p of localPaths) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          const mod = tryRequire(p);
          if (mod) return mod.info;
        }
      }

      // --- Fallback to .nvroot-based project lookup ---
      let dir = process.cwd();
      while (!fs.existsSync(path.join(dir, '.nvroot'))) {
        const parent = path.dirname(dir);
        if (parent === dir) throw new Error('No .nvroot found');
        dir = parent;
      }

      const rootMap = tryRequire(path.join(dir, '.nova_modules.js'));
      const rootEntry = rootMap?.[name];
      if (rootEntry) return rootEntry.info;

      const dirs = ['.nova_modules', 'nova_modules'];
      for (const d of dirs) {
        const base = path.join(dir, d);
        const pathsToTry = [
          path.join(base, name + '.js'),
          path.join(base, name)
        ];
        for (const p of pathsToTry) {
          if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const mod = tryRequire(p);
            if (mod) return mod.info;
          }
        }
      }

      throw new Error(`Module "${name}" not found`, { callStack: [localFile, localPaths] });
	},
        list() {
          const modules = new Set();
          const tryRequire = (p) => { try { return require(p); } catch { return null; } };

          const localMap = tryRequire('./.nova_modules.js');
          if (localMap) Object.keys(localMap).forEach((k) => modules.add(k));

          const folder = './.nova_modules';
          if (fs.existsSync(folder)) {
            fs.readdirSync(folder).forEach((f) => {
              if (f.endsWith('.js')) modules.add(f.slice(0, -3));
              else modules.add(f);
            });
          }

          return Array.from(modules);
        },
        reload(name) {
          const resolve = require.resolve;
          const clearCache = (p) => {
            try { delete require.cache[resolve(p)]; } catch { }
          };

          // clear local .js modules
          clearCache(`./.nova_modules/${name}.js`);
          clearCache(`./.nova_modules/${name}`);

          // clear root level if found
          let dir = process.cwd();
          while (!fs.existsSync(path.join(dir, '.nvroot'))) {
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
          }

          const paths = [
            path.join(dir, '.nova_modules', `${name}.js`),
            path.join(dir, '.nova_modules', name),
            path.join(dir, 'nova_modules', `${name}.js`),
            path.join(dir, 'nova_modules', name)
          ];
          paths.forEach(clearCache);

          return this.import(name);
        },
        from: (name, opts = {}) => {
          const fs = require('fs');
          const path = require('path');
          const tryRequire = (p) => { try { return require(p); } catch { return null; } };

          const {
            path: customPath,
            run = true,
            fallback = null,
            strict = true,
            exportsOnly = false
          } = opts;

          if (customPath) {
            const resolved = path.resolve(customPath);
            if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
              const mod = tryRequire(resolved);
              if (mod) return mod.exports ?? (exportsOnly ? null : mod);
            }
            if (!strict) return fallback;
            throw new Error(`module.from: Cannot load "${customPath}"`);
          }

          const localMap = tryRequire('./.nova_modules.js');
          const entry = localMap?.[name];
          if (entry) {
            if (entry.exports) return entry.exports;
            if (!exportsOnly && run && typeof module.run === 'function') {
              return module.run(entry.code);
            }
            return exportsOnly ? null : entry;
          }

          if (!strict) return fallback;
          throw new Error(`module.from: "${name}" not found`);
        }
      },
    };
    this.maps.shared = {
      ...JSON.parse(fs.readFileSync(path.join(__dirname,'./.env'), 'utf8')),
    };

this.maps.nv = denative(this.maps.nv, this);

this.varMethods = {
  string: {
    remove: (str, bit) => (str + '').split(bit).join(''),
    strip: (str, index) => {
      const idx = typeof index === 'string' ? parseInt(index, 10) : index;
      if (isNaN(idx)) return str;
      return str.slice(0, idx) + str.slice(idx + 1);
    },

    upper: (str) => str.toUpperCase(),
    lower: (str) => str.toLowerCase(),
    reverse: (str) => str.split('').reverse().join(''),
    length: (str) => str.length,
    split: (str, sep) => str.split(sep instanceof RegExp ? sep : sep === undefined ? undefined : sep + ''),
    trim: (str) => str.trim(),
    substring: (str, start, end) => str.substring(start, end),
    substr: (str, start, length) => str.substr(start, length),
    slice: (str, start, end) => str.slice(start, end),
    charAt: (str, index) => str.charAt(index),
    charCodeAt: (str, index) => str.charCodeAt(index),
    codePointAt: (str, index) => str.codePointAt(index),
    concat: (str, ...strings) => str.concat(...strings),
    includes: (str, search, pos = 0) => str.includes(search, pos),
    indexOf: (str, search, pos = 0) => str.indexOf(search, pos),
    lastIndexOf: (str, search, pos) => str.lastIndexOf(search, pos),
    startsWith: (str, search, pos = 0) => str.startsWith(search, pos),
    endsWith: (str, search, len) => str.endsWith(search, len),
    repeat: (str, count) => str.repeat(count),
    padStart: (str, len, pad = ' ') => str.padStart(len, pad),
    padEnd: (str, len, pad = ' ') => str.padEnd(len, pad),

    match: (str, pattern, flags = '') => (str + '').match(env.novaRegex(pattern, flags)),
    test: (str, pattern, flags = '') => env.novaRegex(pattern, flags).test(str + ''),
    search: (str, pattern, flags = '') => (str + '').search(env.novaRegex(pattern, flags)),
    replace: (str, searchValue, replaceValue) =>
      (str + '').replace(searchValue instanceof RegExp ? searchValue : searchValue + '', replaceValue),
    replaceAll: (str, searchValue, replaceValue) =>
      (str + '').split(searchValue).join(replaceValue),
  },

  integer: {
    toFixed: (num, digits) => num.toFixed(digits),
    toExponential: (num, fd) => num.toExponential(fd),
    toPrecision: (num, p) => num.toPrecision(p),
    toString: (num, radix = 10) => num.toString(radix),
    valueOf: (num) => num.valueOf(),
    abs: (num) => Math.abs(num),
    floor: (num) => Math.floor(num),
    ceil: (num) => Math.ceil(num),
    round: (num) => Math.round(num),
    sqrt: (num) => Math.sqrt(num),
    pow: (num, exp) => Math.pow(num, exp),
    sin: (num) => Math.sin(num),
    cos: (num) => Math.cos(num),
    tan: (num) => Math.tan(num),
    log: (num) => Math.log(num),
    max: (num, ...nums) => Math.max(num, ...nums),
    min: (num, ...nums) => Math.min(num, ...nums),
  },

  float: null, // you can alias to integer later

  array: {
    length: (arr) => arr.length,
    push: (arr, ...items) => arr.push(...items),
    pop: (arr) => arr.pop(),
    shift: (arr) => arr.shift(),
    unshift: (arr, ...items) => arr.unshift(...items),
    slice: (arr, start, end) => arr.slice(start, end),
    splice: (arr, start, deleteCount, ...items) => arr.splice(start, deleteCount, ...items),
    indexOf: (arr, item, fromIndex = 0) => arr.indexOf(item, fromIndex),
    lastIndexOf: (arr, item, fromIndex) => arr.lastIndexOf(item, fromIndex),
    includes: (arr, item) => arr.includes(item),
    find: (arr, cb) => arr.find(cb),
    findIndex: (arr, cb) => arr.findIndex(cb),
    map: (arr, cb) => arr.map(cb),
    filter: (arr, cb) => arr.filter(cb),
    reduce: (arr, cb, init) => arr.reduce(cb, init),
    reduceRight: (arr, cb, init) => arr.reduceRight(cb, init),
    forEach: (arr, cb) => arr.forEach(cb),
    some: (arr, cb) => arr.some(cb),
    every: (arr, cb) => arr.every(cb),
    join: (arr, sep = ',') => arr.join(sep),
    reverse: (arr) => arr.reverse(),
    sort: (arr, compareFn) => arr.sort(compareFn),
    concat: (arr, ...arrays) => arr.concat(...arrays),
    clone: (arr) => arr.slice(),
    clear: (arr) => { arr.length = 0; return arr; },
    shuffle: (arr) => arr.shuffle(),
    append: (arr, ...args) => arr.appendTo(...args),
  },

  object: {
    keys: (obj) => Object.keys(obj),
    values: (obj) => Object.values(obj),
    entries: (obj) => Object.entries(obj),
    has: (obj, key) => key in obj,
    get: (obj, key) => obj[key],
    set: (obj, key, val) => { obj[key] = val; return obj; },
    delete: (obj, key) => { delete obj[key]; return obj; },
    clone: (obj) => structuredClone ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)),
    assign: (obj, source) => Object.assign(obj, source),
    freeze: (obj) => Object.freeze(obj),
    seal: (obj) => Object.seal(obj),
    isFrozen: (obj) => Object.isFrozen(obj),
    isSealed: (obj) => Object.isSealed(obj),
  },

  boolean: {
    not: (b) => !b,
    toString: (b) => String(b),
    toggle: (b) => !b,
  },
};

    this.currencies = {
      "time": {
        "base_unit": "s", // Base unit is now 's'
        "ms": { // Milliseconds
          "initial_base": 0.001
        },
        "s": { // Seconds
          "initial_base": 1
        },
        "min": { // Minutes (using 'min' to avoid conflict with meters)
          "initial_base": 60
        },
        "h": { // Hours
          "initial_base": 3600
        },
        "d": { // Days
          "initial_base": 86400
        },
        "wk": { // Weeks
          "initial_base": 604800
        },
        "yr": { // Years
          "initial_base": 31536000
        }
      },
      "length": {
        "base_unit": "m", // Base unit is now 'm'
        "mm": { // Millimeters
          "initial_base": 0.001
        },
        "cm": { // Centimeters
          "initial_base": 0.01
        },
        "met": { // Meters
          "initial_base": 1
        },
        "km": { // Kilometers
          "initial_base": 1000
        },
        "inch": { // Inches
          "initial_base": 0.0254
        },
        "ft": { // Feet
          "initial_base": 0.3048
        },
        "yd": { // Yards
          "initial_base": 0.9144
        },
        "mile": { // Miles
          "initial_base": 1609.34
        }
      },
      "mass": {
        "base_unit": "kg", // Base unit is now 'kg'
        "mg": { // Milligrams
          "initial_base": 0.000001
        },
        "g": { // Grams
          "initial_base": 0.001
        },
        "kg": { // Kilograms
          "initial_base": 1
        },
        "tonne": { // Metric Tonnes
          "initial_base": 1000
        },
        "oz": { // Ounces
          "initial_base": 0.0283495
        },
        "lb": { // Pounds
          "initial_base": 0.453592
        }
      },
      "volume": {
        "base_unit": "l", // Base unit is now 'l'
        "ml": { // Milliliters
          "initial_base": 0.001
        },
        "cl": { // Centiliters
          "initial_base": 0.01
        },
        "dl": { // Deciliters
          "initial_base": 0.1
        },
        "l": { // Liters
          "initial_base": 1
        },
        "kl": { // Kiloliters
          "initial_base": 1000
        },
        "gal": { // US Gallons
          "initial_base": 3.78541
        },
        "qt": { // US Quarts
          "initial_base": 0.946353
        },
        "pt": { // US Pints
          "initial_base": 0.473176
        }
      },
      "currency_fiat": {
        "base_unit": "usd",
        "usd": { "initial_base": 1 },
        "eur": { "initial_base": 1.08 },
        "jpy": { "initial_base": 0.0068 }
      },
      "numbers": {
        "base_until": "1",
        "k": {
          "initial_base": 1000
        },
        "m": {
          "initial_base": 1000_000
        }
      }
    };
    this.webs = {};
    this.classes = {
      for: class ForLoop {
  constructor(cfg, body) {
    this.i = cfg.i
    this.type = cfg.type
    this.list = cfg.list
    this.arguments = cfg.arguments
    this.expose = cfg.expose
    this.body = body
  }

  static types = {
    regular: Symbol("for-regular"),
    of: Symbol("for-of"),
    in: Symbol("for-in")
  }

  call(...args) {
    let result

    if (this.type === ForLoop.types.of) {
      for (let i of this.list) {
        let parsed = this.arguments.map(arg => evalArg(arg, i, this.list))
        result = this.body(...parsed)
      }
    }
    else if (this.type === ForLoop.types.in) {
      for (let key in this.list) {
        let parsed = this.arguments.map(arg => evalArg(arg, key, this.list))
        result = this.body(...parsed)
      }
    }
    else if (this.type === ForLoop.types.regular) {
      for (let i = this.i; i < this.list.length; i++) {
        let parsed = this.arguments.map(arg => evalArg(arg, i, this.list))
        result = this.body(...parsed)
      }
    }

    return this.expose(result, ...args)
  }
},
      line: Line,
      typedFn: class TypedFunction {
        constructor(argTypes = {}, options = {}, fn) {
          this.argTypes = argTypes;
          this.options = options;
          this.fn = fn;

          // Extract options
          this.returnType = options.returns || null;
          this.typeChecker = options.typeChecker || this.defaultCheck;
          this.debug = options.debug || false;
          this.strict = options.strict ?? true;

          // Return wrapped function
          return (...args) => {
            const keys = Object.keys(this.argTypes);

            if (this.strict && args.length !== keys.length) {
              throw new Error(
                `Expected ${keys.length} arguments, got ${args.length}`
              );
            }

            // Validate arguments
            keys.forEach((key, i) => {
              let expected = this.argTypes[key];
              let value = args[i];
              if (!this.typeChecker(value, expected)) {
                throw new TypeError(
                  `Argument '${key}' expected ${this.typeName(expected)}, got ${this.typeName(value.constructor || typeof value)}`
                );
              }
              if (this.debug) {
                console.log(`✔ Arg '${key}' OK:`, value);
              }
            });

            const result = this.fn(...args);

            // Validate return type
            if (this.returnType && !this.typeChecker(result, this.returnType)) {
              throw new TypeError(
                `Return expected ${this.typeName(this.returnType)}, got ${this.typeName(result.constructor || typeof result)}`
              );
            }

            if (this.debug) {
              console.log(`✔ Return OK:`, result);
            }

            return result;
          };
        }

        defaultCheck(value, expected) {
          if (typeof expected === "string") {
            return typeof value === expected.toLowerCase();
          }
          if (expected instanceof Function) {
            return value instanceof expected;
          }
          return false;
        }

        typeName(t) {
          if (typeof t === "string") return t;
          if (t?.name) return t.name;
          return String(t);
        }
      },
      // --- Core JavaScript Built-in Global Constructors (Instantiable with 'new') ---
      Enum: class Enum {
        constructor(items) {
          this._items = items;

          // define key -> index
          items.forEach((item, index) => {
            this[item] = index;
          });

          return new Proxy(this, {
            get(target, prop) {
              // delegate array methods to _items
              if (typeof prop === "string" && prop in Array.prototype) {
                return target._items[prop].bind(target._items);
              }

              // delegate numeric access to _items
              if (typeof prop === "string" && !isNaN(prop)) {
                return target._items[prop];
              }

              // symbols and everything else just fall back
              return target[prop];
            },
            ownKeys(target) {
              return Reflect.ownKeys(target._items).concat(Reflect.ownKeys(target));
            },
            getOwnPropertyDescriptor(target, prop) {
              if (prop in target._items) {
                return Object.getOwnPropertyDescriptor(target._items, prop);
              }
              return Object.getOwnPropertyDescriptor(target, prop);
            }
          });
        }

        toString() {
          return JSON.stringify(this._items);
        }
        [util.inspect.custom]() {
          return this._items;
        }
        toJSON() {
          return this._items;
        }
      },
      Date: Date,
      Array: Array,
      Object: Object,
      Function: Function,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp,
      Map: Map,
      Set: Set,
      WeakMap: WeakMap,
      WeakSet: WeakSet,
      Promise: Promise,

      // --- Error Constructors (for handling and creating specific error types) ---
      Error: Error,
      TypeError: TypeError,
      RangeError: RangeError,
      ReferenceError: ReferenceError,
      SyntaxError: SyntaxError,
      URIError: URIError,
      EvalError: EvalError,

      // --- Typed Array Constructors (for handling binary data efficiently) ---
      ArrayBuffer: ArrayBuffer, // Generic fixed-length raw binary data buffer
      SharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : undefined, // For shared memory (Node.js/Workers)
      DataView: DataView, // View for ArrayBuffer, allowing control over byte order
      Int8Array: Int8Array,
      Uint8Array: Uint8Array,
      Uint8ClampedArray: Uint8ClampedArray,
      Int16Array: Int16Array,
      Uint16Array: Uint16Array,
      Int32Array: Int32Array,
      Uint: (val) => new Uint32Array([val])[0], // Utility to ensure unsigned 32-bit integer
      Int: (val) => new Int32Array([val])[0], // Utility to ensure signed 32-bit integer
      Bigint: (val) => BigInt(val), // Utility to ensure BigInt
      Uint32Array: Uint32Array,
      Float32Array: Float32Array,
      Float64Array: Float64Array,
      BigInt64Array: typeof BigInt64Array !== 'undefined' ? BigInt64Array : undefined, // For 64-bit integers
      BigUint64Array: typeof BigUint64Array !== 'undefined' ? BigUint64Array : undefined, // For 64-bit unsigned integers

      // --- Global Objects (Accessed directly, not with 'new') ---
      JSON: JSON,   // Provides methods for working with JSON (parse, stringify)
      Math: Math,   // Provides mathematical functions and constants
      Reflect: Reflect, // Provides methods for interceptable JavaScript operations
      Atomics: typeof Atomics !== 'undefined' ? Atomics : undefined, // For atomic operations on SharedArrayBuffer

      // --- Global Functions (Behave like utility functions, callable directly) ---
      Symbol: Symbol,     // Function for creating unique symbols
      BigInt: BigInt,     // Function for creating BigInt values
      decodeURI: decodeURI, // Decodes a Uniform Resource Identifier (URI)
      encodeURI: encodeURI, // Encodes a URI
      decodeURIComponent: decodeURIComponent, // Decodes a URI component
      encodeURIComponent: encodeURIComponent, // Encodes a URI component
      isFinite: isFinite, // Determines whether a value is a finite number
      isNaN: isNaN,       // Determines whether a value is NaN

      // --- Internationalization Constructors (for language-sensitive formatting) ---
      Intl: Intl, // Top-level object for Intl API
      Collator: Intl.Collator, // For language-sensitive string comparison
      DateTimeFormat: Intl.DateTimeFormat, // For language-sensitive date and time formatting
      ListFormat: typeof Intl.ListFormat !== 'undefined' ? Intl.ListFormat : undefined, // For language-sensitive list formatting (e.g., "A, B, and C")
      NumberFormat: Intl.NumberFormat, // For language-sensitive number formatting
      PluralRules: typeof Intl.PluralRules !== 'undefined' ? Intl.PluralRules : undefined, // For language-sensitive pluralization rules
      RelativeTimeFormat: typeof Intl.RelativeTimeFormat !== 'undefined' ? Intl.RelativeTimeFormat : undefined, // For language-sensitive relative time formatting (e.g., "1 day ago")
      Locale: typeof Intl.Locale !== 'undefined' ? Intl.Locale : undefined, // For working with BCP 47 language tags

      // --- Web API / Node.js Specific Classes (Conditional Inclusion if environment supports) ---
      // Uncomment these if your interpreter runs in an environment where they are global
      URL: typeof URL !== 'undefined' ? URL : undefined, // For URL parsing and construction (Node.js & Browsers)
      URLSearchParams: typeof URLSearchParams !== 'undefined' ? URLSearchParams : undefined, // For working with URL query strings
      TextEncoder: typeof TextEncoder !== 'undefined' ? TextEncoder : undefined, // For encoding strings to bytes
      TextDecoder: typeof TextDecoder !== 'undefined' ? TextDecoder : undefined, // For decoding bytes to strings
      Console: console, // The global console object (if you want direct access, otherwise your `log` map handles it)
      Worker: typeof Worker !== 'undefined' ? Worker : undefined, // Web Workers API

      // --- Reflection/Meta-programming Constructs ---
      Proxy: typeof Proxy !== 'undefined' ? Proxy : undefined, // For creating proxy objects

      // --- Iterator/Generator Constructs (less common to 'new' directly, but exist) ---
      GeneratorFunction: (function* () { }).constructor, // The constructor for generator functions
      // --- Your Custom Classes (as defined previously) ---
      Vector2D: function (x, y) {
        this.x = x || 0;
        this.y = y || 0;
        this.magnitude = () => Math.sqrt(this.x * this.x + this.y * this.y);
        this.add = (otherVector) => {
          return new this.classes.Vector2D(this.x + otherVector.x, this.y + otherVector.y);
        };
        this.__type = 'Vector2D';
      },
      Point: function (x, y) {
        this.x = x || 0;
        this.y = y || 0;
        this.distanceTo = (otherPoint) => {
          const dx = this.x - otherPoint.x;
          const dy = this.y - otherPoint.y;
          return Math.sqrt(dx * dx + dy * dy);
        };
        this.__type = 'Point';
      },

      // --- Custom Factory Functions / Utility Objects (as defined previously) ---
      HttpRequest: function (method, url, headers = {}, body = null) {
        // Ensure child_process is available (Node.js environment)
        const { execSync } = typeof require !== 'undefined' ? require('child_process') : { execSync: null };

        if (!execSync) {
          console.warn("HttpRequest: execSync is not available. This class requires a Node.js environment.");
          // Return a dummy object or throw an error if execSync is critical
          return {
            method: method, url: url, headers: headers, body: body,
            send: () => { throw new Error("Synchronous HTTP requests via curl are only available in Node.js."); }
          };
        }

        return {
          method: method.toUpperCase(), // Ensure method is uppercase
          url: url,
          headers: headers,
          body: body,

          /**
           * Sends a synchronous HTTP request using curl.
           * @returns {object} An object containing the response status, headers, and body.
           * @throws {Error} If the curl command fails or execSync is unavailable.
           */
          send: function () {
            let curlCommand = `curl -sS -i -X ${this.method}`; // -sS: silent, show errors; -i: include headers in output

            // Add headers
            for (const headerName in this.headers) {
              // Escape double quotes in header values to prevent command injection
              const headerValue = String(this.headers[headerName]).replace(/"/g, '\\"');
              curlCommand += ` -H "${headerName}: ${headerValue}"`;
            }

            // Add request body for methods that typically have one
            if (this.body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(this.method)) {
              // Ensure the body is a string and escape double quotes
              const requestBody = JSON.stringify(this.body).replace(/"/g, '\\"');
              // -d or --data sends POST data. For other methods, it still sends it as body.
              curlCommand += ` -d "${requestBody}"`;
            }

            // Append the URL. Ensure URL is properly quoted to handle special characters.
            // Using single quotes for the URL is generally safer for shell commands.
            curlCommand += ` '${this.url}'`;

            this.log(`Executing curl command: ${curlCommand}`); // Use your interpreter's log

            try {
              // Execute the curl command synchronously
              const output = execSync(curlCommand, { encoding: 'utf8' });
              this.log(`Curl command executed successfully.`);

              // Parse the output to separate headers and body
              const parts = output.split('\r\n\r\n'); // Headers and body are separated by double newline
              let rawHeaders = parts[0];
              let responseBody = parts.slice(1).join('\r\n\r\n').trim(); // Rejoin if body itself contains newlines

              const responseHeaders = {};
              let statusLine = '';

              // Parse headers
              const headerLines = rawHeaders.split('\r\n');
              if (headerLines.length > 0) {
                statusLine = headerLines[0]; // First line is HTTP status line
                headerLines.slice(1).forEach(line => {
                  const colonIndex = line.indexOf(':');
                  if (colonIndex > 0) {
                    const name = line.substring(0, colonIndex).trim();
                    const value = line.substring(colonIndex + 1).trim();
                    responseHeaders[name] = value;
                  }
                });
              }

              // Extract status code from status line (e.g., "HTTP/1.1 200 OK")
              const statusCodeMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
              const statusCode = statusCodeMatch ? parseInt(statusCodeMatch[1], 10) : null;

              return {
                status: statusCode,
                statusText: statusLine.split(' ').slice(2).join(' '), // e.g., "OK"
                headers: responseHeaders,
                body: responseBody,
                raw: output // Include raw output for debugging
              };

            } catch (error) {
              // execSync throws an error if the command exits with a non-zero code
              const errorMessage = `Curl command failed: ${error.message}`;
              const stderr = error.stderr ? error.stderr.toString('utf8') : '';
              const stdout = error.stdout ? error.stdout.toString('utf8') : '';

              this.log(`Curl error: ${errorMessage}`);
              if (stderr) this.log(`Curl stderr: ${stderr}`);
              if (stdout) this.log(`Curl stdout: ${stdout}`);

              throw new Error(`HTTP Request Failed: ${errorMessage}\nStderr: ${stderr}\nStdout: ${stdout}`);
            }
          }
        };
      },
      Logger: function (prefix = 'LOG') {
        return {
          log: function (message) { console.log(`[${prefix}] ${message}`); },
          warn: function (message) { console.warn(`[${prefix} WARN] ${message}`); },
          error: function (message) { console.error(`[${prefix} ERROR] ${message}`); },
        };
      },
      Queue: function () {
        this.items = [];

        // Enqueue: Add an item to the back of the queue
        this.enqueue = function (item) {
          this.items.push(item);
        };

        // Dequeue: Remove an item from the front of the queue
        this.dequeue = function () {
          if (this.isEmpty()) {
            throw new Error("Queue is empty.");
          }
          return this.items.shift();
        };

        // Peek: View the front item without removing it
        this.peek = function () {
          if (this.isEmpty()) {
            throw new Error("Queue is empty.");
          }
          return this.items[0];
        };

        // isEmpty: Check if the queue is empty
        this.isEmpty = function () {
          return this.items.length === 0;
        };

        // Size: Get the current size of the queue
        this.size = function () {
          return this.items.length;
        };

        // Clear: Clear all items in the queue
        this.clear = function () {
          this.items = [];
        };

        // Print: Print the queue items
        this.print = function () {
          console.log(this.items.toString());
        };
      },
      Stack: function () {
        this.items = [];

        // Push: Add an item to the top of the stack
        this.push = function (item) {
          this.items.push(item);
        };

        // Pop: Remove the top item from the stack
        this.pop = function () {
          if (this.isEmpty()) {
            throw new Error("Stack is empty.");
          }
          return this.items.pop();
        };

        // Peek: View the top item without removing it
        this.peek = function () {
          if (this.isEmpty()) {
            throw new Error("Stack is empty.");
          }
          return this.items[this.items.length - 1];
        };

        // isEmpty: Check if the stack is empty
        this.isEmpty = function () {
          return this.items.length === 0;
        };

        // Size: Get the current size of the stack
        this.size = function () {
          return this.items.length;
        };

        // Clear: Clear all items in the stack
        this.clear = function () {
          this.items = [];
        };

        // Print: Print the stack items
        this.print = function () {
          console.log(this.items.toString());
        };
      },
      LinkedList: function () {
        function Node(value) {
          this.value = value;
          this.next = null;
        }

        this.head = null;
        this.tail = null;

        // Append: Add an item to the end of the list
        this.append = function (value) {
          const newNode = new Node(value);
          if (!this.head) {
            this.head = newNode;
            this.tail = newNode;
          } else {
            this.tail.next = newNode;
            this.tail = newNode;
          }
        };

        // Prepend: Add an item to the beginning of the list
        this.prepend = function (value) {
          const newNode = new Node(value);
          if (!this.head) {
            this.head = newNode;
            this.tail = newNode;
          } else {
            newNode.next = this.head;
            this.head = newNode;
          }
        };

        // Remove: Remove the first occurrence of an item
        this.remove = function (value) {
          if (!this.head) return;

          if (this.head.value === value) {
            this.head = this.head.next;
            if (!this.head) this.tail = null; // If the list is empty after removal
            return;
          }

          let current = this.head;
          while (current.next && current.next.value !== value) {
            current = current.next;
          }

          if (current.next) {
            current.next = current.next.next;
            if (!current.next) this.tail = current; // If last element was removed
          }
        };

        // Find: Find the first node with a specific value
        this.find = function (value) {
          let current = this.head;
          while (current) {
            if (current.value === value) return current;
            current = current.next;
          }
          return null;
        };

        // Print: Print the linked list items
        this.print = function () {
          let current = this.head;
          let values = [];
          while (current) {
            values.push(current.value);
            current = current.next;
          }
          console.log(values.toString());
        };
      },

      Alias: function (originalObject) {
        this.original = originalObject;

        // Create an alias for a method or property
        this.create = function (alias, methodName) {
          if (typeof this.original[methodName] === 'function') {
            this[alias] = (...args) => this.original[methodName](...args);
          } else {
            this[alias] = this.original[methodName];
          }
        };

        // Remove an alias
        this.remove = function (alias) {
          delete this[alias];
        };
      },

      Timer: function () {
        this.startTime = null;

        // Start the timer
        this.start = function () {
          this.startTime = Date.now();
        };

        // Get the elapsed time in milliseconds
        this.elapsed = function () {
          if (!this.startTime) {
            throw new Error("Timer not started.");
          }
          return Date.now() - this.startTime;
        };

        // Reset the timer
        this.reset = function () {
          this.startTime = null;
        };
      },

      EventEmitter: function () {
        this.events = {};

        // Add an event listener
        this.on = function (event, listener) {
          if (!this.events[event]) {
            this.events[event] = [];
          }
          this.events[event].push(listener);
        };

        // Remove an event listener
        this.off = function (event, listener) {
          if (!this.events[event]) return;

          const index = this.events[event].indexOf(listener);
          if (index > -1) {
            this.events[event].splice(index, 1);
          }
        };

        // Emit an event
        this.emit = function (event, ...args) {
          if (!this.events[event]) return;

          this.events[event].forEach(listener => {
            listener(...args);
          });
        };
      },
      Debouncer: function (callback, wait) {
        this.callback = callback;
        this.wait = wait;
        this.timer = null;

        this.execute = function (...args) {
          clearTimeout(this.timer);
          this.timer = setTimeout(() => {
            this.callback(...args);
          }, this.wait);
        };
      },
      Cache: function () {
        this.cache = {};

        // Store a value in the cache
        this.set = function (key, value) {
          this.cache[key] = value;
        };

        // Get a value from the cache
        this.get = function (key) {
          return this.cache[key] || null;
        };

        // Check if a key exists in the cache
        this.has = function (key) {
          return this.cache.hasOwnProperty(key);
        };

        // Remove a key from the cache
        this.delete = function (key) {
          delete this.cache[key];
        };

        // Clear the entire cache
        this.clear = function () {
          this.cache = {};
        };
      },
      Counter: function (initialValue = 0) {
        this.value = initialValue;

        // Increment the counter
        this.increment = function (amount = 1) {
          this.value += amount;
        };

        // Decrement the counter
        this.decrement = function (amount = 1) {
          this.value -= amount;
        };

        // Reset the counter to the initial value
        this.reset = function () {
          this.value = initialValue;
        };

        // Get the current value
        this.getValue = function () {
          return this.value;
        };
      },
      Throttle: function (callback, limit) {
        this.callback = callback;
        this.limit = limit;
        this.lastExecuted = 0;

        this.execute = function (...args) {
          const now = Date.now();
          if (now - this.lastExecuted >= this.limit) {
            this.callback(...args);
            this.lastExecuted = now;
          }
        };
      },



    };
    this.ret = {};
    this.states = {};
    this.allVars = {};
    this.macros = {};
    this.types = {
    integer: {
        function: (val) => {
            if (typeof val != 'number' || Math.floor(val) != val) {
                throw "invalid integer: " + val;
            }
            return val;
        },
        default: 0,
        name: "integer"
    },

    float: {
        function: (val) => {
            if (typeof val != 'number') {
                throw "invalid float: " + val;
            }
            return val;
        },
        default: 0.0,
        name: "float"
    },

    string: {
        function: (val) => {
            if (typeof val != 'string') {
                throw "invalid string: " + val;
            }
            return val;
        },
        default: "",
        name: "string"
    },

    array: {
        function: (val) => {
            if (!Array.isArray(val)) {
                throw "invalid array: " + val;
            }
            return val;
        },
        default: [],
        name: "array"
    },

    object: {
        function: (val) => {
            if (typeof val != 'object' || val == null || Array.isArray(val)) {
                throw "invalid object: " + val;
            }
            return val;
        },
        default: {},
        name: "object"
    },

    bool: {
        function: (val) => {
            if (typeof val != 'boolean') {
                throw "invalid bool: " + val;
            }
            return val;
        },
        default: false,
        name: "bool"
    },

    any: {
        function: (val) => val, // accepts anything
        default: null,
        name: "any"
    }
};
    this.instances = {};
    this.resultOutput = "";
    this.keyfuncs = {};
    this.builtins = {
      multiLangs: `
    function runJs(code) {
            try {
              term('node -p "' + code + '"') bash;
            };
    };
`,
      std: `
    function run(code) {
     try {
       exec(code);
     }; catch(er) { print('ERROR: ' + er); };
  };

`,
      toast: `
    function greet(x,count) {
            for (i = 0; i < count; i++) {
      print(i + "-hi!" + x);
            };
    };
    function say(msg,times) {
            for (i = 0; i < times + 1; i++) {
      print(i + '- ' + msg);
            };
            };
            `,
      chrono: `
    function ms(seconds) { var sum = seconds / 1000; give sum; };
`,


      server_framework: `
    function send(arg) {
      send = arg;
    };
`,
      root: `
array keywords { ${this.keywordsArray.map(k => `"${k}"`).join(', ')} };

function keywords() {
  give "${this.keywordsArray.join(',')}";
};
`,
      term: `
    array argv { ${process.argv.slice(3).map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(', ')} };

    function bash(cmd) {
        term(cmd) bash;
    };

    map device {
    platform = '${process.platform}';
    arch = '${process.arch}';
    cpu = '${JSON.stringify(require('os').cpus())}';
    mem = '${JSON.stringify(require('os').totalmem())}';
    user = '${JSON.stringify(require('os').userInfo())}';
    network = '${JSON.stringify(require('os').networkInterfaces())}';
    uptime = '${require('os').uptime()}';
    hostname = '${JSON.stringify(require('os').hostname())}';
    pth = {
      dir = '${JSON.stringify(require('path').dirname(process.execPath))}';
      base = '${JSON.stringify(require('path').basename(process.execPath))}';
      ext = '${JSON.stringify(require('path').extname(process.execPath))}';
      sep = '${JSON.stringify(require('path').sep)}';
      posix = { 
        dir = '${JSON.stringify(require('path').posix.dirname(process.execPath))}';
        base = '${JSON.stringify(require('path').posix.basename(process.execPath))}';
        ext = '${JSON.stringify(require('path').posix.extname(process.execPath))}';
        sep = '${JSON.stringify(require('path').posix.sep)}';
      };
      cwd = '${JSON.stringify(process.cwd())}';
      env = '${JSON.stringify(process.env)}';
      pid = '${process.pid}';
    };
    };
    process = magnif.process;
    map term {
       enviroment = process.env;
       lang = process.env.SHELL;
       HOME = process.env.HOME;
       sudo = (code) => { term ('sudo nova -e="' + code + '"' ) ${process.env.SHELL.substr(5)}; give goblify.leave(); };
       cd = (dir) => { process.chdir(dir); };
    };
`
    };
    this.commentlog = [];
  }

  stripComments(code) {
    this.debug('stripping comments...');
    let result = '';
    let inString = false;
    let stringChar = '';
    let escaped = false;
    let i = 0;

    const customMap = typeof this.customComments === 'object' && this.customComments !== null
      ? this.customComments
      : {};

    const commentRules = Object.values(customMap);

    while (i < code.length) {
      const char = code[i];
      const nextTwo = code.slice(i, i + 2);
      const nextThree = code.slice(i, i + 3);

      // String handling
      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && !escaped) {
        inString = false;
      }

      // Built-in comments
      if (!inString && nextThree === '/!/') {
        while (i < code.length && code[i] !== '\n') i++;
        result += '\n';
        i++;
        continue;
      }

      if (!inString && nextTwo === '/*') {
        i += 2;
        while (i < code.length && code.slice(i, i + 2) !== '*/') i++;
        i += 2;
        continue;
      }

      if (!inString && nextTwo === '//') {
        let comment = '';
        i += 2;
        while (i < code.length && code[i] !== '\n') {
          comment += code[i++];
        }
        this.commentlog?.push(comment.trim());
        result += '\n';
        i++;
        continue;
      }

      if (!inString && nextThree === '/?/') {
        let expr = '';
        i += 3;
        this.debug('found /?/ code');
        while (i < code.length && code[i] !== '\n') {
          expr += code[i++];
        }
        try {
          this.run(expr.trim());
        } catch (e) {
          console.error('Error in /?/ expression:', e);
        }
        result += '\n';
        i++;
        continue;
      }

      // 💡 Custom comment types
      let matched = false;
      for (const rule of commentRules) {
        const start = rule.start || '';
        const end = rule.end || '\n';
        const isFunc = Array.isArray(rule.type);
        const type = isFunc ? rule.type[1] : rule.type;
        const fn = isFunc ? rule.type[0] : null;
        const del = rule.delete !== false;
        const replace = rule.replace;

        if (!inString && code.slice(i, i + start.length) === start) {
          i += start.length;

          // LINE comment
          if (type === 'lineComment') {
            let line = '';
            while (i < code.length && code[i] !== '\n') {
              line += code[i++];
            }

            if (isFunc) {
              const res = fn(line);
              if (replace?.[0] && typeof replace[1] === 'function') {
                result += replace[1](line);
              } else if (!del) {
                result += res;
              }
            }

            result += '\n';
            i++;
            matched = true;
            break;
          }

          // BLOCK comment
          if (type === 'blockComment') {
            let block = '';
            while (i < code.length && code.slice(i, i + end.length) !== end) {
              block += code[i++];
            }
            i += end.length;

            if (isFunc) {
              const res = fn(block);
              if (replace?.[0] && typeof replace[1] === 'function') {
                result += replace[1](block);
              } else if (!del) {
                result += res;
              }
            }

            matched = true;
            break;
          }
        }
      }

      if (matched) continue;

      // Add character normally
      result += char;
      escaped = (!escaped && char === '\\');
      i++;
    }

    return result;
  }

  toString() {
    let RED = '\x1b[31m';
    let RESET = '\x1b[0m';
    return `${RED}Nova:[runtime:env] { ${Object.keys(this).join(", ")} } ${RESET}`;
  };
  tokenize(code) {
    this.debug('startig tokenizer...');
    let cleaned = this.stripComments(code);
    const tokens = [];
    let i = 0;
    const len = cleaned.length;
    let current = '';
    let inString = false;
    let quoteChar = '';

    const addToken = (token) => {
      if (token !== '') tokens.push(token);
    };

    while (i < len) {
      let char = cleaned[i];

      if (inString) {
        current += char;
        if (char === quoteChar && cleaned[i - 1] !== '\\') {
          addToken(current.trim());
          current = '';
          inString = false;
          quoteChar = '';
        }
        i++;
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        addToken(current.trim());
        current = char;
        inString = true;
        quoteChar = char;
        i++;
        continue;
      }

if (/\s/.test(char)) {
  addToken(current.trim());
  current = '';
  i++;
  continue;
}

      const threeChar = cleaned.slice(i, i + 3);
      if (['==>', '===', '!==', '+==', '-==', '<==', '==<', '>==', '>>>'].includes(threeChar)) {
        addToken(current);
        tokens.push(threeChar);
        current = '';
        i += 3;
        continue;
      }

      const twoChar = cleaned.slice(i, i + 2);
      if (['?.', '<<', '>>', '=>', '==', '!=', '<=', '=<', '||', '&&', '>=', '++', '**', '--', '??', '?.', '#:', '$:', '::'].includes(twoChar)) {
        addToken(current);
        tokens.push(twoChar);
        current = '';
        i += 2;
        continue;
      }

      if (/[{}()\[\];=.<>+\-*/,]/.test(char)) {
        addToken(current);
        tokens.push(char);
        current = '';
        i++;
        continue;
      }

      current += char;
      i++;
    }

    addToken(current.trim());
    return { tokens, code: cleaned };
  }

  tokenizeWithoutFns(code) {
    let cleaned = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const tokens = [];
    let i = 0;
    const len = cleaned.length;
    let current = '';
    let inString = false;
    let quoteChar = '';

    const addToken = (token) => {
      if (token !== '') tokens.push(token);
    };

    while (i < len) {
      let char = cleaned[i];

      if (inString) {
        current += char;
        if (char === quoteChar && cleaned[i - 1] !== '\\') {
          addToken(current);
          current = '';
          inString = false;
          quoteChar = '';
        }
        i++;
        continue;
      }

      if (char === '"' || char === "'") {
        addToken(current);
        current = char;
        inString = true;
        quoteChar = char;
        i++;
        continue;
      }

      if (/\s/.test(char)) {
        addToken(current);
        current = '';
        i++;
        continue;
      }

      const threeChar = cleaned.slice(i, i + 3);
      if (['==>', '===', '!==', '+==', '-==', '<==', '==<', '>=='].includes(threeChar)) {
        addToken(current);
        tokens.push(threeChar);
        current = '';
        i += 3;
        continue;
      }

      const twoChar = cleaned.slice(i, i + 2);
      if (['==', '!=', '+=', '-=', '<=', '>='].includes(twoChar)) {
        addToken(current);
        tokens.push(twoChar);
        current = '';
        i += 2;
        continue;
      }


      const methodCall = cleaned.slice(i).match(/^\.([a-zA-Z_]\w*)\(([^)]*)\)/);
      if (methodCall) {
        addToken(current.trim());
        // Find the variable name before the dot
        let varName = this.evaluateExpr(this.tokenize(cleaned.slice(0, i)).tokens.pop());

        let val = varName;
        let result = val;
        const method = methodCall[1];
        let args = this.evaluateExpr(methodCall[2]);
        addToken(`${result}.${method}(${args})`);
      }
      if (/[{}():;=<>+\-*/,]/.test(char)) {
        addToken(current);
        tokens.push(char);
        current = '';
        i++;
        continue;
      }

      current += char;
      i++;
    }

    addToken(current);
    return { tokens, code: cleaned };

  }

  _tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const c = expr[i];

      // Skip whitespace
      if (/\s/.test(c)) {
        i++;
        continue;
      }

      // Quoted string
      if (c === '"' || c === "'" || c === '`') {
        let quote = c;
        let start = i++;
        while (i < expr.length && expr[i] !== quote) {
          if (expr[i] === '\\') i++; // skip escaped
          i++;
        }
        i++;
        tokens.push(expr.slice(start, i));
        continue;
      }

      // Code block
      if (c === '{') {
        let start = i++;
        let depth = 1;
        while (i < expr.length && depth > 0) {
          if (expr[i] === '{') depth++;
          else if (expr[i] === '}') depth--;
          i++;
        }
        tokens.push(expr.slice(start, i));
        continue;
      }


      // Operators and symbols
      const opMatch = expr.slice(i).match(/^(==|!=|===|!==|<=|>=|&&|\|\||[+\-*/<>=%!])/);
      if (opMatch) {
        tokens.push(opMatch[0]);
        i += opMatch[0].length;
        continue;
      }

      // Numbers or single chars
      // Numbers: supports integers and floats
      if (/\d/.test(c)) {
        let start = i;
        while (/\d/.test(expr[i])) i++;

        // Handle decimal point
        if (expr[i] === '.' && /\d/.test(expr[i + 1])) {
          i++; // skip dot
          while (/\d/.test(expr[i])) i++;
        }

        tokens.push(expr.slice(start, i));
        continue;
      }

      // Default: one character
      tokens.push(c);
      i++;
    }

    return tokens;
  }


  parseArr = (expr, devider = ',', allows) => {
    this.debug('Parsing non expr array');
    if (!allows && !this.options?.strict) {
     devider = this.NOVAL_ARR_DEV;
    }

    const parts = [];
    let current = '';
    let depth = 0; // Tracks depth for [], {}, and ()
    let inString = false;
    let quoteType = '';

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];

      // String handling
      if ((char === '"' || char === "'" || char === '`') && !inString) {
        inString = true;
        quoteType = char;
        current += char;
      } else if (char === quoteType && inString) {
        inString = false;
        quoteType = '';
        current += char;
      } else if (inString) {
        current += char;
      }
      // Depth tracking for nested structures
      else if (char === '[') {
        depth++;
        current += char;
      } else if (char === ']') {
        depth--;
        current += char;
      } else if (char === '{') { // <--- Added curly brace depth tracking
        depth++;
        current += char;
      } else if (char === '}') { // <--- Added curly brace depth tracking
        depth--;
        current += char;
      } else if (char === '(') { // Optional: if you expect functions/tuples in array
        depth++;
        current += char;
      } else if (char === ')') { // Optional
        depth--;
        current += char;
      }
      // Element separator (comma) only at top-level depth
      else if (char === devider && depth === 0) {
        parts.push(current.trim());
        current = '';
      }
      // Add character to current element
      else {
        current += char;
      }
    }

    // Push the last part after the loop finishes
    if (current.trim()) parts.push(current.trim());

    // Process parsed parts
    const result = [];
    for (const part of parts) {
      if (part.trim().startsWith('. . . ')) {
        const name = part.slice(6).trim();
        let val = this.maps[name] ?? this.enums[name];
        if (Array.isArray(val)) {
          result.push(...val);
        } else if (val !== undefined && typeof val === 'object' && val !== null) { // Allow spreading objects into an array if desired, pushes values
          result.push(...Object.values(val)); // Or Object.keys(val), or throw error. Depends on desired behavior.
        }
        else if (val !== undefined) {
          result.push(val); // Push non-array, non-object spread values directly
        }
      } else {
        // --- Core logic for parsing individual elements ---
        if (part.startsWith('{') && part.endsWith('}')) {
          result.push(this.parseMapInline(part.slice(1, -1))); // Recursive call for nested maps
        } else if (part.startsWith('[') && part.endsWith(']')) {
          result.push(this.parseArr(part.slice(1, -1))); // Recursive call for nested arrays
        }
        // Direct literal parsing (order matters: check more specific first)
        else if (part === 'true') {
          result.push(true);
        } else if (part === 'false') {
          result.push(false);
        } else if (/^\d+(\.\d+)?$/.test(part)) { // Numbers
          result.push(Number(part));
        } else {
          // Fallback: evaluate as expression (e.g., variable not explicitly checked, or raw string)
          result.push(part);
        }
      }
    }
    return result;
  };

  parseArray = (expr, devider = ',', allows) => {
    if (!allows && !this.options?.strict) {
     devider = this.ARR_DEV;
    }
    expr = this.stripLC('##', String(expr));
    this.debug('parsing array...')
    // Auto-expand if the whole expr is a known enum or array variable
    if (this.enums[expr]) return this.enums[expr];
    if (Array.isArray(this.maps[expr])) return this.maps[expr];

    const parts = [];
    let current = '';
    let depth = 0; // Tracks depth for [], {}, and ()
    let inString = false;
    let quoteType = '';

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];

      // String handling
      if ((char === '"' || char === "'" || char === '`') && !inString) {
        inString = true;
        quoteType = char;
        current += char;
      } else if (char === quoteType && inString) {
        inString = false;
        quoteType = '';
        current += char;
      } else if (inString) {
        current += char;
      }
      // Depth tracking for nested structures
      else if (char === '[') {
        depth++;
        current += char;
      } else if (char === ']') {
        depth--;
        current += char;
      } else if (char === '{') { // <--- Added curly brace depth tracking
        depth++;
        current += char;
      } else if (char === '}') { // <--- Added curly brace depth tracking
        depth--;
        current += char;
      } else if (char === '(') { // Optional: if you expect functions/tuples in array
        depth++;
        current += char;
      } else if (char === ')') { // Optional
        depth--;
        current += char;
      }
      // Element separator (devider) only at top-level depth
      else if (char === devider && depth === 0) {
        parts.push(current.trim());
        current = '';
      }
      // Add character to current element
      else {
        current += char;
      }
    }

    // Push the last part after the loop finishes
    if (current.trim()) parts.push(current.trim());

    // Process parsed parts
    const result = [];
    for (const part of parts) {
      if (part.trim().startsWith('. . . ')) {
        this.debug('found spread op.')
        const name = part.slice(6).trim();

        let val = this.evaluateExpr(name);
        if (Array.isArray(val)) {
          result.push(...val);
        } else if (val !== undefined && typeof val === 'object' && val !== null) { // Allow spreading objects into an array if desired, pushes values
          result.push(...Object.values(val)); // Or Object.keys(val), or throw error. Depends on desired behavior.
        }
        else if (val !== undefined) {
          result.push(val); // Push non-array, non-object spread values directly
        }
      } else {
        // --- Core logic for parsing individual elements ---
        if (part.startsWith('{') && part.endsWith('}')) {
          result.push(this.parseMapInline(part.slice(1, -1))); // Recursive call for nested maps
        } else if (part.startsWith('[') && part.endsWith(']')) {
          result.push(this.parseArray(part.slice(1, -1))); // Recursive call for nested arrays
        } else if (this.enums[part] !== undefined) {
          result.push(this.enums[part]);
        } else if (this.maps[part] !== undefined) { // Check for variables first
          // If a variable holds an array, push it directly or spread it?
          // Current logic spreads if starts with '...', but if just 'myArr', it pushes the array itself.
          // This behavior might need refinement based on your exact language rules.
          result.push(this.maps[part]);
        }
        // Direct literal parsing (order matters: check more specific first)
        else if (part === 'true') {
          result.push(true);
        } else if (part === 'false') {
          result.push(false);
        } else if (/^\d+(\.\d+)?$/.test(part)) { // Numbers
          result.push(Number(part));
        } else {
          // Fallback: evaluate as expression (e.g., variable not explicitly checked, or raw string)
          result.push(this.evaluateExpr(part));
        }
      }
    }
    return result;
  };


 validateStruct(struct, obj, mapping)  {
  let final = {}
  for (let key in struct) {
    let expected = typeof struct[key] === 'string' ? struct[key] : struct[key][0];
    const oldexpct = expected;
    if (mapping?.[expected]) expected = mapping[expected];
    const value = typeof obj[key] === 'undefined' ? struct[key][1] : obj[key];

    if (this?.options?.strict && mapping?.[oldexpct]) {
      if (!(this?.typenames?.[oldexpct])) throw 'unintialized typename "' + oldexpct + '", (is in strict mode.)';
      if (!(this?.typenames?.[oldexpct].includes(expected))) throw `typename '${oldexpct}' does not handle the given type ${expected}`
    }

    if (typeof expected === "function") {
      // Constructor check
      if (!(value instanceof expected)) {
        throw new Error(
          `Invalid type for ${key}: expected ${expected.name}, got ${value?.constructor?.name || this.typeof(value)}`
        );
      }
    } else if (typeof expected === "string") {
      // typeof check
      if (this.typeof(value) !== expected) {
        throw new Error(
          `Invalid type for ${key}: expected ${expected}, got ${this.typeof(value)}`
        );
      }
    } else {
      throw new Error(`Invalid struct definition for key ${key}`);
    }
    final[key] = value;
  }
  return final;
}

  attract(fnName, opts) {
    return this.fn(this._evalToken(fnName).args, this._evalToken(fnName).body, opts);
  }

  extract(fnName, opts) {
    return this.fn(fnName.args, fnName.body, opts);
  }

  _fixBrackets(tokens) {
    const fixed = [];

    for (let token of tokens) {
      if (/^[()\[\]{}]+$/.test(token) && token.length > 1) {
        // Split chains like '))' or '({'
        fixed.push(...token.split(''));
      } else {
        fixed.push(token);
      }
    }

    return fixed;
  }

  _runWithContext(ctxMap, code) {
    this.debug('runnung in context');
    // 1. Backup the current state of global variables and functions.
    this.backupObject(this, '12231');

    // Inject context into local scope
    for (const [key, val] of Object.entries(ctxMap)) {
      if (val && (val.native || val.body)) {
        this.functions[key] = val;
      } else {
        this.maps[key] = val;
      }
    }

    // Evaluate block
    let result;
    try {
      result = this.run(code); // Or this.evaluateExpr(code)
    } catch (e) {
      result = undefined;
    } finally {
      // 2. Restore/Clean up using this.restoreObject.
      this.restoreObject('12231', this);
    }
    return result;
  }

  getBlockTokens(tokens, iStart) {
    let depth = 1;
    const block = [];
    let i = iStart + 1;

    while (i < tokens.length && depth > 0) {
      const token = tokens[i];

      if (token === '{') depth++;
      if (token === '}') depth--;

      if (depth > 0) block.push(token);
      i++;
    }

    return { block, newIndex: i };
  }

  execNVBC(code) {
    const tokens = this.tokenize(code);
    const bytecode = this.compileTokensToBytecode(tokens.tokens);
    this.runBytecode(bytecode);
  }

  // ...existing code...
  compileTokensToBytecode(tokens) {
    const OP = {
      EXPR: 0x01,
      PRINT: 0x10,
      BLOCK: 0x20,
      HALT: 0xFF,
      ASSIGN: 0x30,
      IF: 0x40,
      WHILE: 0x50,
      FUNCDEF: 0x60,
      FUNCCALL: 0x61,
      RETURN: 0x70,
      BREAK: 0x71,
      CONTINUE: 0x72,
      LOG: 0x80,
    };

    const bytecode = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      // Print statement
      if (token === 'print') {
        if (tokens[i + 1] === '(') {
          i += 2;
          const exprTokens = [];
          while (tokens[i] !== ')' && i < tokens.length) exprTokens.push(tokens[i++]);
          i++; // skip ')'
          if (tokens[i] === ';') i++;
          bytecode.push(OP.EXPR, exprTokens.join(' ').trim());
          bytecode.push(OP.PRINT);
        } else {
          i++;
          const exprTokens = [];
          while (tokens[i] !== ';' && i < tokens.length) exprTokens.push(tokens[i++]);
          if (tokens[i] === ';') i++;
          bytecode.push(OP.EXPR, exprTokens.join(' ').trim());
          bytecode.push(OP.PRINT);
        }
        continue;
      }

      // Variable assignment
      if ((token === 'var' || token === 'let' || token === 'const') && /^[a-zA-Z_]\w*$/.test(tokens[i + 1])) {
        const varName = tokens[i + 1];
        i += 2;
        if (tokens[i] === '=') {
          i++;
          const exprTokens = [];
          while (tokens[i] !== ';' && i < tokens.length) exprTokens.push(tokens[i++]);
          if (tokens[i] === ';') i++;
          bytecode.push(OP.EXPR, exprTokens.join(' ').trim());
          bytecode.push(OP.ASSIGN, varName);
          continue;
        }
      }

      // If statement
      if (token === 'if' && tokens[i + 1] === '(') {
        i += 2;
        const condTokens = [];
        while (tokens[i] !== ')' && i < tokens.length) condTokens.push(tokens[i++]);
        i++; // skip ')'
        let blockTokens = [];
        if (tokens[i] === '{') {
          let depth = 1;
          i++;
          while (i < tokens.length && depth > 0) {
            if (tokens[i] === '{') depth++;
            if (tokens[i] === '}') depth--;
            if (depth > 0) blockTokens.push(tokens[i]);
            i++;
          }
        }
        // Compile block to bytecode
        const blockBytecode = this.compileTokensToBytecode(blockTokens);
        bytecode.push(OP.IF, condTokens.join(' ').trim(), blockBytecode);
        continue;
      }

      // While loop
      if (token === 'while' && tokens[i + 1] === '(') {
        i += 2;
        const condTokens = [];
        while (tokens[i] !== ')' && i < tokens.length) condTokens.push(tokens[i++]);
        i++; // skip ')'
        let blockTokens = [];
        if (tokens[i] === '{') {
          let depth = 1;
          i++;
          while (i < tokens.length && depth > 0) {
            if (tokens[i] === '{') depth++;
            if (tokens[i] === '}') depth--;
            if (depth > 0) blockTokens.push(tokens[i]);
            i++;
          }
        }
        // Compile block to bytecode
        const blockBytecode = this.compileTokensToBytecode(blockTokens);
        bytecode.push(OP.WHILE, condTokens.join(' ').trim(), blockBytecode);
        continue;
      }

      // Function definition
      if (token === 'func' && /^[a-zA-Z_]\w*$/.test(tokens[i + 1])) {
        const funcName = tokens[i + 1];
        i += 2;
        let args = '';
        if (tokens[i] === '(') {
          i++;
          const argTokens = [];
          while (tokens[i] !== ')' && i < tokens.length) argTokens.push(tokens[i++]);
          i++; // skip ')'
          args = argTokens.join(' ').trim();
        }
        let bodyTokens = [];
        if (tokens[i] === '{') {
          let depth = 1;
          i++;
          while (i < tokens.length && depth > 0) {
            if (tokens[i] === '{') depth++;
            if (tokens[i] === '}') depth--;
            if (depth > 0) bodyTokens.push(tokens[i]);
            i++;
          }
        }
        // Compile function body to bytecode
        const bodyBytecode = this.compileTokensToBytecode(bodyTokens);
        bytecode.push(OP.FUNCDEF, funcName, args, bodyBytecode);
        continue;
      }

      // Function call
      if (/^[a-zA-Z_]\w*$/.test(token) && tokens[i + 1] === '(') {
        const funcName = token;
        i += 2;
        const argTokens = [];
        while (tokens[i] !== ')' && i < tokens.length) argTokens.push(tokens[i++]);
        i++; // skip ')'
        bytecode.push(OP.FUNCCALL, funcName, argTokens.join(' ').trim());
        continue;
      }

      // Block
      if (token === '{') {
        let depth = 1;
        i++;
        const blockTokens = [];
        while (i < tokens.length && depth > 0) {
          if (tokens[i] === '{') depth++;
          if (tokens[i] === '}') depth--;
          if (depth > 0) blockTokens.push(tokens[i]);
          i++;
        }
        // Compile block to bytecode
        const blockBytecode = this.compileTokensToBytecode(blockTokens);
        bytecode.push(OP.BLOCK, blockBytecode);
        continue;
      }

      // Log statement
      if (token === 'log' && tokens[i + 1] === '(') {
        i += 2;
        const exprTokens = [];
        while (tokens[i] !== ')' && i < tokens.length) exprTokens.push(tokens[i++]);
        i++; // skip ')'
        if (tokens[i] === ';') i++;
        bytecode.push(OP.EXPR, exprTokens.join(' ').trim());
        bytecode.push(OP.LOG);
        continue;
      }

      // Return
      if (token === 'return') {
        i++;
        const exprTokens = [];
        while (tokens[i] !== ';' && i < tokens.length) exprTokens.push(tokens[i++]);
        if (tokens[i] === ';') i++;
        bytecode.push(OP.EXPR, exprTokens.join(' ').trim());
        bytecode.push(OP.RETURN);
        continue;
      }

      // Break/Continue
      if (token === 'break') {
        i++;
        bytecode.push(OP.BREAK);
        continue;
      }
      if (token === 'continue') {
        i++;
        bytecode.push(OP.CONTINUE);
        continue;
      }

      // Fallback: treat as expression
      if (token !== ';') {
        const exprTokens = [];
        while (i < tokens.length && tokens[i] !== ';') exprTokens.push(tokens[i++]);
        if (tokens[i] === ';') i++;
        bytecode.push(OP.EXPR, exprTokens.join(' ').trim());
      }
    }

    bytecode.push(OP.HALT);
    return bytecode;
  }
  backupObject(_, id) {
    // Only backup properties you care about (excluding _backups itself)
    this.LAST_BU_ID = id;
    const backup = {};
    for (const key of Object.keys(this)) {
      if (key !== '_backups') backup[key] = cloneDeep(this[key]);
    }
    this._backups[id] = backup;
  }

  restoreObject(id) {
    const backup = this._backups[id];
    if (!backup) {
      console.warn(`No backup found for id: ${id}`);
      return;
    }
const self = this;
    // A helper function to perform the recursive restoration
function restoreRecursive(target, source, depth, seen = new WeakSet()) {
      // Only iterate through the current object's keys
if (seen.has(target)) return; // 🚫 already visited
seen.add(target);

      for (const key of Object.keys(target)) {
        // Exclude the backup storage property
        if (key === '_backups') {
          continue;
        }

        // If the key is not in the source, it's a new property.
        if (!(key in source)) {
          // Check if the property is at a depth that's less that self.delete_depth (defaults 2).
          // If so, delete it.
          if (depth < self.delete_depth) {
            if (!self.options?.keep_envs) {
                if (!target[key]?.do_not?.delete) {
if (target[key]?._destructor) {
  const result = target[key]._destructor();

  // Rebirth check
  if (result !== undefined && target[key]?.__reassign) {
    // __reassign decides what the object becomes
    target[key] = target[key].__reassign(target[key], result);
    continue; // don't delete it, it's reborn
  }

  // TTL check
  else if (target[key]?.ttl && typeof target[key].ttl === "number") {
    setTimeout(() => {
      if (!target[key]?.do_not?.delete) {
        if (target[key]?._destructor) {
          const lateResult = target[key]._destructor();
          if (lateResult !== undefined && target[key]?.__reassign) {
            target[key] = target[key].__reassign(lateResult);
            return;
          }
        }
        delete target[key];
      }
    }, target[key].ttl);

    continue; // skip immediate deletion
  }

  delete target[key];
} else {
  delete target[key];
}
  		}
	    }

          }
          // If depth is 2 or greater, do nothing; the new key is kept.
        } else {
          // If it's a nested object, recurse
          const sourceValue = source[key];
          const targetValue = target[key];

          if (typeof sourceValue === 'object' && sourceValue !== null &&
            typeof targetValue === 'object' && targetValue !== null &&
            !Array.isArray(sourceValue) && !Array.isArray(targetValue)
          ) {
            // Increment the depth for the recursive call
            restoreRecursive(targetValue, sourceValue, depth + 1, seen);
	  }
        }
      }
    }

    // Start the recursive process at depth 0
    restoreRecursive(this, backup, 0);
  }
  runBytecode(bytecode) {
    const OP = {
      EXPR: 0x01,
      PRINT: 0x10,
      BLOCK: 0x20,
      HALT: 0xFF,
      ASSIGN: 0x30,
      IF: 0x40,
      WHILE: 0x50,
      FUNCDEF: 0x60,
      FUNCCALL: 0x61,
      RETURN: 0x70,
      BREAK: 0x71,
      CONTINUE: 0x72,
      LOG: 0x80,
    };

    const stack = [];
    let i = 0;
    let env = this;
    let retVal = undefined;
    let running = true;

    // Store function bytecode definitions
    const localFuncs = {};

    while (i < bytecode.length && running) {
      const op = bytecode[i++];

      switch (op) {
        case OP.EXPR: {
          const expr = bytecode[i++];
          const result = env.evaluateExpr(expr);
          stack.push(result);
          break;
        }
        case OP.PRINT: {
          const value = stack.pop();
          env._log(value);
          break;
        }
        case OP.LOG: {
          const value = stack.pop();
          console.log(value);
          break;
        }
        case OP.ASSIGN: {
          const varName = bytecode[i++];
          const value = stack.pop();
          env.maps[varName] = value;
          break;
        }
        case OP.IF: {
          const condExpr = bytecode[i++];
          const blockBytecode = bytecode[i++];
          const cond = env.evaluateExpr(condExpr);
          if (cond) {
            env.runBytecode(blockBytecode);
          }
          break;
        }
        case OP.WHILE: {
          const condExpr = bytecode[i++];
          const blockBytecode = bytecode[i++];
          while (env.evaluateExpr(condExpr)) {
            env.runBytecode(blockBytecode);
          }
          break;
        }
        case OP.FUNCDEF: {
          const funcName = bytecode[i++];
          const args = bytecode[i++];
          const bodyBytecode = bytecode[i++];
          localFuncs[funcName] = { args: args.split(',').map(a => a.trim()), bytecode: bodyBytecode };
          env.functions[funcName] = localFuncs[funcName]; // Optionally update global
          break;
        }
        case OP.FUNCCALL: {
          const funcName = bytecode[i++];
          const argExprs = bytecode[i++].split(',').map(a => a.trim());
          const argVals = argExprs.map(expr => env.evaluateExpr(expr));
          const fn = localFuncs[funcName] || env.functions[funcName];
          if (fn && fn.bytecode) {
            this.backupObject(env, '121');
            fn.args.forEach((arg, idx) => { env.maps[arg] = argVals[idx]; });
            retVal = env.runBytecode(fn.bytecode);
            this.restoreObject('121', env);
            stack.push(retVal);
          } else if (fn && fn.native) {
            stack.push(fn.native(env, ...argVals));
          } else {
            throw new Error(`Function '${funcName}' not found`);
          }
          break;
        }
        case OP.BLOCK: {
          const blockBytecode = bytecode[i++];
          env.runBytecode(blockBytecode);
          break;
        }
        case OP.RETURN: {
          retVal = stack.pop();
          running = false;
          break;
        }
        case OP.BREAK: {
          running = false;
          break;
        }
        case OP.CONTINUE: {
          // Not implemented: would need loop context
          break;
        }
        case OP.HALT: {
          running = false;
          break;
        }
        default: {
          throw new Error("Unknown opcode: " + op);
        }
      }
    }

    return retVal;
  }




  _patchParenTokensSafe(tokens) {
    const patched = [];
    let buffer = '';
    let parenDepth = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];

      const isParenStart = t.includes('(');
      const isParenEnd = t.includes(')');
      const isFunctionCall = i > 0 && tokens[i - 1].match(/^[a-zA-Z_][a-zA-Z0-9_]*$/);

      if (isParenStart && !isFunctionCall && parenDepth === 0) {
        buffer = t;
        parenDepth += (t.match(/\(/g) || []).length;
        parenDepth -= (t.match(/\)/g) || []).length;
      } else if (buffer) {
        buffer += ' ' + t;
        if (isParenEnd) {
          parenDepth -= (t.match(/\)/g) || []).length;
          if (parenDepth <= 0) {
            patched.push(buffer);
            buffer = '';
          }
        }
      } else {
        patched.push(t);
      }
    }

    if (buffer) patched.push(buffer); // just in case

    return patched;
  }

  typeof(value) {

    // Nova custom types
    if (value?.getType && value?.typeProperties?.isType) {
      return value.getType();
    }

    // null
    if (value === null) return 'null';

    // arrays
    if (Array.isArray(value)) return "array";

    // numbers
    if (typeof value === 'number' || value?.__isPointerNumber) {
      if (Number.isInteger(value)) return "integer";
      if (Number.isNaN(value)) return "numeric:invalid";
      return "float";
    }

    // extended JS objects
    if (value instanceof Date) return "date";
    if (Buffer.isBuffer(value)) return "buffer";

    // fallback
    switch (typeof value) {
      case "string": return "string";
      case "boolean": return "boolean";
      case "undefined": return "undefined";
      case "symbol": return "symbol";
      case "object": return "object";
      default: return typeof value;
    }
  }
extractFn(expr) {
if (expr.trim().match(/^\(.*\)\s*=>\s*{.*}$/s)) {
      this.debug('found arrow function');
      // It's a Nova-style inline function
      const arrowIndex = expr.indexOf('=>');
      this.debug(`arrowIndex: ${arrowIndex}`);
      const argsStr = expr.slice(0, arrowIndex).trim();
      this.debug(`argsStr: ${argsStr}`);
      const bodyStr = expr.slice(arrowIndex + 2).trim();
      this.debug(`bodyStr: ${bodyStr}`);

      const argList = this.parseArr(argsStr.slice(1, -1));
      this.debug(`argList: ${JSON.stringify(argList)}`);

      const body = bodyStr.replace(/^\{|\}$/g, '').trim();
      this.debug(`body: ${body}`);


      return this.extract({
        args: argList,
        body
      })
    }

    // Detect expression arrow functions: (args) => val
    if (expr.trim().match(/^\(.*\)\s*=>\s*[^{}].*$/s)) {
      this.debug('found expression arrow function');

      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(0, arrowIndex).trim();
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = this.parseArr(argsStr.slice(1, -1));

      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return this.extract({
        args: argList,
        body
      }, { usetype: 'expr' }); // mark it as an expression-style body
    }

    // Single-arg block arrow function: arg => { body }
    if (expr.trim().match(/^[a-zA-Z_$][\w$]*\s*=>\s*{.*}$/s)) {
      this.debug('found single-arg block arrow function');

      const arrowIndex = expr.indexOf('=>');
      const argStr = expr.slice(0, arrowIndex).trim();
      const body = expr.slice(arrowIndex + 2).trim().replace(/^\{|\}$/g, '').trim();

      const argList = [argStr];

      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return this.extract({
        args: argList,
        body
      });
    }
  // Single-arg expression arrow function: arg => val
    if (expr.trim().match(/^[a-zA-Z_$][\w$]*\s*=>\s*[^{}].*$/s)) {
      this.debug('found single-arg expression arrow function');

      const arrowIndex = expr.indexOf('=>');
      const argStr = expr.slice(0, arrowIndex).trim();
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = [argStr];

      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return this.extract({
        args: argList,
        body
      }, { usetype: 'expr' }); // expression-style body
    }

    // Immediately-run block arrow function: [args] => { code }
    if (expr.trim().match(/^\[\s*[\w$,\s]*\s*\]\s*=>\s*{.*}$/s)) {
      this.debug('found immediately-run block arrow function');

      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(0, arrowIndex).trim().replace(/^\[|\]$/g, '').trim();
      const body = expr.slice(arrowIndex + 2).trim().replace(/^\{|\}$/g, '').trim();

      const argList = this.parseArr(argsStr);

      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      // wrap directly in an IIFE
      return (this.extract({
        args: argList,
        body
      }))();
    }

    // Immediately-run expression arrow function: [args] => val
    if (expr.trim().match(/^\[\s*[\w$,\s]*\s*\]\s*=>\s*[^{}].*$/s)) {
      this.debug('found immediately-run expression arrow function');

      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(0, arrowIndex).trim().replace(/^\[|\]$/g, '').trim();
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = this.parseArr(argsStr);

      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      // wrap directly in an IIFE
      return (this.extract({
        args: argList,
        body
      }, { usetype: 'expr' }))();
    }
    // Async block arrow function: async (args) => { body }
    if (expr.trim().match(/^async\s*\(.*\)\s*=>\s*{.*}$/s)) {
      this.debug('found async block arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(5, arrowIndex).trim().replace(/^\(|\)$/g, '');
      const body = expr.slice(arrowIndex + 2).trim().replace(/^\{|\}$/g, '').trim();

      const argList = this.parseArr(argsStr);
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return async () => (this.extract({ args: argList, body }))();
    }

    // Async expression arrow function: async (args) => val
    if (expr.trim().match(/^async\s*\(.*\)\s*=>\s*[^{}].*$/s)) {
      this.debug('found async expression arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(5, arrowIndex).trim().replace(/^\(|\)$/g, '');
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = this.parseArr(argsStr);
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return async () => (this.extract({ args: argList, body }, { usetype: 'expr' }))();
    }

    // Async single-arg block arrow function: async arg => { body }
    if (expr.trim().match(/^async\s*[a-zA-Z_$][\w$]*\s*=>\s*{.*}$/s)) {
      this.debug('found async single-arg block arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argStr = expr.slice(5, arrowIndex).trim();
      const body = expr.slice(arrowIndex + 2).trim().replace(/^\{|\}$/g, '').trim();

      const argList = [argStr];
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return async () => (this.extract({ args: argList, body }))();
    }

    // Async single-arg expression arrow function: async arg => val
    if (expr.trim().match(/^async\s*[a-zA-Z_$][\w$]*\s*=>\s*[^{}].*$/s)) {
      this.debug('found async single-arg expression arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argStr = expr.slice(5, arrowIndex).trim();
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = [argStr];
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);


      return async () => (this.extract({ args: argList, body }, { usetype: 'expr' }))();
    }

    // Async immediately-run block arrow function: async [args] => { code }
    if (expr.trim().match(/^async\s*\[\s*[\w$,\s]*\s*\]\s*=>\s*{.*}$/s)) {
      this.debug('found async immediately-run block arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(5, arrowIndex).trim().replace(/^\[|\]$/g, '').trim();
      const body = expr.slice(arrowIndex + 2).trim().replace(/^\{|\}$/g, '').trim();

      const argList = this.parseArr(argsStr);
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);


      return (async () => (this.extract({ args: argList, body })))();
    }
    // Async immediately-run expression arrow function: async [args] => val
    if (expr.trim().match(/^async\s*\[\s*[\w$,\s]*\s*\]\s*=>\s*[^{}].*$/s)) {
      this.debug('found async immediately-run expression arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(5, arrowIndex).trim().replace(/^\[|\]$/g, '').trim();
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = this.parseArr(argsStr);
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);


      return (async () => (this.extract({ args: argList, body }, { usetype: 'expr' })))()
};
if (expr.startsWith('{') && expr.endsWith('}')) {
return this.fn([], expr.slice(1,-1));
} else {
return this.fn([], expr, { usetype: 'expr' });
}
};
  evaluateExpr(expr, called, istoc) {
    this.debug('evaluating expr: ' + expr);
    if (typeof expr !== 'string') expr = String(expr).trim();
    if (expr.startsWith("define ")) {
      let parts = expr.trim().split(/\s+/); // split by spaces
      let name = parts[1]; // word after "define"
      let e = parts.slice(3).join(' '); // everything after name
      let d = this.evaluateExpr(e);
      this._assignToPath(name, d);
      this.descpr(`defines "${name}" with ${d}`);
      return d;
    }

    if (expr.trim().match(/^\(.*\)\s*=>\s*{.*}$/s)) {
      this.debug('found arrow function');
      // It's a Nova-style inline function
      const arrowIndex = expr.indexOf('=>');
      this.debug(`arrowIndex: ${arrowIndex}`);
      const argsStr = expr.slice(0, arrowIndex).trim();
      this.debug(`argsStr: ${argsStr}`);
      const bodyStr = expr.slice(arrowIndex + 2).trim();
      this.debug(`bodyStr: ${bodyStr}`);

      const argList = this.parseArr(argsStr.slice(1, -1));
      this.debug(`argList: ${JSON.stringify(argList)}`);

      const body = bodyStr.replace(/^\{|\}$/g, '').trim();
      this.debug(`body: ${body}`);


      return this.extract({
        args: argList,
        body
      })
    }

    // Detect expression arrow functions: (args) => val
    if (expr.trim().match(/^\(.*\)\s*=>\s*[^{}].*$/s)) {
      this.debug('found expression arrow function');

      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(0, arrowIndex).trim();
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = this.parseArr(argsStr.slice(1, -1));

      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return this.extract({
        args: argList,
        body
      }, { usetype: 'expr' }); // mark it as an expression-style body
    }

    // Single-arg block arrow function: arg => { body }
    if (expr.trim().match(/^[a-zA-Z_$][\w$]*\s*=>\s*{.*}$/s)) {
      this.debug('found single-arg block arrow function');

      const arrowIndex = expr.indexOf('=>');
      const argStr = expr.slice(0, arrowIndex).trim();
      const body = expr.slice(arrowIndex + 2).trim().replace(/^\{|\}$/g, '').trim();

      const argList = [argStr];

      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return this.extract({
        args: argList,
        body
      });
    }

    // Single-arg expression arrow function: arg => val
    if (expr.trim().match(/^[a-zA-Z_$][\w$]*\s*=>\s*[^{}].*$/s)) {
      this.debug('found single-arg expression arrow function');

      const arrowIndex = expr.indexOf('=>');
      const argStr = expr.slice(0, arrowIndex).trim();
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = [argStr];

      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return this.extract({
        args: argList,
        body
      }, { usetype: 'expr' }); // expression-style body
    }

    // Immediately-run block arrow function: [args] => { code }
    if (expr.trim().match(/^\[\s*[\w$,\s]*\s*\]\s*=>\s*{.*}$/s)) {
      this.debug('found immediately-run block arrow function');

      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(0, arrowIndex).trim().replace(/^\[|\]$/g, '').trim();
      const body = expr.slice(arrowIndex + 2).trim().replace(/^\{|\}$/g, '').trim();

      const argList = this.parseArr(argsStr);

      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      // wrap directly in an IIFE
      return (this.extract({
        args: argList,
        body
      }))();
    }

    // Immediately-run expression arrow function: [args] => val
    if (expr.trim().match(/^\[\s*[\w$,\s]*\s*\]\s*=>\s*[^{}].*$/s)) {
      this.debug('found immediately-run expression arrow function');

      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(0, arrowIndex).trim().replace(/^\[|\]$/g, '').trim();
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = this.parseArr(argsStr);

      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      // wrap directly in an IIFE
      return (this.extract({
        args: argList,
        body
      }, { usetype: 'expr' }))();
    }
    // Async block arrow function: async (args) => { body }
    if (expr.trim().match(/^async\s*\(.*\)\s*=>\s*{.*}$/s)) {
      this.debug('found async block arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(5, arrowIndex).trim().replace(/^\(|\)$/g, '');
      const body = expr.slice(arrowIndex + 2).trim().replace(/^\{|\}$/g, '').trim();

      const argList = this.parseArr(argsStr);
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return async () => (this.extract({ args: argList, body }))();
    }

    // Async expression arrow function: async (args) => val
    if (expr.trim().match(/^async\s*\(.*\)\s*=>\s*[^{}].*$/s)) {
      this.debug('found async expression arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(5, arrowIndex).trim().replace(/^\(|\)$/g, '');
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = this.parseArr(argsStr);
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return async () => (this.extract({ args: argList, body }, { usetype: 'expr' }))();
    }

    // Async single-arg block arrow function: async arg => { body }
    if (expr.trim().match(/^async\s*[a-zA-Z_$][\w$]*\s*=>\s*{.*}$/s)) {
      this.debug('found async single-arg block arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argStr = expr.slice(5, arrowIndex).trim();
      const body = expr.slice(arrowIndex + 2).trim().replace(/^\{|\}$/g, '').trim();

      const argList = [argStr];
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);

      return async () => (this.extract({ args: argList, body }))();
    }

    // Async single-arg expression arrow function: async arg => val
    if (expr.trim().match(/^async\s*[a-zA-Z_$][\w$]*\s*=>\s*[^{}].*$/s)) {
      this.debug('found async single-arg expression arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argStr = expr.slice(5, arrowIndex).trim();
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = [argStr];
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);


      return async () => (this.extract({ args: argList, body }, { usetype: 'expr' }))();
    }

    // Async immediately-run block arrow function: async [args] => { code }
    if (expr.trim().match(/^async\s*\[\s*[\w$,\s]*\s*\]\s*=>\s*{.*}$/s)) {
      this.debug('found async immediately-run block arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(5, arrowIndex).trim().replace(/^\[|\]$/g, '').trim();
      const body = expr.slice(arrowIndex + 2).trim().replace(/^\{|\}$/g, '').trim();

      const argList = this.parseArr(argsStr);
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);


      return (async () => (this.extract({ args: argList, body })))();
    }
    // Async immediately-run expression arrow function: async [args] => val
    if (expr.trim().match(/^async\s*\[\s*[\w$,\s]*\s*\]\s*=>\s*[^{}].*$/s)) {
      this.debug('found async immediately-run expression arrow function');
      const arrowIndex = expr.indexOf('=>');
      const argsStr = expr.slice(5, arrowIndex).trim().replace(/^\[|\]$/g, '').trim();
      const body = expr.slice(arrowIndex + 2).trim();

      const argList = this.parseArr(argsStr);
      this.debug(`argList: ${JSON.stringify(argList)}`);
      this.debug(`body: ${body}`);


      return (async () => (this.extract({ args: argList, body }, { usetype: 'expr' })))();
    }
    // Try/catch as expression: try { ... } catch("err") { ... }
    if (/^try\s*{/.test(expr)) {
      this.debug('found try block in expr');
      // Parse try block
      let tryMatch = expr.match(/^try\s*{([\s\S]*?)}\s*catch\s*\(\s*["']?([a-zA-Z_]\w*)["']?\s*\)\s*{([\s\S]*?)}/);
      if (tryMatch) {
        this.debug('tryMatch found');
        const tryBody = tryMatch[1].trim();
        this.debug(`tryBody: ${tryBody}`);
        const errName = tryMatch[2].trim();
        this.debug(`errName: ${errName}`);
        const catchBody = tryMatch[3].trim();
        this.debug(`catchBody: ${catchBody}`);
        try {
          this.debug('attempting to evaluate tryBody');
          return this.evaluateExpr(tryBody);
        } catch (e) {
          this.debug(`caught error: ${e.message}, assigning to ${errName}`);
          this.maps[errName] = e;
          this.debug('evaluating catchBody');
          return this.evaluateExpr(catchBody);
        }
      }
    }

    const prefixMatch = expr.match(/^([a-zA-Z_][\w]*)\s+(.*)$/);
    if (prefixMatch && this.prefs[prefixMatch[1]]) {
      this.debug(`found prefix match: ${prefixMatch[1]}`);
      const prefixName = prefixMatch[1];
      const argExpr = prefixMatch[2].trim();
      this.debug(`prefixName: ${prefixName}, argExpr: ${argExpr}`);
      // Evaluate the argument expression before passing to prefix function
      const evaluatedArg = this.evaluateExpr(argExpr);
      this.debug(`evaluatedArg for prefix: ${evaluatedArg}`);
      this.descpr(`calls user-defined prefix: ${prefixName}`)
      return this.prefs[prefixName](evaluatedArg);
    }
    if (expr.startsWith('defined ')) {
      this.debug('finding defined');
      const name = expr.slice(8).trim();
      this.debug(`checking if variable '${name}' is defined`);
      this.descpr(`checks if ${name} is defined`);
      return this.maps?.hasOwnProperty(name);
    }
    if (expr.startsWith('isnull ')) {
      this.debug('finding isnull');
      const val = this.evaluateExpr(expr.slice(7).trim());
      this.debug(`isnull value: ${val}`);
      return val === null || val === undefined;
    }
    if (expr.startsWith('keys ')) {
      this.debug('finding keys');
      const val = this.evaluateExpr(expr.slice(5).trim());
      this.debug(`keys of value: ${JSON.stringify(val)}`);
      return (typeof val === 'object' && val !== null) ? Object.keys(val) : [];
    }

    if (expr.startsWith('typeis ')) {
      this.debug('checking type match');
      const [left, right] = expr.slice(7).trim().split(/\s+/, 2);
      this.debug(`typeis left: ${left}, right: ${right}`);
      const val = this.evaluateExpr(left);
      const expected = this.evaluateExpr(right);
      this.debug(`typeis evaluated val: ${val}, expected: ${expected}`);
      if (val === null && expected === 'null') return true;
      if (Array.isArray(val) && expected === 'array') return true;
      return this.typeof(val) === expected;
    }
    if (expr.startsWith('default ')) {
      this.debug('doing defaulted expr');
      const parts = expr.slice(8).trim().split(/\s+/, 2);
      this.debug(`default parts: ${JSON.stringify(parts)}`);
      const a = this.evaluateExpr(parts[0]);
      this.debug(`default first part evaluated to: ${a}`);
      const result = (a !== undefined && a !== null) ? a : this.evaluateExpr(parts[1]);
      this.debug(`default result: ${result}`);
      return result;
    }
    if (expr.startsWith('range ')) {
      this.debug('doing prefix range op');
      const parts = expr.slice(6).trim().split(/\s+/);
      this.debug(`range parts: ${JSON.stringify(parts)}`);
      const a = Number(this.evaluateExpr(parts[0]));
      const b = Number(this.evaluateExpr(parts[1]));
      this.debug(`range a: ${a}, b: ${b}`);
      return Array.from({
        length: b - a + 1
      }, (_, i) => a + i);
    }

    if (expr.startsWith('not ')) {
      this.debug('handling not expression');
      const valToNegate = this.evaluateExpr(expr.slice(4).trim());
      this.debug(`not evaluating: ${valToNegate}`);
      return !valToNegate;
    }
    this.debug('tokenizing expression');
    // --- Start Currency Tokenization Modification ---
    // Dynamically build the currency unit regex part
    let currencyUnits = [];
    for (const category in this.currencies) {
      if (this.currencies.hasOwnProperty(category)) {
        for (const unit in this.currencies[category]) {
          if (unit !== "base_unit" && this.currencies[category].hasOwnProperty(unit)) {
            currencyUnits.push(unit);
          }
        }
      }
    }
    // Sort longer units first to prevent partial matches (e.g., 'milliseconds' before 'ms', 'ms' before 's')
    currencyUnits.sort((a, b) => b.length - a.length);
    const currencyUnitRegex = currencyUnits.length > 0 ? `(?:${currencyUnits.join('|')})` : ''; // Non-capturing group for units

    // Updated regex to include numbers followed by a currency unit
    // Key change: The unit part is now outside the numeric part and specifically looks for the units.
    let tokens = expr.match(
      new RegExp(`"[^"]*"|'[^']*'|\`[^\`]*\`|` + // Strings
        `[0]+x[0-9A-Za-z_]+|` +
        `([0-9]+(?:\\.[0-9]+)?${currencyUnitRegex})|` + // Numbers with optional currency units
        `[0-9]+\\.[0-9]+|` +
        `[0-9]+\\.{2,3}[0-9]+|` +
        `[0-9]+(?:_[0-9]+)*|[a-zA-Z_][a-zA-Z0-9_]*(?:\\.[a-zA-Z0-9_]+)*|[!]=?==?|>>>|===|::|--|\\+\\+|\\*\\*|==|<=|>=|=>|\\?\\.|>>|<<|>>>|\\?\\?|&&|\#\:|\\|\\||[+\\-\$*/%<>|=.!&|^~?:,;(){}\\[\\]>]`, 'g')
    ) || [];
    // Filter out undefined matches that can occur with outer capturing groups
    tokens = tokens.filter(token => token !== undefined);
    // --- End Currency Tokenization Modification ---

    this.debug(`initial tokens: ${JSON.stringify(tokens)}`);

    let grouped = this._groupTokens(tokens); //join {...}, nothibg wrong here too
    this.debug(`grouped tokens: ${JSON.stringify(grouped)}`);
    grouped = this._fixBrackets(grouped);
    this.debug(`fixed brackets grouped tokens: ${JSON.stringify(grouped)}`);
    this.debug(`reordered tokens by precedence: ${JSON.stringify(grouped)}`);

    if (this.options.debugExpr) {
      console.log(grouped);
    }
    let i = 0;
    const leftObj = this._advanceToks(grouped, i, called, istoc);
    i += leftObj._consumed;
    let left = leftObj.value();
    this.debug(`initial left operand:`, left);
    let finalLeft = null;
    let leftIsArray = false;
    // Pretty chained ternary — safe, final boss edition
    if (grouped.includes('if') && grouped.includes('else')) {
      this.debug('found ternary expression');
      let i = 0;
      while (i < grouped.length) {
        // Step 1: Collect value expression
        const valParts = [];
        while (i < grouped.length && grouped[i] !== 'if') {
          valParts.push(grouped[i++]);
        }
        const valExpr = (valParts.join(' ') || '').trim();
        this.debug(`ternary valExpr: ${valExpr}`);

        // Step 2: Check for 'if'
        if (i >= grouped.length || grouped[i] !== 'if') break;
        i++; // consume 'if'
        this.debug('consumed "if"');

        // Step 3: Collect condition expression
        const condParts = [];
        while (i < grouped.length && grouped[i] !== 'else') {
          condParts.push(grouped[i++]);
        }
        const condExpr = (condParts.join(' ') || '').trim();
        this.debug(`ternary condExpr: ${condExpr}`);

        // Step 4: Check for 'else'
        if (i >= grouped.length || grouped[i] !== 'else') break;
        i++; // consume 'else'
        this.debug('consumed "else"');

        // Step 5: Evaluate the condition
        this.debug(`evaluating ternary condition: ${condExpr}`);
        const condition = this.evaluateExpr(condExpr);
        this.debug(`ternary condition result: ${condition}`);

        if (condition) {
          this.debug('condition is true, evaluating valExpr');
          return this.evaluateExpr(valExpr);
        }

        // If false, loop continues—but do NOT skip fallback
        this.debug('condition is false, continuing in ternary loop');
      }

      // 🪂 Fallback: get last else clause
      let lastElseIndex = grouped.lastIndexOf('else');
      if (lastElseIndex !== -1 && lastElseIndex + 1 < grouped.length) {
        this.debug('found last "else" clause for fallback');
        const fallback = grouped.slice(lastElseIndex + 1).join(' ').trim();
        this.debug(`fallback expression: ${fallback}`);
        return this.evaluateExpr(fallback);
      }

      // 🛑 Nothing to fallback to
      this._log("Ternary expression has no valid fallback.");
      this.debug('ternary expression has no valid fallback, returning undefined');
      return undefined;
    }
    let inoi = 0;
    while (i < grouped.length) {
      let OLDIT = grouped[inoi];

      inoi = i;
      let op = grouped[i++];

if (op.slice(1).startsWith("dynamic::")) {
op = this.evaluateExpr(this._evalToken(op).slice(9));
}

if (grouped[i] === '=') {
let value = this.evaluateExpr(`${grouped.slice(0, i-1).join(' ')} ${op} ${grouped.slice(i+1).join(' ')}`);
this.ref.assign(value);
return this.ref.get();
}
      let IST = (d) => {
        if ((op === d && !['if'].includes(d)) || (OLDIT === d)) return true
        else return false;
      }
      let ISTGR = (d) => {
        if (d(OLDIT)) return true
        else return false;
      }
      if (IST(';') && !this.options?.dONTsTOPoNsEMICOLONS) return left;
      if (IST('typeof')) {
        let named = this._advanceToks(grouped, inoi, called, true);
        inoi += named._consumed;
        named = named.value();
        if (Array.isArray(named?.args) && named?.body) named = this.extract(named);
        left = this.typeof(named);
        i = inoi;
        continue;
      }
if (IST('array')) {
  let typeArgs = [];
  let bb = op;  // current token, could be '<' or '{...}'

  // Handle generic type arguments like <T>
  if (op === "<") {
    let body = [];
    let depth = 1;
    while (i < grouped.length && depth > 0) {
      if (grouped[i] === "<") depth++;
      else if (grouped[i] === ">") depth--;

      if (depth > 0) body.push(grouped[i]);
      i++;
    }
    bb = grouped[i]; // should now be the '{ ... }' token
    typeArgs = this.parseArray(body.join(' ')); // extract type args
  }
  // bb is now the array literal token like '{1,2,3}'
  let val = this.parseArray(bb.slice(1, -1));

  // If there’s a type argument, validate elements
if (typeArgs.length > 0) {
  let expectedType = typeArgs[0];  // 'integer', 'string', etc.
  for (let idx = 0; idx < val.length; idx++) {
    if (!typeArgs.includes(this.typeof(val[idx]))) {
      // Decide: throw error or just ignore? For strict mode, throw:
        throw new Error(
          `typed array error: element (${val[idx]}) at index ${idx} is ${this.typeof(val[idx])}, expected one of ${typeArgs}`
        );
    }
  }
}
  left = val;
  if (i + 1 > grouped.length - 1) return left;
  continue;
}
if (IST('shared')) {
  let name = op;
  let body = grouped.slice(i).join(' '); // skip the 'shared' keyword & variable name
  let val = this.evaluateExpr(body);

  // save in memory
  this.maps[name] = val;

  // save to file
  let old = {};
  if (fs.existsSync(path.join(__dirname, './.env'))) {
    old = JSON.parse(fs.readFileSync(path.join(__dirname,'./.env'), 'utf8'));
  }
  old[name] = val;
  fs.writeFileSync(path.join(__dirname ,'./.env'), JSON.stringify(old, null, 2), 'utf8');
  return;
}


if (IST('fnum')) {
  let name = op;
  if (grouped[i] !== ':') throw "expected ':' after fnum name.";
  i++; // skip ':'
  let b = [];
  while (grouped[i] !== '=') {
     b.push(grouped[i++]);
  }
  i++; // skip '='
  let fargs = this.parseArray(b.join(' '));
  let body = grouped.slice(i).join(' ');
  let val = this.evaluateExpr(body);

  // save in memory
  createFnum(this.maps, name, fargs?.[0], fargs?.[1], val);

  return val;
}


if (IST('Ptr')) {
  let name = op;
  if (grouped[i] !== '=') throw 'expected equals sign after pointer name.';
  i++;
  let body = grouped.slice(i).join(' ');
  let val = this.evaluateExpr(body);

  // save in memory
  this.ptr(name, val);

  return val;
}

if (IST('lval')) {
  let name = op;
  if (grouped[i] !== ':') throw "expected ':' after lval name.";
  i++; // skip ':'
  let b = [];
  while (grouped[i] !== '=') {
     b.push(grouped[i++]);
  }
  i++; // skip '='
  let fargs = this.parseArray(b.join(' '));
  let body = grouped.slice(i).join(' ');
  let val = this.evaluateExpr(body);

  // save in memory
  createListed(this.maps, name, val, fargs);

  return val;
}

if (IST('fsum')) {
  let name = op;
  if (grouped[i] !== ':') throw "expected ':' after fnum name.";
  i++; // skip ':'
  let b = [];
  while (grouped[i] !== '=') {
     b.push(grouped[i++]);
  }
  i++; // skip '='
  let fargs = this.parseArray(b.join(' '));
  let body = grouped.slice(i).join(' ');
  let val = this.evaluateExpr(body);

  // save in memory
  defineFsum(this.maps, name, fargs.slice(1), val, fargs?.[0]);

  return val;
}


if (IST('fint')) {
  let name = op;
  if (grouped[i] !== ':') throw "expected ':' after fnum name.";
  i++; // skip ':'
  let b = [];
  while (grouped[i] !== '=') {
     b.push(grouped[i++]);
  }
  i++; // skip '='
  let fargs = this.parseArray(b.join(' '));
  let body = grouped.slice(i).join(' ');
  let val = this.evaluateExpr(body);
  // save in memory
  createFint(this.maps, name, fargs?.[0], fargs?.[1], val);

  return val;
}

if (IST('proportial')) {
if(op !== '(') throw "expected '('";
        let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
          if (i >= grouped.length) {
            this.debug("Reached end of tokens, parenCount=" + parenCount);
            throw "missing closing ')'.";
          }

          let tok = grouped[i++];
          this.debug("tok=" + tok + " i=" + i + " parenCount=" + parenCount);

          if (tok === '(') {
            parenCount++;
            this.debug("Increment parenCount -> " + parenCount);
            body.push(tok);
          } else if (tok === ')') {
            parenCount--;
            this.debug("Decrement parenCount -> " + parenCount);
            if (parenCount === 0) {
              this.debug("Breaking on closing ')'");
              break;
            }
            body.push(tok);
          } else {
            body.push(tok);
          }
        }

        let args = this.parseArray(body.join(' '));
  let name = grouped[i++];
  if (grouped[i] !== ':') throw "expected ':' after fnum name.";
  i++; // skip ':'
  let b = [];
  while (grouped[i] !== '=') {
     b.push(grouped[i++]);
  }
  i++; // skip '='
  let Pargs = this.parseArray(b.join(' '));
  let bdy = grouped.slice(i).join(' ');
  let val = this.evaluateExpr(bdy);

  defineProportional(this.maps, args?.[0], args?.[1], name, Pargs, val);

  return val;
}


if (IST('fproportial')) {
if(op !== '(') throw "expected '('";
        let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
          if (i >= grouped.length) {
            this.debug("Reached end of tokens, parenCount=" + parenCount);
            throw "missing closing ')'.";
          }

          let tok = grouped[i++];
          this.debug("tok=" + tok + " i=" + i + " parenCount=" + parenCount);

          if (tok === '(') {
            parenCount++;
            this.debug("Increment parenCount -> " + parenCount);
            body.push(tok);
          } else if (tok === ')') {
            parenCount--;
            this.debug("Decrement parenCount -> " + parenCount);
            if (parenCount === 0) {
              this.debug("Breaking on closing ')'");
              break;
            }
            body.push(tok);
          } else {
            body.push(tok);
          }
        }

        let args = this.parseArray(body.join(' '));
  let name = grouped[i++];
  if (grouped[i] !== ':') throw "expected ':' after fproportial name.";
  i++; // skip ':'
  let b = [];
  while (grouped[i] !== '=') {
     b.push(grouped[i++]);
  }
  i++; // skip '='
  let Pargs = this.parseArray(b.join(' '));
  let bdy = grouped.slice(i).join(' ');
  let val = this.evaluateExpr(bdy);

  defineFproportial(this.maps, args?.[0], args?.[1], name, Pargs, args?.[2], args?.[3] , val);

  return val;
}

if (IST('unshare')) {
  let name = op;


  // save to file
  let old = {};
  if (fs.existsSync(path.join(__dirname, './.env'))) {
    old = JSON.parse(fs.readFileSync(path.join(__dirname,'./.env'), 'utf8'));
  }
  left = old[name];
  delete old[name];
  fs.writeFileSync(path.join(__dirname ,'./.env'), JSON.stringify(old, null, 2), 'utf8');
  continue;
}

if (IST('delete')) {
  let name = op;
  left = this._assignToPath(name, undefined, true);
  continue;
}
      if (IST('enum')) {
        let b = op;
        left = new this.classes.Enum(this.parseArray(b.slice(1, -1)));
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      if (IST('shArray')) {
        let b = op;
        left = this.parseArray(b.slice(1, -1), ':', true);
        if (left.length === 0 && this.typeof(left[0]) === 'array') left = left[0];
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      if (IST('exprArray')) {
        let b = op;
        left = this.parseArray(b.slice(1, -1), ';', true);
        if (left.length === 0 && this.typeof(left[0]) === 'array') left = left[0];
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      if (op.trim() === '?') {
        left = Boolean(left);
        continue
      }
      if (IST('js')) {
        let b = op;
        const processStr = str => this.evaluateExpr(str.startsWith('{') && str.endsWith('}') ? str.slice(1, -1) : str);
        left = eval(processStr(b.trim()));
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      let ppstr = (str) => {
        if (str.startsWith('{') && str.endsWith('}')) {
          return (str.slice(1, -1))
        } else {
          return str.slice(1, -1);
        }
      }
      if (ISTGR((a) => this.wrappers?.[a])) {
        left = this.wrappers[OLDIT](ppstr(op));
        if (i + 1 > grouped.length - 1) return left;
        continue
      }

      if (ISTGR((a) => this.types?.[a])) {
        let type = grouped[i-2];
        let name = op;
        if (grouped[i++] !== '=') throw "expected '='.";
        let fullv = grouped.slice(i);
        let val = this.types[type].function(this.evaluateExpr(fullv));
        createTyped(this.maps, name, val, type, this.typeof);
        return val;
      }
if (ISTGR((a) => this.structs?.[a])) {
  let typeArgs = [];
  let bb = op;
  // check if the operator itself is '<'
  if (op.trim() === "<") {
    let body = [];
    let depth = 1;

    while (i < grouped.length && depth > 0) {
      if (grouped[i] === "<") depth++;
      else if (grouped[i] === ">") depth--;

      if (depth > 0) body.push(grouped[i]);
      i++;
    }
    bb = grouped[i];
    // parse the collected body to get type arguments
    typeArgs = this.parseArray(body.join(' '));
  }

  let val = this.evaluateExpr(bb);

  let structDef = this.structs[OLDIT];
  if (typeArgs.length > 0 && structDef.params) {
    // substitute generic params with actual types
    let mapping = {};
    for (let k = 0; k < structDef.params.length; k++) {
      mapping[structDef.params[k]] = typeArgs[k];
    }

    val = this.validateStruct(structDef.fields, val, mapping);
  } else {
    val = this.validateStruct(structDef.fields, val);
  }

  left = val;
  if (i + 1 > grouped.length - 1) return left;
  continue;
}
      if (IST('time')) {
        let b = op;
        let start = Date.now();
        let end = Date.now();
        left = start - end;
        if (i + 1 > grouped.length - 1) return left;
        continue
      }

      if (op === '(') {
        let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
          if (i >= grouped.length) {
            this.debug("Reached end of tokens, parenCount=" + parenCount);
            throw "missing closing ')'.";
          }

          let tok = grouped[i++];
          this.debug("tok=" + tok + " i=" + i + " parenCount=" + parenCount);

          if (tok === '(') {
            parenCount++;
            this.debug("Increment parenCount -> " + parenCount);
            body.push(tok);
          } else if (tok === ')') {
            parenCount--;
            this.debug("Decrement parenCount -> " + parenCount);
            if (parenCount === 0) {
              this.debug("Breaking on closing ')'");
              break;
            }
            body.push(tok);
          } else {
            body.push(tok);
          }
        }

        let args = this.parseArray(body.join(' '));
        this.debug("Parsed args: " + JSON.stringify(args));
        if (typeof left === 'object' && this.typeof(left?.args) === 'array' && typeof left?.body === 'string') {
          left = this.fn(left.args, left.body);
        }
if (typeof left !== 'function') {
  switch (typeof left) {
    case 'number': {
      let val = left;
      left = (v) => val * v; // numbers become multipliers
      break;
    }

    case 'string': {
      let str = left;
      // calling a string concatenates
      left = (...args) => str + args.join('');
      break;
    }

    case 'boolean': {
      let b = left;
      // booleans as selectors
      left = (ifTrue, ifFalse = null) => (b ? ifTrue : ifFalse);
      break;
    }

    case 'object': {
      let obj = left;
      if (Array.isArray(obj)) {
        // arrays as indexers
        left = (i) => obj[i];
      } else if (obj !== null) {
        // objects as key-getters
        left = (k) => obj[k];
      } else {
        throw 'left side of expression is null';
      }
      break;
    }

    case 'symbol': {
      let sym = left;
      // symbols stringify themselves when "called"
      left = () => sym.toString();
      break;
    }

    case 'undefined': {
      throw 'cannot call undefined';
    }

    default:
      throw 'left side of expression is not a function';
  }
}

        left = left(...args);
        continue;
      }

      if (op === '[') {
        let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
          if (i >= grouped.length) {
            this.debug("Reached end of tokens, parenCount=" + parenCount);
            throw "missing closing ']'.";
          }

          let tok = grouped[i++];
          this.debug("tok=" + tok + " i=" + i + " parenCount=" + parenCount);

          if (tok === '[') {
            parenCount++;
            this.debug("Increment parenCount -> " + parenCount);
            body.push(tok);
          } else if (tok === ']') {
            parenCount--;
            this.debug("Decrement parenCount -> " + parenCount);
            if (parenCount === 0) {
              this.debug("Breaking on closing ']'");
              break;
            }
            body.push(tok);
          } else {
            body.push(tok);
          }
        }

        let val = this.evaluateExpr(body.join(' '));
if ((typeof val === 'number') && (typeof left === 'number')) {
left =  Number(`${left}.${val}`);
continue;
}
let typemeths = this.varMethods?.[this.typeof(left)];
const fn = typemeths?.[val];
this.ref.set(left, val);
if (typeof fn === "function") {
let lf = left;
  left = ((...args) => fn(lf, ...args)).bind(this);
} else {
  left = left?.[val] ?? left;
}
        continue;
      }
      if (grouped[i-2] === '(') {
        i--;
       let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
          if (i >= grouped.length) {
            this.debug("Reached end of tokens, parenCount=" + parenCount);
            throw "missing closing ')'.";
          }

          let tok = grouped[i++];
          this.debug("tok=" + tok + " i=" + i + " parenCount=" + parenCount);

          if (tok === '(') {
            parenCount++;
            this.debug("Increment parenCount -> " + parenCount);
            body.push(tok);
          } else if (tok === ')') {
            parenCount--;
            this.debug("Decrement parenCount -> " + parenCount);
            if (parenCount === 0) {
              this.debug("Breaking on closing ')'");
              break;
            }
            body.push(tok);
          } else {
            body.push(tok);
          }
        }
        left = this.evaluateExpr(body.join(' '));
        continue
      }
      if (grouped[i-2] === '+') {
        i--;
	let named = this._advanceToks(grouped, i, called);
        i += named._consumed;
        named = named.value();
        if (Array.isArray(named?.args) && named?.body) named = this.extract(named);
        left = +named;
	continue
      }

      if (grouped[i-2] === '!') {
        i--;
        let named = this._advanceToks(grouped, i, false, true);
        i += named._consumed;
        named = named.value();
        if (Array.isArray(named?.args) && named?.body) named = this.extract(named);

            let maybeType = named;
            if (maybeType?.typeProperties?.isType === true && maybeType?.typeProperties?.toOpposite) {
              left = maybeType.typeProperties.toOpposite(maybeType.value);
            } else {
              left = !maybeType;
            }
        continue
      }

      if (grouped[i-2] === '-') {
        i--;
        let named = this._advanceToks(grouped, i, called);
        i += named._consumed;
        named = named.value();
        if (Array.isArray(named?.args) && named?.body) named = this.extract(named);
        left = -named;
        continue
      }
      if (grouped[i-2] === 'ref') {
        let named = this.maps[op];
        left = named.address;
        continue
      }
      if (grouped[i-2] === '-') {
        i--;
        let named = this._advanceToks(grouped, i, called);
        i += named._consumed;
        named = named.value();
        if (Array.isArray(named?.args) && named?.body) named = this.extract(named);
        left = -named;
        continue
      }
      if (grouped[i-2] === '~') {
        i--;
        let named = this._advanceToks(grouped, i, called);
        i += named._consumed;
        named = named.value();
        if (Array.isArray(named?.args) && named?.body) named = this.extract(named);
        left = Math.round(named / this.ROUND_NUM) * this.ROUND_NUM;;
        continue;
      }
      if (IST(':')) {
     let named = this.QAEs[op];
         left = named;
continue;
      }
      if (IST('memoize')) {
        let b = op;
        let body = grouped[i++];
        left = Memoize(this.fn(this.parseArr(b.slice(1, -1)), body.slice(1, -1)));
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      if (IST('if')) {
        // condition
        let condExpr = op.slice(1, -1);
        let condVal = this.evaluateExpr(condExpr);

        // body after if
        let ifBody = grouped[i++];

        if (condVal) {
          left = this.evaluateExpr(ifBody.slice(1, -1));
          if (i + 1 > grouped.length - 1) return left;
          continue;
        }
        continue;
      }
      if (IST('repeat')) {
        let b = this._evalToken(op);
        let body = grouped[i++];
        let ress;
        for (let i = 0; i < b; i++) {
          ress = this.evaluateExpr(body);
        }
        left = ress;
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      if (IST('run')) {
        let b = op;
        left = this.exec(b.slice(1, -1));
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      if (IST('background')) {
        let b = op;
        if (b.trim() === "run") left = (async () => this.exec(b.slice(1, -1)))()
        else left = (async () => this.evaluateExpr(b.slice(1, -1)))();
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      if (IST('expr')) {
        let b = op;
        left = this.evaluateExpr(b.slice(1, -1));
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      if (IST('etok')) {
        let b = op;
        left = this._evalToken(b.slice(1, -1));
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      if (IST('map')) {
        let bb = op;
        let val = this.parseMapInline(bb.slice(1, -1));
        left = val;
        if (i + 1 > grouped.length - 1) return left;
        continue
      }
      if (IST('Type')) {
        let named = this._advanceToks(grouped, inoi, called, istoc); inoi += named._consumed;
        named = named.value();
        if (Array.isArray(named?.args) && named?.body) named = this.extract(named);
        left = typeof named; i = inoi;
        continue;
      }

      this.debug(`processing operator: ${op}`);

      if (op === '.') {
        const propertyName = grouped[i]; // Get the token directly as the property name string
        this.debug(`handling property access via . operator, propertyName: ${propertyName}`);
        if (!propertyName) {
          // Basic validation for property names (adjust regex as needed)
          this.debug(`error: Invalid property name '${propertyName}'`);
          throw new Error(`Invalid property name '${propertyName}' after '.' at position ${i} in expression.`);
        }
        i++; // Consume the property name token
        this.debug(`consumed property name: ${propertyName}`);

        if (left === null || left === undefined) {
          this.debug(`error: Cannot access property '${propertyName}' of null or undefined.`);
          throw new Error(`Cannot access property '${propertyName}' of null or undefined.`);
        }
let typemeths = this.varMethods?.[this.typeof(left)];
let lre = (left?.resolver === true && left?.resolvers.val) ?  left = left.resolvers.val : null;
        // Allow access on objects, arrays, and for primitive methods (like "string".length, "number".toFixed)
if (propertyName.startsWith(".")) {

let evaluedRangeOp = false;
        if (!isNaN(left)) {
 let isExlusive = false;
if (grouped[i] === '.') { isExlusive = true; i++}
      const rightObj = this._advanceToks(grouped, i, false, istoc, true);
      i += rightObj._consumed;
      let rhs_val;
      let evaluedR = false;
      const right = () => {
if (!evaluedR) {
rhs_val = rightObj.value();
evaluedR = true;
}
return rhs_val;
}
const start = Number(left);
const end = Number(right());
if (isNaN(start) || isNaN(end)) throw new Error("Range bounds must be numbers");
const result = [];
for (let n = start; n <= end; n++) {
  if (isExlusive && n === end) break;
  result.push(n);
}

left = result; // assign back to left for chaining
evaluedRangeOp = true;
        }
if (!evaluedRangeOp) left = left["__empty"]();
continue;
}
if (propertyName.startsWith("!")) {
this.ref.set(left?.[propertyName.substr(1)]);
left = left?.[propertyName.substr(1)] ?? null;
continue;
}

if (propertyName.startsWith("@")) {
left = left[grouped[i++]].bind(left);;
continue;
}
        if (propertyName.startsWith("\"")) {
	  left = left["*"](this._evalToken(propertyName));
	  continue;
	}
if (propertyName.startsWith("[")) {
i++;
let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
          if (i >= grouped.length) {
            this.debug("Reached end of tokens, parenCount=" + parenCount);
            throw "missing closing ']'.";
          }

          let tok = grouped[i++];
          this.debug("tok=" + tok + " i=" + i + " parenCount=" + parenCount);

          if (tok === '[') {
            parenCount++;
            this.debug("Increment parenCount -> " + parenCount);
            body.push(tok);
          } else if (tok === ']') {
            parenCount--;
            this.debug("Decrement parenCount -> " + parenCount);
            if (parenCount === 0) {
              this.debug("Breaking on closing ']'");
              break;
            }
            body.push(tok);
            } else {
            body.push(tok);
          }
}
let expr = body.join(" ");
let val = this._evalToken(expr);

if ((typeof val === 'number') && (typeof left === 'number')) {
left = Number(`${left}.${val}`);
continue;
}
const fn = typemeths?.[val];
if (typeof fn === "function" && !(val in left)) {
let lf = left;
  left = ((...args) => fn(lf, ...args)).bind(this);
} else {
  left = left?.[val] ?? lre?.[val];
}
    continue;
}
        if (propertyName.startsWith("(")) {
let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
          if (i >= grouped.length) {
            this.debug("Reached end of tokens, parenCount=" + parenCount);
            throw "missing closing ')'.";
          }

          let tok = grouped[i++];
          this.debug("tok=" + tok + " i=" + i + " parenCount=" + parenCount);

          if (tok === '(') {
            parenCount++;
            this.debug("Increment parenCount -> " + parenCount);
            body.push(tok);
          } else if (tok === ')') {
            parenCount--;
            this.debug("Decrement parenCount -> " + parenCount);
            if (parenCount === 0) {
              this.debug("Breaking on closing ')'");
              break;
            }
            body.push(tok);
          } else {
            body.push(tok);
          }
        }
          left = left["__functor"](...this.parseArray(body.join(" ")));
          continue;
        }
const fn = typemeths?.[propertyName];
let val = propertyName;
if ((!isNaN(val)) && (typeof left === 'number' || typeof lre === 'number')) {1
left = Number(`${(typeof left === 'number') ? left : lre}.${val}`);
continue;
}
this.ref.set(left, val);
if (typeof fn === "function" && !(left.hasOwnProperty(val))) {
let fl = left;
  left = ((...args) => fn(fl, ...args));
} else {
  left = left?.[propertyName] ?? lre?.[propertyName];
}
        this.debug(`result of property access: ${left}`);
        continue; // Continue to the next operator/operand, skipping the general rightObj and switch
}

if (op === '?.') {
    const propertyName = grouped[i];
    this.debug(`handling optional chaining via '?.', propertyName: ${propertyName}`);
    i++; // consume token

    if (left === null || left === undefined) {
        left = null; // optional chaining returns null instead of throwing
        continue;
    }

    // ---------- property/method handling ----------

    if (propertyName.startsWith(".")) {
let evaluedRangeOp = false;
        if (!isNaN(left)) {
 let isExlusive = false;
if (grouped[i] === '.') {isExlusive = true; i++};
      const rightObj = this._advanceToks(grouped, i, false, istoc, true);
      i += rightObj._consumed;
      let rhs_val;
      let evaluedR = false;
      const right = () => {
if (!evaluedR) {
rhs_val = rightObj.value();
evaluedR = true;
}
}
right(); // evaluate RHS once
const start = Number(left);
const end = Number(rhs_val);

if (isNaN(start) || isNaN(end)) throw new Error("Range bounds must be numbers");

const result = [];
for (let n = start; n <= end; n++) {
  if (isExlusive && n === end) break;
  result.push(n);
}

left = result; // assign back to left for chaining
evaluedRangeOp = true;
        }
        if (!evaluedRangeOp) left = left["__empty"]?.() ?? null;
        continue;
    }
    if (propertyName.startsWith("!")) {
        left = left?.[propertyName.substr(1)] ?? null;
        continue;
    }
    if (propertyName.startsWith("@")) {
        left = left?.[grouped[i++]]?.bind(left) ?? null;
        continue;
    }
    if (propertyName.startsWith("\"")) {
        left = left?.["*"]?.(this._evalToken(propertyName)) ?? null;
        continue;
    }
    if (propertyName.startsWith("[")) {
        i++;
        let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
            if (i >= grouped.length) throw "missing closing ']'.";
            let tok = grouped[i++];
            if (tok === '[') parenCount++;
            else if (tok === ']') parenCount--;
            if (parenCount > 0) body.push(tok);
        }
        let expr = body.join(" ");
        let val = this._evalToken(expr);
        if ((typeof val === 'number') && (typeof left === 'number')) {
            left = Number(`${left}.${val}`);
            continue;
        }
        left = left?.[val] ?? null;
        continue;
    }
    if (propertyName.startsWith("(")) {
        i++;
        let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
            if (i >= grouped.length) throw "missing closing ')'.";
            let tok = grouped[i++];
            if (tok === '(') parenCount++;
            else if (tok === ')') parenCount--;
            if (parenCount > 0) body.push(tok);
        }
        left = left?.(...this.parseArray(body.join(" "))) ?? null;
        continue;
    }

    // fallback: normal property access
    left = left?.[propertyName] ?? null;
    continue;
}

if (op === '::') {
    const propertyName = grouped[i];
    this.debug(`handling static access via '::', propertyName: ${propertyName}`);
    i++; // consume token

    if (left === null || left === undefined) {
        throw new Error(`Cannot access static property '${propertyName}' of null or undefined.`);
    }

    let lre = (left?.resolver === true && left?.resolvers.val) ? left = left.resolvers.val : null;

    // ---------- Special 'new' check ----------
    if (propertyName === "new") {
        // Expect next token to be '(' for constructor args
        if (grouped[i] !== "(") throw new Error(`Expected '(' after 'new' for constructor call.`);
        i++; // consume '('
        let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
            if (i >= grouped.length) throw "missing closing ')'.";
            const tok = grouped[i++];
            if (tok === '(') parenCount++;
            else if (tok === ')') parenCount--;
            if (parenCount > 0) body.push(tok);
        }
        const args = this.parseArray(body.join(" "));
        // Instantiate new object
        if (typeof left === "function") {
            left = new left(...args);
        } else {
            throw new Error(`Cannot use 'new' on non-constructable object.`);
        }
        continue;
    }

    // ---------- Special prefixes ----------
    if (propertyName.startsWith(".")) {
        left = left["__empty"]?.() ?? null;
        continue;
    }
    if (propertyName.startsWith("!")) {
        const val = left[propertyName.substr(1)];
        left = (typeof val === "function") ? val.bind(left) : val ?? null;
        continue;
    }
    if (propertyName.startsWith("@")) {
        const val = left[grouped[i++]];
        left = (typeof val === "function") ? val.bind(left) : val ?? null;
        continue;
    }
    if (propertyName.startsWith("\"")) {
        const val = left["*"](this._evalToken(propertyName));
        left = (typeof val === "function") ? val.bind(left) : val ?? null;
        continue;
    }

    // ---------- Indexing ----------
    if (propertyName.startsWith("[")) {
        i++;
        let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
            if (i >= grouped.length) throw "missing closing ']'.";
            let tok = grouped[i++];
            if (tok === '[') parenCount++;
            else if (tok === ']') parenCount--;
            if (parenCount > 0) body.push(tok);
        }
        const expr = body.join(" ");
        const val = this._evalToken(expr);
        const prop = left[val] ?? lre?.[val];
        left = (typeof prop === "function") ? prop.bind(left) : prop ?? null;
        continue;
    }

    // ---------- Function call ----------
    if (propertyName.startsWith("(")) {
        i++;
        let parenCount = 1;
        let body = [];
        while (parenCount > 0) {
            if (i >= grouped.length) throw "missing closing ')'.";
            const tok = grouped[i++];
            if (tok === '(') parenCount++;
            else if (tok === ')') parenCount--;
            if (parenCount > 0) body.push(tok);
        }
        const args = this.parseArray(body.join(" "));
        const fn = left["__functor"];
        if (typeof fn === "function") {
            left = fn.bind(left)(...args); // bind to static object
        } else {
            left = null;
        }
        continue;
    }

    // ---------- Normal property access ----------
    const prop = left[propertyName] ?? lre?.[propertyName];
    left = (typeof prop === "function") ? prop.bind(left) : prop ?? null;
    continue;
}

if (op === "neg") {
    left = -left;
    continue;
}
if (op === "abs") {
    left = Math.abs(left);
    continue;
}
if (op === "toArray") {
    left = Array.isArray(left) ? left : [left];
    continue;
}

if (op === "toString") {
    left = String(left);
    continue;
}

if (op === "toNumber") {
    left = Number(left);
    continue;
}
if (op === "noop") {
    left = left;
    continue;
}
if (['++', '--', '**'].includes(op)) {
switch (op) {

        case '**':
          this.debug(`performing ** (doubling) operation on assignable: ${grouped[i - 2]}`);
          // Ensure it's applied to an assignable variable
          if (typeof this._assignToPath === 'function' && grouped[i - 2]) {
            const originalValue = Number(this.ref.get());

            // Double the original value and assign it back
            left = originalValue * 2; // The result of the expression is the new doubled value
            this.ref.assign(originalValue * 2);
          } else {
            // If not an assignable variable, just double the value and return it
            // (e.g., if '5++' were allowed, it would become 10)
            left = Number(left) * 2;
            this.debug(`result: ${left}`);
          }
          break;

        case '--':
          this.debug(`performing -- (decrement) operation on assignable: ${grouped[i - 2]}`);
          // Ensure it's applied to an assignable variable
          if (typeof this._assignToPath === 'function' && grouped[i - 2]) {
            const originalValue = Number(this.ref.get());

            // Decrement the original value by 1 and assign it back
            left = originalValue - 1; // The result of the expression is the new decremented value
            this.ref.assign(originalValue - 1);
          } else {
            // If not an assignable variable, just decrement by 1 and return it
            left = Number(left) - 1;
            this.debug(`result: ${left}`);
          }
          break;

        case '++':
          this.debug(`performing ++ (increment) operation on assignable: ${grouped[i - 2]}`);

          // Ensure it's applied to an assignable variable
          if (grouped[i - 2]) {
            const originalValue = Number(this.ref.get()) ?? 0;

            // Double the original value and assign it back
            left = originalValue + 1; // The result of the expression is the new doubled value
            this.ref.assign(originalValue + 1);
          } else {
            // If not an assignable variable, just double the value and return it
            // (e.g., if '5**' were allowed, it would become 10)
            left = Number(left) + 1;
            this.debug(`result: ${left}`);
          }
          break;
}
continue
}
      // For all other operators, read the right operand as usual
      let oldI = i;
      const rightObj = this._advanceToks(grouped, i, called, istoc);
      i += rightObj._consumed;
      let rhs_val;
      let evaluedR = false;
      let rhs_expr;
      let evaluedRe = false;
      const right = () => {
if (!evaluedR) {
rhs_val = rightObj.value();
evaluedR = true;
}
        this.debug(`evaluating right operand for operator ${op}: ${rhs_val}`);
        return rhs_val;
      }; // Use a closure to lazily evaluate for some operators if needed
      const rightExpr = () => {
if (!evaluedRe) {
rhs_expr = this.evaluateExpr(grouped.slice(oldI).join(' '));
evaluedRe = true;
}
 this.debug(`evaluating right expr for op ${op}, ${rhs_expr}`);
i = grouped.length - 1;
return rhs_expr;
};

if (left?.['"operator:(' + op +')"'] && !this.options?.strict) {
left = left['"operator:(' + op +')"'](right())
continue
}

if (op.slice(1).startsWith("dynamic_infix::")) {
op = this.evaluateExpr(this._evalToken(op).slice(9));
}

if (this.typeops?.[this.typeof(left)]?.[op] && !this?.IS_IN_TYPE_OPS && !this.options?.strict) {
    this.IS_IN_TYPE_OPS = true;
    left = this.typeops[this.typeof(left)][op](left, right());
    this.IS_IN_TYPE_OPS = false;
    continue;
}

      if (this.operators?.[op] && !this.options?.strict) {
        this.debug(`using custom operator handler for ${op}`);
        left = this.operators[op](left, right());
        this.debug(`result of custom operator ${op}: ${left}`);
        continue;
      }

      switch (op) {
        case 'as': {
          this.debug(`casting ${left} as ${right()}`);
          const targetType = String(right()).toLowerCase();

          this.descpr(`casts ${left} as type ${right()}`)

          switch (targetType) {
            case 'number':
            case 'num':
            case 'float':
            case 'double':
              left = Number(left);
              break;

            case 'int':
            case 'integer':
              left = Math.trunc(Number(left));
              break;

            case 'string':
              left = String(left);
              break;

            case 'boolean':
              left = Boolean(left);
              break;

            case 'array':
              left = Array.isArray(left) ? left : [left];
              break;

            case 'object':
              left = this.typeof(left) === 'object' ? left : { value: left };
              break;

            default:
              if (this.castings?.[targetType]) {
                this.debug(`using custom casting handler for '${targetType}'`);
                left = this.castings[targetType](left);
              } else {
                throw new Error(`Unknown type cast: '${targetType}'`);
              }
          }

          this.debug(`result of 'as': ${left}`);
          break;
        }
        case '$': {
          // Evaluate right operand first (assuming right() evaluates and returns the right side)
          const rightVal = right();

          // Handle different left operand types
          if (typeof left === 'string') {
            // Check substring presence
            left = left.includes(rightVal);
          } else if (Array.isArray(left)) {
            // Check array contains element
            left = left.includes(rightVal);
          } else if (left && typeof left === 'object') {
            // For maps/objects, check if rightVal is a key
            left = rightVal in left;
          } else {
            // Default fallback — false for unsupported types
            left = false
          }
          break;
        }
        case '#:': {
          const patternMap = right(); // expects a map/array of [condition => expression]

          for (let [cond, expr] of patternMap) {
            if (this.typeof(left) === cond.toLowerCase()) { // matches can check type, value, or call a function
              left = this.evaluateExpr(expr);
              break;
            }
          }
          break;
        }
	case ',': {
          let r = right();
          if (leftIsArray) {
           left.push(r);
           break;
          } else {
	   leftIsArray = true;
	   left = [left, r];
          }
          break;
        }
        case 'then': left = left ? rightExpr() : false; return left;
        case 'if': left = rightExpr() ? left : false; return left;
        case 'from': {
          let taken = left;
          let map = right();

          if (String(taken).trim() === "*") {
            // all keys
            left = Object.keys(map);
            break;
          }

          if (String(taken).trim() === "%") {
            // random key + val
            const keys = Object.keys(map);
            const randKey = keys[Math.floor(Math.random() * keys.length)];
            left = { [randKey]: map[randKey] };
            break;
          }

          if (String(taken).trim() === "??") {
            // random value only
            const keys = Object.keys(map);
            const randKey = keys[Math.floor(Math.random() * keys.length)];
            left = map[randKey];
            break;
          }

          if (String(taken).trim() === "!") {
            // negate: boolean true if map is empty
            left = Object.keys(map).length === 0;
            break;
          }

          if (String(taken).trim() === "#") {
            // count keys
            left = Object.keys(map).length;
            break;
          }
          if (map?.[left]) {
            left = map[left];
            break;
          } else {
            if (grouped[i] === 'where') {
              i++;
              let fn = this.evaluateExpr(grouped.slice(i).join(' '));
              if (typeof fn !== 'function') {
                try { fn = this.extract(fn); } catch { throw `'where' expects a function.`; }
              }
              let finalMap = {};
              Object.keys(map).forEach((m) => {
                if (fn(map[m])) { finalMap[m] = map[m] }
              });
              left = finalMap;
              return left;
            }
          }
        }
        case '+':
          let r = rightExpr();
          this.debug(`performing + operation: ${left} + ${r}`);
          if (typeof left === 'string' || typeof r === 'string') {
            left = String(left) + String(r);
          } else if (typeof left === 'boolean' || typeof r === 'boolean') {
            left = left && r;
          } else if (typeof left === 'bigint' || typeof r === 'bigint') {
            left = BigInt(left) + BigInt(r);
          } else if (this.typeof(left) === 'array' || this.typeof(r) === 'array') {
            left = (this.typeof(left) === 'array' ? left : [left])
              .concat(this.typeof(r) === 'array' ? r : [r]);
          } else {
            left = Number(left) + Number(r);
          }
          this.descpr(`adds ${left} and ${r}`);
          this.debug(`result: ${left}`);
          return left;
        case '-':
          this.debug(`performing - operation: ${left} - ${rightExpr()}`);
          left = Number(left) - Number(rightExpr());
          this.debug(`result: ${left}`);
          return left;
        case '%':
          this.debug(`performing % operation: ${left} % ${right()}`);
          left = Number(left) % Number(right());
          this.debug(`result: ${left}`);
          break;
        case '*':
          this.debug(`performing * operation: ${left} * ${right()}`);
          left = Number(left) * Number(right());
          this.debug(`result: ${left}`);
          break;
        case 'in':
          this.debug(`performing in operation: ${left} in ${right()}`);
          left = left in right();
          this.debug(`result: ${left}`);
          break;
        case '/':
          this.debug(`performing / operation: ${left} / ${right()}`);
          left = Number(left) / Number(right());
          this.debug(`result: ${left}`);
          break;
        case 'xor': left = Boolean(left) !== Boolean(right()); break;
        case 'matches':
        case '==':
          this.debug(`performing == operation: ${left} == ${right()}`);
          left = left == right();
          this.debug(`result: ${left}`);
          break;
        case '=':
          this.debug(`performing = assignment: ${grouped[i - 3]} = ${rightExpr()}`);
          const assignedValue = rightExpr(); // Evaluate the right-hand side first
          left = assignedValue; // The result of the assignment expression is the assigned value
          this.ref.assign(assignedValue);
          this.debug(`result of assignment: ${left}`);
          return left;
        case '!=':
          this.debug(`performing != operation: ${left} != ${right()}`);
          left = left != right();
          this.debug(`result: ${left}`);
          break;
        case 'pow':
          this.debug(`performing pow operation: ${left} ** ${right()}`);
          left = Number(left) ** Number(right());
          this.debug(`result: ${left}`);
          break;

        case 'or':
          this.debug(`performing or operation: ${left} || ${right()}`);
          left = left ? left : right();
          this.debug(`result: ${left}`);
          break;

        case '^':
          this.debug(`performing ^ (bitwise XOR) operation: ${left} ^ ${right()}`);
          left = Number(left) ^ Number(right());
          this.debug(`result: ${left}`);
          break;

        case 'instanceof': {
          left = left instanceof right();
          break;
        }
        case 'istypeof': {
          left = this.typeof(left) === right();
          break;
        }
        case 'extends': {
          left = this.extends(left, right());
          break;
        }
        case 'extend': {
          // If both sides are objects/maps
          if (typeof left === "object" && typeof right === "object") {
            left = { ...left, ...right };
          }
          // If both are arrays, maybe concat
          else if (Array.isArray(left) && Array.isArray(right)) {
            left = [...left, ...right];
          }
          // Fallback: just overwrite
          else {
            left = right;
          }
          break;
        }

        case 'between': left = Number(left) > Number(right()) && Number(left) < Number(extra()); break;
        case 'not': left = !Boolean(right()); break;
        case 'join': if (Array.isArray(left)) left = left.join(String(right())); break;
        case 'concat': if (Array.isArray(left)) left = left.concat(right()); break;
        case 'index': if (Array.isArray(left)) left = left[Number(right())]; break;
        case 'avg': left = (Number(left) + Number(right())) / 2; break;
        case 'diff': left = Math.abs(Number(left) - Number(right())); break;
        case 'ratio': left = Number(left) / Number(right()); break;
        case 'mult_of': left = Number(left) % Number(right()) === 0; break;
        case 'gcd': {
          const a = Math.abs(Number(left)), b = Math.abs(Number(right()));
          const gcd = (x, y) => y === 0 ? x : gcd(y, x % y);
          left = gcd(a, b);
          break;
        }
        case 'lcm': {
          const a = Math.abs(Number(left)), b = Math.abs(Number(right()));
          const gcd = (x, y) => y === 0 ? x : gcd(y, x % y);
          left = (a * b) / gcd(a, b);
          break;
        }
        case 'repeat_sep': left = String(left).repeat(Number(right())); break;
        case 'replace': left = String(left).replace(String(right()), ''); break;
        case 'pad_start': left = String(left).padStart(Number(right()), ' '); break;
        case 'pad_end': left = String(left).padEnd(Number(right()), ' '); break;
        case 'equals_ignore': left = String(left).toLowerCase() === String(right()).toLowerCase(); break;
        case 'cmp': left = String(left).localeCompare(String(right())); break; // -1,0,1
        case 'zip': {
          const arr1 = Array.isArray(left) ? left : [left];
          const arr2 = Array.isArray(right()) ? right() : [right()];
          left = arr1.map((v, i) => [v, arr2[i]]);
          break;
        }
        case 'intersect': {
          const arr1 = Array.isArray(left) ? left : [];
          const arr2 = Array.isArray(right()) ? right() : [];
          left = arr1.filter(v => arr2.includes(v));
          break;
        }
        case 'diff_arr': {
          const arr1 = Array.isArray(left) ? left : [];
          const arr2 = Array.isArray(right()) ? right() : [];
          left = arr1.filter(v => !arr2.includes(v));
          break;
        }
        case 'union': {
          const arr1 = Array.isArray(left) ? left : [];
          const arr2 = Array.isArray(right()) ? right() : [];
          left = [...new Set([...arr1, ...arr2])];
          break;
        }

        case 'nand': left = !(Boolean(left) && Boolean(right())); break;
        case 'nor': left = !(Boolean(left) || Boolean(right())); break;
        case 'xnor': left = Boolean(left) === Boolean(right()); break; // opposite of xor
        case 'equals':
        case 'is':
    if ((typeof left === 'object' && left !== null) || typeof left === 'function') {
        left = left === right();
        break
    }
    left = left === right(); break;
        case '===':
          this.debug(`performing === operation: ${left} === ${right()}`);
          left = left === right();
          this.debug(`result: ${left}`);
          break;
        case 'isnt':
          this.debug(`performing !== operation: ${left} !== ${rightExpr()}`);
          left = left !== rightExpr();
          this.debug(`result: ${left}`);
          return left;
        case '!==':
          this.debug(`performing !== operation: ${left} !== ${right()}`);
          left = left !== right();
          this.debug(`result: ${left}`);
          break;
        case 'bigger':
          this.debug(`performing === operation: ${left} > ${rightExpr()}`);
          left = left > rightExpr();
          this.debug(`result: ${left}`);
          return left;
        case '>':
          this.debug(`performing > operation: ${left} > ${right()}`);
          if (left === 'usefullness') {
            left = 'always';
            break;
          }
          left = left > right();
          this.debug(`result: ${left}`);
          break;
        case 'smaller':
          this.debug(`performing < operation: ${left} < ${rightExpr()}`);
          left = left < rightExpr();
          this.debug(`result: ${left}`);
          return left;
        case '<':
          this.debug(`performing < operation: ${left} < ${right()}`);
          left = left < right();
          this.debug(`result: ${left}`);
          break;
        case '>=':
          this.debug(`performing >= operation: ${left} >= ${right()}`);
          left = left >= right();
          this.debug(`result: ${left}`);
          break;
        case '<=':
          this.debug(`performing <= operation: ${left} <= ${right()}`);
          left = left <= right();
          this.debug(`result: ${left}`);
          break;
        case 'and':
        case '&&':
          left = left && rightExpr();
          this.debug(`result: ${left}`);
          return left;
        case 'step': {
          let start = Array.isArray(left) ? (left[0]) : 0;
          let end = Array.isArray(left) ? (left[left.length - 1]) : left;
          let step = right();
          left = Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) => start + i * step);
          break;
        }
        case '||':
          this.debug(`performing || operation: ${left} || ${right()}`);
          left = left || rightExpr();
          this.debug(`result: ${left}`);
          return left;
        case '=>': {
          let r = grouped[i - rightObj._consumed];
          this.debug(`handling => (function application) operation: ${r}(${left})`);
          left = this._evalToken(`${r}(${left})`);
          this.debug(`result of function application: ${left}`);
          break;
        }
        default: {
          let r = right()
          this.debug(`attempting to evaluate unknown operator: ${op} with ${left} and ${r}`);
          try {
            left = eval(`left ${op} r`);
            this.debug(`eval successful, result: ${left}`);
          } catch (e) {
            this.debug(`error: Unknown operator: ${op}, error: ${e.message}`);
            throw new Error(`Unknown operator: ${op}`);
          }
        }
      }
    }
    finalLeft = left;
    return finalLeft;
  }
  _convertCurrency(value, unit) {
    this.debug(`_convertCurrency: value=${value}, unit=${unit}`);
    for (const categoryName in this.currencies) {
      if (this.currencies.hasOwnProperty(categoryName)) {
        const category = this.currencies[categoryName];
        if (category.hasOwnProperty(unit)) {
          const unitDef = category[unit];
          if (typeof unitDef === 'object' && unitDef !== null && unitDef.hasOwnProperty('initial_base')) {
            const convertedValue = value * unitDef.initial_base;
            this.debug(`Converted ${value}${unit} to ${convertedValue} (base units of ${categoryName})`);
            return convertedValue;
          }
        }
      }
    }
    return this._evalToken(`${value}${unit}`)
  }
_groupTokens(tokens) {
  const output = [];
  const stack = [];
  const openers = { '{': '}' };

  const flattenBuffer = (buf) => {
    return buf.map(item => Array.isArray(item) ? flattenBuffer(item) : item).join(' ');
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (openers[token]) {
      const top = stack[stack.length - 1];
      if (token === '|' && top && top.type === '|') {
        // Close the current | group
        top.buffer.push(token);
        const finished = stack.pop();
        const flat = flattenBuffer(finished.buffer);
        if (stack.length > 0) {
          stack[stack.length - 1].buffer.push(flat);
        } else {
          output.push(flat);
        }
      } else {
        // Open a new group
        stack.push({ type: token, buffer: [token] });
      }
      continue;
    }

    const top = stack[stack.length - 1];
    if (top && token === openers[top.type] && token !== '|') {
      // Regular closer
      top.buffer.push(token);
      const finished = stack.pop();
      const flat = flattenBuffer(finished.buffer);
      if (stack.length > 0) {
        stack[stack.length - 1].buffer.push(flat);
      } else {
        output.push(flat);
      }
      continue;
    }

    // Default
    if (stack.length > 0) {
      top.buffer.push(token);
    } else {
      output.push(token);
    }
  }

  // Flush any unclosed groups
  while (stack.length > 0) {
    const unfinished = stack.pop();
    output.push(flattenBuffer(unfinished.buffer));
  }

  return output;
}

 _advanceToks(tokens, i_start, called, istoc, isrn) {
  if (called) {
    return {
      value: () => this._evalToken(tokens[i_start], false, istoc),
      _consumed: 1
    };
  }

  let i = i_start;
  let peek = () => tokens[i];
  let next = () => tokens[i++];

  // parse delimited block but don't evaluate yet
  let parseDel = (l, r) => {
    if (peek() !== l) return null;
    let depth = 0;
    let start = i;
    next(); // consume opening
    depth++;
    while (i < tokens.length && depth > 0) {
      let tok = next();
      if (tok === l) depth++;
      else if (tok === r) depth--;
    }
    return tokens.slice(start, i); // return raw token slice
  };

  // --- base atom ---
  function advanceE() {
  let tok = peek();
  if (tok === '(') { next(); parseDel('(', ')'); }
  else if (tok === '[') { next(); parseDel('[', ']'); }
  else if (tok === '{') { next(); parseDel('{', '}'); }
  else if (['ref', '-','+','~','!'].includes(tok)) { next(); advanceE(); }
  else { next(); }

  // --- postfix operators loop ---
  while (true) {
    if (peek() === '.' || peek() === '?.' || peek() === '::') {
      next();       // consume '.'
      let prop = next();       // consume property
      switch(prop) {
       case '@': next(); break;
       case '[': parseDel('[', ']'); break;
       case '(': parseDel('(', ')'); break;
       case '.': if (next() === '.') next();
       if (isrn) break;
      }
    } else if (peek() === '(') {
      if (tok === 'proportial' || tok === 'fproportial') break;
      parseDel('(', ')');
    } else if (peek() === '[') {
      parseDel('[', ']');
    } else break;
  }
};
advanceE();
  // return thunk for evaluateExpr
  return {
    value: () => this.evaluateExpr(tokens.slice(i_start, i).join(' '), true, istoc),
    _consumed: i - i_start
  };
}

  _evalToken(token, allowReplace = false, isTypeofCall = false, isAcsr = false) {
    this.debug('token: ' + token);
    if (typeof token !== 'string') token = String(token);
    // handle unary
    if (/^[-+!~:]/.test(token)) {
      const match = token.match(/^([-+!:~]+)\s*(.+)$/s);
      if (match) {
        let [_, ops, rest] = match;
        let val = () => this.evaluateExpr(rest.trim());
        for (let i = ops.length - 1; i >= 0; i--) {
          if (ops[i] === '-') val = -(val());
          else if (ops[i] === '+') val = +(val());
          else if (ops[i] === '!') {
            let maybeType = this._evalToken(rest.trim(), allowReplace, true);
            if (maybeType?.typeProperties?.isType === true && maybeType?.typeProperties?.toOpposite) {
              val = maybeType.typeProperties.toOpposite(maybeType.value);
            } else {
              val = !maybeType;
            }
          }
          else if (ops[i] === '~') val = Math.round(val() / this.ROUND_NUM) * this.ROUND_NUM;
          else if (ops[i] === ':') val = this?.QAEs[val()];
        }
        return val;
      }
    }

    if (token === undefined || token === null) {
      this.debug('Token is undefined or null, returning undefined.');
      return token;
    }

    // 0. Range Operator (1..10 or 1...10)
    // Matches "start..end" (inclusive) or "start...end" (exclusive)
    const rangeMatch = token.match(/^((-?\d+(?:\.\d+)?|[a-zA-Z_][a-zA-Z0-9_]*))\s*(\.{2,3})\s*((-?\d+(?:\.\d+)?|[a-zA-Z_][a-zA-Z0-9_]*))$/);
    if (rangeMatch) {
      this.debug(`Detected range operator: ${token}`);
      const startStr = rangeMatch[1];
      const operator = rangeMatch[3]; // ".." or "..."
      const endStr = rangeMatch[4];
      this.debug(`Range parts: startStr='${startStr}', operator='${operator}', endStr='${endStr}'`);

      const start = this.evaluateExpr(startStr);
      const end = this.evaluateExpr(endStr);
      this.debug(`Evaluated range values: start=${start}, end=${end}`);

      if (isNaN(start) || isNaN(end)) {
        this.debug(`Error: Invalid range, start or end is not a valid number in '${token}'`);
        throw new Error(`Invalid range: start or end is not a valid number in '${token}'`);
      }

      const result = [];
      if (start <= end) {
        if (operator === '..') { // Inclusive
          this.debug('Generating ascending inclusive range.');
          for (let i = start; i <= end; i++) {
            result.push(i);
          }
        } else { // Exclusive "..."
          this.debug('Generating ascending exclusive range.');
          for (let i = start; i < end; i++) {
            result.push(i);
          }
        }
      } else { // Decrementing range
        if (operator === '..') { // Inclusive
          this.debug('Generating descending inclusive range.');
          for (let i = start; i >= end; i--) {
            result.push(i);
          }
        } else { // Exclusive "..."
          this.debug('Generating descending exclusive range.');
          for (let i = start; i > end; i--) {
            result.push(i);
          }
        }
      }
      this.debug(`Range result: ${JSON.stringify(result)}`);
      return result;
    }

    // Normalize everything into a string, even numbers/nulls/booleans etc
    token = String(token).trim();
    this.debug(`Normalized token: '${token}'`);

    function replaceEscapes(str, escapes) {
      const keys = Object.keys(escapes).sort((a, b) => b.length - a.length);

      let result = "";
      let i = 0;

      while (i < str.length) {
        if (str[i] === "\\") {
          // Try to match longest key
          let name = null;
          for (const key of keys) {
            if (str.slice(i + 1, i + 1 + key.length) === key) {
              name = key;
              break;
            }
          }

          if (!name) {
            result += str[i++];
            continue;
          }

          const replacement = escapes[name];
          let j = i + 1 + name.length;

          // Check if argument exists
          let arg;
          if (str[j] === "{") {
            let braceCount = 1;
            let argStart = j + 1;
            let k = argStart;

            while (k < str.length && braceCount > 0) {
              if (str[k] === "{") braceCount++;
              else if (str[k] === "}") braceCount--;
              k++;
            }

            arg = str.slice(argStart, k - 1);
            i = k; // Continue **after closing brace**
          } else {
            i = j;
          }

          // Apply replacement
          if (typeof replacement === "function") {
            result += replacement(arg);
          } else {
            result += arg !== undefined ? `${replacement}{${arg}}` : replacement;
          }
        } else {
          result += str[i++];
        }
      }

      return result;
    }

    // Single-quoted strings
    if (/^'/.test(token)) {
      this.debug(`Detected single-quoted string literal: ${token}`);
      let content = token.slice(1, -1);
      content = replaceEscapes(content, this.escapes);
      this.debug(`Content after escape replacement: ${content}`);
      return content;
    }

    // Double-quoted strings with embedded expressions
    if (/^"/.test(token)) {
      this.debug(`Detected double-quoted string with potential embedded expressions: ${token}`);
      let content = token.slice(1, -1);
      content = replaceEscapes(content, this.escapes);
      this.debug(`String content after escape replacement: ${content}`);

      const expressionRegex = /\\&\[\^(.*?)\]/g;
      let lastIndex = 0;
      let result = '';

      content.replace(expressionRegex, (match, expr, offset) => {
        result += content.substring(lastIndex, offset);
        const evaluatedPart = this.evaluateExpr(expr);
        result += evaluatedPart;
        lastIndex = offset + match.length;
        return expr;
      });

      result += content.substring(lastIndex);
      this.debug(`Final result after embedded expressions: '${result}'`);
      return result;
    }

    // Backtick-quoted template literals
    if (/^`/.test(token)) {
      this.debug(`Detected backtick-quoted string (template literal) with potential embedded expressions: ${token}`);
      let content = token.slice(1, -1);
      content = replaceEscapes(content, this.escapes);
      this.debug(`Template literal content after escape replacement: ${content}`);

      const expressionRegex = /\&\{(.*?)\}/g;
      let lastIndex = 0;
      let result = '';

      content.replace(expressionRegex, (match, expr, offset) => {
        result += content.substring(lastIndex, offset);
        const evaluatedPart = this.evaluateExpr(expr);
        result += evaluatedPart;
        lastIndex = offset + match.length;
        return expr;
      });

      result += content.substring(lastIndex);
      this.debug(`Final result after embedded expressions: '${result}'`);
      return result;
    }

    // Handle boolean literals
    if (token === 'true') {
      this.debug('Detected boolean literal: true');
      return true;
    }
    if (token === 'false') {
      this.debug('Detected boolean literal: false');
      return false;
    }
    // Handle null, undefined, NaN, Infinity literals
    if (token === 'null') {
      this.debug('Detected null literal.');
      return null;
    }
    if (token === 'undefined') {
      this.debug('Detected undefined literal.');
      return undefined;
    }
    if (token === 'NaN') {
      this.debug('Detected NaN literal.');
      return NaN;
    }
    if (token === 'Infinity') {
      this.debug('Detected Infinity literal.');
      return Infinity;
    }

    if (token.startsWith('{') && token.endsWith('}')) {
      this.debug(`Detected potential inline map block: ${token}`);
      let result = this.parseMapInline(token.slice(1, -1));

      this.debug(`Parsed inline map (filtered): ${(result)}`);
      return result;
    }

    if (token.startsWith('|') && token.endsWith('|')) {
      this.debug(`Detected potential absolute value: ${token}`);
      let result = Math.abs(this.evaluateExpr(token.slice(1, -1)));

      this.debug(`Parsed inline map (filtered): ${(result)}`);
      return result;
    }

    if (token.startsWith('[') && token.endsWith(']')) {
      this.debug(`Detected potential inline array block: ${token}`);
      let result = this.parseArray(token.slice(1, -1));

      // Filter undefined and null values
      result = result.filter(v => v !== undefined && v !== null);

      return result;
    }

    // 6. Numbers (This condition is redundant if the earlier `!isNaN` check catches all numbers, but debug for completeness)
    const value = allowReplace ? this._replaceAll(token) : token;
    this.debug(`Processing as raw value (possibly number or variable): '${value}'`);

    const cleanedValueF = value.toString().replace(/_/g, '');
    this.debug(`cleaned raw: ${cleanedValueF}`);

    let cleanedValue;

    if (cleanedValueF.startsWith('0x') && !isNaN(cleanedValueF.slice(2))) {
      // Join parts before and after 'x'
      const joined = cleanedValueF.slice(2);
      cleanedValue = parseInt(joined, this.HEX_BASE);
    } else {
      cleanedValue = cleanedValueF;
    }

    this.debug(`cleaned parsed: ${cleanedValue}`);

    if (!isNaN(cleanedValue) && !isNaN(parseFloat(cleanedValue))) {
      this.debug(`Confirmed '${value}' as a number. Returning ${Number(cleanedValue)}`);
      return Number(cleanedValue);
    }

    if (this.webs?.hasOwnProperty(value)) {
      this.debug(`Found '${value}' in 'this.webs': ${this.webs[value]}`);
      this.ref.set(this.web, value);
      return this.webs[value];
    }
    if (this.enums?.hasOwnProperty(value)) {
      this.debug(`Found '${value}' in 'this.enums': ${this.enums[value]}`);
      this.ref.set(this.enums, value);
      return this.enums[value];
    }
    if (this.maps?.hasOwnProperty(value)) {
      this.debug(`Found '${value}' in 'this.maps'. Returning value property if is instance or the map itself.`);
      this.ref.set(this.maps, value);
      if (isTypeofCall) return this.maps[value];
      if (this.maps[value]?.resolver && this.maps[value]?.resolvers?.val) return this.maps[value].resolvers.val;
      return this.maps[value];
    }
    if (this.classes?.hasOwnProperty(value)) {
      this.debug(`Found '${value}' in 'this.maps'. Returning value property if is instance or the map itself.`);
      this.ref.set(this.classes, value);
      return this.classes[value];
    }
    if (this.typenames?.hasOwnProperty(value)) {
      return value;
    }
    if (this.functions?.hasOwnProperty(value)) {
      this.debug(`Found '${value}' in 'this.functions': ${this.functions[value]}`);
      this.ref.set(this.functions, value);
      return this.functions[value];
    }
    if (this.blocks?.hasOwnProperty(value)) {
      this.debug(`Found '${value}' in 'this.blocks': ${this.blocks[value]}`);
      this.ref.set(this.blocks, value);
      return this.exec(this.blocks[value]);
    }
    this.debug(`Token '${value}' not resolved as any known type. Returning raw token.`);


    const currencyMatch = String(token).match(/^([0-9]+(?:\.[0-9]+)?)([a-zA-Z_]+)$/);
    if (currencyMatch) {
      const value = Number(currencyMatch[1]);
      const unit = currencyMatch[2];
      this.debug(`Detected currency unit '${unit}' for value '${value}'. Calling _convertCurrency.`);
      // Ensure _convertCurrency exists and returns a number
      const convertedValue = this._convertCurrency(value, unit);
      this.debug(`_evalToken: Converted currency token '${token}' to number: ${convertedValue}`);
      return convertedValue;
    }
this.maps[value] = undefined;
this.ref.set(this.maps, value);
    return (this.options?.varSafe || this.options?.strict) ? undefined : value;
  }

  inject(dd) {
        Object.keys(this.maps).forEach((p) => {
          if (dd[p] !== undefined) dd[p] = this.maps[p];
        });
  }

  _assignToPath(path, value, deleteT) {
    if (typeof path !== 'string' || path.trim() === '') {

      // Handle if path is an array
      if (this.typeof(path) === 'array') {
        path.forEach((p, i) => {
          // if value is also an array, take corresponding index
          if (this.typeof(value) === 'array' && i < value.length) {
            this._assignToPath(p, value[i]);
          } else {
            this._assignToPath(p, p); // fallback to element itself
          }
        });
        return; // stop further processing
      }

      // Handle if path is an object
      if (typeof path === 'object') {
        Object.keys(path).forEach((p) => {
          if (value[p] !== undefined) this._assignToPath(p, value[p]);
          else this._assignToPath(p, path[p]);
        });
      }
    }

    // Early return for objects or arrays
    if (typeof path === 'object' || this.typeof(path) === 'array') return;

    const parts = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < path.length) {
      const c = path[i];

      if (c === '"' || c === "'" || c === '`') {
        inQuotes = !inQuotes;
        current += c;
        i++;
        continue;
      }

      if (inQuotes) {
        current += c;
        i++;
        continue;
      }

      if (c === '[') {
        if (current) {
          parts.push({ type: 'property', value: current });
          current = '';
        }
        let bracketContent = '';
        let bracketDepth = 1;
        let j = i + 1;
        while (j < path.length && bracketDepth > 0) {
          const innerC = path[j];
          if (innerC === '[') bracketDepth++;
          else if (innerC === ']') bracketDepth--;
          if (bracketDepth > 0) bracketContent += innerC;
          j++;
        }
        parts.push({ type: 'bracket_access', value: bracketContent });
        i = j;
      } else if (c === '.') {
        if (current) {
          parts.push({ type: 'property', value: current });
          current = '';
        }
        i++;
      } else if (c === '(') {
        throw new Error(`Invalid assignment target: cannot assign to a method call '${path}'.`);
      }
      else {
        current += c;
        i++;
      }
    }

    if (current) {
      parts.push({ type: 'property', value: current });
    }

    if (parts.length === 0 && !typeof path === 'object') {
      throw new Error(`Invalid empty path for assignment.`);
    }



    let currentObject = null;
    let targetProperty = null;

    for (let k = 0; k < parts.length; k++) {
      const part = parts[k];


      if (k === 0) {
        if (part.type === 'property') {
          if (this.fnopts.hasOwnProperty(part.value)) {
            currentObject = this.maps;
          } else if (this.functions.hasOwnProperty(part.value)) {
            currentObject = this.maps;
          } else {
            currentObject = this.maps;

          }
          targetProperty = part.value;
        } else {
          throw new Error(`Invalid assignment target: path cannot start with bracket access '${path}'.`);
        }
      } else {
        if (currentObject === null || currentObject[targetProperty] === undefined) {
          if (part.type === 'property') {
            if (currentObject[targetProperty] === undefined) {

              currentObject[targetProperty] = {};
            }
            currentObject = currentObject[targetProperty];
            targetProperty = part.value;
          } else if (part.type === 'bracket_access') {
            throw new Error(`Cannot assign to index of undefined or null object at '${parts.slice(0, k).map(p => p.type === 'property' ? p.value : `[${p.value}]`).join('')}'.`);
          }
        } else {

          currentObject = currentObject[targetProperty];
        }

        if (part.type === 'property') {
          targetProperty = part.value;
        } else if (part.type === 'bracket_access') {
          targetProperty = this.evaluateExpr(part.value);

          if (typeof targetProperty !== 'string' && typeof targetProperty !== 'number') {
            throw new Error(`Invalid index or property name in bracket access: '${part.value}' evaluates to ${targetProperty}.`);
          }
        }
      }

    }
    if (currentObject?.[targetProperty]?.typeProperties?.setVal) {
      currentObject[targetProperty] = currentObject[targetProperty].typeProperties.setVal(value);
      return value;
    }
    currentObject[targetProperty] = value;
    if (deleteT) delete currentObject[targetProperty];

    return value;
  }

  _splitArgs(argString) {
    const args = [];
    let current = '';
    let depth = 0;
    let quote = null;
    let escape = false;

    for (let i = 0; i < argString.length; i++) {
      const c = argString[i];

      if (escape) {
        current += c;
        escape = false;
        continue;
      }

      if (c === '\\') {
        escape = true;
        current += argString[i];
        continue;
      }

      if (quote) {
        current += c;
        if (c === quote) quote = null;
        continue;
      }

      if (c === '"' || c === "'" || c === '`') {
        quote = c;
        current += c;
        continue;
      }

      if (c === '(' || c === '{' || c === '[') depth++;
      if (c === ')' || c === '}' || c === ']') depth--;

      if (c === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }

    if (current.trim()) args.push(current.trim());

    return args;
  }

  /**
   * Returns a function that takes an args array.
   * For each arg in the second args array, it adds to this.maps
   * with the name of that I in the first args array,
   * then uses this.run(body), then retrieves vars.
   *
   * @param {string[]} argNames - An array of strings representing the names of the arguments.
   * @param {string} body - The JavaScript code to execute.
   * @returns {Function} A function that takes an array of argument values.
   */
  fn(argNames, body, options) {

    if (!Array.isArray(argNames) || !argNames.every(name => typeof name === 'string')) {
      throw new Error(`Invalid function definition: argNames must be an array of strings.`);
    }
    if (typeof body !== 'string') {
      throw new Error(`Invalid function definition: body must be a string.`);
    }

    // Capture 'this' (the SimpleRunner instance) from the outer scope
    // This 'self' variable will be accessible inside the returned functions
    // This is the function that will be returned.
    return (...argValues) => {
      env.backupObject(1, '106');
      if (!Array.isArray(argValues)) {
        throw new Error('The function returned by fn expects an array of argument values.');
      }

      // Use the captured 'env' to access 'maps' and 'run'
      argNames.forEach((name, i) => {
        env.maps[name] = argValues[i];
      });

      let executionResult;
      try {
        // Run the body directly using the existing env.run method of the captured 'env'.
        // The 'body' string MUST still refer to maps as 'env.maps.variableName'.
        executionResult = options?.['usetype'] === 'expr' ? env.evaluateExpr(body) : env.run(body); // FIX: Use 'env' here

      } catch (e) {
        console.error("Error during dynamic nova function execution:", e);
        throw e; // Re-throw the error
      }
env.restoreObject('106');
      return executionResult;
    };
  }
  _parseValue(val) {
    if (val.startsWith('{')) {
      return this.parseMapInline(val.slice(1, -1));
    } else if (val.startsWith('[')) {
      return this.parseArray(val.slice(1, -1));
    } else if (/^\d+(\.\d+)?$/.test(val)) {
      return Number(val);
    } else if (val === 'true') {
      return true;
    } else if (val === 'false') {
      return false;
    } else if (val.startsWith('"') || val.startsWith("'") || val.startsWith('`')) {
      return val.slice(1, -1);
    } else {
      return this.evaluateExpr(val);
    }
  }

linkObjects(obj1, obj2, propName = 'ref') {
  Object.defineProperty(obj1, propName, {
    get() {
      return obj2;
    },
    set(newObj) {
      // Replace all properties of obj2 with newObj's properties
      Object.keys(obj2).forEach(key => delete obj2[key]); // clear old
      Object.assign(obj2, newObj); // copy new
    },
    enumerable: true,
    configurable: true
  });
}

  parseMapInline(str, kev = '=', dev = ';', allows) {
    if (!allows && !this.options?.strict) {
    kev = this.OBJ_KEV;
    dev = this.OBJ_DEV;
    }
    let inner = str.trim();
    inner = this.stripLC('##', inner);
    if (inner.startsWith('{') && inner.endsWith('}')) inner = inner.slice(1, -1).trim();

    let obj = {};
    this.linkObjects(this.maps, obj, 'this');
    let depth = 0;
    let quote = null;
    let current = '';
    const entries = [];
    let defaultExpr = null;
    let setterExpr = null;
    let staticProps = {}; // <-- collect static definitions

    // Split entries respecting quotes and braces
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];

      if (quote) {
        current += c;
        if (c === quote) quote = null;
        continue;
      }

      if (c === '"' || c === "'" || c === '`') {
        quote = c;
        current += c;
        continue;
      }

      if (c === '{') depth++;
      if (c === '}') depth--;

      if (c === dev && depth === 0) {
        if (current.trim()) entries.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }

    if (current.trim()) entries.push(current.trim());

    // Process each entry
    for (const entry of entries) {
      // --- Include ---
      if (entry.startsWith('include ')) {
        const val = this.evaluateExpr(entry.slice(8).trim());
        if (val && typeof val === 'object') Object.assign(obj, val);
        continue;
      }
      if (entry.startsWith('__toStr ')) {
        const val = this.evaluateExpr(entry.slice(8).trim());

        // If the value is a function, wrap it
        if (typeof val === 'function') {
          obj.toString = function (...args) {
            return val(...args);
          };
        } else {
          obj.toString = () => val; // otherwise return literal
        }

        continue;
      }
      if (entry.startsWith('get ')) {
        const eq = entry.indexOf(kev);
        const key = entry.slice(4, eq).trim();
        const valExpr = entry.slice(eq + 1).trim();
        Object.defineProperty(obj, key, {
          get: () => this.evaluateExpr(valExpr),
          enumerable: true,
        });
        continue;
      }
      if (entry.startsWith('set ')) {
        const eq = entry.indexOf(kev);
        const key = entry.slice(4, eq).trim();
        const valExpr = entry.slice(eq + 1).trim();
        Object.defineProperty(obj, key, {
          set: (v) => this.evaluateExpr(valExpr.replace(/\$value/g, v)),
          enumerable: true,
        });
        continue;
      }
      if (entry.startsWith('lazy ')) {
        const eq = entry.indexOf(kev);
        const key = entry.slice(5, eq).trim();
        const valExpr = entry.slice(eq + 1).trim();
        let cached;
        Object.defineProperty(obj, key, {
          get: () => {
            if (cached === undefined) cached = this.evaluateExpr(valExpr);
            return cached;
          },
          enumerable: true,
        });
        continue;
      }
      if (entry.startsWith('alias ')) {
        const [newKey, oldKey] = entry.slice(6).trim().split(/\s+/);
        Object.defineProperty(obj, newKey, {
          get: () => obj[oldKey],
          set: v => obj[oldKey] = v,
          enumerable: true,
        });
        continue;
      }
      if (entry.startsWith('__proto__ ')) {
        const val = this.evaluateExpr(entry.slice(9).trim());
        Object.setPrototypeOf(obj, val);
        continue;
      }
      if (entry.startsWith('fetch ')) {
        // syntax: fetch key [defaultExpr]
        const parts = entry.slice(6).trim().split(/\s+/, 2);
        const defaultExpr = parts.slice(1).join(' ');
        obj.fetch = (k) => {
          if (k in obj) return obj[k];
          return defaultExpr ? this.evaluateExpr(defaultExpr) : undefined;
        };
        continue;
      }
      if (entry === 'keys') {
        obj.keys = () => Object.keys(obj);
        continue;
      }

      if (entry === 'values') {
        obj.values = () => Object.values(obj);
        continue;
      }
      if (entry.startsWith('static ')) {
        const eqIndex = entry.indexOf(kev);
        const key = entry.slice(7, eqIndex).trim();
        const valExpr = entry.slice(eqIndex + 1).trim();
        staticProps[key] = this.evaluateExpr(valExpr);
        continue;
      }
      if (entry.startsWith('select ')) {
        const fnExpr = entry.slice(7).trim();
        obj.select = () => Object.fromEntries(Object.entries(obj).filter(() => this.evaluateExpr(fnExpr)));
        continue;
      }

      if (entry.startsWith('reject ')) {
        const fnExpr = entry.slice(7).trim();
        obj.reject = () => Object.fromEntries(Object.entries(obj).filter(() => !this.evaluateExpr(fnExpr)));
        continue;
      }
      if (entry.startsWith('each ')) {
        obj.each = (callback) => {
          for (const [k, v] of Object.entries(obj)) {
            callback(k, v);
          }
        };
        continue;
      }
      if (entry.startsWith('tap ')) {
        const fnExpr = entry.slice(4).trim();
        obj.tap = () => {
          this.evaluateExpr(fnExpr);
          return obj;
        };
        continue;
      }
      if (entry === 'dig') {
        obj.dig = (...keys) => {
          let current = obj;
          for (const k of keys) {
            if (current && k in current) current = current[k];
            else return undefined;
          }
          return current;
        };
        continue;
      }

      if (entry.startsWith('__toJson ')) {
        const val = this.evaluateExpr(entry.slice(9).trim());

        // If the value is a function, wrap it
        if (typeof val === 'function') {
          obj.toJSON = function (...args) {
            return val(...args);
          };
        } else {
          obj.toJSON = () => val; // otherwise return literal
        }

        continue;
      }
      if (entry.startsWith('setup ')) {
        continue;
      }

      // --- Default ---
      if (entry.startsWith('default ')) {
        defaultExpr = entry.slice(8).trim();
        continue;
      }
      if (entry.startsWith('setter ')) {
        setterExpr = entry.slice(7).trim();
        continue;
      }

      // --- Spread ---
      if (entry.trim().startsWith('. . . ')) {
        const name = entry.slice(6).trim();
        const val = this.evaluateExpr(name);
        if (val && typeof val === 'object') Object.assign(obj, { ...val });
        continue;
      }

      // --- Key = Value ---
      const eqIndex = entry.indexOf(kev);
      if (eqIndex === -1) {
        let name = '';
        name = entry.trim();
        obj[name] = this.evaluateExpr(entry);
        continue;
      };

      let key = entry.slice(0, eqIndex).trim();
      const val = entry.slice(eqIndex + 1).trim();
      let parsed;
        parsed = this.evaluateExpr(val);

      obj[key] = parsed;
    }

    // If static properties were defined, wrap in a class
    if (Object.keys(staticProps).length > 0) {
      const statics = staticProps;

      // Base instance (plain object from parseMapInline)
      let instance = obj;

      // Apply Proxy wrapping if default/setter exist
      if (defaultExpr || setterExpr) {
        const self = this;
        instance = new Proxy(instance, {
          get(target, prop, receiver, ...args) {
            if (prop in target) return target[prop];
            if (typeof prop === 'string' && defaultExpr) {
              const result = self.evaluateExpr(defaultExpr);
              if (typeof result === 'function') return result(prop, receiver, ...args);
              return result;
            }
            return Reflect.get(target, prop, receiver);
          },
          set(target, prop, value, receiver, ...args) {
            if (typeof prop === 'string' && setterExpr) {
              let result = self.evaluateExpr(setterExpr);
              if (typeof result === 'function') result = result(prop, value, receiver, ...args);
              target[prop] = result !== undefined ? result : value;
              return true;
            }
            target[prop] = value;
            return true;
          },
          has() { return true; }
        });
      }

      // Define the NovaMap class dynamically
      class NovaMap {
        constructor() {
          // Copy properties (this preserves proxy behavior since instance is already proxy)
          return instance;
        }
      }

      // Attach static fields
      for (const [k, v] of Object.entries(statics)) {
        NovaMap[k] = v;
      }

      // Return instance, but make sure its constructor points to NovaMap
      Object.setPrototypeOf(instance, NovaMap.prototype);
      return instance;
    }

    // Wrap with Proxy if default or setter is set
    if (defaultExpr || setterExpr) {
      const self = this;
      return new Proxy(obj, {
        get(target, prop, receiver, ...args) {
          if (prop in target) return target[prop];

          if (typeof prop === 'string' && defaultExpr) {
            const result = self.evaluateExpr(defaultExpr);
            if (typeof result === 'function') return result(target, prop, receiver, ...args);
            return result;
          }

          return Reflect.get(target, prop, receiver);
        },
        set(target, prop, value, receiver, ...args) {
          if (typeof prop === 'string' && setterExpr) {
            // Evaluate the setter expression, passing prop and value
            let result = self.evaluateExpr(setterExpr);
            // You can optionally use the result to override the stored value
            if (typeof result === 'function') result = result(target, prop, value, receiver, ...args);
            target[prop] = result !== undefined ? result : value;
            return true;
          }
          target[prop] = value; // fallback normal assignment
          return true;
        },
        has(target, prop) {
          return true;
        }
      });
    }
    return obj;
  }

  novaRegex(pattern, flags = '') {
    // Map Nova keywords to regex patterns
    const map = {
      'keyword': '\\w+',
      'symbol': '[^\\w\\s]', // Current symbol definition
      'digit': '\\d+',
      'nondigit': '\\D',
      'whitespace': '\\s+',
      'tab': '\\t',
      'newline': '\\n',
      'return': '\\r',
      'start': '^',
      'end': '$',
      'any': '.',
      'wordboundary': '\\b',
      'nonwordboundary': '\\B',
      'expr': '\\(.*?\\)',
      'word': '[a-zA-Z]',
      'symbolchar': '[^a-zA-Z0-9_]',
      'digitchar': '\\d',
      'htmltag': '<[^>]+>',
      'var': '\\$[a-zA-Z_][a-zA-Z0-9_]*',
      'integer': '\\d+',
      'float': '\\d+\\.\\d+',
      'string': '"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`', // Important for string literals
      'variable': '[a-zA-Z_][a-zA-Z0-9_]*',
      'title': '[A-Z][a-zA-Z0-9_]*',
      'strliteral': '"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`',
      'comment': '//.*|/\\*[\\s\\S]*?\\*/',
      'math': '[+\\-*/%]',
      'ordered_math:up': '[-+*/%]',
      'ordered_math:down': '[-+*/%]',
      'ordered_math:both': '[-+*/%]',
      'hex': '0[xX][0-9a-fA-F]+',
      'binary': '0[bB][01]+',
      'octal': '0[oO][0-7]+',
      'date': '\\d{4}-\\d{2}-\\d{2}',
      'time': '\\d{2}:\\d{2}:\\d{2}',
      'datetime': '\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2}',
      'url': '(https?|ftp):\\/\\/[a-zA-Z0-9.-]+(?:\\:[0-9]+)?(?:\\/[a-zA-Z0-9._~!$&\'()*+,;=:@%-]*)*',
      'email': '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
      'uuid': '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
      'color': '#[0-9a-fA-F]{3,6}',
      'xml': '<[^>]+>(?:[^<]+|<[^>]+>)*<\\/[^>]+>',
      'yaml': `(?:[a-zA-Z0-9_]+\\s*:\\s*(?:(?:"[^"]*"|'[^']*'|\\d+|true|false|null|\\{[^}]*\\}|\\[[^\\]]*\\]))\\s*)+`,
      'csv': '"(?:[^"]|"")*"|[^,]+'
    };


    let processedPattern = pattern;

    // --- NEW DEBUG LINES (re-added to show raw string from outside) ---
    if (processedPattern.length > 0) {
    }
    // --- END NEW DEBUG LINES ---


    // Keep this line for standard trim
    processedPattern = String(processedPattern).trim();

    if (processedPattern.length > 0) {
    }


    const excludePatterns = [];

    processedPattern = processedPattern.replace(/exclude:(?:<([^>]+)>|\(([^)]+)\))/g, (match, typesBracket, typeParen) => {
      const types = typesBracket || typeParen;
      if (types) {
        types.split('|').forEach(type => {
          const trimmedType = type.trim();
          const regexPart = map[trimmedType] || trimmedType;
          if (regexPart) {
            excludePatterns.push(new RegExp(`^${regexPart}$`));
          }
        });
      }
      return '';
    });

    processedPattern = processedPattern.replace('??', '.*');
    processedPattern = processedPattern.replace(/\$(\w+)/g, (_, id) => this.maps?.[id] ?? `$${id}`);

    processedPattern = processedPattern.replace(/<([^>]+)>/g, (match, group) => {
      const expandedResult = '(' + group.split('|').map(k => {
        const trimmedKey = k.trim();
        const mappedValue = map[trimmedKey]; // Get the regex part from the map
        return mappedValue || trimmedKey; // Use mapped value or fallback to key itself
      }).join('|') + ')';
      return expandedResult;
    });


    // --- NEW FIX ATTEMPT: Aggressively remove trailing whitespace before final RegExp compilation ---
    const finalPatternCleaned = processedPattern.replace(/\s+$/, ''); // Remove one or more whitespace characters only at the end.
    // --- END NEW FIX ATTEMPT ---


    const finalFlags = flags.includes('g') ? flags : flags + 'g';
    // Use the cleaned pattern for RegExp compilation
    const finalRegex = new RegExp(finalPatternCleaned, finalFlags);

    finalRegex._novaExcludePatterns = excludePatterns;

    finalRegex.novaMatchTokens = function (str) {
      const results = [];
      let match;
      this.lastIndex = 0; // Reset lastIndex for consecutive calls

      while ((match = this.exec(str)) !== null) {
        let token = match[0];

        token = token.trim();

        let shouldExclude = false;
        if (token.length === 0) {
          shouldExclude = true;
        } else {
          for (const excludeRegExp of this._novaExcludePatterns) {
            if (excludeRegExp.test(token)) {
              shouldExclude = true;
              break;
            }
          }
        }

        if (!shouldExclude) {
          results.push(token);
        } else {
        }
      }
      return results;
    };

    return finalRegex;
  }

  execute(code, options) {
    code = require('./nvopt.js')(code);
    let cleaned = this.tokenize(code).code;
    let tokens = this.tokenize(code).tokens;
    let pos = 0;

function watchTokensNewline(shouldTerminate) {
    let stopped = false;

    const loop = () => {
        if (stopped) return;

        try {
            if (tokens[pos] === '\n') {
            console.log('deleting');
                if (shouldTerminate) {
                    tokens[pos] = ';';
                } else {
                    delete tokens[pos];
                }
            }
        } catch {}

        if (!stopped) setImmediate(loop);
    };

    setImmediate(loop);

    return () => { stopped = true; }; // optional stop function
}
let shouldTerminate = false;

let stopWatcher = watchTokensNewline(shouldTerminate);

    while (pos < tokens.length) {

      // Helper function: split on comma, but ignore those inside quotes/backticks
      function smartSplitArgs(input) {
        const parts = [];
        let current = '';
        let inSingle = false, inDouble = false, inBacktick = false;

        for (let i = 0; i < input.length; i++) {
          const char = input[i];

          if (char === "'" && !inDouble && !inBacktick) {
            inSingle = !inSingle;
          } else if (char === '"' && !inSingle && !inBacktick) {
            inDouble = !inDouble;
          } else if (char === '`' && !inSingle && !inDouble) {
            inBacktick = !inBacktick;
          }

          if (char === ',' && !inSingle && !inDouble && !inBacktick) {
            parts.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }

        if (current.trim()) parts.push(current.trim());
        return parts;
      }

      const next = () => tokens[pos++];
      const peek = () => tokens[pos];
      let innerCurrent = peek();
      let current = this.options['guesEr']
        ? findClosestMatch(this.keywordsArray, innerCurrent)
        : innerCurrent;
      const expect = (x) => {
        if (this.options?.spaceMet && x === ';') return;
        if (this.options?.UnSemicolon && x === ';') return;
        if (tokens[pos] === ',' && x === ';') {
          next()
          tokens[pos++] = current;
          return;
        }

        const got = tokens[pos];

        let caretPos = 0;
        const RESET = '\x1b[0m';
        const RED = '\x1b[31m';
        const BLUE = '\x1b[34m';
        const GRAY = '\x1b[90m';
        const BOLD = '\x1b[1m';

        if (got !== x) {
          if (got !== undefined) {
            const target = got;
            const beforeCount = tokens.slice(0, pos).filter(t => t === target).length;

            let matchIndex = -1;
            let count = 0;
            for (let i = 0; i < code.length; i++) {
              if (code.startsWith(target, i)) {
                if (count === beforeCount) {
                  matchIndex = i;
                  break;
                }
                count++;
              }
            }

            caretPos = matchIndex >= 0 ? matchIndex : 0;
          } else {
            const lastToken = tokens[pos - 1] ?? '';
            const idx = code.lastIndexOf(lastToken);
            caretPos = idx >= 0 ? idx + lastToken.length : code.length;
          }

          const lines = code.split('\n');
          let charCount = 0;
          let lineIndex = 0;
          let col = caretPos;

          for (let i = 0; i < lines.length; i++) {
            const lineLen = lines[i].length + 1;
            if (caretPos < charCount + lineLen) {
              lineIndex = i;
              col = caretPos - charCount;
              break;
            }
            charCount += lineLen;
          }

          const offendingLine = lines[lineIndex];
          const pointerLine = ' '.repeat(col) + `${GRAY}^`.repeat(got?.length || x.length) + RESET;

          console.log(
            `${RED}${BOLD}Expected '${x}' but got '${got ?? '<end of input>'}' at position ${pos}:${RESET}\n` +
            `${BLUE}Line ${lineIndex + 1}:${RESET}\n` +
            `${offendingLine}\n${pointerLine}`
          );

          const err = new Error("Unfound Expected");
          err.code = "UFE"; // your symbolic Nova-style error type
          throw err;
        }

        pos++;
        return got;
      };

      const expectF = (x, got) => {
        if (this.options?.spaceMet && x === ';') return;

        let caretPos = 0;
        const RESET = '\x1b[0m';
        const RED = '\x1b[31m';
        const BLUE = '\x1b[34m';
        const GRAY = '\x1b[90m';
        const BOLD = '\x1b[1m';

        if (got !== x) {
          if (got !== undefined) {
            const target = got;
            const beforeCount = tokens.slice(0, pos).filter(t => t === target).length;

            let matchIndex = -1;
            let count = 0;
            for (let i = 0; i < code.length; i++) {
              if (code.startsWith(target, i)) {
                if (count === beforeCount) {
                  matchIndex = i;
                  break;
                }
                count++;
              }
            }

            caretPos = matchIndex >= 0 ? matchIndex : 0;
          } else {
            const lastToken = tokens[pos - 1] ?? '';
            const idx = code.lastIndexOf(lastToken);
            caretPos = idx >= 0 ? idx + lastToken.length : code.length;
          }

          const lines = code.split('\n');
          let charCount = 0;
          let lineIndex = 0;
          let col = caretPos;

          for (let i = 0; i < lines.length; i++) {
            const lineLen = lines[i].length + 1;
            if (caretPos < charCount + lineLen) {
              lineIndex = i;
              col = caretPos - charCount;
              break;
            }
            charCount += lineLen;
          }

          const offendingLine = lines[lineIndex];
          const pointerLine = ' '.repeat(col) + `${GRAY}^`.repeat(got?.length || x.length) + RESET;

          console.log(
            `${RED}${BOLD}Expected '${x}' but got '${got ?? '<end of input>'}' at position ${pos}:${RESET}\n` +
            `${BLUE}Line ${lineIndex + 1}:${RESET}\n` +
            `${offendingLine}\n${pointerLine}`
          );

          const err = new Error("Unfound Expected");
          err.code = "UFE"; // your symbolic Nova-style error type
          err.pos = pos;
          err.line = lineIndex + 1;
          err.token = tokens[pos];
          throw err;
        }

        pos++;
        return got;
      };
      const parseParen = () => {
shouldTerminate = false;
        if (this.options.pyschod) return parseUntil(':');
        if (this.options.ford) return parseUntil('=>');
        if (this.options.spaceMet) return parseUntil('pi');
        expect('(');
        let body = '';
        let parenCount = 1;
        while (parenCount > 0) {
          const tok = next();
          if (tok === '(') parenCount++;
          else if (tok === ')') {
            parenCount--;
            if (parenCount === 0) break;
          }
          if (pos > tokens.length) throw "Missing closing ')'";
          body += tok + ' ';
        }
        if (this.options.useStmts) body = this.evaluateExpr(body);
        if (this.options.jsMeta) body = eval(body);
        if (this.options.vartroub) body = this._replaceAll(body);
        return body;
      };
      const parseBlock = () => {
shouldTerminate = false;
        if (this.options.spaceMet) return parseUntil('fi');
        expect('{');
        let body = '';
        let braceCount = 1;
        while (braceCount > 0) {
          const tok = next();
          if (tok === '{') braceCount++;
          else if (tok === '}') {
            braceCount--;
            if (braceCount === 0) break;
          }
          if (pos > tokens.length) throw "Missing closing '}'";
          body += tok + ' ';
        }
        if (this.options.useStmts) body = this.evaluateExpr(body);
        if (this.options.vartroub) body = this._replaceAll(body);
        return body;
      };
      const parseDelimited = (l, r, s) => {
shouldTerminate = false;
        if (this.options.spaceMet) return parseUntil(s);
        expect(l);
        let body = '';
        let braceCount = 1;
        while (braceCount > 0) {
          const tok = next();
          if (tok === l) braceCount++;
          else if (tok === r) {
            braceCount--;
            if (braceCount === 0) break;
          }
          if (pos > tokens.length) throw "Missing closing '" + r + "'";
          body += tok + ' ';
        }
        if (this.options.useStmts) body = this.evaluateExpr(body);
        if (this.options.vartroub) body = this._replaceAll(body);
        return body;
      };
      const parseUntilSem = () => {
shouldTerminate = true;
        if (this.options.spaceMet) return parseUntil('Si');
        let body = '';
        let braceCount = 0;
        while (true) {
          const tok = next();
          if (tok === '{' || tok === '[' || tok === '(') braceCount++;
          if (tok === '}' || tok === ']' || tok === ')') braceCount--;
          if (tok === ';' && braceCount === 0) break;
          if (pos > tokens.length) break;
          body += tok + ' ';
        }
shouldTerminate = false;
 if (this.options.useStmts) body = this.evaluateExpr(body);
        if (this.options.jsMeta) body = eval(body);
        if (this.options.vartroub) body = this._replaceAll(body); return body;
      };
      const parseTill = (xf, cb = 'gig', r = ['{', '[', '('], l = ['}', ']', ')']) => {
shouldTerminate = true;
        if (this.options.spaceMet) return parseUntil(cb);
        let body = '';
        let braceCount = 0;
        while (true) {
          const tok = next();
                    if (tok === xf && braceCount === 0) break;

          if (r.includes(tok)) braceCount++;
          if (
            l.includes(tok)
          ) braceCount--;
          if (pos > tokens.length) throw `Missing closing '${xf}'`;
          body += tok + ' ';
        }
shouldTerminate = false;
 if (this.options.useStmts) body = this.evaluateExpr(body);
        if (this.options.jsMeta) body = eval(body);
        if (this.options.vartroub) body = this._replaceAll(body); return body;
      };
      const parseUntil = (xf) => {
shouldTerminate = true;
        let body = '';
        let braceCount = 1;
        while (braceCount > 0) {
          const tok = next();
          if (tok === xf) break;
          if (pos > tokens.length) throw `Missing closing '${xf}'`;
          body += tok + ' ';
        }
shouldTerminate = false;
 if (this.options.useStmts) body = this.evaluateExpr(body);
        if (this.options.jsMeta) body = eval(body);
        if (this.options.vartroub) body = this._replaceAll(body); return body;
      };

      const parseUntilTP = () => {
        let body = '';
        let braceCount = 1;
        while (braceCount > 0) {
          const tok = next();
          if (tok === ':') break;
          body += tok + ' ';
          if (pos > tokens.length) throw "Missing closing ':'";
        } if (this.options.useStmts) body = this.evaluateExpr(body);
        if (this.options.jsMeta) body = eval(body);
        if (this.options.vartroub) body = this._replaceAll(body);
        return body;
      };

      const parseUntilEq = () => {
        if (this.options.spaceMet) return parseUntil('Si');
        let body = '';
        let braceCount = 0;
        while (true) {
          const tok = next();
          if (tok === '{' || tok === '[' || tok === '(') braceCount++;
          if (tok === '}' || tok === ']' || tok === ')') braceCount--;
          if ((tok === ';' || tok === '=')&& braceCount === 0) break;
          if (pos > tokens.length) break;
          body += tok + ' ';
        } if (this.options.useStmts) body = this.evaluateExpr(body);
        if (this.options.jsMeta) body = eval(body);
        if (this.options.vartroub) body = this._replaceAll(body); return body;
      };


      const parseLinedExpr = () => {
        expect('|');
        expect('==>');
        let body = '';
        let count = 1;
        while (count > 0) {
          const tok = next();
          if (tok === '==>') continue;
          else if (tok === '|') count++;
          else if (tok === '[]') {
            count--;
            if (count === 0) break;
          }
          else if (tok === '[]') break;
          if (pos > tokens.length) throw "Missing closing '[]'";
          body += tok + ' ';
        } if (this.options.useStmts) body = this.evaluateExpr(body);
        if (this.options.jsMeta) body = eval(body);
        if (this.options.vartroub) body = this._replaceAll(body);
        return body;
      }
      const parseExpr_math = (expr) => {
        return this.evaluateExpr(expr);
      };

      const parseStmt = (expr) => {
        return this.evaluateExpr(expr);
      }

      for (let dir of PLUGIN_PATHS) {
        if (!dir || dir.trim() === '') continue;

        dir = path.resolve(dir); // make absolute

        if (dir === '/') continue; // NO root SCANNING

        if (!fs.existsSync(dir)) continue;
        if (!fs.statSync(dir).isDirectory()) continue;

        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          if (!fs.statSync(fullPath).isFile()) continue;

          this.dynamicKeywords[file] = function () {
            next();
            eval(`${fs.readFileSync(fullPath, 'utf8')}`);
          }.bind(this);
        }
      }

      code = this._replaceMacros(code);

      let rest = tokens.slice(pos).join(' ');

      this.maps['initdex'] = {
        toks: tokens,
        code: code,
        cleaned: cleaned,
        innerCurrent: innerCurrent,
        current: current,
        parentheses: () => parseParen(),
        block: () => parseBlock,
        till: (d) => parseUntil(d),
        tillSem: () => parseUntilSem(),
        evaluator: (expr) => this.evaluateExpr(expr),
        expect: (x) => expect(x),
        expectF: (xd) => expectF(xd),
        next: () => next(),
        last: () => tokens[pos--],
        linedExpr: () => parseLinedExpr(),
        parseTill: (...args) => parseTill(...args),
        pos: () => pos,
        rest: () => rest,
        new: (name, body) => {
          this.macros[name] = body;
        },
        append: (p = pos, ...args) => tokens.appendTo(p, ...args),
      }
      if (current === '{') {
        this.exec(parseBlock());
        next();
      } else if (current === 'windowUI') {
        next();
        const body = this.parseMapInline(parseParen());
        expect(';');
        let options = {};
        try { options = body }
        catch { throw "windowUI expects a map object"; }
        windowUI(options);
      } else if (current === 'random') {
        next();
        const [min, max] = smartSplitArgs(parseParen()).map(x => this.evaluateExpr(x));
        expect('=>');
        const varName = this.evaluateExpr(next());
        expect(';');
        this.maps[varName] = Math.floor(Math.random() * (max - min + 1)) + min;
      } else if (current === 'echo') {
        next();
        const body = parseParen();
        expect(';');
        process.stdout.write(this.evaluateExpr(body));
      } else if (current === 'keep') {
        next();
        const name = next();
        expect('=');
        const value = this.evaluateExpr(this.evaluateExpr(parseUntilSem()));

        if (!(name in this.maps)) {
          this.maps[name] = value;
        }
      } else if (current === 'temp') {
        next(); // consume 'temp'

        const name = next();
        expect('=');
        const tempValue = this.evaluateExpr(this.evaluateExpr(parseUntil('=>')));
        const block = parseBlock();
        expect(';');

        const had = name in this.maps;
        const backup = this.maps[name];

        this.maps[name] = tempValue;
        this.exec(block);

        if (had) this.maps[name] = backup;
        else delete this.maps[name];
      } else if (current === 'void') {
        next();
        const ignored = parseParen();
        expect(';');

        // the magic
        eval(nova.toString()); // recreate class in current scope
        const voidRunner = new nova();
        const serialized = JSON.stringify(this);
        const plainClone = JSON.parse(serialized);

        Object.keys(plainClone).forEach(key => {
          // Don't assign objects directly — deep clone each field
          if (typeof plainClone[key] === 'object') {
            voidRunner[key] = JSON.parse(JSON.stringify(plainClone[key]));
          } else {
            voidRunner[key] = plainClone[key];
          }
        });
        voidRunner.run(this.evaluateExpr(ignored));
      } else if (current === 'lend') {
        next(); // 'lend'

        if (peek() === 'fn') {
          next(); // 'fn'

          const sourceName = next();
          expect('to');
          const targetName = next();
          expect(';');

          const sourceFn = this.functions[sourceName];
          const targetFn = this.functions[targetName];

          if (!sourceFn || !targetFn) {
            throw `Cannot lend. One of the functions does not exist.`;
          }

          // Merge args, avoiding duplicates
          const argsSet = new Set(targetFn.args || []);
          for (const arg of (sourceFn.args || [])) {
            argsSet.add(arg);
          }

          // Merge bodies (you could concat or inject based on control)
          const newBody = (targetFn.body || '') + '\n' + (sourceFn.body || '');

          this.functions[targetName] = {
            args: [...argsSet],
            body: newBody
          };
        } else if (peek() === 'm') {
          next(); // 'm'

          const mapName = next(); // name of the map
          expect('with');
          const funcName = next(); // function to lend
          expect(';');

          const map = this.maps?.[mapName];
          const fn = this.functions?.[funcName];

          if (!map || !fn) {
            throw `Cannot lend. Map '${mapName}' or function '${funcName}' not found.`;
          }

          // Add the function as a method to the map
          map[funcName] = {
            ...fn,
            method: true // optional flag, in case you want to treat it differently
          };
        }
      } else if (current === 'sstream') {
        next();
        const name = next();     // stream name
        expect('=>');
        const body = parseBlock();

        this.functions[name] = {
          args: [],
          body: `
      __stream = "";
      ${body.replace(/put\s+(.*?);/g, '__stream += $1;\n')}
      give __stream;
    `,
        };

      } else if (current === 'async') {
        next();                        // move past 'async'
        const delay = this.evaluateExpr(next()); // evaluate the delay expression
        const expr = parseUntilSem();            // next token is the expression to evaluate

        // Schedule the expression asynchronously
        this.scheduleAsync(this.evaluateExpr(expr), delay);
      } else if (current === 'tap') {
        next();
        const [x, y] = parseStmt(parseParen()).split(',').map(v => this.evaluateExpr(v.trim()));
        expect(';');

        try {
          require('child_process').execSync(`input tap ${x} ${y}`);
        } catch (e) {
          this._log(`Tap error: ${e.message}`);
        }
      } else if (current === 'press') {
        next();
        let key = this.evaluateExpr(parseParen());
        expect(';');
        const shPath = '/bin/bash';
        console.clear();
        execSync(`input keyevent ${key}`, { shPath, encoding: 'utf8' });
      } else if (current === 'banner') {
        next();
        const body = parseParen();
        expect(';');

        const raw = (body);

        let text = "";
        let font = "Standard"; // default

        if (typeof raw === "string" && raw.includes(',')) {
          const [txt, fnt] = raw.split(',').map(s => this.evaluateExpr(s.trim()));
          text = txt;
          font = fnt || "Standard";
        } else if (Array.isArray(raw)) {
          text = raw[0];
          font = raw[1] || "Standard";
        } else {
          text = this.evaluateExpr(raw);
        }

        const figlet = require('figlet');
        figlet.text(text, { font }, (err, data) => {
          if (err) {
            this._log("Banner error: " + err.message);
          } else {
            this._log('\n' + data);
          }
        });

        return;
      } else if (current === 'print') {
        next();
        const body = parseParen();
        expect(';');
        this._log(this.evaluateExpr(body));
      } else if (current === 'rate') {
        next(); // Consume 'rate'

        const [value, total] = this.parseArray(parseParen()); // rate(x, 100)
        expect('{');

        const cases = [];
        let otherCase = null;
        let cumulative = 0;
        let shouldbreak = false; let shouldconti = false;
        while (peek() !== '}') {
          this.breakFn = (() => shouldbreak = true).bind(this); this.contiFn = (() => shouldconti = true).bind(this);
          if (shouldbreak) break;
          if (shouldconti) { shouldconti = false; continue; };
          const token = peek();
          if (token !== 'other') {
            const percentageStr = token;
            const percent = Number(this.evaluateExpr(percentageStr));

            if (isNaN(percent)) {
              throw new Error(`Invalid percentage '${token}' in rate block.`);
            }

            next(); // consume 'XX%'
            expect('=>');

            const body = parseBlock();
            expect(';');

            cases.push({ range: [cumulative, cumulative + percent], body });
            cumulative += percent;
          } else if (token === 'other') {
            next(); // consume 'other'
            expect('=>');
            otherCase = parseBlock();
            expect(';');
          } else {
            throw new Error(`Unexpected token '${token}' in rate block.`);
          }
        }

        expect('}');
        expect(';');

        const val = value;

        const totalNum = Number(total);
        if (isNaN(val) || isNaN(totalNum)) {
          throw new Error(`Invalid values in rate: val=${value}, total=${total}`);
        }

        // Scale val to a range from 0 to totalNum
        const percentValue = (val / totalNum) * 100;

        const matched = cases.find(({ range: [start, end] }) => {
          return percentValue >= start && percentValue <= end;
        });

        if (matched) {
          this.exec(matched.body);
        } else if (otherCase) {
          this.exec(otherCase);
        } else {
        }
      } else if (current === 'using') {
        next();
        let optionName = next();
        expect(';');
        this.options[optionName] = true;
      } else if (current === '<' && tokens[pos+1] === 'use') {
        next(); next();
        let optionName = next();
        expect('>');
        this.options[optionName] = true;
        let ttk = this.tokenize(code);
        tokens = ttk.tokens;
        cleaned = ttk.code;
      } else if (current === 'option') {
        next();
        let optionName = next();
        expect('=');
        let expr = this.evaluateExpr(parseUntilSem());
        this.fnopts[optionName.trim()] = expr;
      } else if (current === 'unuse') {
        next();
        let optionName = next();
        expect(';');
        this.options[optionName] = false;
      } else if (current === 'UI') {
        next();
        const body = this.evaluateExpr(parseParen()).trim();
        expect('as');
        let Formatlang = next();
        let parsed = {};
        if (Formatlang === 'json') parsed = JSON.parse(body)
        else if (Formatlang === 'js') parsed = require('json5').parse(body)
        else if (Formatlang === 'keol') parsed = parseKeol(body)
        else if (Formatlang === 'self') parsed = this.parseMapInline(body)
        else throw `Unkown or unsuppored formatting language: ${FormatLang}`;
        console.log(generateConsoleUI(parsed));
        expect(';');
      } else if (current === 'println') {
        next();
        const body = parseParen();
        expect(';'); //write to console inline using process.stdout.write
        process.stdout.write(this.evaluateExpr(body));
        this.resultOutput += this.evaluateExpr(body);
      } else if (current === 'logln') {
        next();
        const body = parseParen();
        expect(';');
        process.stdout.write(this.evaluateExpr(body));
      } else if (current === 'log') {
        next();
        const body = parseParen();
        expect(';');
        console.log(this.evaluateExpr(body));
      } else if (current === 'expt') {
        next();
        const expected = next();
        expect('from');
        this.loggable = false;
        const actual = String(this.exec(parseBlock())).trim();
        this.loggable = true;
        expect(';');
        expectF(expected, actual);
      } else if (current === 'do') {
        next();
        const body = parseBlock();
        const cname = next();
        const cond = parseParen();
        expect(';');
        if (this.evaluateExpr(cond) && cname === 'if') {
          this.exec(body);
        } else if (this.evaluateExpr(cond) && cname === 'while') {
          while (this.evaluateExpr(cond)) this.exec(body);
        } else if (this.evaluateExpr(cond) && cname === 'until') {
          while (!(this.evaluateExpr(cond))) this.exec(body);
        } else if (this.evaluateExpr(cond) && cname === 'if') {
          if (this.evaluateExpr(cond)) this.exec(body);
        } else {
          this.exec(body);
        }
      } else if (current === 'reed') {
        //python-like if
        next();
        let flag = parseUntilTP();
        const body = parseLinedExpr();
        if (this.evaluateExpr(flag)) this.exec(body);
      } else if (current === 'dper') {
        //python-like while
        next();
        let flag = parseUntilTP();
        const body = parseLinedExpr();
        while (this.evaluateExpr(flag)) this.exec(body);
      } else if (current === 'expect') {
        next();
        const expected = next();
        expect('from');
        const actual = this.evaluateExpr(parseParen()).trim();
        expect(';');
        if (actual !== expected) {
          throw new Error(`Expected '${expected}' but got '${actual}'`);
        }
      } else if (current === 'var') {
        next();
        const varName = next();
        expect('=');
        const value = this.evaluateExpr((parseUntilSem()));
        if (this.maps[varName] !== undefined) {
          throw new Error(`Variable ${varName} already exists`);
        }
        this.maps[varName] = value;
      } else if (current === 'let' || current === 'const') {
        next();
        const varName = this.evaluateExpr(parseUntilEq());
        if (tokens[pos-1] === ';') {
          this._assignToPath(varName, undefined);
          continue
        };

        // Check for flags block: [ ... ]
        let flags = null;
        if (peek() === '[') {
          next(); // consume '['
          let flagTokens = [];
          let depth = 1;
          while (depth > 0 && peek() !== undefined) {
            const tok = next();
            if (tok === '[') depth++;
            else if (tok === ']') depth--;
            if (depth > 0) flagTokens.push(tok);
          }
          flags = this.parseArr(flagTokens.join(' '));
          expect('=');
        }

        // Parse values (support multiple, separated by commas)
        let valuesRaw = parseUntilSem();
        let values = this.evaluateExpr(valuesRaw);

        // Find the last tuple flag (e.g. (a,b))
        let tupleFlag = flags?.filter(f => /^\(.*\)$/.test(f)).pop();

        if (tupleFlag) {
          // Always use tuple keys if present
          let keys = this.parseArr(tupleFlag.substr(1, tupleFlag.length - 2));
          let obj = {};
          for (let i = 0; i < keys.length; i++) {
            obj[keys[i]] = values[i];
          }
          // Fill remaining keys with undefined
          for (let i = values.length; i < keys.length; i++) {
            obj[keys[i]] = undefined;
          }
          this._assignToPath(varName, obj);
        } else if (flags?.some(f => f.startsWith('typeof::'))) {
          // If typeof::object, force object with v0, v1, ...
          if (flags.find(f => f === 'typeof::object')) {
            let obj = {};
            for (let i = 0; i < values.length; i++) {
              obj[`v${i}`] = values[i];
            }
            this._assignToPath(varName, obj);
          } else if (flags.find(f => f === 'typeof::array')) {
            // If typeof::array, force array
            this._assignToPath(varName, values);
          } else if (flags.find(f => f === 'typeof::set')) {
            length = values.length;
            // If typeof::array, force array
            this._assignToPath(varName = Array.from(new Set(values)));
          } else if (flags.find(f => f === 'typeof::string')) {
            // If typeof::string, force string
            this._assignToPath(varName, String(values));
          } else if (flags.find(f => f === 'typeof::number')) {
            // If typeof::string, force string
            this._assignToPath(varName, Number(values));
          } else if (flags.find(f => f === 'typeof::bool')) {
            // If typeof::string, force string
            this._assignToPath(varName, Boolean(values));
          } else {
            // Other typeof:: types can be handled here
            this._assignToPath(varName, values);
          }
        } else {
          // Default: assign single value or array
          this._assignToPath(varName, values);
        }

        // For const, make read-only
        if (current === 'const') {
          Object.defineProperty(this.maps, varName, {
            value: this.maps[varName],
            writable: false,
            configurable: false,
            enumerable: true
          });
        }
      } else if (this.structs[current]) {
        const struct = this.structs[current];
        next();
        const instanceName = next();
        let typeArgs = peek() === '<' ? this.parseArray(parseDelimited('<', '>')) : [];
	let body = parseBlock();
        let structDef = struct;
        // Store the instance
        let val = this.parseMapInline(body);

if (typeArgs.length > 0 && structDef.params) {
    // substitute generic params with actual types
    let mapping = {};
    for (let k = 0; k < structDef.params.length; k++) {
      mapping[structDef.params[k]] = typeArgs[k];
    }

    val = this.validateStruct(structDef.fields, val, mapping);
  } else {
    val = this.validateStruct(structDef.fields, val);
}
        this.maps[instanceName] = val;
      } else if (current === 'continue') {
        next();
        expect(';');
        try {
          this.contiFn();
        } catch (e) {
          continue;
        };
      } else if (current === 'end') {
        next();
        if (pos === tokens.length - 1 || pos === 0) continue
        pos = tokens.length - 1;
      } else if (current === 'time') {
        next();
        const body = parseBlock();

        const start = Date.now();
        this.exec(body);
        const end = Date.now();
        this._log(`${end - start}`);
      } else if (current === 'clear') {
        next();

        this.functions = {};
        this.enums = {};
        this.classes = {};
        this.ret = {};
        this.states = {};
        this.macros = {};
        this.defunctions = {};
        this.structs = {};
        this.blocks = {};
        this.snippets = {};
        this.interfaces = {};
        this.types = {};
        this.keyfuncs = {};
        console.clear();
        this._log('Environment cleared');
      } else if (current === 'out.clear') {
        next();

        console.clear();
      } else if (current === 'out.loggable') {
        next();
        expect('=');
        const status = this.evaluateExpr(next());

        this.loggable = status;
      } else if (current === 'out.reload') {
        next();

        const shPath = '/bin/bash';
        runNovaCode('clear;');
        console.clear();
        execSync('clear', { shPath, encoding: 'utf8' });
        execSync('nova', { shPath, encoding: 'utf8' });
      } else if (current === '<' && tokens[pos+1] === 'type' && tokens[pos+2] === 'name') {
        next(); next(); next();
        let name = next();
        expect('=');
        let body = parseBlock();
        expect('>');
        let val = this.evaluateExpr(body);
        this.typenames[name.trim()] = val;
      } else if (current === '<' && tokens[pos+1] === 'typename') {
	next(); next();
        let name = next();
        expect('=');
        let body = parseBlock();
        expect('>');
        let val = this.evaluateExpr(body);
        this.typenames[name.trim()] = val;
      } else if (current === '<' && tokens[pos+1] === 'retok' && tokens[pos+2] === '>') {
        next(); next(); next();
        let ttk = this.tokenize(code);
        tokens = ttk.tokens;
        cleaned = ttk.code;
      } else if (current === '<' && tokens[pos+1] === 'type' && tokens[pos+2] === 'op') {
        next(); next(); next();
      } else if (current === 'skip') {
        next();
        expect(';');
      } else if (current === ';') {
        next();
        break;
      } else if (current === '' || current === ' ' || current === undefined) {
        next();
      } else if (String(current).startsWith('...')) {
        next();
        const matter = current.slice(3);
        if (matter === 'code') {
          console.log("running test code...");
        } else if (matter === 'print') {
          let val = this.evaluateExpr(parseUntilSem());
          console.log(val);
        } else if (matter === 'add') {
          let name = next();
          expect('as');
          let val = this.evaluateExpr(parseUntilSem());
          this.maps[name] = val;
        }
      } else if (current === 'repeat') {
        next();
        const times = parseExpr_math(parseParen());
        const body = parseBlock();

        if (body.trim() === '') { } else {
          for (let i = 0; i < times; i++) {
            this.maps['i'] = i;
            this.exec(body);
          }
        }
      } else if (current === 'tb$') {
        next();
        const body = parseBlock();

        this.exec(body.trim().substring(1, body.trim().length - 1));
      } else if (current === 'keyfunc') {
        next();
        const funcName = next();
        const funcParams = parseParen();
        const funcBody = parseBlock();
        const funcLogic = parseBlock();

        this.keyfuncs[funcName] = { params: funcParams, body: funcBody, logic: funcLogic };
      } else if (current === 'map') {
        next();
        const mapName = next();
        const mapBlock = parseBlock(); // assume block like `{ a = 1; b = [1, 2]; c = { d = 4 }; f = (x) => x * 2 }`


        const entries = this.parseMapInline(mapBlock);

        this.maps[mapName] = entries;
      } else if (current === 'class') {
        next();
        const mapName = next(); const mapBlock = parseBlock(); // assume block like `{ a = 1; b = [1, 2]; c = { d = 4 }; f =>
        const entries = this.parseMapInline(mapBlock);

        this.classes[mapName] = entries;
      } else if (current === 'web') {
        next();
        const mapName = next();
        let raw = parseBlock();
        const mapBlock = '{' + raw.substring(1, raw.length - 2) + '}'; // assume block like `{ a = 1; b = [1, 2]; c = { d = 4 }; f = (x) => x * 2 }`


        const entries = webfirm.parse(mapBlock);

        this.webs[mapName] = new webfirm(entries);
      } else if (current === 'enum') {
        next();
        const enumName = next();
        const enumBlock = parseBlock(); // like `{ A, B, C }`


        const values = this.parseArray(enumBlock)

        this.enums[enumName] = values;
        this.maps[enumName] = values;
      } else if (current === 'array') {
        next();
        const arrayName = next();
        const arrayBlock = parseBlock(); // returns the string inside `{ ... }`


        const items = this.parseArray(arrayBlock);
        this.maps[arrayName] = items;
      } else if (current === 'DYNAMIC') {
        next();
        const naSme = next();
        if (naSme === 'FUNCTION') {
          expect('NAME');
          expect('=');
          let name = next();
          expect('BODY:');
          let body = parseBlock();
          this.dynamicKeywords[name] = function () {
            next();
            eval(`${this.evaluateExpr(body)}`);
          }.bind(this);
        } else if (naSme === 'TEXT') {
          expect('NAME');
          expect('=');
          let name = next();
          expect('INIT:');
          let body = parseBlock();
          this.dynamicKeywords[name] = `${this.evaluateExpr(body)}`;
        }
      }

      else if (this.keyfuncs[current]) {
        const funcName = current;
        next();
        const args = parseParen();
        const funcCallBody = parseBlock();
        const func = this.keyfuncs[funcName];
        const logic = func.logic.replace(func.params, args);
        const body = func.body.replace('act', funcCallBody);
        const code = logic.replace('act', body);
        this.exec(code.replace('act', funcCallBody));
      } else if (current === 'readFile') {
        next();
        const varName = next();
        expect('=');
        const filename = this.evaluateExpr(parseParen());
        expect(';');
        try {
          const content = safeReadFile(filename);
          this.maps[varName] = content;
        } catch (e) {
          throw e;
        }
      } else if (current === 'test') {
        next();
        const topic = next();

        if (topic === 'expr') {
          const expr = parseParen();
          const val = this.evaluateExpr(expr);
          console.log('[test:expr]', val);
          expect(';');

        } else if (topic === 'evalTok') {
          const expr = parseParen();
          const val = this._evalToken(parseStmt(expr));
          console.log('[test:evalToken]', val);
          expect(';');

        } else if (topic === 'token') {
          const input = parseParen();
          const tokens = this.tokenize(input);
          console.log('[test:token]', tokens);
          expect(';');

        } else if (topic === 'replace') {
          const input = parseParen();
          const out = this._replaceAll(input);
          console.log('[test:replace]', out);
          expect(';');

        } else if (topic === 'strip') {
          const input = parseParen();
          const out = this.stripComments(input);
          console.log('[test:strip]', out);
          expect(';');

        } else if (topic === 'run') {
          const input = parseParen();
          this.exec(input);
          expect(';');

        } else if (topic === 'code') {
          const code = parseBlock().trim();
          const operation = next();

          let result;
          switch (operation) {
            case 'print':
              console.log('[test:code:print]\n' + code);
              break;

            case 'tokenize':
              result = this.tokenize(code);
              console.dir(result, { depth: null });
              break;

            case 'replaceAll':
              result = this._replaceAll(code);
              console.log('[test:code:replaceAll]', result);
              break;

            case 'stripComments':
              result = this.stripComments(code);
              console.log('[test:code:stripComments]', result);
              break;

            case 'run':
              console.log('[test:code:run]');
              this.exec(code);
              break;

            default:
              console.warn(`[test:code] Unknown op: ${operation}`);
          }

          expect(';');

        } else {
          console.warn(`[test] Unknown topic: ${topic}`);
          skipUntil(';');
        }
      } else if (current === 'give' || current === 'return') {
        next();
        const body = this.evaluateExpr(parseUntilSem());
        this.resultOutput = body;
        if (current === 'give') return;
      } else if (current === 'execFile') {
        next();
        const filename = this.evaluateExpr(parseParen());
        expect(';');
        try {
          const content = safeReadFile(filename);
          const ext = path.extname(filename).toLowerCase().trim().replace("\"", '').replace("\'", '');
          if (ext === '.nova' || ext === '.nv') {
            this.exec(content);
          } else if (ext === '.js') {
            eval(content);
          } else if (ext === '.json') {
            this.maps['lastJson'] = JSON.parse(content);
            this._log('Loaded JSON into lastJson');
          } else {
            this._log(`Unknown file extension: ${ext}`);
          }
        } catch (e) {
          throw e;
        }
      }
      else if (current === 'createFile') {
        next();
        const filename = this.evaluateExpr((parseParen()));
        expect(',');
        const content = this.evaluateExpr((parseParen()));
        expect(';');
        try {
          let fname = filename.trim();
          if ((fname.startsWith('"') && fname.endsWith('"')) || (fname.startsWith("'") && fname.endsWith("'"))) {
            fname = fname.slice(1, -1);
          }
          fs.writeFileSync(fname, content, 'utf8');
        } catch (e) {
          throw new Error(`Failed to create file ${fname}: ${e.message}`);
        }
      } else if (this.commands[current]) {
        const cname = next();
        this.run(cname.body)
      } else if (current === 'delete') {
        next();
        const varName = next();
        expect(';');
        this.maps[varName] = undefined;
      } else if (current === 'deleteFile') {
        next();
        const filename = this.evaluateExpr((parseParen()));
        expect(';');
        try {
          let fname = filename.trim();
          if ((fname.startsWith('"') && fname.endsWith('"')) || (fname.startsWith("'") && fname.endsWith("'"))) {
            fname = fname.slice(1, -1);
          }
          fs.unlinkSync(fname);
        } catch (e) {
          throw new Error(`Failed to delete file ${fname}: ${e.message}`);
        }
      } else if (current === 'listFiles') {
        next();
        const dir = this.evaluateExpr((parseParen()));
        expect(';');
        try {
          let dname = dir.trim();
          if ((dname.startsWith('"') && dname.endsWith('"')) || (dname.startsWith("'") && dname.endsWith("'"))) {
            dname = dname.slice(1, -1);
          }
          const files = fs.readdirSync(dname);
          this.maps['lastFileList'] = files;
          this._log(`${dname}: ${files.join(', ')}`);
        } catch (e) {
          throw new Error(`Failed to list files: ${e.message}`);
        }
      } else if (current === 'term') {
        next();
        const cmd = this.evaluateExpr(parseParen()).trim();
        const shell = next();
        expect(';');
        try {
          // Map shell names to paths
          let shellPath = `/bin/${shell}` || '/bin/bash';

          const output = execSync(cmd, { shell: shellPath, encoding: 'utf8' });
          this._log(output.trim());
          this.maps['lastTermOutput'] = output.trim();
        } catch (e) {
          this._log(`${shell} term error: ${e.message}`);
          this.maps['lastTermOutput'] = '';
        }
      } else if (current === 'defunc') {
        next();
        const funcName = next();
        const funcParams = parseBlock(); // parse params in {}
        const funcBody = parseBlock(); // parse function body in {}
        this.defunctions[funcName] = { params: funcParams, body: funcBody };
      }

      else if (this.defunctions[current]) {
        const funcName = current;
        next();
        const args = parseBlock(); // parse args in {}
        let varTarget = null;
        if (peek() === '=>') {
          next();
          varTarget = next();
        };
        const func = this.defunctions[funcName];
        const body = func.body.replace('act', args);
        let result = this.exec(body);
        if (this.maps[varTarget]) {
          this.maps[varTarget] = result;
        };
      } else if (current === 'lambda') {
        next();
        const paramsStr = parseParen();
        expect('=>');
        const valueBlock = parseBlock();
        expect(';');
        this.functions['llmbd'] = {
          args: this.parseArray(paramsStr),
          body: valueBlock,
          execBlock: ''
        };
      } else if (current === 'block') {
        next();
        const blockName = next();
        const blockBody = parseBlock();
        expect(';');
        this.blocks[blockName] = blockBody;
      } else if (this.blocks[current]) {
        const blockName = current;
        next();
        const blockBody = this.blocks[blockName];
        this.exec(blockBody);
      }

      // Snippet
      else if (current === 'snippet') {
        next();
        const snippetName = next();
        const snippetBody = parseBlock();
        expect(';');
        this.snippets[snippetName] = snippetBody;
      } else if (this.snippets[current]) {
        const snippetName = current;
        next();
        const args = parseParen().split(',').map(arg => arg.trim());
        expect(';');
        const snippetBody = this.snippets[snippetName];
        let code = snippetBody;
        for (let i = 0; i < args.length; i++) {
          code = code.replace(new RegExp(`arg${i}`, 'g'), args[i]);
        }
        this.exec(code);
      }

      // Interface
      else if (current === 'interface') {
        next();
        const interfaceName = next();
        expect('{');
        const methods = [];
        while (peek() !== '}') {
          const methodName = next();
          const methodParams = parseParen();
          expect(';');
          methods.push({ name: methodName, params: methodParams });
        }
        expect('}');
        expect(';');
        this.interfaces[interfaceName] = methods;
      } else if (current === 'struct') {
        next();
        const structName = next();
        let params = [];
        if (peek() === '<') params = parseDelimited('<', '>');
        let blody = parseBlock();
        expect(';');
        this.structs[structName] = { params: this.parseArray(params), fields: this.parseMapInline(blody) };
      } else if (current === 'implements') {
        next();
        const interfaceName = next();
        expect('{');
        const implementations = {};
        while (peek() !== '}') {
          const methodName = next();
          const methodBody = parseBlock();
          implementations[methodName] = methodBody;
        }
        expect('}');
        expect(';');
        const interfaceMethods = this.interfaces[interfaceName];
        for (const method of interfaceMethods) {
          if (!implementations[method.name]) {
            throw new Error(`Method ${method.name} not implemented`);
          }
        }
        for (const methodName in implementations) {
          const methodBody = implementations[methodName];
          this.exec(methodBody);
        }
      } else if (current === 'exit') {
        next();
        const code = parseInt(this.evaluateExpr(this._replaceAll(parseParen())));
        expect(';');
        process.exit(code);
      } else if (current === 'throw') {
        next();
        let errorMessage = '';
        while (peek() !== ';') {
          errorMessage += next() + ' ';
        }
        expect(';');
        throw this.evaluateExpr(errorMessage.trim());
      }

      else if (current === 'break') {
        next();
        expect(';');
        try {
          this.breakFn();
        } catch (e) {
          break;
        };
      } else if (current === 'Terminate') {
        next();
        expect(';');
        process.exit(0);
      }

      else if (current === 'error') {
        next();
        let errorMessage = this.evaluateExpr(this._replaceAll(parseParen()));
        expect(';');
        throw `${errorMessage}`;
      }

      else if (current === 'info') {
        next();
        let infoMessage = this.evaluateExpr((parseParen()));
        expect(';');
        this._log(`INFO: ${infoMessage}`);
      } else if (current === 'resu') {
        next();
        const resuName = next();
        const paramsStr = parseParen();
        expect('=>');
        const valueBlock = parseBlock();
        expect(',');
        expect(';');
        this.maps[resuName] = this.fn(this.parseArr(paramsStr), valueBlock, { usetype: 'expr' });
      } else if (current === 'type') {
        next();
        const typeName = next();
        let typeBlock = parseBlock();
        expect(';');
        let val = this.parseMapInline(typeBlock);
        this.varMethods[typeName] = val;
        this.types[typeName] = val;
      }

      else if (this.types[current]) {
        const typeName = current;
        next();
        let name = next();
        expect('=');
        let val = parseUntilSem();
        this.debug('making instance of: ' + typeName + ', value: ' + JSON.stringify(this.types[typeName]));
        let init = this.types[typeName].function(this.evaluateExpr((val)));
        let handler = {
          value: init,
          ...{ ...this.types[typeName]?.metadatas },
          getType: this.types[typeName]?.getType || (() => typeName), //overrode nova's typeof
          typeProperties: {
            isType: true,
            ...{ ...this.types[typeName] }
          }
        };
        createTyped(this.maps, name, (['integer', 'float', 'string', 'array', 'object', 'bool', 'any'].includes(typeName)) ? init : handler, typeName, this.typeof);
      }

      else if (current === 'export') {
        next();
        expect('{');
        while (peek() !== '}') {
          const exportName = this.evaluateExpr((parseParen()));
          expect('=');
          const exportBlock = parseBlock();
          fs.writeFileSync(`${exportName}.nvh`, exportBlock);
          if (peek() === ',') next();
        }
        expect('}');
        expect(';');
      }

      else if (current === 'warn') {
        next();
        let warningMessage = this.evaluateExpr((parseParen()));
        expect(';');
        this._log(`Warning: ${warningMessage}`);
      }

      else if (current === 'assert') {
        next();
        let condition = this.evaluateExpr((parseParen()));
        expect(';');
        if (!this.evaluateExpr((condition))) {
          throw `Assertion failed: ${condition}`;
        }
      } else if (current === 'until') {
        next();
        const rawExpr = parseParen();
        const body = parseBlock();
        expect(';');
        let shouldbreak = false; let shouldconti = false;

        while (!(this.evaluateExpr((rawExpr)))) {
          this.breakFn = (() => shouldbreak = true).bind(this); this.contiFn = (() => shouldconti = true).bind(this);
          if (shouldbreak) break;
          this.exec(body);
          if (shouldconti) { shouldconti = false; continue; };
        }
      } else if (current === 'macro') {
        next();
        const name = this.evaluateExpr(next());
        const body = this.evaluateExpr((parseParen()));
        expect(';');
        this.macros[name] = body;
      } else if (current === 'namespace') {
        next();
	let name = parseUntilSem();
        this._assignToPath(this.evaluateExpr(name), {});
      } else if (current === 'classify') {
        next();
        const body = parseParen();
        const args = body.split(',');
        const mapName = args[0].trim();
        const className = args[1].trim();
        expect(';');


        if (this.enums[mapName]) {
          this.states[className] = this.enums[mapName];
        } else if (this.maps[mapName]) {
          this.classes[className] = this.maps[mapName];
        } else {
          throw `${mapName} doesn't exist`;
        }
      } else if (this.classes[current]) {
        const className = next();
        const name = next();
        let args = this.parseArray(parseParen());
        expect(';');
        try {
          this.maps[name] = new new this.classes[className](...args);
        } catch {
          try {
            this.maps[name] = new this.classes[className](...args);
          } catch {
            try {
              this.maps[name] = this.classes[className](...args);
            } catch {
              try {
                this.maps[name] = this.extract(this.classes[className])(...args);
              } catch {
                this.maps[name] = this.classes[className];
              }
            }
          }
        }
      } else if (this.branches[current.trim()]) {
next();
            let branch = this.branches[current];
            let body; let cond
            if (branch.cond) cond = parseParen();
            if (branch.body) body = parseBlock();
            if (branch.predefined_expr) cond = this.evaluateExpr(cond);
            if (branch.expects) {
	      branch.expects.forEach((a) => expect(a));
	    }
            if (branch.checker(cond)) {
               if (branch.execute) this.exec(body);
               if (branch.fn) branch.fn(body);
            }
            } else if (this.states[current]) {
        const className = next();
        const name = next();
        expect(';');
        this.enums[name] = this.states[className];
      } else if (current === 'evalAsJavaScript__unknown') {
        next();
        const body = this.evaluateExpr(parseParen()) + '\n';
        expect(';');
        this._log(eval(body));
      } else if (current === 'if') {
        next();
        const expr = (parseParen());
        const cond = this.evaluateExpr(expr);
        const ifBody = parseBlock();
        let executed = false;

        if (cond) {
          this.run(ifBody);
          executed = true;
        }

        // Handle optional 'else if' and 'else'

        while (peek() === 'else') {
          next();
          if (peek() === 'if') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);
            const elseIfBody = parseBlock();


            if (!executed && elseIfCond) {
              this.run(elseIfBody);
              executed = true;
            }
} else if (peek() === 'guard') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);


            if (!executed && elseIfCond) {
              executed = true;
            }
          } else if (peek() === 'assert') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);


            if (!executed && elseIfCond) {
              executed = true;
            } else process.exit(-1);
          } else if (peek() === 'exit') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);


            process.exit(elseIfCond);
            } else if (peek() === 'unless') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);
            const body = parseBlock();
            const elseIfBody = parseBlock();


            if (!executed && !elseIfCond) {
              this.run(body);
              executed = true;
            }
            } else if (this.branches[peek().trim()]) {
            let branch = this.branches[peek()];
next();
            let body; let cond; let val;
            if (branch.cond) cond = parseParen();
            if (branch.body) body = parseBlock();
            if (branch.predefined_expr) cond = this.evaluateExpr(cond);
	    if (branch.checker(cond)) {
               if (branch.execute) this.run(body);
               if (branch.fn) branch.fn(body);
            }
            } else {
            const elseBody = parseBlock();


            if (!executed) {
              this.run(elseBody);
            }

            break;
          }
}
      } else if (current === 'guard') {
        next();
        const expr = (parseParen());
        const cond = this.evaluateExpr(expr);
        let executed = false;

        if (cond) {
          executed = true;
        }

        // Handle optional 'else if' and 'else'
        while (peek() === 'else') {
          next();
          if (peek() === 'if') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);
            const elseIfBody = parseBlock();


            if (!executed && elseIfCond) {
              this.exec(elseIfBody);
              executed = true;
            }
} else if (peek() === 'guard') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);


            if (!executed && elseIfCond) {
              executed = true;
            }
          } else if (peek() === 'assert') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);


            if (!executed && elseIfCond) {
              executed = true;
            } else process.exit(-1);
          } else if (peek() === 'exit') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);


            process.exit(elseIfCond);
            } else if (peek() === 'unless') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);
            const body = parseBlock();
            const elseIfBody = parseBlock();


            if (!executed && !elseIfCond) {
              this.exec(body);
              executed = true;
            }
            } else if (this.branches[peek()]) {
next()
            let branch = this.branches[peek()];
            let body; let cond; let val;
            if (branch.cond) cond = parseParen();
            if (branch.body) body = parseBlock();
            if (branch.predefined_expr) cond = this.evaluateExpr(cond);
            if (branch.checker(cond)) {
               if (branch.execute) this.exec(body);
               if (branch.fn) branch.fn(body);
            }
            } else {
            const elseBody = parseBlock();


            if (!executed) {
              this.exec(elseBody);
            }

            break;
          }
}
      } else if (current === 'unless') {
        next();
        const expr = this.evaluateExpr(parseParen());
        const cond = this.evaluateExpr(expr);
        const ifBody = parseBlock();
        let executed = false;


        if (!(cond)) {
          this.exec(ifBody);
          executed = true;
        }

        while (peek() === 'else') {
          next();
          if (peek() === 'if') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);
            const elseIfBody = parseBlock();


            if (!executed && elseIfCond) {
              this.exec(elseIfBody);
              executed = true;
            }
} else if (peek() === 'guard') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);


            if (!executed && elseIfCond) {
              executed = true;
            }
          } else if (peek() === 'assert') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);


            if (!executed && elseIfCond) {
              executed = true;
            } else process.exit(-1);
          } else if (peek() === 'exit') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);


            process.exit(elseIfCond);
            } else if (peek() === 'unless') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);
            const body = parseBlock();
            const elseIfBody = parseBlock();


            if (!executed && !elseIfCond) {
              this.exec(body);
              executed = true;
            }
            } else if (this.branches[peek()]) {
nect();
            let branch = this.branches[peek()];
            let body; let cond; let val;
            if (branch.cond) cond = parseParen();
            if (branch.body) body = parseBlock();
            if (branch.predefined_expr) cond = this.evaluateExpr(cond);
            if (branch.checker(cond)) {
               if (branch.execute) this.exec(body);
               if (branch.fn) branch.fn(body);
            }
            } else {
            const elseBody = parseBlock();


            if (!executed) {
              this.exec(elseBody);
            }

            break;
          }
}
      } else if (current === 'while') {
        next();
        const rawExpr = parseParen();
        const body = parseBlock();
        let executed = false;
        let shouldbreak = false; let shouldconti = false;

        while (this.evaluateExpr((rawExpr))) {
          this.breakFn = (() => shouldbreak = true).bind(this); this.contiFn = (() => shouldconti = true).bind(this);
          if (shouldbreak) break;
          this.exec(body);
          if (shouldconti) { shouldconti = false; continue; };
        }

        while (peek() === 'then') {
          next();
          if (peek() === 'if') {
            next();
            const elseIfExpr = (parseParen());
            const elseIfCond = this.evaluateExpr(elseIfExpr);
            const elseIfBody = parseBlock();


            if (!executed && elseIfCond) {
              this.exec(elseIfBody);
              executed = true;
            }
          } else if (this.branches[peek()]) {
next();
            let branch = this.branches[peek()];
            let body; let cond; let val;
            if (branch.cond) cond = parseParen();
            if (branch.body) body = parseBlock();
            if (branch.predefined_expr) cond = this.evaluateExpr(cond);
            if (branch.checker(cond)) {
               if (branch.execute) this.exec(body);
               if (branch.fn) branch.fn(body);
            }
            } else {
            const elseBody = parseBlock();


            if (!executed) {
              this.exec(elseBody);
            }
            break;
          }
        }
      } else if (current === 'match') {
        next(); // skip 'match'

        const matchExpr = this.evaluateExpr(parseUntil('do'));
        expect('{');
        let matched = false;
        let lastBody = null;
        let shouldbreak = false; let shouldconti = false;

        while (peek() !== '}') {
          this.breakFn = (() => shouldbreak = true).bind(this); this.contiFn = (() => shouldconti = true).bind(this);
          if (shouldbreak) break;
          const caseKey = next(); // might be '1', '2', or '_Last'
          expect(')');

          const caseBody = parseUntil(';') + ' ;';

          if (caseKey === '_Last') {
            lastBody = caseBody;
          } else if (!matched && String(this.evaluateExpr(caseKey)) === String(matchExpr)) {
            this.exec(caseBody);
            matched = true;
          }
          if (shouldconti) { shouldconti = false; continue; };
        }

        if (!matched && lastBody) {
          this.exec(lastBody);
        }

        expect('}');

      } else if (current === 'with') {
        next(); // 'with'
        if (peek() === 'option') {
        let opt = next();
	this.options[opt.trim()] = true;
	this.exec(parseBlock());
	delete this.options[opt.trim()];
        } else {
        let targetMap = this.evaluateExpr(parseParen());
        if (!targetMap || typeof targetMap !== 'object') {
          throw `with(${targetName}) must target a map or var-map`;
        }

        const body = parseBlock();
        this._runWithContext(targetMap, body);
        }
      } else if (current === 'when') {
        next();
        let cond = this.evaluateExpr(parseUntil('do'));
        let body = parseBlock();
        expect(';');
        if (cond) {
          this.exec(body);
        }
      } else if (current === 'session') {
        next(); // 'session'

        const sessionName = this.evaluateExpr(parseParen());

        const body = parseBlock(); // body = { ... }

        const parsed = this.parseMapInline(body); // Convert to a JS object
        this.sessions = this.sessions || {};
        this.sessions[sessionName] = parsed;

        // Run the code if present
        if (parsed.code) {
          try {
            this.exec(parsed.code);
          } catch (e) {
            console.log(`❌ Session "${sessionName}" code error:\n`, e);
          }
        }

      } else if (this.sessions?.[current]) {
        next();
        const sess = this.sessions[current];
        if (sess.code) {
          this.exec(sess.code);
        } else {
          console.log(`⚠️ Session "${current}" has no code`);
        }

      } else if (current === 'enter') {
        next(); // skip 'enter'

        const enterKey = next(); // e.g. 'session'
        const enterType = next(); // e.g. 'sets'
        expect(';');

        // Only supporting 'session sets' for now
        if (enterKey === 'session' && enterType === 'sets') {
          const name = prompt('>>> name? ');
          const lang = prompt('>>> Lang (nova/ny/nvp/nv_plugin/nvcc/nvn/nvcc-pre/nova-pre) ? ');
          const code = prompt('>>> Code? ');

          const built = `
session("${name}") {
  lang = "${lang}";
  code = ${code};
};
`;

          console.log('\nNova says: Enter complete 💫');
          console.log('Generated:\n' + built);
          this.exec(built); // or save to a file, or inject into runtime
        } else {
          throw `Unknown enter command: ${enterKey} ${enterType}`;
        }
      } else if (current === 'declare') {
        next(); // skip 'return'
        const val = this.evaluateExpr(parseParen());

        let name = null;
        let returnToRet = false;
        let returnToVars = false;
        let shouldLog = false;
        let shouldThrow = false;
        let shouldFinalize = false;

        const nextToken = peek();

        if (nextToken === 'as') {
          next();
          name = next();
          returnToRet = true;
          returnToVars = true;
        } else if (nextToken === 'into') {
          next();
          name = next();
          returnToVars = true;
        } else if (nextToken === 'with') {
          next();
          name = next();
          returnToRet = true;
        } else if (nextToken === 'quietly') {
          next();
          // Do nothing – pure side effectless return
        }

        // Handle optional flags after name
        while (['log', 'throw', 'finalize', 'quietly'].includes(peek())) {
          const flag = next();
          if (flag === 'log') shouldLog = true;
          else if (flag === 'throw') shouldThrow = true;
          else if (flag === 'finalize') shouldFinalize = true;
          else if (flag === 'quietly') {
            // override any name-based assignments
            returnToRet = false;
            returnToVars = false;
            name = null;
          }
        }

        expect(';');

        if (name && returnToRet) this.ret[name] = val;
        if (name && returnToVars) this.maps[name] += val;

        if (shouldLog) this._log(`${name || 'unnamed'}: ${val}`);
        if (shouldThrow) throw new Error(`${name || 'value'}: ${val}`);
        if (shouldFinalize) break;

        continue;
      } else if (current === 'func') {
        next();
        const funcName = next();
        const paramsStr = parseParen();
        expect('=>');
        const valueBlock = parseBlock();
        expect(';');
        this.functions[funcName] = this.extract({
          args: this.parseArr(paramsStr),
          body: valueBlock
        });
      } else if (current === 'ifunc') {
        next(); // skip 'ifunc'
        const name = next(); // function name
        const arg = parseParen().trim();
        const body = parseBlock();
        expect(';');
        this.infuncs[name] = { arg, body };
      } else if (current === 'function') {
        next(); // skip 'function'
        const name = next(); // function name
        const args = parseParen().split(',').map(s => s.trim()).filter(Boolean); // argument names
        const body = parseBlock();

        this.functions[name] = { args, body };
        continue;
      } else if (this.infuncs[current]) {
        const fnName = next();
        const fn = this.functions[fnName];
        const val = parseUntilSem();

        this.backupObject(this, '58'); // save current scope
        this.maps[fn.argName] = this.evaluateExpr(val);
        this.exec(fn.body);
        this.restoreObject('58', this); // restore previous scope
        continue;
      } else if (current === 'loadKeol') {
        next();
        const file = this.evaluateExpr((parseParen()));
        expect('=>');
        const varName = next();
        expect(';');
        this.maps[varName] = this.parseKeolFile(file);
      } else if (current === 'keol') {
        next();
        const file = this.evaluateExpr(parseParen());
        expect('=>');
        const varName = next();
        expect(';');
        this.maps[varName] = parseKeol(file);
      } else if (current === 'import') {
        next();
        const filePath = this.evaluateExpr((parseParen())).trim();
        expect(';');

        if (this.builtins[filePath]) {
          this.exec(this.builtins[filePath]);
        } else {
          try {
            const content = safeReadFile(filePath);
            this.exec(content);
          } catch (e) {
            throw e;
          }
        }
      } else if (current === 'loop') {
        next(); // skip 'loop'

        const loopVar = next(); // e.g. I
        expect('in');

        const expr = this.evaluateExpr(parseUntil('=>'));
        let iterable;

        const parsed = this.parseArray(expr);
        iterable = parsed;


        if (!Array.isArray(iterable)) {
          throw `Nova runtime error: 'loop in' requires iterable array, got: ${typeof iterable}`;
        }

        const body = parseBlock(); // { ... }

        for (const val of iterable) {
          this.maps[loopVar] = val;
          this.exec(body);
        }

        expect(';');
      } else if (current === 'for' && tokens[pos+2] === 'of') {
        next();
        let name = next();
        next();
        let map = parseParen();
        let body = parseBlock();
        let mapVal = this.evaluateExpr(map);
        this.backupObject(0, '199110');
        for (let A of mapVal) {
         this.maps[name.trim()] = A;
         this.run(body);
        }
        this.restoreObject('199110');
      } else if (current === 'for' && tokens[pos+2] === 'in') {
        next();
        let name = next();
        next();
        let map = parseParen();
        let body = parseBlock();
        let mapVal = this.evaluateExpr(map);
        this.backupObject(0, '199114');
        for (A of Object.keys(mapVal)) {
         this.maps[name.trim()] = A;
         this.run(body);
        }
        this.restoreObject('199114');
      } else if (current === 'for') {
        this.backupObject(this, '16618');
        next();
        let [init, condition, increment] = this.parseArr(parseParen(), ';');
        const body = parseBlock();

        this.run(init + ';');
        let shouldbreak = false; let shouldconti = false;

        while (this.evaluateExpr(condition)) {
          this.breakFn = (() => shouldbreak = true).bind(this); this.contiFn = (() => shouldconti = true).bind(this);
          if (shouldbreak) break;
          this.exec(body);
          this.evaluateExpr(increment);
        }
        this.restoreObject('16618',this);
      } else if (current === 'wait') {
        next();
        const body = parseParen();
        const waitTime = parseExpr_math((body));
        expect(';');
        sleepSync(waitTime);
      } else if (current === 'run') {
        next();
        const body = parseBlock();
        expect(';');
        let resl = this.exec(body);
        this.resultOutput = resl;
      } else if (current === 'exec') {
        next();
        const body = parseParen();
        expect(';');
        this.resultOutput = this.exec(this.evaluateExpr(body));
      } else if (current === 'share') {
        next();
        const path = this.evaluateExpr((parseParen())).trim();
        expect(';');
        try {
          require('child_process').execSync(`termux-share -a send -u ${path}`);
          this._log(`Shared file: ${path}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'camera') {
        next();
        const outputPath = this.evaluateExpr((parseParen())).trim();
        expect(';');
        try {
          require('child_process').execSync(`termux-camera-photo -c 0 -o ${outputPath}`);
          this._log(`Photo saved to ${outputPath}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      }

      else if (current === 'notify') {
        next();
        const [title, content] = parseParen().split(',').map(v => this.evaluateExpr(v.trim()));
        expect(';');
        try {
          require('child_process').execSync(`termux-notification --title "${title}" --content "${content}"`);
          this._log(`Notified: ${title}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'clipboard') {
        next();
        const text = this.evaluateExpr((parseParen()));
        expect(';');
        try {
          require('child_process').execSync(`termux-clipboard-set <<< "${text}"`);
          this._log(`Copied to clipboard`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      }

      else if (current === 'open') {
        next();
        const pathOrUrl = this.evaluateExpr((parseParen())).trim();
        expect(';');
        try {
          require('child_process').execSync(`termux-open '${pathOrUrl}'`);
          this._log(`Opened: ${pathOrUrl}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      }
      else if (current === 'ringtones') {
        next();
        expect('=>');
        const varName = next(); // Variable to store the JSON ringtone list
        expect(';');
        try {
          const ringtoneList = require('child_process').execSync('termux-ringtones').toString().trim();
          this.maps[varName] = JSON.parse(ringtoneList); // Parse the JSON output
        } catch (e) {
          this._log('error: ' + e.message);
        }
      }

      else if (current === 'toast') {
        next();
        const message = this.evaluateExpr((parseParen())); // Expecting a string message
        expect(';');
        try {
          require('child_process').execSync(`termux-toast "${message}"`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'vibrate') {
        next();
        const duration = this.evaluateExpr((parseParen())); // Expecting a number (duration in ms)
        expect(';');
        try {
          // You might want to add validation here to ensure duration is a number
          require('child_process').execSync(`termux-vibrate -d ${duration}`);
          this._log(`Vibrated for ${duration}ms`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'notification') {
        next();
        expect('(');
        const title = this.evaluateExpr((parseParen())); // First argument is title
        expect(',');
        const content = this.evaluateExpr((parseParen())); // Second argument is content
        expect(')');
        expect(';');
        try {
          require('child_process').execSync(`termux-notification -t "${title}" -c "${content}"`);
          this._log(`Displayed notification with title "${title}" and content "${content}"`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'brightness') {
        next();
        expect('=>');
        const varName = next(); // Variable to store the brightness level
        expect(';');
        try {
          const brightness = require('child_process').execSync('termux-brightness').toString().trim();
          this.maps[varName] = parseInt(brightness, 10); // Store as integer
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'set_brightness') {
        next();
        const level = this.evaluateExpr((parseParen())); // Expecting a number (0-255)
        expect(';');
        try {
          // Add validation to ensure level is between 0 and 255
          require('child_process').execSync(`termux-brightness ${level}`);
          this._log(`Set brightness to ${level}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'battery_status') {
        next();
        expect('=>');
        const varName = next(); // Variable to store the JSON battery info
        expect(';');
        try {
          const batteryInfo = require('child_process').execSync('termux-battery-status').toString().trim();
          this.maps[varName] = JSON.parse(batteryInfo); // Parse the JSON output
          this._log(`Battery status stored in ${varName}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'sms_send') {
        next();
        expect('(');
        const phoneNumber = this.evaluateExpr((parseParen())); // Phone number
        expect(',');
        const message = this.evaluateExpr((parseParen())); // Message content
        expect(')');
        expect(';');
        try {
          require('child_process').execSync(`termux-sms-send -n "${phoneNumber}" "${message}"`);
          this._log(`Sent SMS to ${phoneNumber}: "${message}"`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'call_log') {
        next();
        expect('=>');
        const varName = next(); // Variable to store the JSON call log
        expect(';');
        try {
          const callLog = require('child_process').execSync('termux-call-log').toString().trim();
          this.maps[varName] = JSON.parse(callLog); // Parse the JSON output
          this._log(`Call log stored in ${varName}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'contact_list') {
        next();
        expect('=>');
        const varName = next(); // Variable to store the JSON contact list
        expect(';');
        try {
          const contactList = require('child_process').execSync('termux-contact-list').toString().trim();
          this.maps[varName] = JSON.parse(contactList); // Parse the JSON output
          this._log(`Contact list stored in ${varName}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'camera_photo') {
        next();
        expect('(');
        const outputPath = this.evaluateExpr((parseParen())); // Output file path
        expect(',');
        const cameraId = this.evaluateExpr((parseParen())); // Camera ID (0 for back, 1 for front, etc.)
        expect(')');
        expect(';');
        try {
          require('child_process').execSync(`termux-camera-photo -c ${cameraId} "${outputPath}"`);
          this._log(`Took photo with camera ${cameraId} and saved to "${outputPath}"`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'dialog') {
        next(); // Consume 'dialog' keyword

        // dialogType could be "alert", "confirm", "text", "checkbox", "counter", etc.
        const dialogType = this.evaluateExpr((parseParen()));
        expect(';'); // Assuming a semicolon terminates the dialog statement

        let command = `termux-dialog ${dialogType}`;
        let dialogArgs = ''; // To store additional arguments specific to the dialog type

        // Here, you'd ideally have logic to parse arguments specific to each dialog type.
        // For this example, I'll assume an additional parseParen() call for arguments.
        // In a real parser, you might pass the arguments as a second parameter to your dialog command.
        try {
          // This is a simplified approach. You'll need to adapt it to your actual parser.
          // If parseParen() captures all subsequent arguments for the dialog, it's simpler.
          // Example: dialog("alert", "-t 'Title' -i 'Message'");
          // Or: dialog("text", "-t 'Enter Name' -i 'Your Name'");
          dialogArgs = this.evaluateExpr(parseParen()); // Captures arguments like "-t 'Title' -i 'Message'"
        } catch (e) {
          // If parseParen() throws an error because there are no more parentheses,
          // it means there are no additional arguments, which is fine for some dialogs.
          // Log or handle this as appropriate for your parser's design.
          this._log('No additional dialog arguments found or parsing error: ' + e.message);
        }

        if (dialogArgs) {
          command += ` ${dialogArgs}`;
        }

        try {
          const result = require('child_process').execSync(command).toString().trim();
          this._log(`Termux Dialog (${dialogType}) Result: ` + result);
          // You might want to parse the result (e.g., "true"/"false" for confirm, or entered text)
          return result;
        } catch (e) {
          this._log(`Error executing Termux Dialog (${dialogType}): ` + e.message);
          throw new Error(`Termux Dialog (${dialogType}) command failed: ` + e.message);
        }
      }
      else if (current === 'torch') {
        next();
        const state = this.evaluateExpr((parseParen())); // "on" or "off"
        expect(';');
        try {
          // Add validation for 'on' or 'off'
          require('child_process').execSync(`termux-torch ${state}`);
          this._log(`Torch set to ${state}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'wifi_info') {
        next();
        expect('=>');
        const varName = next(); // Variable to store the JSON Wi-Fi info
        expect(';');
        try {
          const wifiInfo = require('child_process').execSync('termux-wifi-connectioninfo').toString().trim();
          this.maps[varName] = JSON.parse(wifiInfo); // Parse the JSON output
          this._log(`Wi-Fi connection info stored in ${varName}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'location') {
        next();
        expect('=>');
        const varName = next(); // Variable to store the JSON location info
        expect(';');
        try {
          const locationInfo = require('child_process').execSync('termux-location').toString().trim();
          this.maps[varName] = JSON.parse(locationInfo); // Parse the JSON 
          this._log(`Location info stored in  ${varName}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'microphone_record') {
        next();
        expect('(');
        const outputPath = this.evaluateExpr((parseParen())); // Output audio file path
        expect(',');
        const duration = this.evaluateExpr((parseParen())); // Duration in seconds
        expect(')');
        expect(';');
        try {
          // Use -q for quiet mode and -d for duration
          require('child_process').execSync(`termux-microphone-record -f "${outputPath}" -d ${duration}`);
        } catch (e) {
          this._log('error: ' + e.message);
        }
      } else if (current === 'microphone_stop') {
        next();
        expect(';');
        try {
          require('child_process').execSync('termux-microphone-record -s');
        } catch (e) {
          this._log('error: ' + e.message);
        }
      }
      else if (current === 'copy') {
        next(); // Move past 'copy' keyword
        const varName = this.evaluateExpr((parseParen())); // Parse the variable name
        expect(';'); // Expect a semicolon after the variable name
        try {
          // Use termux-clipboard-set to copy the variable's value to the clipboard
          require('child_process').execSync(`termux-clipboard-set "${this.evaluateExpr(varName)}"`);
          this._log(`Copied **${varName}** to clipboard!`);
        } catch (e) {
          this._log(`Error copying to clipboard: ${e.message}`); // Log specific error message
        }
      } else if (current === 'paste') {
        next(); // Move past 'paste' keyword
        expect('=>'); // Expect '=>' after 'paste'
        const varName = next(); // Get the variable name to paste into
        expect(';'); // Expect a semicolon after the variable name
        try {
          // Use termux-clipboard-get to retrieve content from the clipboard
          const clipboardContent = require('child_process').execSync('termux-clipboard-get').toString().trim();
          this.maps[varName] = clipboardContent; // Assign clipboard content to the variable
          this._log(`Pasted clipboard content into **${varName}**`);
        } catch (e) {
          this._log(`Error pasting from clipboard: ${e.message}`); // Log specific error message
        }
      } else if (current === 'op') {
        next();
        const opSymbol = next(); // e.g. '<>'
        expect('=>');

        // Parse function args from parentheses
        const argRaw = parseParen(); // "(a, b)"
        const args = argRaw.split(',').map(x => x.trim());

        // Parse function body block
        const body = parseBlock();

        this.operators[opSymbol] = (a, b) => {
          this.backupObject(this, '178'); // save current scope
          this.maps[args[0]] = a;
          this.maps[args[1]] = b;
          const result = this.exec(body);
          this.restoreObject('178', this); // restore previous scope
          return result;
        };
      } else if (current === 'call_code') {
        next();
        let name = next();
        expect(';');
        let v = this._evalToken(name);
        if (v?.body && v?.args) v = this.extract(v);
        if (v?.native) v = v.native;
        code = v(code);
        tokens = this.tokenize(code).tokens;
      } else if (current === 'comment') {
        next(); // skip 'comment'

        const commentType = next(); // 'block' or 'line' or whatever
        expect('using');

        const start = this.evaluateExpr(next()); // expects a string token like '"/#"'
        const end = commentType === 'line' ? null : this.evaluateExpr(next()); // only if block

        // Parse body config like: { type: "blockComment"; delete: true; }
        const configBlock = parseBlock(); // your Nova mini-object

        const config = this.parseMapInline(configBlock);

        // Create a rule object for comment stripping
        let rule = {
          start: start,
          type: config.type,
          delete: config.delete !== false
        };

        if (end) rule.end = (end);
        if (config.replace) rule.replace = config.replace;
        if (typeof config.function === 'function') {
          rule.type = [config.function, config.type];
        }

        // Store in this.customComments by name or symbol
        const ruleKey = config.name || commentType + ':' + rule.start;
        this.customComments[ruleKey] = rule;
        tokens = this.tokenize(code).tokens;
      } else if (current === 'cast') {
        next();
        const opSymbol = next();
        expect('is');

        // Parse function args from parentheses
        const argRaw = parseParen(); // "(a, b)"
        const args = argRaw.split(',').map(x => x.trim());

        // Parse function body block
        const body = parseBlock();

        this.castings[opSymbol] = (a) => {
          this.backupObject(this, '4556'); // save current scope
          this.maps[args[0]] = a;
          const result = this.exec(body);
          this.restoreObject('4556', this); // restore previous scope
          return result;
        };
      } else if (current === 'prefix') {
        next();
        // Parse the prefix operator name (e.g. 'not', 'custom')
        const opSymbol = this.evaluateExpr(parseUntil('=>')).trim();

        // Parse function argument(s) from parentheses
        const argStr = parseParen().trim();
        // Support multiple args, but usually only one for prefix
        const argNames = this._splitArgs(argStr);

        // Parse function body block
        const body = parseBlock();

        // Register the prefix function
        // ...existing code...
        this.prefs[opSymbol] = (...args) => {
          this.backupObject(this, '6778'); // save current scope
          argNames.forEach((name, i) => {
            this.maps[name] = args[i];
          });
          let result;
          // If body starts with 'give', treat as expression and return its value
          result = this.exec(body);

          this.restoreObject('6778', this); // restore previous scope
          return result;
        };
        // ...existing code...
      } else if (current === 'wrapper') {
        next();
        // Parse the prefix operator name (e.g. 'not', 'custom')
        const opSymbol = this.evaluateExpr(parseUntil('=>')).trim();

        // Parse function argument(s) from parentheses
        const argStr = parseParen().trim();
        // Support multiple args, but usually only one for prefix
        const argNames = this._splitArgs(argStr);

        // Parse function body block
        const body = parseBlock();

        // Register the prefix function
        // ...existing code...
        this.wrappers[opSymbol] = (...args) => {
          this.backupObject(this, '7998'); // save current scope
          argNames.forEach((name, i) => {
            this.maps[name] = args[i];
          });
          let result;
          // If body starts with 'give', treat as expression and retu>
          result = this.exec(body);

          this.restoreObject('7998', this); // restore previous scope
          return result;
        };
        // ...existing code...
      } else if (current === 'escape') {
        next();
        // Parse the prefix operator name (e.g. 'not', 'custom')
        let name = next().trim();
        expect('=');
        let val = parseUntilSem();
        this.escapes[name] = this.evaluateExpr(val);
      } else if (current === 'branch') {
        next();
        // Parse the prefix operator name (e.g. 'not', 'custom')
        let name = next().trim();
        expect('=');
        let val = parseUntilSem();
        this.branches[name] = this.evaluateExpr(val);
      } else if (current === 'date') {
        next();
        expect('=>');
        const varName = next();
        expect(';');
        this.maps[varName] = new Date().toString();
        this._log(`Stored date in ${varName}`);
      } else if (current === 'jsonParse') {
        next();
        const varName = this.evaluateExpr((parseParen()));
        expect(';');
        try {
          this.maps[varName] = JSON.parse(this.maps[varName]);
          this._log(`Parsed JSON in ${varName}`);
        } catch (e) {
          this._log(`Failed to parse JSON in ${varName}: ${e.message}`);
        }
      } else if (current === 'jsonStringify') {
        next();
        const varName = this.evaluateExpr((parseParen()));
        expect(';');
        try {
          this.maps[varName] = JSON.stringify(this.maps[varName]);
          this._log(`Stringified ${varName} as JSON`);
        } catch (e) {
          this._log(`Failed to stringify ${varName}: ${e.message}`);
        }
      } else if (current === 'uuid') {
        next();
        expect('=>');
        const varName = next();
        expect(';');
        const uuid = ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
        this.maps[varName] = uuid;
        this._log(`Generated UUID in ${varName}`);
      } else if (current === 'b$') {
        next();
        const blockBody = parseBlock();
        expect(';');
        this.exec(blockBody);
      } else if (current === 'k$') {
        next();
        const blockBody = parseBlock();
        expect(';');
        this._log(parseKeol(blockBody.replaceAll('[]', "\n")));
      } else if (current === 'tk$') {
        next();
        const body = parseBlock();
        expect(';');
        this._log(parseKeol(body.replaceAll('[]', "\n").substring(1, body.trim().length - 1)));
      } else if (current === 'js$') {
        next();
        const blockBody = parseBlock();
        expect(';');
        eval(blockBody);
      } else if (current === 'tjs$') {
        next();
        const body = parseBlock();
        expect(';');
        this._log(eval(body.trim().substring(1, body.trim().length - 1)));
      } else if (current === 'p$') {
        next();
        const blockBody = parseParen();
        expect(';');
        this.exec(blockBody);
      } else if (current === 'l$') {
        next();
        const blockBody = parseLinedExpr();
        expect(';');
        this.exec(blockBody);
      } else if (current === 'e$') {
        next();
        const blockBody = parseUntilSem();
        expect(';');
        this._log(parseExpr_math(blockBody));
      } else if (current === 'switch') {
        next(); // skip 'switch'
        const switchVal = this.evaluateExpr(parseParen()).trim();
        expect('{');
        let matched = false;
        let shouldbreak = false; let shouldconti = false;

        while (peek() !== '}' && pos < tokens.length) {
          this.breakFn = (() => shouldbreak = true).bind(this); this.contiFn = (() => shouldconti = true).bind(this);
          if (shouldbreak) break;
          if (peek() === 'case') {
            next();
            const caseVal = this.evaluateExpr(next());
            const caseBody = parseBlock();
            expect(';');
            if (!matched && switchVal === caseVal) {
              this.exec(caseBody);
              matched = true;
            }
          } else if (peek() === 'isType') {
            next();
            const caseVal = (this.evaluateExpr(next()));
            const caseBody = parseBlock();
            expect(';');
            if (!matched && this.typeof(switchVal) === caseVal) {
              this.exec(caseBody);
              matched = true;
            }
          } else if (peek() === '?') {
            next();
            const caseVal = this.evaluateExpr(`${switchVal} ${parseParen()}`);
            const caseBody = parseBlock();
            expect(';');
            if (!matched && caseVal) {
              this.exec(caseBody);
              matched = true;
            }
            if (shouldconti) { shouldconti = false; continue; };
          } else if (peek() === 'untilCase') {
            next();
            const caseVal = this.evaluateExpr(next());
            const caseBody = parseBlock();
            expect(';');
            if (switchVal !== caseVal) {
              while (switchVal !== caseVal) this.exec(caseBody);
            }
          } else if (peek() === 'whileCase') {
            next();
            const caseVal = this.evaluateExpr(next());
            const caseBody = parseBlock();
            expect(';');
            if (switchVal === caseVal) {
              while (switchVal === caseVal) this.exec(caseBody);
            }
          } else if (peek() === 'default') {
            next();
            const defaultBody = parseBlock();
            expect(';');
            if (!matched) {
              this.exec(defaultBody);
              matched = true;
            }
          } else {
            throw `Unexpected token in switch: ${peek()}`;
          }
        }
        expect('}');
        expect(';');
      } else if (current === 'logO') {
        console.log(this.resultOutput);
        next();
        expect(';');
      } else if (current === 'stream') {
        next();
        let devider = this.evaluateExpr(parseParen());
        let name = next();
        expect(';');
        this.streams[name] = devider;
      } else if (current === 'istream') {
        next();
        let devider = this.evaluateExpr(parseParen());
        let name = next();
        expect('=>');
        let string = this.evaluateExpr(parseParen());
        expect(';');
        this.istreams[name] = { devider, string };
      } else if (current === 'fnstream') {
        next();
        let devider = this.evaluateExpr(parseParen());
        let name = next();
        expect('=>');
        let string = this.exec(parseParen());
        expect(';');
        this.istreams[name] = { devider, string, body };
      } else if (current === 'pattern') {
        next();
        let args = parseParen().split(',').map(a => a.trim());;
        let name = next();
        let body = parseBlock();
        expect(';');
        this.patterns[name] = this.fn(args, body);
      } else if (this.streams[current]) {
        next();
        let string = this.evaluateExpr(parseParen());
        let strVals = string.split(this.streams[current]);
        expect('>>');
        let values = parseUntilSem().trim().split('>>');
        for (let i = 0; i < values.length; i++) {
          values.forEach((p, i) => {
            this.maps[p.trim()] = strVals[i];
          });
        }
      } else if (this.istreams[current]) {
        next();
        let strVals = this.istreams[current].string.split(this.istreams[current].devider);
        expect('>>');
        let values = parseUntilSem().trim().split('>>');
        for (let i = 0; i < values.length; i++) {
          values.forEach((p, i) => {
            this.maps[p.trim()] = strVals[i];
          });
        }
      } else if (this.patterns[current]) {
        next();
        let args = this._splitArgs(parseParen()).map(a => this.evaluateExpr(a));
        this.patterns[current](...args);
      } else if (current === 'input') {
        next();
        const askMsg = this.evaluateExpr((parseParen()));
        expect('=>');
        const varName = next();
        expect(';');
        let val = prompt(askMsg);
        this.maps[varName] = val;
      } else if (current === 'getpress') {
        next();
        const promptMsg = this.evaluateExpr(parseParen());
        expect('=>');
        const varName = next();
        expect(';');
        let getchar = require('./getChar-sync.js');
        process.stdout.write(promptMsg);
        this.maps[varName.trim()] = getchar();
        process.stdout.write('\n');
      } else if (current === 'beep') {
        next();
        expect(';');
        process.stdout.write('\x07');
      } else if (current === 'try') {
        next();
        const tryBody = parseBlock();
        let catchBody = null;
        let errorName = null;
        if (peek() === 'catch') {
          next();
          errorName = this.evaluateExpr((parseParen())).trim();
          catchBody = parseBlock();
        }
        let finallyBody = null; // Declare finallyBody
        if (peek() === 'finally') { // Check for 'finally' keyword
          next();
          finallyBody = parseBlock(); // Parse the finally block
        }
        try {
          this.exec(tryBody);
        } catch (e) {
          this.maps[`${errorName}`] = e;
          if (catchBody) this.exec(catchBody);
        } finally { // Add the finally block
          if (finallyBody) this.exec(finallyBody); // Run the finally block if it exists
        }
      } else if (current === '_cdr') {
        next();
        let expr = this.evaluateExpr(next());
        let pcode = this.evaluateExpr(parseParen());
        try {
          this.resultOutput = this.exec(pcode);
        } catch (e) {
          this.resultOutput = expr + e;
          console.log(expr + e);
        };
      } else if (current === 'http') {
        next(); // 'http'
        const method = next(); // GET, POST, etc.
        const url = this.evaluateExpr(parseParen()).trim();

        let body = '';
        let headers = [];

        if (peek() === '{') {
          next(); // Consume '{'

          while (peek() !== '}') {
            const key = next();

            if (key === 'headers') {
              expect('=');
              const headerBlock = this.evaluateExpr(parseBlock());
              const keolObj = parseKeol(headerBlock);
              const parsedHeaders = keolObj?.default ?? keolObj;

              headers = Object.entries(parsedHeaders)
                .map(([k, v]) => `-H "${k}: ${v}"`);
              expect(';');
            }

            else if (key === 'body') {
              expect('=');
              body = this.evaluateExpr(next());
              expect(';');
            }

            else {
              throw `❌ Unexpected key in http block: '${key}'`;
            }
          }

          expect('}');
          expect(';');
        }

        const curl = `curl -s -X ${method.toUpperCase()} ${headers.join(' ')} ${body ? `--data '${body}'` : ''} "${url}"`;

        try {
          const response = execSync(curl, { encoding: 'utf8' });
          this.maps['res'] = response.trim();
          this.maps['status'] = 200;
        } catch (e) {
          this.maps['res'] = '';
          this.maps['status'] = 500;
          console.error('[NOVA_HTTP_ERR]', e.message);
        }
      }
      else if (current === 'osPlatform') {
        next();
        this._log(require('os').platform());
        expect(';');
      }
      else if (current === 'cpu') {
        next();
        const cpus = require('os').cpus();
        cpus.forEach(cpu => this._log(cpu.model));
        expect(';');
      }
      else if (current === 'mem') {
        next();
        const os = require('os');
        const gb = x => (x / 1024 / 1024 / 1024).toFixed(2);
        this._log(gb(os.freemem()));
        this._log(gb(os.totalmem()));
        expect(';');
      }
      else if (current === 'userInfo') {
        next();
        const info = require('os').userInfo();
        this._log(info.username);
        this._log(info.homedir);
        expect(';');
      }
      else if (current === 'network') {
        next();
        const ifaces = require('os').networkInterfaces();
        Object.entries(ifaces).forEach(([, addrs]) => {
          addrs.forEach(addr => {
            this._log(addr.address);
          });
        });
        expect(';');
      }
      else if (current === 'uptime') {
        next();
        this._log(require('os').uptime().toString());
        expect(';');
      }
      else if (current === 'hostname') {
        next();
        this._log(require('os').hostname());
        expect(';');
      }
      else if (current === 'arch') {
        next();
        this._log(require('os').arch());
        expect(';');
      }
      else if (current === 'load') {
        next();
        const load = require('os').loadavg();
        load.forEach(avg => this._log(avg.toFixed(2)));
        expect(';');
      }
      else if (current === 'tmpDir') {
        next();
        this._log(require('os').tmpdir());
        expect(';');
      } else if (current === 'pathDir') {
        next();
        const target = this.evaluateExpr(parseParen());
        this._log(require('path').dirname(target));
        expect(';');
      }
      else if (current === 'pathBase') {
        next();
        const target = this.evaluateExpr(parseParen());
        this._log(require('path').basename(target));
        expect(';');
      }
      else if (current === 'pathExt') {
        next();
        const target = this.evaluateExpr(parseParen());
        this._log(require('path').extname(target));
        expect(';');
      }
      else if (current === 'pathJoin') {
        next();
        const parts = this.evaluateExpr(parseBlock()).split(/\s+/);
        this._log(require('path').join(...parts));
        expect(';');
      } else if (current === 'pid') {
        next();
        this._log(process.pid.toString());
        expect(';');
      }
      else if (current === 'cwd') {
        next();
        this._log(process.cwd());
        expect(';');
      }
      else if (current === 'env') {
        next();
        this._log(JSON.stringify(process.env));
        expect(';');
      }
      else if (current === 'platform') {
        next();
        this._log(process.platform);
        expect(';');
      } else if (current === 'exists') {
        next();
        const file = this.evaluateExpr(parseParen());
        this._log(require('fs').existsSync(file) ? 'yes' : 'no');
        expect(';');
      } else if (current === 'sha256') {
        next();
        const input = this.evaluateExpr(parseParen());
        const hash = require('crypto').createHash('sha256').update(input).digest('hex');
        this._log(hash);
        expect(';');
      }
      else if (current === 'randomBytes') {
        next();
        const count = Number(this.evaluateExpr(parseParen()));
        const hex = require('crypto').randomBytes(count).toString('hex');
        this._log(hex);
        expect(';');
      } else if (current === 'parseURL') {
        next();
        const raw = this.evaluateExpr(parseParen());
        const parsed = new URL(raw);
        this._log(parsed.hostname);
        this._log(parsed.pathname);
        this._log(parsed.search);
        expect(';');
      } else if (current === 'sh') {
        next();
        const shellCmd = this.evaluateExpr(parseBlock());
        const { execSync } = require('child_process');
        try {
          const output = execSync(shellCmd, { encoding: 'utf8' });
          this._log(output.trim());
        } catch (e) {
          this._log(e.message);
        }
        expect(';');
      } else if (current === 'sandbox') {
        next();
        const codeBlock = this.evaluateExpr(parseBlock()); // ← pull user's code block
        expect(';');

        const vm = require('vm');

        // 🔐 Prepare sandbox from Nova vars
        const sandbox = {};
        Object.entries(this.maps).forEach(([k, v]) => {
          sandbox[k] = v;
        });

        // 🌐 Add global helpers if you want
        sandbox.console = console;

        try {
          vm.createContext(sandbox); // 🏰 isolate
          vm.runInContext(codeBlock, sandbox); // 🔥 run user JS
        } catch (err) {
          console.error('[NOVA::sandbox ERROR]', err.message);
        }

        // ⛏ Pull values back into Nova
        Object.keys(sandbox).forEach(k => {
          this.maps[k] = sandbox[k];
        });
      } else if (current === 'random') {
        next();
        const [min, max] = smartSplitArgs(parseParen()).map(x => this.evaluateExpr(x));
        expect('=>');
        const varName = this.evaluateExpr(next());
        expect(';');
        this.maps[varName] = Math.floor(Math.random() * (this.evaluateExpr(max) - this.evaluateExpr(min) + 1)) + this.evaluateExpr(min);
      } else if (current === 'chars') {
        next();
        const str = this.evaluateExpr(parseParen());
        expect('=>');
        const varName = this.evaluateExpr(next());
        expect(';');
        this.enums[varName] = this.evaluateExpr(str).split('');
      } else if (current === 'reverse') {
        next();
        const arr = this.evaluateExpr(parseParen());
        expect('=>');
        const varName = this.evaluateExpr(next());
        expect(';');
        this.enums[varName] = this.evaluateExpr(arr).slice().reverse();
      } else if (current === 'ascii') {
        next();
        const str = this.evaluateExpr(parseParen());
        expect('=>');
        const varName = this.evaluateExpr(next());
        expect(';');
        this.enums[varName] = this.evaluateExpr(str).split('').map(c => c.charCodeAt(0));
      } else if (current === 'sum') {
        next();
        const arr = this.evaluateExpr(parseParen());
        expect('=>');
        const varName = this.evaluateExpr(next());
        expect(';');
        this.maps[varName] = this.evaluateExpr(arr).reduce((a, b) => a + b, 0);
      } else if (current === 'keys') {
        next();
        const obj = this.evaluateExpr(parseParen());
        expect('=>');
        const varName = this.evaluateExpr(next());
        expect(';');
        this.enums[varName] = Object.keys(this.evaluateExpr(obj));
      } else if (current === 'range') {
        next();
        const [start, end] = smartSplitArgs(parseParen()).map(x => this.evaluateExpr(x));
        expect('=>');
        let varName = this.evaluateExpr(next());
        expect(';');
        this.enums[varName] = Array.from(
          { length: this.evaluateExpr(end) - this.evaluateExpr(start) },
          (_, i) => i + this.evaluateExpr(start)
        );
      } else if (current === 'plugin' && !this.options?.strict) {
        next();
        let path = this.evaluateExpr(parseParen());
        expect(';');

        const fs = require('fs');
        const fullPath = path.replace(/^['"]|['"]$/g, '');
        const raw = fs.readFileSync(fullPath, 'utf8');
        const defs = JSON.parse(raw);

        this.dynamicKeywords = this.dynamicKeywords || {};

        for (const def of defs) {
          const { name, vars = [], logic, ...steps } = def;
          if (!name || !logic) {
            console.error("❌ Invalid keyword config in plugin");
            continue;
          }

          // Build the function body like nova_gen would
          const lines = [`  next();`];

          for (const v of vars) {
            const code = steps[v];
            if (!code) {
              lines.push(`  // ⚠️ Missing parser logic for '${v}'`);
              continue;
            }

            if (code.startsWith("expect(")) {
              lines.push(`  ${code};`);
            } else if (code.startsWith("parse") || code.startsWith("next")) {
              lines.push(`  let ${v} = ${code};`);
            } else {
              lines.push(`  ${code};`);
            }
          }

          for (const k in steps) {
            if (k.startsWith('expect') && !vars.includes(k)) {
              lines.push(`  expect(${steps[k]});`);
            }
          }

          lines.push(`  ${logic}`);

          const funcBody = lines.join('\n');

          // Create function from constructed body
          this.dynamicKeywords[name] = eval(`(function() {
            ${funcBody}
          }).bind(this)`);
        }
      } else if (this.dynamicKeywords && this.dynamicKeywords[current] && !this.options?.strict) {
        this.dynamicKeywords[current]();
      } else if (current === '"I am feeling lucky today, give response as"') {
        next(); // Consume the lucky phrase
        const varname = this.evaluateExpr(parseUntilSem());

        // Feeling lucky? Roll a number from 1 to 100
        const luckyNumber = Math.floor(Math.random() * 100) + 1;

        this.maps[varname] = luckyNumber;

      } else if (current === 'foreach') {
        next(); // 'foreach'

        const mapName = parseParen();  // first paren: map name
        expect(',');                              // comma between params

        const keyVar = this.parseArray(parseParen());   // second paren: variable name
        const block = parseBlock();               // block to run

        const map = this.evaluateExpr(mapName.trim());
        let arr = (typeof map === 'object') ? Object.keys(map) : map
        arr.forEach((key, i, y) => {
          this.maps[keyVar[0]] = key;
	  this.maps[keyVar[1] || 'iter_i'] = i;
          this.maps[keyVar[2] || 'iter_third_arg'] = y;

          this.exec(block);
        });
      } else if (current === 'engage') {
        next();

        let gearsList = '';

        // collect full list if not just one
        if (tokens[pos + 1] !== ';') {
          gearsList = parseUntilSem(); // collects until `;`
        } else {
          gearsList = next(); // single gear
          expect(';');
        }

        const gearNames = gearsList.split('>>').map(x => x.trim());

        for (const name of gearNames) {
          const gear = this.gears?.[name];
          if (!gear) throw `Unknown gear '${name}'`;
        }

        const loop = () => {
          for (const name of gearNames) {
            const gear = this.gears[name];
            const code = gear.block;
            this.exec(code);
          }

          const delay = Number(this.gears[gearNames[0]]?.wait) || 1;
          sleepSync(delay / 1000);
          loop(); // loop again
        };

        loop(); // start infinite loop
      } else if (current === 'backup') {
        next();

        if (peek() === 'val') {
          next(); // 'val'
          const name = next();
          expect('=');
          const value = this.evaluateExpr(this.evaluateExpr(parseUntilSem()));

          this.backups = this.backups || {};
          this.backups[name] = value;
          this.maps[name] = value; // optional auto-assign
        } else if (peek() === 'retrieve') {
          next(); // 'retrieve'
          const name = next();
          expect(';');

          if (this.backups?.hasOwnProperty(name)) {
            this.maps[name] = this.backups[name];
          } else {
            throw `No backup found for '${name}'`;
          }
        }
      } else if (current === 'gear') {
        next();

        // Check for optional wait
        let waitTime = this.evaluateExpr(parseParen());

        const name = next();
        const block = parseBlock();
        expect(';');

        this.gears = this.gears || {};
        this.gears[name] = { block, wait: waitTime };
      } else if (current === 'invoke') {
        next(); // Consume 'invoke'
        const target = this.evaluateExpr(parseParen());

        if (target === 'env') {
          Object.entries(process.env).forEach(([key, value]) => {
            this.maps[key] = value;
          });
        } else if (target === 'tts') {
          const input = this.evaluateExpr(parseParen());

          let text = input;

          // File input detection
          if (text.startsWith("file://")) {
            const filePath = text.slice(7).trim();
            if (!fs.existsSync(filePath)) {
              throw `TTS Error: File not found - ${filePath}`;
            }
            text = fs.readFileSync(filePath, 'utf8');
          }

          try {
            execSync(`espeak "${text.replace(/"/g, '\\"')}"`);
          } catch (err) {
            throw `TTS Error: ${err.message}`;
          }
        } else if (target === 'response') {
          const varName = next(); // e.g., body
          const url = parseUntil('[]');     // e.g., "https://..."

          try {
            const result = execSync(`curl -s ${url}`).toString();

            this.maps[varName] = result;
          } catch (err) {
            throw `invoke(response) failed: ${err.message}`;
          }
        } else if (target === 'cliArgStr') {
          let argvStr = "";
          process.argv.slice(2).forEach((val) => {
            argvStr += ' ' + String(val);
          });
          this.maps[this.evaluateExpr(parseParen())] = argvStr;
        } else if (target === 'streams-toolkit') {
          this.istreams['stdin'] = { devider: ' ', string: prompt('') };
          this.istreams['trso'] = { devider: ' ', string: this.resultOutput };
          this.streams['stdstream'] = ' ';
        } else if (target === 'fn-toolkit') {
          this.functions['spc'] = { body: 'using spaceMet;' };
          this.functions.rand = {
            args: ['min', 'max'],
            native: (ctx, min, max) => {
              min = Number(min);
              max = Number(max);
              if (isNaN(min) || isNaN(max)) throw new Error('rand(min, max) requires two numbers');
              if (max < min) [min, max] = [max, min]; // swap if needed
              return Math.floor(Math.random() * (max - min + 1)) + min;
            }
          };
          this.functions.floor = {
            args: ['a'],
            native: (a) => Math.floor(a)
          };
        } else if (target === 'sounds') {
          const audioFile = this.evaluateExpr(parseParen());


          const filePath = path.resolve(this.baseDir || '.', audioFile);

          if (!fs.existsSync(filePath)) {
            throw `Audio file not found: ${filePath}`;
          }

          try {
            // Attempt node-web-audio-api (if setup)
            const { AudioContext } = require('web-audio-api');
            // Setup decoding + playback...
          } catch (e) {
            // Fallback exec
            try {
              const playerCmd = process.platform === 'darwin' ? 'afplay' :
                process.platform === 'win32' ? 'start' :
                  'mpg123'; // or `play`, `mpv`

              execSync(`${playerCmd} "${filePath}"`);
            } catch (err) {
              throw `Unable to play sound: ${err}`;
            }
          }
        } else if (target === 'uuid') {
          const name = this.evaluateExpr(parseParen());
          this.maps[name] = require('crypto').randomUUID();

        } else if (target === 'date') {
          const name = this.evaluateExpr(parseParen());
          this.maps[name] = new Date().toISOString();

        } else if (target === 'cwd') {
          const name = this.evaluateExpr(parseParen());
          this.maps[name] = process.cwd();

        } else if (target === 'uptime') {
          const name = this.evaluateExpr(parseParen());
          this.maps[name] = `${Math.round(process.uptime())}s`;

        } else if (target === 'platform') {
          const name = this.evaluateExpr(parseParen());
          this.maps[name] = process.platform;

        } else if (target === 'arch') {
          const name = this.evaluateExpr(parseParen());
          this.maps[name] = process.arch;

        } else if (target === 'mem') {
          const name = this.evaluateExpr(parseParen());
          this.maps[name] = `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`;

        } else if (target === 'randomBytes') {
          const len = Number(this.evaluateExpr(parseParen()));
          const name = this.evaluateExpr(parseParen());
          this.maps[name] = require('crypto').randomBytes(len).toString('hex');

        } else if (target === 'read') {
          const filePath = this.evaluateExpr(parseParen());
          const varname = this.evaluateExpr(parseParen());
          this.maps[varname] = fs.readFileSync(filePath, 'utf8');

        } else if (target === 'write') {
          const filePath = this.evaluateExpr(parseParen());
          const data = this.evaluateExpr(parseParen());
          fs.writeFileSync(filePath, data, 'utf8');

        } else if (target === 'mkdir') {
          const dirPath = this.evaluateExpr(parseParen());
          fs.mkdirSync(dirPath, { recursive: true });

        } else if (target === 'delete') {
          const filePath = this.evaluateExpr(parseParen());
          fs.unlinkSync(filePath);

        } else if (target === 'listFiles') {
          const dirPath = this.evaluateExpr(parseParen());
          const varname = this.evaluateExpr(parseParen());
          this.maps[varname] = fs.readdirSync(dirPath).join(', ');

        } else if (target === 'exec') {
          const command = this.evaluateExpr(parseParen());
          try {
            const result = execSync(command).toString();
            this.resultOutput = result;
          } catch (err) {
            throw `Exec Error: ${err.message}`;
          }
        } else {
          throw `Unknown invoke target: ${target}`;
        }
        expect(';');
      } else if (current === 'sleep') {
        next();
        const ms = Number(this.evaluateExpr(parseParen()));
        expect(';');
        const wait = Date.now() + ms;
        while (Date.now() < wait); // Brutal scync sleep, baby
      }
      else if (current === 'envkeys') {
        next(); expect(';');
        this.maps['envkeys'] = Object.keys(process.env).join(',');
      }
      else if (current === 'cwd') {
        next(); expect(';');
        this.maps['cwd'] = process.cwd();
      } else if (current === 'infer') {
        next();
        const model = this.evaluateExpr(parseParen()); // e.g., "deepseek-r1:1.5b"
        expect('=>');
        const varName = next();
        expect(':');
        const prompt = this.evaluateExpr(parseBlock());
        expect(';');

        const { execSync } = require('child_process');
        try {
          const cmd = `ollama run ${model} --think=false ${JSON.stringify(prompt)}`;
          const raw = execSync(cmd, { encoding: 'utf8' });
          this.maps[varName] = raw.trim();
        } catch (err) {
          this.maps[varName] = '[INFER_FAILED] ' + err.message;
        }
      } else if (current === 'server') {
        next(); // Consume 'server' keyword

        // Parse the port number, could be a literal or a variable
        const port = this.evaluateExpr(parseParen()); // e.g., server(3000) or server(myPort)
        expect('{'); // Expecting the block for server routes

        const routes = [];
        while (peek() !== '}') {
          const method = peek(); // Should be 'get', 'post', etc.
          if (method === 'get' || method === 'post' || method === 'put' || method === 'delete') {
            next(); // Consume the method keyword
            const path = this.evaluateExpr(parseParen()); // e.g., "/api/data"

            // Parse the statements within the route handler
            const handlerBody = parseBlock(); // This will contain the logic for the route
            expect(';');

            routes.push({ method, path, handlerBody });
          } else {
            throw new Error(`Unexpected token '${method}' inside server block. Expected 'get', 'post', etc.`);
          }
        }
        expect('}');
        expect(';'); // Expecting a semicolon after the server definition

        // --- Execution Phase ---
        // This part would typically happen in your runtime/interpreter, not necessarily in the parser.
        // However, for demonstration, I'm including it here.

        const express = require('express');
        const app = express();
        app.use(express.json());

        routes.forEach(({ method, path, handlerBody }) => {
          app[method](path, (req, res) => {
            this.maps['req'] = req; // Make 'req' available in the script's scope
            this.maps['res'] = res; // Make 'res' available in the script's scope
            this.maps['reqBody'] = req.body;
            this.maps['resBody'] = res.body;
            this.functions['send'] = (data) => {
              res.send(data); // Custom send function to respond
            };
            this.functions['html'] = (htmlString, options = {}) => {
              // Import cheerio dynamically to ensure it's loaded only when needed,
              // or if this code is part of a larger module, it can be imported at the top.
              const cheerio = require('cheerio');

              if (typeof htmlString !== 'string') {
                console.error("Error: Input to 'html' function must be a string.");
                return null;
              }

              try {
                // Use cheerio.load() to parse the HTML string
                const $ = cheerio.load(htmlString, options);
                console.log("HTML string parsed successfully.");
                return $; // Return the Cheerio object for further manipulation
              } catch (error) {
                console.error("Error parsing HTML string:", error);
                return null;
              }
            };
            this.functions['json'] = (data) => {
              res.json(data); // Custom json function to respond with JSON
            };
            this.functions['status'] = (statusCode) => {
              res.status(statusCode); // Custom status function to set response status
            };

            try {
              this.run(handlerBody); // Execute the parsed route handler
            } catch (e) {
              console.error(`Error in route ${method.toUpperCase()} ${path}:`, e);
              if (!res.headersSent) {
                res.status(500).send('Internal Server Error');
              }
            }
          });
        });

        // Convert the port to a number, handling variables if necessary
        let resolvedPort;
        if (this.maps[port] !== undefined) {
          resolvedPort = Number(this.maps[port]);
        } else {
          resolvedPort = Number(port); // Assume it's a literal if not a variable
        }

        if (isNaN(resolvedPort)) {
          throw new Error(`Invalid port number: ${port}`);
        }

        app.listen(resolvedPort, () => {
          console.log(`Server running on port ${resolvedPort}`);
        });
      } else if (current === '"IS CLI"') {
        next(); // Consume 'commander' keyword
        expect('=');

        expect('{');

        const commands = [];
        while (peek() !== '}') {
          const commandName = this.evaluateExpr(parseParen()); // e.g., ("init")

          const commandBody = parseBlock(); // block of logic to run when command is called
          expect(';');

          commands.push({ name: commandName, body: commandBody });
        }

        expect('}');
        expect(';');

        // --- Execution Phase ---
        // This part executes the correct command based on user input

        const userArg = process.argv[2]; // e.g., node file.js init

        const foundCommand = commands.find(cmd => cmd.name === userArg);
        if (foundCommand) {
          try {
            this.maps['argv'] = process.argv.slice(3); // remaining args available in code
            this.maps['command'] = userArg;

            this.functions['print'] = console.log;
            this.functions['exit'] = (code = 0) => process.exit(code);

            this.exec(foundCommand.body); // Run command handler
          } catch (e) {
            console.error(`Error while running command '${userArg}':`, e);
          }
        } else {
          console.error(`Unknown command: '${userArg}'`);
          process.exit(1);
        }
      } else if (current === 'addto') {
        next();
        let name = next();
        let val = parseParen();
        this.maps[name] = this.evaluateExpr(name);
        if (Array.isArray(this.maps[name])) { this.maps[name].push(this.evaluateExpr(val)); expect(';'); }
        else this.maps[name][this.evaluateExpr(val)] = this.evaluateExpr(parseUntilSem());
      }
      else if (current === 'require') {
        next();
        const name = next();

        let type;
        if (next() === 'as') {
          type = next();
          expect(';');
        } else {
        }

        if (type) {
          switch (type) {
            case 'var':
            case 'variable':
              if (!(name in this.maps)) {
                throw `expected ${name} to be a variable, but it doesn't exist`;
              }
              break;
            case 'func':
            case 'function':
              if (!this.functions[name]) {
                throw `expected ${name} to be a function, but it doesn't exist`;
              }
              this.exec(this.functions[name].body);
              break;
            case 'ret':
            case 'return':
            case 'returnedVal':
              if (!(name in this.ret)) {
                throw `expected ${name} to be a return value, but it doesn't exist`;
              }
              break;
            case 'enum':
              if (!(name in this.enums)) {
                throw `expected ${name} to be an enum, but it doesn't exist`;
              }
            case 'mod':
            case 'module':
              if (!(name in this.builtins)) {
                throw `expected ${name} to be a module, but it doesn't exist`;
              }
              this.exec(this.builtins[name]);
              break;
            default:
              throw `unknown type ${type} for require`;
          }
        } else {
          if (this.functions[name]) {
            this.exec(this.functions[name].body);
          } else if (name in this.maps || name in this.ret || name in this.enums || name in this.builtins) {
            throw `expected ${name} to be a function, but it's defined as something else`;
          } else {
            throw `expected ${name} but it doesn't exist in functions, variables, return values or enums`;
          }
        }
      } else if (/^[a-zA-Z_]\w*$/.test(current)) {
        let varName = next();
        if (peek() === '=' && tokens[pos + 1] === 'new') {
          next(); next();
          const className = next();
          if (className === 'num') {
            const args = parseParen().trim();
            this.maps[varName] = Number(args);
          } else if (className === 'arr') {
            const args = parseParen().trim();
            this.maps[varName] = Array(args);
          } else if (className === 'fn') {
            const args = parseBlock();
            this.maps[varName] = this.exec(args);
          } else if (className === 'func') {
            const args = parseParen();
            this.maps[varName] = { args: this.parseArray(args), body: parseBlock() };
          } else if (className === 'file') {
            const args = parseParen().trim().replace(' ', '');
            this.maps[varName] = fs.readFileSync(args);
          } else if (className === 'UI') {
            parseParen();
            const body = parseKeol(this.evaluateExpr(parseBlock()));
            this.maps[varName] = generateConsoleUI(body);
          } else if (className === 'date') {
            const args = parseParen().trim();
            this.maps[varName] = new Date(args);
          } else if (className === 'regex') {
            const args = parseParen().trim();
            // Assuming the args string contains the regex pattern and optional flags
            const match = args.match(/^\/(.*)\/([gimsuy]*)$/);
            if (match) {
              this.maps[varName] = new RegExp(match[1], match[2]);
            } else {
              throw new Error(`Invalid regex format: ${args}`);
            }
          } else if (className === 'URL') {
            const args = parseParen().trim();
            this.maps[varName] = new URL(args);
          } else if (className === 'error') {
            const args = parseParen().trim();
            this.maps[varName] = new Error(args);
          } else if (className === 'promise') {
            const args = parseBlock().trim(); // Assume the block contains the promise executor function
            this.maps[varName] = new Promise(resolve => this.exec(args, { resolve })); // Pass resolve to the execution context
          } else if (className === 'event') {
            const args = parseParen().trim(); // Event type
            this.maps[varName] = new Event(args);
          } else if (className === 'socket') { // For network sockets
            const args = parseParen().trim(); // e.g., "ws://localhost:8080"
            this.maps[varName] = new WebSocket(args);
          } else if (className === 'buffer') { // For binary data
            const args = parseParen().trim(); // e.g., "10" for size, or "Hello" for string
            this.maps[varName] = Buffer.from(args); // Assuming Node.js Buffer
          } else if (className === 'intl_datetimeformat') {
            const args = this.evaluateExpr(parseParen()).trim().split(',').map(s => s.trim());
            const locale = args[0] || undefined; // e.g., 'en-US'
            let options = {};
            if (args[1]) {
              try {
                options = JSON.parse(args[1]); // Expecting a JSON string for options
              } catch (e) {
                throw new Error(`Invalid JSON for Intl.DateTimeFormat options: ${args[1]}`);
              }
            }
            this.maps[varName] = new Intl.DateTimeFormat(locale, options);
          } else if (className === 'intl_numberformat') {
            const args = this.evaluateExpr(parseParen()).trim().split(',').map(s => s.trim());
            const locale = args[0] || undefined; // e.g., 'de-DE'
            let options = {};
            if (args[1]) {
              try {
                options = JSON.parse(args[1]); // Expecting a JSON string for options
              } catch (e) {
                throw new Error(`Invalid JSON for Intl.NumberFormat options: ${args[1]}`);
              }
            }
            this.maps[varName] = new Intl.NumberFormat(locale, options);
          } else if (className === 'intl_collator') {
            const args = this.evaluateExpr(parseParen()).trim().split(',').map(s => s.trim());
            const locale = args[0] || undefined; // e.g., 'sv'
            let options = {};
            if (args[1]) {
              try {
                options = JSON.parse(args[1]); // Expecting a JSON string for options
              } catch (e) {
                throw new Error(`Invalid JSON for Intl.Collator options: ${args[1]}`);
              }
            }
            this.maps[varName] = new Intl.Collator(locale, options);
          } else {
            pos -= 2;
            this.maps[varName] = this.evaluateExpr(parseUntilSem());
          }

        } else if (peek() === '=') {
          next();
          const expr = parseUntilSem();

          let value;
          value = this.evaluateExpr(expr);

          this.maps[varName] = value;
        } else if (peek() === '_RAND__') {
          next();
          const expr = parseUntilSem();
          let value = this.evaluateExpr(expr.trim());
          this.maps[varName] = Math.random() * value;
        } else {
          try {
            tokens[pos--];
            let funvc = (a) => {
              if (this.options.logExprs) return console.log(a);
              else return a;
            }
            funvc(this.evaluateExpr(parseUntilSem()));
          } catch (e) {
            console.log(e);
            throw `unknown command: '${current}'${(s => s !== current ? `, did you mean: ${s}?` : '')(findClosestMatch(this.keywordsArray, current))}`;
          }
        }
      } else { // not a valid stmt
        try {
          let funvc = (a) => {
            if (this.options.logExprs) return console.log(a);
            else return a;
          }
          funvc(this.evaluateExpr(parseUntilSem()));
        } catch (e) {
          // If it's an actual Error (expr/runtime problem), rethrow as-is
          console.log(e);

          // Otherwise, it's truly an unknown command (stmt failure)
          throw `unknown command: '${current}'${(s => s !== current ? `, did you mean: ${s}?` : '')(findClosestMatch(current))}`;
        }
      }
      if (this.expectedROP.length > 0) {
        expectF(String(this.expectedROP).trim(), String(this.resultOutput).trim());
      }
      code = this._replaceMacros(code);
      this.processAsyncQueqe();
      stopWatcher();
      if (options?.oneRun) return { tokens, cleaned, code, pos, res: this.resultOutput };
    }
    this.processAsyncQueqe(true);
Object.keys(this.fnopts).forEach((a) => {
  if (this.options[a]) {
    const fn = this.fnopts[a];
    delete this.options[a];
    delete this.fnopts[a];
    fn();
  }
});
  }

  processAsyncQueqe(flushAll = false) {
    // Run processing asynchronously to avoid recursive stack growth
    setTimeout(() => {
      let i = 0;
      while (i < this.asyncQueqe.length) {
        const event = this.asyncQueqe[i];
        if (!(typeof event?.callback === 'function' || event?.ready)) {
          i++;
          continue;
        }
        if (event.ready || flushAll) {
          try {
            event.callback();
          } catch (err) {
            console.error("AsyncQueue callback error:", err);
          }
          this.asyncQueqe.splice(i, 1); // remove finished
        } else {
          i++;
        }
      }
    }, 0);
  }

  scheduleAsync(callback, delay = 0) {
    const event = {
      callback,
      ready: false
    };
    setTimeout(() => {
      event.ready = true;
      // Automatically process when ready
      this.processAsyncQueqe();
    }, delay);
    this.asyncQueqe.push(event);
  }
  awaitSync(fn, ...args) {
    return fn(...args);
  }
  debug(expr) {
    if (this.options.maxedDebug) {
      console.log('MAX DEBUG: -----------');
      console.log('      ', new Error(expr));
      console.log('-------------');
      return;
    }
    if (this.options.debugger) console.log('DEBUG:', expr);
  }
  descpr(expr) {
    this.desarr.push(`${this.cctx}: ${expr}`);
  }
  exec(code) {
    this.backupObject(this, '8970');
    if (code.startsWith('#"IS EXPR"')) {
      // Get all lines except the first one (header)
      let rawLines = code.split('\n').slice(1);

      let mergedLines = [];
      let current = '';

      for (let line of rawLines) {
        let trimmed = line.trimEnd();
        if (trimmed.endsWith('\\')) {
          current += trimmed.slice(0, -1); // Remove the backslash
        } else {
          current += trimmed;
          mergedLines.push(current);
          current = '';
        }
      }
      if (current) mergedLines.push(current); // catch any leftover
      mergedLines = mergedLines.filter(line => line.trim() !== '');
      // Evaluate each merged line
      let ress = [];
      for (let line of mergedLines) {
        let res = this.evaluateExpr(line);
        ress.push(res);
      }
      if (ress.length === 1) ress = ress[0];
      console.log(ress);
      return ress;
    }
    this.execute(this._replaceMacros(code));
    if (this.options?.allowRetsAsPrinted) console.log(this.resultOutput);
    this.restoreObject('8970', this);
    return this.resultOutput;
  }
  run(code) {
    if (code.startsWith('#"IS EXPR"')) {
      // Get all lines except the first one (header)
      let rawLines = code.split('\n').slice(1);

      let mergedLines = [];
      let current = '';

      for (let line of rawLines) {
        let trimmed = line.trimEnd();
        if (trimmed.endsWith('\\')) {
          current += trimmed.slice(0, -1); // Remove the backslash
        } else {
          current += trimmed;
          mergedLines.push(current);
          current = '';
        }
      }
      if (current) mergedLines.push(current); // catch any leftover
      mergedLines = mergedLines.filter(line => line.trim() !== '');
      // Evaluate each merged line
      let ress = [];
      for (let line of mergedLines) {
        let res = this.evaluateExpr(line);
        ress.push(res);
      }
      if (ress.length === 1) ress = ress[0];
      console.log(ress);
      return ress;
    }
    this.execute(this._replaceMacros(code));
    if (this.options?.allowRetsAsPrinted) console.log(this.resultOutput);
    return this.resultOutput;
  }

  _replaceResu(str) {
    // Match myResu$1, 18$
    return str.replace(/\b([a-zA-Z_]\w*)\$([^$]+)\$/g, (match, resuName, argsStr) => {
      const resuObj = this.resus[resuName];
      if (!resuObj) return match;
      const args = argsStr.split(',').map(a => this.evaluateExpr(a.trim()));
      const paramNames = resuObj.params.split(',').map(p => p.trim());
      const oldVars = { ...this.maps };
      paramNames.forEach((p, i) => {
        this.maps[p] = args[i];
      });
      // Evaluate value block or call .call if present
      let value = '';
      if (typeof resuObj.call === 'function') {
        value = resuObj.call(...args);
      } else {
        try {
          value = this.exec(this.evaluateExpr(resuObj.valueBlock));
        } catch (e) {
          value = this.evaluateExpr(resuObj.valueBlock);
        }
        // Execute exec block
        this.exec(resuObj.execBlock);
      }
      this.maps = oldVars;
      return value;
    });
  }
  _replaceVars(str) {
    return str.replace(/\b([a-zA-Z_]\w*)\b/g, (_, vname) => {
      if (vname === 'print' || /^[0-9]+(\.[0-9]*)?$/.test(vname)) return vname;

      const fallback = val => {
        if (!this.options?.varFallback) return val;
        if (val === undefined) return '?';
        if (val === null) return '';
        if (typeof val === 'number' && isNaN(val)) return 0;
        return val;
      };

      if (vname.includes('[')) {
        const enumName = vname.split('[')[0];
        const index = vname.split('[')[1].replace(']', '');

        if (this.enums[enumName]?.values[index] !== undefined) {
          return fallback(this.enums[enumName].values[index]);
        } else if (this.maps[enumName]?.values[index] !== undefined) {
          return fallback(this.maps[enumName].values[index]);
        } else if (this.maps[enumName]?.values[index] !== undefined) {
          return fallback(this.maps[enumName].values[index]);
        } else {
          return this.options?.varSafe ? undefined : fallback(vname);
        }
      }

      let val = this.maps[vname];
      return val !== undefined ? fallback(val) : (this.options?.varSafe ? undefined : fallback(vname));
    });
  }

  parseKeolFile(filename) {
    const fs = require('fs');
    const path = require('path');
    let resolved = filename.trim();
    if (!path.isAbsolute(resolved)) resolved = path.resolve(process.cwd(), resolved);
    const content = fs.readFileSync(resolved, 'utf8');
    const parser = new KeolParser(path.dirname(resolved));
    return parser.parse(content, resolved);
  }


  _replaceEscapes(str) {
    return str.replace(/\b([a-zA-Z_]\w*)\b/g, (_, vname) => {
      if (vname === 'print' || /^[0-9]+(\.[0-9]*)?$/.test(vname)) return vname;
      const val = this.escapes[vname];
      return val !== undefined ? val : vname;
    });
  }
  _replaceMacros(str) {
    return String(str).replace(/\b([a-zA-Z_]\w*)\b/g, (match) => {
      return this.macros[match] || match;
    });
  }


  _replaceEnums(str) {
    return str.replace(/([a-zA-Z_]\w*)\[([0-9]+)\]/g, (match, enumName, value) => {
      if (this.enums[enumName] && this.enums[enumName].values[value]) {
        return this.enums[enumName].values[value];
      }
      return match;
    });
  }

  _replaceMaps(str) {
    // Support: myMap.myFunc[args] or myMap.myFunc
    return str.replace(
      /([a-zA-Z_]\w*)\.([a-zA-Z_]\w+)(?:\[(.*?)\])?/g,
      (match, mapName, key, argStr) => {
        const map = this.maps[mapName];
        if (map && key in map) {
          const value = map[key];
          if (typeof value === "function") {
            // Parse arguments if present
            let args = [];
            if (argStr) {
              args = argStr.split(',').map(a => a.trim());
            }
            return value(...args);
          }
          if (typeof value === "array") {
            return value[parseInt(argStr)];
          }
          return value;
        }
        return match;
      }
    );
  }

  _replaceAll(str) {
    let result = str;
    result = this._replaceMacros(result);
    result = this._replaceEscapes(result);
    result = this._replaceResu(result);
    result = this._replaceVars(result);
    result = this._replaceEnums(result);
    result = this._replaceMaps(result);
    return result;
  }
  _log(msg) {
    if (this.loggable) {
      console.log(msg);
    } else { };
    this.resultOutput = '\n' + msg
  }
}
const env = new nova();
module.exports = { runNovaCode, runREPLNovaCode, nova, env };
Object.assign(module.exports, {
  default: env,
});

