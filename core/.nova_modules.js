const { setuid } = require('process');
const { getCppHeapStatistics } = require('v8');

const shellQuote = require("shell-quote");
const yargsParser = import("yargs-parser");

class Pointer__ {
  constructor(size) {
    this.ptr = require('../natives/pointers').alloc(size);
  }
  ptr() { return this.ptr; }
  writeInt(V) { require('../natives/pointers').writeInt(this.ptr, V); }
  readInt() { require('../natives/pointers').readInt(this.ptr) }
  writeByte(V) { require('../natives/pointers').writeByte(this.ptr, V); }
  readByte() { require('../natives/pointers').readByte(this.ptr) }
  writeShort(V) { require('../natives/pointers').writeShort(this.ptr, V); }
  readShort() { require('../natives/pointers').readShort(this.ptr) }
  writeDouble(V) { require('../natives/pointers').writeDouble(this.ptr, V); }
  readDouble() { require('../natives/pointers').readDouble(this.ptr) }
  writeArray(V) { require('../natives/pointers').writeArray(this.ptr, V); }
  readArray() { require('../natives/pointers').readArray(this.ptr) }
  writeFloat(V) { require('../natives/pointers').writeAsFloat(this.ptr, V); }
  readFloat() { require('../natives/pointers').readInt(this.ptr) }
  free() { require('../natives/pointers').free(this.ptr) }
}

/**
 * Parses a shell-like command string.
 * @param {string} input - The command string to parse.
 * @returns {object} Parsed object with command, subcommand, args, and options.
 */
function parseShellCommand(input) {
  // Step 1: Split respecting quotes
  const argv = shellQuote.parse(input);

  if (!argv.length) return {};

  // Step 2: Extract the first two positional arguments as command/subcommand
  const command = argv[0] || null;
  const subcommand = argv[1] || null;

  // Step 3: Parse the rest with yargs-parser
  const rest = argv.slice(subcommand ? 2 : 1);
  const options = yargsParser(rest);

  // Step 4: Positional args (exclude _ for command/subcommand)
  const args = options._ || [];

  return { command, subcommand, args, options };
}

function toWordNUMM(num) {
  if (num === 0) return "zero";
  if (num < 0) return "negative " + toWordNUMM(-num);

  const small = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen"
  ];

  const tens = [
    "", "twenty", "thirty", "forty", "fifty",
    "sixty", "seventy", "eighty", "ninety"
  ];

  const scales = [
    "", "thousand", "million", "billion", "trillion"
  ];

  function chunkToWord(n) {
    let words = [];

    if (n >= 100) {
      words.push(small[Math.floor(n / 100)]);
      words.push("hundred");
      n %= 100;
      if (n > 0) {
        words.push("and");
      }
    }

    if (n >= 20) {
      words.push(tens[Math.floor(n / 10)]);
      if (n % 10) words.push(small[n % 10]);
    } else if (n > 0) {
      words.push(small[n]);
    }

    return words.join(" ");
  }

  let words = [];
  let scale = 0;

  while (num > 0) {
    let chunk = num % 1000;
    if (chunk) {
      let chunkWords = chunkToWord(chunk);
      if (scales[scale]) chunkWords += " " + scales[scale];
      words.unshift(chunkWords);
    }
    num = Math.floor(num / 1000);
    scale++;
  }

  return words.join(" ").trim();
}

class NumericStr {
  constructor(str) {
    this.value = NumericStr.parse(str);
  }

