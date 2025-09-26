const py =
    require('./build/Release/pointer-addon.node');

py.init();

// Import math
let math = py.import("math");

// Grab sqrt
let sqrt = py.getAttr(math, "sqrt");

// Call sqrt(49)
console.log("sqrt(49) =", py.call(sqrt, 49)); // -> 7

py.end();
