/* CodeLens — C/C++ lexer (with tiny preprocessor) */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});

  class CLError extends Error {
    constructor(kind, msg, line) {
      super(msg);
      this.kind = kind; // 'compile' | 'runtime'
      this.line = line || 0;
    }
  }
  CL.CLError = CLError;

  const KW = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return',
    'struct', 'class', 'union', 'typedef', 'const', 'static', 'unsigned', 'signed', 'long', 'short', 'int', 'char',
    'float', 'double', 'void', 'bool', 'sizeof', 'new', 'delete', 'true', 'false', 'nullptr', 'auto',
    'enum', 'public', 'private', 'protected', 'using', 'namespace', 'this', 'extern', 'register', 'volatile',
    'inline', 'goto', 'template', 'virtual', 'operator', 'friend'
  ]);
  CL.KW = KW;

  const OPS = ['<<=', '>>=', '...', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
    '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '::'];
  const SINGLE = '+-*/%=<>!&|^~?:;,.(){}[]#';

  const ESC = { n: 10, t: 9, r: 13, '0': 0, a: 7, b: 8, f: 12, v: 11, '\\': 92, "'": 39, '"': 34, '?': 63 };

  function lexRaw(src, startLine) {
    const toks = [];
    let i = 0, line = startLine || 1;
    const n = src.length;
    const err = (m) => { throw new CLError('compile', m, line); };

    function readEscape() {
      // src[i] is char after backslash
      const c = src[i];
      if (c === 'x') {
        let h = ''; i++;
        while (i < n && /[0-9a-fA-F]/.test(src[i]) && h.length < 2) h += src[i++];
        return parseInt(h || '0', 16);
      }
      if (/[0-7]/.test(c)) {
        let o = '';
        while (i < n && /[0-7]/.test(src[i]) && o.length < 3) o += src[i++];
        return parseInt(o, 8);
      }
      i++;
      if (c in ESC) return ESC[c];
      return c.charCodeAt(0);
    }

    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      // comments
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
        i += 2; continue;
      }
      const start = i;
      // preprocessor line
      if (c === '#') {
        let j = i;
        let text = '';
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\' && src[j + 1] === '\n') { j += 2; line++; continue; }
          text += src[j++];
        }
        i = j;
        toks.push({ t: 'pp', v: text.trim(), line, pos: start, end: i });
        continue;
      }
      // numbers
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i, isFloat = false, val;
        if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
          j = i + 2;
          while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
          val = parseInt(src.slice(i + 2, j), 16);
        } else if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
          j = i + 2;
          while (j < n && /[01]/.test(src[j])) j++;
          val = parseInt(src.slice(i + 2, j), 2);
        } else {
          while (j < n && /[0-9]/.test(src[j])) j++;
          if (src[j] === '.') { isFloat = true; j++; while (j < n && /[0-9]/.test(src[j])) j++; }
          if (src[j] === 'e' || src[j] === 'E') {
            let k = j + 1;
            if (src[k] === '+' || src[k] === '-') k++;
            if (/[0-9]/.test(src[k] || '')) { isFloat = true; j = k; while (j < n && /[0-9]/.test(src[j])) j++; }
          }
          const txt = src.slice(i, j);
          val = isFloat ? parseFloat(txt) : (/^0[0-7]+$/.test(txt) ? parseInt(txt, 8) : parseInt(txt, 10));
        }
        let suffix = '';
        while (j < n && /[uUlLfF]/.test(src[j])) suffix += src[j++];
        suffix = suffix.toLowerCase();
        if (suffix.includes('f') && !(c === '0' && /x/i.test(src[i + 1]))) isFloat = true;
        i = j;
        toks.push({ t: 'num', v: val, isFloat, suffix, line, pos: start, end: i });
        continue;
      }
      // identifiers / keywords
      if (/[A-Za-z_]/.test(c)) {
        let j = i + 1;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
        const w = src.slice(i, j);
        i = j;
        toks.push({ t: KW.has(w) ? 'kw' : 'id', v: w, line, pos: start, end: i });
        continue;
      }
      // strings
      if (c === '"') {
        i++;
        const codes = [];
        while (i < n && src[i] !== '"') {
          if (src[i] === '\n') err('String band nahi hui (closing " missing)');
          if (src[i] === '\\') { i++; codes.push(readEscape()); }
          else codes.push(src.charCodeAt(i++));
        }
        if (i >= n) err('String band nahi hui (closing " missing)');
        i++;
        toks.push({ t: 'str', v: String.fromCharCode(...codes), line, pos: start, end: i });
        continue;
      }
      if (c === "'") {
        i++;
        let code;
        if (src[i] === '\\') { i++; code = readEscape(); }
        else code = src.charCodeAt(i++);
        if (src[i] !== "'") err("Character literal galat hai (closing ' missing)");
        i++;
        toks.push({ t: 'chr', v: code, line, pos: start, end: i });
        continue;
      }
      // operators
      let matched = null;
      for (const op of OPS) if (src.startsWith(op, i)) { matched = op; break; }
      if (!matched && SINGLE.includes(c)) matched = c;
      if (!matched) err("Ajeeb character '" + c + "' mila");
      i += matched.length;
      toks.push({ t: 'op', v: matched, line, pos: start, end: i });
    }
    return toks;
  }

  // Preprocess: handle #define (object-like), drop #include etc., merge adjacent strings
  function lex(src) {
    const raw = lexRaw(src, 1);
    const macros = new Map();
    const out = [];
    for (const tk of raw) {
      if (tk.t === 'pp') {
        const m = /^#\s*define\s+([A-Za-z_]\w*)(\(?)\s*(.*)$/.exec(tk.v);
        if (m) {
          if (m[2] === '(') throw new CLError('compile', 'Function-jaisa #define macro abhi supported nahi (const ya function use karo)', tk.line);
          const body = m[3].trim();
          macros.set(m[1], body ? lexRaw(body, tk.line).filter(x => x.t !== 'pp') : []);
        }
        continue;
      }
      out.push(tk);
    }
    // macro expansion (non-recursive depth-limited)
    function expand(list, depth) {
      const res = [];
      for (const tk of list) {
        if (tk.t === 'id' && macros.has(tk.v) && depth < 8) {
          for (const b of expand(macros.get(tk.v), depth + 1))
            res.push(Object.assign({}, b, { line: tk.line, pos: tk.pos, end: tk.end }));
        } else res.push(tk);
      }
      return res;
    }
    const exp = macros.size ? expand(out, 0) : out;
    // merge adjacent string literals
    const merged = [];
    for (const tk of exp) {
      const last = merged[merged.length - 1];
      if (tk.t === 'str' && last && last.t === 'str') { last.v += tk.v; last.end = tk.end; }
      else merged.push(tk);
    }
    const lastLine = merged.length ? merged[merged.length - 1].line : 1;
    merged.push({ t: 'eof', v: '<end>', line: lastLine, pos: src.length, end: src.length });
    return merged;
  }
  CL.lex = lex;
})();
