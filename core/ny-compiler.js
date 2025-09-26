// ny-compiler.js

const env = require('./nova.js'); // Assuming nova.js exists
const yips = require('yip-core');

function compile_to_nova__yip(code) {
  let Ny = new yips.Yip(new yips.YipTokenizer().tokenize(code), 0, code);

  // Register the "for" compiler command
  Ny.registerCompiler(
    'for',
    'basic for loop',
    'for (any x, val) { val; }',
    function () {
      // The current instance 'this' (which is 'Ny') is used for parsing
      // This is the correct way to parse the tokens for the current command
      const parenContent = this.parseParen();
      const tokens = new yips.YipTokenizer().tokenize(parenContent);
      
      // Parse the loop variables and collection from the parenContent
      let var1, var2, iterable;
      
      if (tokens.length >= 4 && tokens[0] === 'any' && tokens[2] === ',') {
        var1 = tokens[1];
        var2 = tokens[3];
        this.expect('in');
        iterable = this.next();
      } else {
        // Handle other for loop types here if needed
        throw new yips.YipError("Invalid 'for' loop signature", 'FOR_SYNTAX', this.pos, this.code, this.tokens);
      }

      // Parse the loop body block
      const body = this.parseBlock();

      // Return the compiled Nova code string
      return `foreach(${iterable}), (${var1}, ${var2}) { ${body} };`;
    }
  );

  Ny.compile(); // Call compile on the instance
  return Ny.getCompiled();
}

module.exports = { compile_to_nova__yip };