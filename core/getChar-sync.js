// lib/getch.js
const fs = require('fs');

function getch(promptText = '') {
  const fd = fs.openSync('/dev/tty', 'rs');
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);

  if (promptText) process.stdout.write(promptText);

  const buf = Buffer.alloc(1);
  fs.readSync(fd, buf, 0, 1);

  process.stdin.setRawMode(wasRaw);
  fs.closeSync(fd);

  return buf.toString();
}

module.exports = getch;
