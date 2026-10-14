const fs = require('fs');
const out = ['header'];
let cache = null;

function link(url) {
  return `[map](${url})`;
}

if (process.env.MAP_URL) {
  out.push(link(process.env.MAP_URL));
}
process.stdout.write(out.join('\n'));
