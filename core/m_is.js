// is.js — is CLI Initializer with Sync Variants

const fs = require('fs');
const path = require('path');
const readlineSync = require('readline-sync');

function mkdirpSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[is] Created directory: ${dir}`);
  }
}

function scaffold(options) {
  const {
    dir,
    config_file,
    fields,
    auto = {},
    macros = {},
    faults = {},
    signals = {},
    sync = false,
  } = options;

  if (dir) mkdirpSync(dir);

  fields.forEach(f => configSchema.add(f));

  Object.entries(signals).forEach(([sig, fn]) => {
    process.on(sig, fn);
  });

  const promptFn = sync ? askuser_sync : askuser;
  const macroValues = Object.fromEntries(
    Object.entries(macros).map(([k, fn]) => [k, fn()])
  );

  const autoDefaults = { ...auto, ...macroValues };

const finalize = responses => {
  const config = {};
  for (const field of fields) {
    config[field] =
      responses[field] ||
      (faults[field] ? faults[field]() : undefined) ||
      autoDefaults[field] ||
      '';
  }

  // 🔒 Clean circular refs and functions before writing
  const seen = new WeakSet();
  const clean = JSON.parse(JSON.stringify(config, (key, value) => {
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  }));

  fs.writeFileSync(filePath, JSON.stringify(clean, null, 2));
  console.log(`[is] Config written to ${filePath}`);
};


if (sync) {
  const responses = askuser_sync({ auto: autoDefaults.name || '' });
  finalize(responses);
} else {
  promptFn({ auto: autoDefaults.name || '' }).then(finalize);
}
}

const configSchema = new Set();

function askuser_config(fields) {
  fields.forEach(f => configSchema.add(f));
}

function askuser_config_sync(fields) {
  fields.forEach(f => configSchema.add(f));
}

function getCwdName() {
  return path.basename(process.cwd());
}

function version(v = '0.0.0') {
  return v;
}

function askuser({ auto } = {}) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const responses = {};
  const fields = [...configSchema];
  let index = 0;

  return new Promise(resolve => {
    const askNext = () => {
      if (index >= fields.length) {
        rl.close();
        return resolve(responses);
      }

      const field = fields[index];
      const defaultVal = field === 'name' ? auto || getCwdName() : '';
      const prompt = `${field}? (ENTER for '${defaultVal}'): `;

      rl.question(prompt, answer => {
        const final = answer.trim() || defaultVal;
        responses[field] = final;
        console.log(`Set ${field} to ${final}`);
        index++;
        askNext();
      });
    };

    askNext();
  });
}

function askuser_sync({ auto } = {}) {
  const responses = {};
  const fields = [...configSchema];

  for (const field of fields) {
    const defaultVal = field === 'name' ? auto || getCwdName() : '';
    const prompt = `${field}? (ENTER for '${defaultVal}'): `;
    const answer = readlineSync.question(prompt);
    const final = answer.trim() || defaultVal;
    responses[field] = final;
    console.log(`Set ${field} to ${final}`);
  }

  return responses;
}

function init_module({ config_file = 'is.config.json', config }) {
  const filePath = path.resolve(config_file);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  console.log(`[is] Config written to ${filePath}`);
}

function init_module_sync({ config_file = 'is.config.json', config }) {
  const filePath = path.resolve(config_file);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  console.log(`[is] Config written to ${filePath}`);
}

module.exports = {
  askuser_config,
  askuser_config_sync,
  askuser,
  askuser_sync,
  init_module,
  init_module_sync,
  getCwdName,
  version,
  scaffold,
};
