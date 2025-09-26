import * as tf from "@tensorflow/tfjs";

// === Training dataset (replace with any .js file text) ===
const text = `
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

for (let i = 0; i < 5; i++) {
  console.log("num", i, factorial(i));
}

class Counter {
  constructor() {
    this.count = 0;
  }
  inc() {
    this.count++;
    return this.count;
  }
}
const c = new Counter();
console.log(c.inc(), c.inc());
`;

// === Char encoding ===
const chars = [...new Set(text)];
const char2idx = Object.fromEntries(chars.map((c, i) => [c, i]));
const idx2char = chars;
const encoded = [...text].map(c => char2idx[c]);

// === Training sequences ===
const seqLength = 20; // longer context
const xs = [], ys = [];
for (let i = 0; i < encoded.length - seqLength; i++) {
  xs.push(encoded.slice(i, i + seqLength));
  ys.push(encoded[i + seqLength]);
}

const xsTensor = tf.tensor2d(xs, [xs.length, seqLength], "float32");
const ysTensor = tf.tensor1d(ys, "float32");

// === Model ===
const model = tf.sequential();
model.add(tf.layers.embedding({ inputDim: chars.length, outputDim: 32, inputLength: seqLength }));
model.add(tf.layers.simpleRNN({ units: 32 })); // instead of 64
model.add(tf.layers.dense({ units: chars.length, activation: "softmax" }));

model.compile({ loss: "sparseCategoricalCrossentropy", optimizer: "adam" });

// === Train ===
console.log("Training...");
await model.fit(xsTensor, ysTensor, {
  epochs: 3,        // drop from 15 → 3
  batchSize: 32     // bigger batches = fewer updates
});
console.log("Training done!");

// === Sampling helper (with temperature) ===
function sample(probs, temperature = 1.0) {
  probs = probs.map(p => Math.pow(p, 1 / temperature));
  const sum = probs.reduce((a, b) => a + b);
  probs = probs.map(p => p / sum);

  let r = Math.random();
  let accum = 0;
  for (let i = 0; i < probs.length; i++) {
    accum += probs[i];
    if (r < accum) return i;
  }
  return probs.length - 1;
}

// === Text generator ===
async function generate(seed, length = 120, temperature = 0.8) {
  let input = seed.split("").map(c => char2idx[c] ?? 0);

  if (input.length < seqLength) {
    input = new Array(seqLength - input.length).fill(0).concat(input);
  } else {
    input = input.slice(-seqLength);
  }

  let result = seed;

  for (let i = 0; i < length; i++) {
    const inputTensor = tf.tensor2d([input], [1, seqLength], "float32");
    const preds = model.predict(inputTensor);
    const probs = await preds.data();

    const nextIdx = sample([...probs], temperature);
    const nextChar = idx2char[nextIdx];

    result += nextChar;
    input = [...input.slice(1), nextIdx];
  }
  return result;
}

// === Try it out ===
console.log(await generate("function ", 200, 0.7));
