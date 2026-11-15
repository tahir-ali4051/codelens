/* CodeLens — C / C++ standard library subset */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  const { TY } = CL;
  const lib = (CL.lib = {});
  const VOID = { v: 0, ty: TY.void };
  const I = (v) => ({ v, ty: TY.int });
  const D = (v) => ({ v, ty: TY.double });
  const UL = (v) => ({ v, ty: TY.ulong });

  const need = (it, args, n, name) => { if (args.length < n) it.err(`${name}() ko kam az kam ${n} argument chahiye.`, it.curLine); };
  const num = (it, args, i) => it.evalR(args[i]);

  // ---- I/O ----
  lib.printf = function (args, n) {
    need(this, args, 1, 'printf');
    const f = this.evalR(args[0]);
    if (f.ty.k !== 'ptr') this.err('printf ka pehla argument format string honi chahiye.', n.line);
    const fmt = f.lit !== undefined ? f.lit : this.readCString(f.v, n.line);
    const rest = args.slice(1).map(a => this.evalR(a));
    const s = this.cformat(fmt, rest, n.line);
    this.emit(s);
    return I(s.length);
  };
  lib.puts = function (args, n) { const s = this.evalR(args[0]); this.emit(this.readCString(s.v, n.line) + '\n'); return I(1); };
  lib.putchar = function (args, n) { const c = this.evalR(args[0]); this.emit(String.fromCharCode(c.v & 0xff)); return I(c.v); };
  lib.getchar = function () {
    if (this.inPos >= this.stdin.length) { this.notes.push('⚠️ Input khatam (EOF).'); return I(-1); }
    return I(this.stdin.charCodeAt(this.inPos++));
  };
  lib.scanf = function (args, n) {
    need(this, args, 1, 'scanf');
    const f = this.evalR(args[0]);
    const fmt = f.lit !== undefined ? f.lit : this.readCString(f.v, n.line);
    const ptrs = args.slice(1).map(a => this.evalR(a));
    let ai = 0, count = 0;
    const s = this.stdin;
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (/\s/.test(c)) { while (this.inPos < s.length && /\s/.test(s[this.inPos])) this.inPos++; continue; }
      if (c !== '%') { if (s[this.inPos] === c) this.inPos++; else break; continue; }
      i++;
      let len = '';
      while ('hlL'.includes(fmt[i])) len += fmt[i++];
      const conv = fmt[i];
      const p = ptrs[ai++];
      if (!p) this.err('scanf me format ke mutabiq address (&variable) nahi diya gaya.', n.line);
      if (conv !== 'c') while (this.inPos < s.length && /\s/.test(s[this.inPos])) this.inPos++;
      if (this.inPos >= s.length) { if (count === 0) { this.notes.push('⚠️ Input khatam — Input box me values daalo.'); return I(-1); } break; }
      if (p.ty.k !== 'ptr') this.err("scanf ko variable ka ADDRESS chahiye (&x), value nahi! '&' lagana bhool gaye?", n.line);
      if (p.v === 0) this.err('scanf ko NULL pointer mila.', n.line);
      if (conv === 'd' || conv === 'i' || conv === 'u') {
        const m = /^[+-]?\d+/.exec(s.slice(this.inPos)); if (!m) break;
        this.inPos += m[0].length;
        this.writeCell(p.v, CL.wrapInt(parseInt(m[0], 10), len === 'l' || len === 'll' ? TY.long : TY.int), n.line);
      } else if (conv === 'f' || conv === 'e' || conv === 'g') {
        const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(this.inPos)); if (!m) break;
        this.inPos += m[0].length;
        const cell = this.getCell(p.v, n.line);
        this.writeCell(p.v, cell.ty.size === 4 ? Math.fround(parseFloat(m[0])) : parseFloat(m[0]), n.line);
        if (len !== 'l' && cell.ty.size === 8) this.notes.push('⚠️ double ke liye %lf use karo (%f sirf float ke liye hai).');
      } else if (conv === 'c') {
        this.writeCell(p.v, s.charCodeAt(this.inPos++) & 0xff, n.line);
      } else if (conv === 's') {
        let j = this.inPos; while (j < s.length && !/\s/.test(s[j])) j++;
        const tok = s.slice(this.inPos, j); this.inPos = j;
        for (let k = 0; k < tok.length; k++) this.writeCell(p.v + k, tok.charCodeAt(k) & 0xff, n.line);
        this.writeCell(p.v + tok.length, 0, n.line);
      } else this.err(`scanf me %${conv} supported nahi.`, n.line);
      count++;
    }
    this.notes.push(`scanf ne ${count} value(s) input se padhi.`);
    return I(count);
  };
  lib.fgets = function (args, n) {
    const buf = this.evalR(args[0]), sz = this.evalR(args[1]).v;
    if (this.inPos >= this.stdin.length) return { v: 0, ty: CL.ptrTo(TY.char) };
    let line = '';
    while (this.inPos < this.stdin.length && line.length < sz - 1) { const ch = this.stdin[this.inPos++]; line += ch; if (ch === '\n') break; }
    for (let k = 0; k < line.length; k++) this.writeCell(buf.v + k, line.charCodeAt(k) & 0xff, n.line);
    this.writeCell(buf.v + line.length, 0, n.line);
    return buf;
  };
  lib.stdin = null;

  // ---- memory ----
  lib.malloc = function (args, n) {
    const sz = Math.trunc(this.evalR(args[0]).v);
    if (sz < 0 || sz > 5e6) this.err('malloc ko galat size mila.', n.line);
    const al = this.alloc({ k: 'raw', size: Math.max(sz, 1) }, 'heap', 'heap', { origin: `malloc(${sz})` });
    al.size = Math.max(sz, 1);
    this.notes.push(`malloc(${sz}) → heap par ${sz} bytes ka block mila (${CL.hex(al.addr)}). Isme abhi kachra hai.`);
    return { v: al.addr, ty: CL.ptrTo(TY.void) };
  };
  lib.calloc = function (args, n) {
    const c = Math.trunc(this.evalR(args[0]).v), s = Math.trunc(this.evalR(args[1]).v), sz = c * s;
    const al = this.alloc({ k: 'raw', size: Math.max(sz, 1) }, 'heap', 'heap', { origin: `calloc(${c}, ${s})` });
    al.size = Math.max(sz, 1); al.calloc = true; al.forceArr = c > 1;
    this.notes.push(`calloc(${c}, ${s}) → heap par ${sz} bytes ka block mila, saari values 0 hain.`);
    return { v: al.addr, ty: CL.ptrTo(TY.void) };
  };
  lib.realloc = function (args, n) {
    const p = this.evalR(args[0]), sz = Math.trunc(this.evalR(args[1]).v);
    if (p.v === 0) return lib.malloc.call(this, [args[1]], n);
    const old = this.heapByAddr.get(p.v);
    if (!old || old.internal) this.err('realloc ko valid heap pointer chahiye.', n.line);
    const el = old.type.k === 'array' ? old.type.of : (old.type.k === 'raw' ? null : old.type);
    const al = this.alloc({ k: 'raw', size: Math.max(sz, 1) }, 'heap', 'heap', { origin: `realloc(…, ${sz})` });
    al.size = Math.max(sz, 1);
    if (el) {
      this.retypeRaw(al.addr, el);
      const cnt = old.type.k === 'array' ? old.type.n : 1;
      const nal = this.allocs.get(al.id);
      const ncnt = nal.type.k === 'array' ? nal.type.n : 1;
      for (let i = 0; i < Math.min(cnt, ncnt); i++) this.moveCells(old.addr + i * el.size, al.addr + i * el.size, el);
    }
    this.freeAlloc(old, 'free');
    this.notes.push(`realloc: naya ${sz} bytes ka block (${CL.hex(al.addr)}) mila, purana data copy hua aur purana block free ho gaya.`);
    return { v: al.addr, ty: CL.ptrTo(TY.void) };
  };
  lib.free = function (args, n) {
    const p = this.evalR(args[0]);
    if (p.ty.k !== 'ptr') this.err('free() ko pointer chahiye.', n.line);
    if (p.v === 0) { this.notes.push('free(NULL): kuch nahi hua (safe).'); return VOID; }
    this.freeHeap(p.v, n.line, 'free');
    return VOID;
  };
  lib.memset = function (args, n) {
    const p = this.evalR(args[0]), v = this.evalR(args[1]).v, cnt = this.evalR(args[2]).v;
    let a = p.v; const end = p.v + cnt;
    while (a < end) {
      const c = this.getCell(a, n.line);
      if (c.ty.k === 'ptr' || c.ty.k === 'string' || c.ty.k === 'vector') { c.v = 0; c.init = true; }
      else if (c.ty.k === 'float') { this.writeCell(a, v === 0 ? 0 : NaN, n.line); }
      else { let x = 0; for (let b = 0; b < c.ty.size; b++) x = x * 256 + (v & 0xff); this.writeCell(a, CL.wrapInt(x, c.ty), n.line); }
      a += Math.max(1, c.ty.size);
    }
    return p;
  };
  lib.memcpy = function (args, n) {
    const d = this.evalR(args[0]), s = this.evalR(args[1]), cnt = this.evalR(args[2]).v;
    let off = 0;
    while (off < cnt) { const c = this.getCell(s.v + off, n.line); this.writeCell(d.v + off, c.v, n.line); off += Math.max(1, c.ty.size); }
    return d;
  };
  lib.memmove = lib.memcpy;

  // ---- strings (C) ----
  const cstr = (it, rv, line) => it.readCString(rv.v, line);
  const wstr = (it, addr, s, line) => { for (let i = 0; i < s.length; i++) it.writeCell(addr + i, s.charCodeAt(i) & 0xff, line); it.writeCell(addr + s.length, 0, line); };
  lib.strlen = function (args, n) { return UL(cstr(this, this.evalR(args[0]), n.line).length); };
  lib.strcpy = function (args, n) {
    const d = this.evalR(args[0]), s = cstr(this, this.evalR(args[1]), n.line);
    const dc = this.mem.get(d.v);
    if (dc && dc.al && d.v + s.length + 1 > dc.al.addr + dc.al.size) this.notes.push('⚠️ BUFFER OVERFLOW! String destination se bari hai — dusri memory overwrite ho sakti hai.');
    wstr(this, d.v, s, n.line); return d;
  };
  lib.strncpy = function (args, n) {
    const d = this.evalR(args[0]), s = cstr(this, this.evalR(args[1]), n.line), c = this.evalR(args[2]).v;
    for (let i = 0; i < c; i++) this.writeCell(d.v + i, i < s.length ? s.charCodeAt(i) & 0xff : 0, n.line);
    return d;
  };
  lib.strcat = function (args, n) {
    const d = this.evalR(args[0]), s = cstr(this, this.evalR(args[1]), n.line), cur = cstr(this, d, n.line);
    wstr(this, d.v + cur.length, s, n.line); return d;
  };
  lib.strcmp = function (args, n) { const a = cstr(this, this.evalR(args[0]), n.line), b = cstr(this, this.evalR(args[1]), n.line); return I(a < b ? -1 : a > b ? 1 : 0); };
  lib.strncmp = function (args, n) { const c = this.evalR(args[2]).v; const a = cstr(this, this.evalR(args[0]), n.line).slice(0, c), b = cstr(this, this.evalR(args[1]), n.line).slice(0, c); return I(a < b ? -1 : a > b ? 1 : 0); };
  lib.strchr = function (args, n) { const p = this.evalR(args[0]), c = this.evalR(args[1]).v, s = cstr(this, p, n.line); const i = s.indexOf(String.fromCharCode(c)); return { v: i < 0 ? 0 : p.v + i, ty: CL.ptrTo(TY.char) }; };
  lib.atoi = function (args, n) { return I(parseInt(cstr(this, this.evalR(args[0]), n.line), 10) || 0); };
  lib.atof = function (args, n) { return D(parseFloat(cstr(this, this.evalR(args[0]), n.line)) || 0); };
  lib.sprintf = function (args, n) {
    const d = this.evalR(args[0]), f = this.evalR(args[1]);
    const s = this.cformat(f.lit !== undefined ? f.lit : cstr(this, f, n.line), args.slice(2).map(a => this.evalR(a)), n.line);
    wstr(this, d.v, s, n.line); return I(s.length);
  };

  // ---- ctype ----
  const ct = (name, fn) => { lib[name] = function (args) { return I(fn(String.fromCharCode(this.evalR(args[0]).v & 0xff)) ? 1 : 0); }; };
  ct('isdigit', c => /[0-9]/.test(c)); ct('isalpha', c => /[A-Za-z]/.test(c)); ct('isalnum', c => /[A-Za-z0-9]/.test(c));
  ct('isspace', c => /\s/.test(c)); ct('isupper', c => /[A-Z]/.test(c)); ct('islower', c => /[a-z]/.test(c)); ct('ispunct', c => /[!-\/:-@\[-`{-~]/.test(c));
  lib.toupper = function (args) { const c = this.evalR(args[0]).v; return I(c >= 97 && c <= 122 ? c - 32 : c); };
  lib.tolower = function (args) { const c = this.evalR(args[0]).v; return I(c >= 65 && c <= 90 ? c + 32 : c); };

  // ---- math ----
  const m1 = (name, f) => { lib[name] = function (args) { return D(f(Number(this.evalR(args[0]).v))); }; };
  m1('sqrt', Math.sqrt); m1('sin', Math.sin); m1('cos', Math.cos); m1('tan', Math.tan); m1('fabs', Math.abs);
  m1('floor', Math.floor); m1('ceil', Math.ceil); m1('round', (x) => Math.sign(x) * Math.round(Math.abs(x))); m1('log', Math.log); m1('log10', Math.log10); m1('exp', Math.exp); m1('cbrt', Math.cbrt);
  lib.pow = function (args) { return D(Math.pow(Number(this.evalR(args[0]).v), Number(this.evalR(args[1]).v))); };
  lib.fmod = function (args) { return D(Number(this.evalR(args[0]).v) % Number(this.evalR(args[1]).v)); };
  lib.abs = function (args) { const v = this.evalR(args[0]); return v.ty.k === 'float' ? D(Math.abs(v.v)) : { v: Math.abs(v.v), ty: v.ty }; };
  lib.labs = lib.llabs = lib.abs;
  lib.rand = function () { this.randState = (Math.imul(this.randState, 1103515245) + 12345) >>> 0; return I((this.randState >>> 1) & 0x7fffffff); };
  lib.srand = function (args) { this.randState = this.evalR(args[0]).v >>> 0; return VOID; };
  lib.time = function (args) { for (const a of args) this.evalR(a); return { v: 1700000000, ty: TY.long }; };
  lib.exit = function (args, n) {
    const c = args.length ? this.evalR(args[0]).v : 0;
    this.snap(n.line, `exit(${c}) call hui — program yahin foran khatam.`);
    throw { __exit: c };
  };
  lib.system = function () { this.err('system() yahan allowed nahi.'); };

  // ---- C++ helpers ----
  lib.swap = function (args, n) {
    const a = this.evalL(args[0]), b = this.evalL(args[1]);
    const da = this.readObj(a.addr, a.ty, n.line), db = this.readObj(b.addr, b.ty, n.line);
    if (a.ty.k === 'vector') { this.vecAssign(a.addr, a.ty, db.items, n.line); this.vecAssign(b.addr, b.ty, da.items, n.line); }
    else { this.writeObj(a.addr, a.ty, db, n.line); this.writeObj(b.addr, b.ty, da, n.line); }
    return VOID;
  };
  lib.min = function (args) { const a = this.evalR(args[0]), b = this.evalR(args[1]); const t = a.ty.k === 'string' ? a.ty : this.arithType(a.ty, b.ty); return { v: b.v < a.v ? b.v : a.v, ty: t }; };
  lib.max = function (args) { const a = this.evalR(args[0]), b = this.evalR(args[1]); const t = a.ty.k === 'string' ? a.ty : this.arithType(a.ty, b.ty); return { v: b.v > a.v ? b.v : a.v, ty: t }; };
  const rng = function (it, args, n) {
    const a = it.evalR(args[0]), b = it.evalR(args[1]);
    if (a.ty.k !== 'ptr') it.err('Ye function iterator/pointer range (begin, end) chahta hai.', n.line);
    const es = a.ty.to.size, cnt = Math.max(0, Math.trunc((b.v - a.v) / es));
    return { base: a.v, es, cnt, ty: a.ty.to };
  };
  lib.sort = function (args, n) {
    if (args.length > 2) this.err('sort() me custom comparator abhi supported nahi (sirf ascending sort).', n.line);
    const r = rng(this, args, n);
    const vals = []; for (let i = 0; i < r.cnt; i++) vals.push(this.readObj(r.base + i * r.es, r.ty, n.line));
    if (r.ty.k === 'struct') this.err('Struct ko sort karne ke liye comparator chahiye (abhi supported nahi).', n.line);
    vals.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    vals.forEach((v, i) => this.writeCell(r.base + i * r.es, v, n.line));
    this.notes.push(`sort: ${r.cnt} elements ascending order me arrange hue.`);
    return VOID;
  };
  lib.reverse = function (args, n) {
    const r = rng(this, args, n);
    const vals = []; for (let i = 0; i < r.cnt; i++) vals.push(this.readObj(r.base + i * r.es, r.ty, n.line));
    vals.reverse().forEach((v, i) => this.writeObj(r.base + i * r.es, r.ty, v, n.line));
    return VOID;
  };
  lib.to_string = function (args) { const v = this.evalR(args[0]); return { v: v.ty.k === 'float' ? Number(v.v).toFixed(6) : String(v.v), ty: TY.string }; };
  lib.stoi = function (args, n) { const s = this.coerce(this.evalR(args[0]), TY.string, n.line); const v = parseInt(s, 10); if (isNaN(v)) this.err(`std::invalid_argument: stoi("${s}") — ye number nahi hai.`, n.line); return I(v); };
  lib.stod = function (args, n) { const s = this.coerce(this.evalR(args[0]), TY.string, n.line); const v = parseFloat(s); if (isNaN(v)) this.err(`std::invalid_argument: stod("${s}") — ye number nahi hai.`, n.line); return D(v); };
  lib.getline = function (args, n) {
    const lv = this.evalL(args[1]);
    if (this.inPos >= this.stdin.length) { this.inFail = true; this.notes.push('⚠️ Input khatam (Input box me line daalo).'); return { v: 0, ty: { k: 'istream', size: 1 } }; }
    let j = this.stdin.indexOf('\n', this.inPos); if (j < 0) j = this.stdin.length;
    const line = this.stdin.slice(this.inPos, j).replace(/\r$/, ''); this.inPos = j + 1;
    this.writeCell(lv.addr, line, n.line);
    this.notes.push(`getline ne poori line padhi: "${line}".`);
    return { v: 0, ty: { k: 'istream', size: 1 } };
  };
  lib.setprecision = function (args) { return { v: this.evalR(args[0]).v, ty: { k: 'manip', name: 'setprecision', size: 1 } }; };
  lib.setw = function (args) { return { v: this.evalR(args[0]).v, ty: { k: 'manip', name: 'setw', size: 1 } }; };
})();