  static parse(str) {
    const small = {
      zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
      seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
      thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
      seventeen: 17, eighteen: 18, nineteen: 19
    };
    const tens = {
      twenty: 20, thirty: 30, forty: 40, fifty: 50,
      sixty: 60, seventy: 70, eighty: 80, ninety: 90
    };
    const scales = {
      nan: NaN,
      hundred: 100,
      thousand: 1_000,
      million: 1_000_000,
      billion: 1_000_000_000,
      trillion: 1_000_000_000_000,
      quadrillion: 1_000_000_000_000_000,
      quintillion: 1_000_000_000_000_000_000,
      sextillion: 1_000_000_000_000_000_000_000,
      septillion: 1_000_000_000_000_000_000_000_000,
      octillion: 1_000_000_000_000_000_000_000_000_000,
      nonillion: 1_000_000_000_000_000_000_000_000_000_000,
      decillion: 1_000_000_000_000_000_000_000_000_000_000_000,
      googol: 10n ** 100n  // use BigInt for googol
    };

    let words = str.toLowerCase().split(/[\s-]+/);
    let total = 0n;
    let current = 0n;
    let negative = false;

    if (words[0] === 'minus') {
      negative = true;
      words.shift();
    }

    for (let word of words) {
      if (word === 'and') continue;
      if (small[word] != null) {
        current += BigInt(small[word]);
      } else if (tens[word] != null) {
        current += BigInt(tens[word]);
      } else if (scales[word] != null) {
        current *= BigInt(scales[word]);
        if (scales[word] >= 1000) {
          total += current;
          current = 0n;
        }
      } else {
        throw new Error(`Unknown number word: ${word}`);
      }
    }

    let result = total + current;
    if (negative) result = -result;
    return result;
  }

  valueOf() {
    // Convert BigInt to Number if safe, else throw
    if (typeof this.value === 'bigint') {
      if (this.value <= BigInt(Number.MAX_SAFE_INTEGER) && this.value >= BigInt(Number.MIN_SAFE_INTEGER)) {
        return Number(this.value);
      } else {
        throw new Error("Number too big for JS Number, use .toString() or BigInt operations");
      }
    }
    return this.value;
  }

  toString() {
    return this.value.toString();
  }
}

const fs = require("fs");

function readFileSafe(path) {
  try {
    return fs.readFileSync(path, "utf8");
  } catch (e) {
    return null; // permission denied or not present
  }
}

// Generic parser for "Key: Value" formatted files
function parseKeyValueFile(path) {
  const text = readFileSafe(path);
  if (!text) return null;
  const out = {};
  text.split("\n").forEach(line => {
    if (!line.trim()) return;
    const [key, ...rest] = line.split(":");
    let value = rest.join(":").trim();
    if (/^\d+(\s+\d+)+$/.test(value)) {
      value = value.split(/\s+/).map(n => parseInt(n, 10));
    } else if (/^\d+\s+kB$/.test(value)) {
      value = parseInt(value.replace(" kB", ""), 10) * 1024;
    } else if (/^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }
    out[key.trim()] = value;
  });
  return out;
}

function parseKeyValue(text) {
  if (!text) return null;
  const out = {};
  text.split("\n").forEach(line => {
    if (!line.trim()) return;
    const [key, ...rest] = line.split(":");
    let value = rest.join(":").trim();
    if (/^\d+(\s+\d+)+$/.test(value)) {
      value = value.split(/\s+/).map(n => parseInt(n, 10));
    } else if (/^\d+\s+kB$/.test(value)) {
      value = parseInt(value.replace(" kB", ""), 10) * 1024;
    } else if (/^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }
    out[key.trim()] = value;
  });
  return out;
}

const proc = {
  info: "general info based of the linux style /proc dir",
  exports: {
    // --- General info ---
    version: () => ({ version: readFileSafe("/proc/version") }),
    cmdline: (pid = "self") => ({ cmdline: readFileSafe(`/proc/${pid}/cmdline`) }),
    status: (pid = "self") => parseKeyValueFile(`/proc/${pid}/status`),
    mounts: () => parseKeyValueFile("/proc/mounts"),
    uptime: () => parseKeyValueFile("/proc/uptime"),
    loadavg: () => parseKeyValueFile("/proc/loadavg"),
    meminfo: () => parseKeyValueFile("/proc/meminfo"),
    cpuinfo: () => parseKeyValueFile("/proc/cpuinfo"),

    // --- Process specific ---
    environ: (pid = "self") => ({ environ: readFileSafe(`/proc/${pid}/environ`) }),
    maps: (pid = "self") => ({ maps: readFileSafe(`/proc/${pid}/maps`) }),
    fd: (pid = "self") => {
      try {
        return { fd: fs.readdirSync(`/proc/${pid}/fd`) };
      } catch {
        return { fd: [] };
      }
    },

    // --- System lists ---
    devices: () => parseKeyValueFile("/proc/devices"),
    filesystems: () => parseKeyValueFile("/proc/filesystems"),
    partitions: () => parseKeyValueFile("/proc/partitions"),
    modules: () => parseKeyValueFile("/proc/modules"),

    // --- Helper parser ---
    parseStatus: (pid = "self") => parseKeyValueFile(`/proc/${pid}/status`)
  }
};

