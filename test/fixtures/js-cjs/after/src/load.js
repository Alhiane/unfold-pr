// CommonJS module: exported functions must not be flagged as having no callers.
let cache = null;

function configure(opts) {
  cache = normalize(opts);
}

function normalize(opts) {
  return { ...opts };
}

function forgotten() {
  return cache;
}

module.exports = { configure };