function toOrdinal(num) {
  const word = toWordNUMM(num); // reuse your existing function
  const special = {
    one: "first",
    two: "second",
    three: "third",
    five: "fifth",
    eight: "eighth",
    nine: "ninth",
    twelve: "twelfth"
  };

  let parts = word.split(" ");
  let last = parts.pop();

  if (special[last]) {
    parts.push(special[last]);
  } else if (last.endsWith("y")) {
    parts.push(last.slice(0, -1) + "ieth"); // twenty → twentieth
  } else {
    parts.push(last + "th");
  }

  return parts.join(" ");
}

function toTime(str) {
  str = str.toLowerCase().trim();

  const hoursMap = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12
  };

  let hour = 0, minute = 0, pm = false;

  if (str.includes("quarter past")) {
    minute = 15;
    hour = hoursMap[str.replace("quarter past ", "")];
  } else if (str.includes("half past")) {
    minute = 30;
    hour = hoursMap[str.replace("half past ", "")];
  } else if (str.includes("quarter to")) {
    minute = 45;
    hour = hoursMap[str.replace("quarter to ", "")] - 1;
  } else {
    // fallback: exact hour
    for (let w in hoursMap) {
      if (str.includes(w)) hour = hoursMap[w];
    }
    if (str.includes("thirty")) minute = 30;
    if (str.includes("fifteen")) minute = 15;
    if (str.includes("forty five")) minute = 45;
  }

  if (str.includes("pm")) pm = true;
  if (pm && hour < 12) hour += 12;
  if (!pm && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

module.exports = {
  'argv': {
    info: "process cli arguments",
    exports: process.argv.slice(2)
  },
  'shell': {
    info: "general shell utility",
    exports: {
      exec: (code) => require('child_process').execSync(code).toString(),
      paths: () => process.env.PATH.split(':'),
      env: () => process.env,
      stdio: () => {
        return {
          setRawMode: () => process.stdin.setRawMode(true),
          setEncoding: (encoding) => process.stdin.setEncoding(encoding),
          isRaw: () => process.stdin.isRaw,
          getHeapStatistics: () => getCppHeapStatistics(),
          getHeapSpaceStatistics: () => process.memoryUsage(),
          open: (...args) => require('fs').openSync(...args),
          close: (...args) => require('fs').closeSync(...args),
          readFS: (...args) => require('fs').readSync(...args),
          writeFS: (...args) => require('fs').writeSync(...args),
          setuid: (uid) => {
            if (typeof uid !== 'number') {
              throw new TypeError('setuid requires a number argument');
            }
            try {
              setuid(uid);
            } catch (err) {
              console.error('[shell.setuid] Error setting UID:', err);
            }
          },
          write: (data) => process.stdout.write(data),
          error: (data) => process.stderr.write(data),
          read: () => {
            let data = '';
            process.stdin.on('data', chunk => data += chunk);
            return data;
          }
        };
      },
      spawn: (command, args = [], options = {}) => {
        const { spawnSync } = require('child_process');
        return spawnSync(command, args, options);
      },
      execFile: (file, args = [], options = {}) => {
        const { execFileSync } = require('child_process');
        return execFileSync(file, args, options);
      },
      password: (options = { prompt: 'Password: ', echo: false }) => {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: true
        });
        return new Promise((resolve, reject) => {
          rl.question(options.prompt, (password) => {
            if (!options.echo) {
              process.stdout.write('\n'); // Move to the next line after password input
            }
            rl.close();
            resolve(password);
          });
        });
      },
    }
  },
  'natural': {
    info: "natural formatting",
    exports: {
      NumericStr: (a) => new NumericStr(a),
      NumericWord: (n) => toWordNUMM(n),
      NumericOrdinalStr: (n) => toOrdinal(n),
      toTime: (s) => toTime(s),
    }
  },
  'improv-ptr': {
    exports: (s) => new Pointer__(s)
  },
  'natives': {
    info: "simple utility for native packages",
    exports: {
      list: () => require('fs').readdirSync('../natives/'),
      import: (name) => require('../natives/' + name)
    }
  },
  'persa': {
    info: "usefull parsing functions for various utility",
    exports: {
	int: (...args) => parseInt(args),
        float: (...args) => parseInt(args),
	obj: (str, kev, dev) => require('./nova.js').env.parseMapInline(str, kev, dev, true),
        array: (str, dev) => require('./nova.js').env.parseArray(str, dev, true),
        no_val_array: (str, dev) => require('./nova.js').env.parseArr(str, dev, true),
        key_value_pair: (str) => parseKeyValue(str),
        querystr: (str) => require('querystring').parse(str),
xml: str => new (require('fast-xml-parser').XMLParser)({
  parseTagValue: true,
  ignoreAttributes: false
}).parse(str),
	json: (str) => JSON.parse(str),
        json5: (str) => require('json5').parse(str),
        sh: (str) => parseShellCommand(str),
    }
   },
  'proc': proc,
  'os': {
    info: "general os info",
    exports: {
      data: () => {
        let { execSync } = require('child_process');
        let os = require('os');
        let platform = os.platform();
        let output;
        try {
          if (platform === 'win32') {
            output = execSync('powershell -Command "Get-ComputerInfo | ConvertTo-Json -Depth 3"', { encoding: 'utf8' });
          } else if (platform === 'linux') {
            output = execSync('inxi -Fxz --output json', { encoding: 'utf8' });
          } else if (platform === 'darwin') {
            output = execSync('system_profiler SPSoftwareDataType -json');
          } else if (platform === 'android') {
            output = JSON.stringify({
              info: [{ msg: 'android system info not supported (yet)' }, 0, 1, 2, 3],
              init: [],
              user: os.userInfo({ encoding: 'utf8' })
            })
          } else {
            throw `Unsupported OS: ${platform}`
          }
          return {
            system: JSON.parse(output),
            user: os.userInfo({ encoding: 'utf8' })
          };
        } catch (err) {
          output = {
            error: 'Failed to retrieve system info',
            details: err.message || String(err)
          }
          return output;
        }
      },
      platform: () => process.platform,
      arch: () => process.arch,
      user: () => {
        return {
          name: require('child_process').execSync('whoami'),
          other: require('os').userInfo({ encoding: 'utf8' })
        }
      },
      hostname: () => require('os').hostname(),
      uptime: () => require('os').uptime(),
      cpus: () => require('os').cpus(),
      memory: () => require('os').totalmem(),
      freemem: () => require('os').freemem(),
      env: () => process.env,
      cwd: () => process.cwd(),
      tmpdir: () => require('os').tmpdir(),
      isSu: () => process.getuid && process.getuid() === 0,
      net: () => require('os').networkInterfaces(),
      ver: () => require('os').version(),
      getEnv: (name) => {
        if (typeof name !== 'string') {
          throw new TypeError('getEnv requires a string argument');
        }
        let VAL = process.env[name] || null;
        if (VAL.includes(':')) return VAL.split(':');
        else return VAL;
      },
      setEnv: (name, value) => {
        if (typeof name !== 'string' || typeof value !== 'string') {
          throw new TypeError('setEnv requires string arguments');
        }
        process.env[name] = value;
      },
      homedir: () => require('os').homedir(),
      edject: (name, value) => {
        if (typeof name !== 'string' || typeof value !== 'string') {
          throw new TypeError('edject requires string arguments');
        }
        try {
          require('child_process').execSync(`export ${name}="${value}"`, { stdio: 'ignore' });
        } catch (err) {
          console.error('[os.edject] Error setting environment variable:', err);
        }
      },
      idject: (name) => {
        // de-inject environment variable
        if (typeof name !== 'string' || typeof value !== 'string') {
          throw new TypeError('idject requires string arguments');
        }
        try {
          require('child_process').execSync(`unset ${name}`, { stdio: 'ignore' });
        } catch (err) {
          console.error('[os.idject] Error unsetting environment variable:', err);
        }
      }
    }
  },
  'npm': {
    info: "simple wrapper around the 'npm' cli",
    exports: {
      install: (name, options = { opts: [], version: '@latest', global: false }) => {
        return require('child_process').execSync(`npm i ${'-g' ? options.global === true : ''} ${name}${options.version ? options.version : '@latest'} ${options.opts.join(' ') ? options.opts : ''}`).toString('utf8');
      },
      usr: () => {
        return require('child_process').execSync('npm whoami').toString('utf8').trim()
      },
      init: (options = { opts: [], version: '@latest', global: false }) => {
        return require('child_process').execSync(`npm init  ${options.opts.join(' ') ? options.opts : ''}`)
      },
      uninstall: (name, options = { opts: [], version: '@latest', global: false }) => {
        return require('child_process').execSync(`npm uninstall ${'-g' ? options.global === true : ''} ${name}${options.version ? options.version : ''} ${options.opts.join(' ') ? options.opts : ''}`).toString('utf8');
      },
      update: (name, options = { opts: [], version: '@latest', global: false }) => {
        return require('child_process').execSync(`npm update ${'-g' ? options.global === true : ''} ${name}${options.version ? options.version : ''} ${options.opts.join(' ') ? options.opts : ''}`).toString('utf8');
      },
      list: (options = { opts: [], version: '@latest', global: false }) => {
        return require('child_process').execSync(`npm list ${'-g' ? options.global === true : ''} ${options.opts.join(' ') ? options.opts : ''}`).toString('utf8');
      },
      search: (name, options = { opts: [], version: '@latest', global: false }) => {
        return require('child_process').execSync(`npm search ${name} ${options.opts.join(' ') ? options.opts : ''}`).toString('utf8');
      },
      cache: (options = { opts: [], version: '@latest', global: false }) => {
        return require('child_process').execSync(`npm cache ${options.command} ${options.opts.join(' ') ? options.opts : ''}`).toString('utf8');
      },
      root: (options = { global: false }) => {
        return require('child_process').execSync(`npm root ${'-g' ? options.global === true : ''}`).toString('utf8').trim();
      },
      bin: (options = { global: false }) => {
        return require('child_process').execSync(`npm bin ${'-g' ? options.global === true : ''}`).toString('utf8').trim();
      }
    }
  },
  'typescript': {
    info: "simple wrapper around the typescript language",
    exports: {
      compile: (code, options = { module: 'commonjs', target: 'es5', outDir: './dist', sourceMap: false }) => {
        const ts = require('typescript');
        const result = ts.transpileModule(code, {
          compilerOptions: {
            module: options.module || 'commonjs',
            target: options.target || 'es5',
            outDir: options.outDir || './dist',
            sourceMap: options.sourceMap || false,
          }
        });
        return {
          outputText: result.outputText,
          sourceMapText: result.sourceMapText,
          diagnostics: result.diagnostics.map(d => ({
            message: d.messageText,
            category: d.category,
            code: d.code,
            start: d.start,
            length: d.length,
            file: d.file ? d.file.fileName : undefined,
          })),
        };
      },
      parse: (code, options = { module: 'commonjs', target: 'es5', outDir: './dist', sourceMap: false }) => {
        const ts = require('typescript');
        const result = ts.transpileModule(code, {
          compilerOptions: {
            module: options.module || 'commonjs',
            target: options.target || 'es5',
            outDir: options.outDir || './dist',
            sourceMap: options.sourceMap || false,
          }
        });
        return {
          outputText: result.outputText,
          sourceMapText: result.sourceMapText,
          diagnostics: result.diagnostics.map(d => ({
            message: d.messageText,
            category: d.category,
            code: d.code,
            start: d.start,
            length: d.length,
            file: d.file ? d.file.fileName : undefined,
          })),
        };
      },
      version: () => require('typescript').version,
      config: (filePath) => {
        if (typeof filePath !== 'string') {
          throw new TypeError('config requires a string argument');
        }
        const ts = require('typescript');
        const configFile = ts.readConfigFile(filePath, ts.sys.readFile);
        if (configFile.error) {
          throw new Error(`Error reading TypeScript config file: ${configFile.error.messageText}`);
        }
        const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, require('path').dirname(filePath));
        return {
          options: parsedConfig.options,
          fileNames: parsedConfig.fileNames,
          errors: parsedConfig.errors.map(d => ({
            message: d.messageText,
            category: d.category,
            code: d.code,
            start: d.start,
            length: d.length,
            file: d.file ? d.file.fileName : undefined,
          })),
        };
      },
    },
  },
  'gyp': {
    info: "simple wrapper around the GYP generator",
    exports: {
      build: (options = { targets: [], buildDir: 'build', release: false, debug: false }) => {
        const { execSync } = require('child_process');
        const args = [
          'build',
          ...options.targets.map(target => `--target=${target}`),
          `--build-dir=${options.buildDir}`,
          options.release ? '--release' : '',
          options.debug ? '--debug' : '',
        ].filter(Boolean).join(' ');
        try {
          return execSync(`node-gyp ${args}`, { stdio: 'inherit' });
        } catch (error) {
          console.error('Error during gyp build:', error.message);
          throw error;
        }
      },
      configure: (options = { targets: [], buildDir: 'build', release: false, debug: false }) => {
        const { execSync } = require('child_process');
        const args = [
          'configure',
          ...options.targets.map(target => `--target=${target}`),
          `--build-dir=${options.buildDir}`,
          options.release ? '--release' : '',
          options.debug ? '--debug' : '',
        ].filter(Boolean).join(' ');
        try {
          return execSync(`node-gyp ${args}`, { stdio: 'inherit' });
        } catch (error) {
          console.error('Error during gyp configure:', error.message);
          throw error;
        }
      },
      rebuild: (options = { targets: [], buildDir: 'build', release: false, debug: false }) => {
        const { execSync } = require('child_process');
        const args = [
          'rebuild',
          ...options.targets.map(target => `--target=${target}`),
          `--build-dir=${options.buildDir}`,
          options.release ? '--release' : '',
          options.debug ? '--debug' : '',
        ].filter(Boolean).join(' ');
        try {
          return execSync(`node-gyp ${args}`, { stdio: 'inherit' });
        } catch (error) {
          console.error('Error during gyp rebuild:', error.message);
          throw error;
        }
      },
      clean: (options = { buildDir: 'build' }) => {
        const { execSync } = require('child_process');
        try {
          return execSync(`node-gyp clean --build-dir=${options.buildDir}`, { stdio: 'inherit' });
        } catch (error) {
          console.error('Error during gyp clean:', error.message);
          throw error;
        }
      },
      version: () => {
        const { execSync } = require('child_process');
        try {
          return execSync('node-gyp --version').toString().trim();
        } catch (error) {
          console.error('Error getting gyp version:', error.message);
          throw error;
        }
      },
      info: () => {
        const { execSync } = require('child_process');
        try {
          return execSync('node-gyp info').toString().trim();
        } catch (error) {
          console.error('Error getting gyp info:', error.message);
          throw error;
        }
      },
      list: () => {
        const { execSync } = require('child_process');
        try {
          return execSync('node-gyp list').toString().trim();
        } catch (error) {
          console.error('Error listing gyp targets:', error.message);
          throw error;
        }
      },
    }
  },
  'is': {
    info: "simple cli helper",
    exports: () => require('./m_is')
  },
  'common': {
    info: "meta information around the nova runtime",
    exports: {
      types: ['file', 'string', 'number', 'boolean', 'object', 'function', 'undefined', 'symbol', 'integer', 'float', 'array', 'null'],
      containers: ['bridge', 'options', 'blocks', 'snippets', 'interfaces', 'defunctions', 'variables', 'commands', 'resus', 'infuncs', 'patterns', 'streams', 'operators', 'prefs', 'gears', 'backups', 'dynamicKeywords', 'istreams', 'fnstreams', 'keywordsArray', 'escapes', 'functions', 'enums', 'structs', 'maps', 'varMethods', 'currencies', 'classes', 'ret', 'states', 'allVars', 'macros', 'types', 'keyfuncs', 'templates', 'builtins', 'castings'],
      pkg: () => JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../package.json'))),
      src: () => require('./nova.js'),
      builts: {
        modules: exports,
      }
    }
  },
}
