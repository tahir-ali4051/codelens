/* CodeLens — interpreter part 4: call dispatch, C++ vector/string/streams */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  const { TY } = CL;
  const P = CL.Interp.prototype;
  const fv = CL.fmtVal;

  // ---------- output ----------
  P.emit = function (s) {
    this.out += s;
    if (this.out.length > 300000) this.err(CL.t(`Too much output (more than 300,000 characters). Maybe a loop is not ending.`, 'Output bahut zyada ho gaya (300,000 characters se zyada). Shayad loop band nahi ho raha.'));
  };

  CL.fmtG = function (v, prec, alt) {
    if (!Number.isFinite(v)) return Number.isNaN(v) ? 'nan' : (v < 0 ? '-inf' : 'inf');
    if (prec === 0) prec = 1;
    if (v === 0) return '0';
    const exp = Math.floor(Math.log10(Math.abs(v)));
    let s;
    const strip = (x) => x.includes('.') ? x.replace(/0+$/, '').replace(/\.$/, '') : x;
    if (exp < -4 || exp >= prec) {
      const m = v.toExponential(prec - 1).split('e');
      const e = parseInt(m[1], 10);
      s = strip(m[0]) + 'e' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
    } else s = strip(v.toFixed(Math.max(0, prec - 1 - exp)));
    return s;
  };

  // ---------- printf-style ----------
  P.cformat = function (fmt, args, line) {
    let out = '', ai = 0;
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (c !== '%') { out += c; continue; }
      i++;
      if (fmt[i] === '%') { out += '%'; continue; }
      let flags = '';
      while ('-+ 0#'.includes(fmt[i]) && i < fmt.length) flags += fmt[i++];
      let width = '';
      if (fmt[i] === '*') { width = String(args[ai++].v); i++; } else while (/[0-9]/.test(fmt[i] || '')) width += fmt[i++];
      let prec = null;
      if (fmt[i] === '.') { i++; prec = ''; if (fmt[i] === '*') { prec = String(args[ai++].v); i++; } else while (/[0-9]/.test(fmt[i] || '')) prec += fmt[i++]; prec = prec === '' ? 0 : parseInt(prec, 10); }
      let len = '';
      while ('hlLzjt'.includes(fmt[i]) && i < fmt.length) len += fmt[i++];
      const conv = fmt[i];
      if (conv === undefined) break;
      const a = args[ai++];
      if (!a) { this.notes.push(CL.t(`⚠️ No value was given for %${conv} in printf — garbage will be printed.`, `⚠️ printf me %${conv} ke liye value nahi di gayi — kachra print hoga.`)); continue; }
      let s;
      switch (conv) {
        case 'd': case 'i': {
          let v = a.ty.k === 'float' ? (this.notes.push(CL.t(`⚠️ A decimal (float/double) value was given for %d — the output will be wrong! Use %f.`, '⚠️ %d ke saath decimal (float/double) value di — galat output aayega! %f use karo.')), Math.trunc(a.v)) : a.v;
          if (a.ty.k === 'ptr') v = a.v;
          if (len === '' || len === 'h') v = CL.wrapInt(v, TY.int);
          s = String(Math.abs(v)); if (prec !== null) s = s.padStart(prec, '0');
          s = (v < 0 ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '') + s; break;
        }
        case 'u': s = String(len === '' ? CL.wrapInt(a.v, TY.uint) : CL.wrapInt(a.v, TY.ulong)); break;
        case 'x': case 'X': case 'o': {
          let v = len === '' ? CL.wrapInt(a.v, TY.uint) : CL.wrapInt(a.v, TY.ulong);
          s = v.toString(conv === 'o' ? 8 : 16); if (conv === 'X') s = s.toUpperCase();
          if (flags.includes('#') && v !== 0) s = (conv === 'o' ? '0' : conv === 'x' ? '0x' : '0X') + s; break;
        }
        case 'c': s = String.fromCharCode(a.v & 0xff); break;
        case 's': {
          if (a.ty.k === 'string') s = a.v;
          else if (a.ty.k !== 'ptr') { this.notes.push(CL.t(`⚠️ %s needs a string (char*) but something else was given!`, '⚠️ %s ke liye string (char*) chahiye thi, lekin kuch aur mila!')); s = '(null)'; }
          else s = a.v === 0 ? '(null)' : this.readCString(a.v, line);
          if (prec !== null) s = s.slice(0, prec); break;
        }
        case 'f': case 'F': {
          if (a.ty.k === 'int') this.notes.push(CL.t(`⚠️ An integer was given for %f — the output will be wrong! Use %d.`, '⚠️ %f ke saath integer di — galat output aayega! %d use karo.'));
          s = Number(a.v).toFixed(prec === null ? 6 : prec); if (!Number.isFinite(+a.v)) s = CL.fmtG(+a.v, 6);
          if (+a.v >= 0 && flags.includes('+')) s = '+' + s; break;
        }
        case 'e': case 'E': { const m = Number(a.v).toExponential(prec === null ? 6 : prec).split('e'); const e = parseInt(m[1], 10); s = m[0] + (conv === 'E' ? 'E' : 'e') + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0'); break; }
        case 'g': case 'G': s = CL.fmtG(Number(a.v), prec === null ? 6 : prec); break;
        case 'p': s = a.v === 0 ? '(nil)' : CL.hex(a.v); break;
        default: s = '%' + conv;
      }
      if (width) {
        const w = parseInt(width, 10);
        if (s.length < w) {
          if (flags.includes('-')) s = s.padEnd(w, ' ');
          else if (flags.includes('0') && 'diuxXofFeEgG'.includes(conv)) { const sg = /^[+-]/.test(s) ? s[0] : ''; s = sg + s.slice(sg.length).padStart(w - sg.length, '0'); }
          else s = s.padStart(w, ' ');
        }
      }
      out += s;
    }
    return out;
  };

  // ---------- C++ streams ----------
  P.fmtCout = function (rv) {
    const t = rv.ty;
    switch (t.k) {
      case 'int': return t.isChar ? String.fromCharCode(rv.v & 0xff) : String(rv.v);
      case 'bool': return this.cfmt.boolalpha ? (rv.v ? 'true' : 'false') : (rv.v ? '1' : '0');
      case 'float': return this.cfmt.fixed ? Number(rv.v).toFixed(this.cfmt.prec) : CL.fmtG(Number(rv.v), this.cfmt.prec);
      case 'string': return rv.v;
      case 'ptr':
        if (t.to.isChar) return rv.v === 0 ? this.err(CL.t(`Printing a NULL char* with cout crashes the program.`, 'NULL char* ko cout me print karne se crash hota hai.')) : this.readCString(rv.v);
        return rv.v === 0 ? '0' : CL.hex(rv.v);
    }
    this.err(CL.t(`${CL.typeName(t)} cannot be printed directly with cout.`, `${CL.typeName(t)} ko cout se seedha print nahi kar sakte.`));
  };

  P.streamOp = function (op, a, n) {
    if (!this.cfmt) this.cfmt = { fixed: false, prec: 6, width: 0, boolalpha: false };
    if (op === '<<') {
      if (a.ty.k !== 'ostream') this.err(CL.t(`Use cout with <<.`, '<< ke saath cout use karo.'), n.line);
      const b = this.evalR(n.r);
      if (b.ty.k === 'manip') {
        if (b.ty.name === 'endl') this.emit('\n');
        else if (b.ty.name === 'fixed') this.cfmt.fixed = true;
        else if (b.ty.name === 'boolalpha') this.cfmt.boolalpha = true;
        else if (b.ty.name === 'setprecision') this.cfmt.prec = b.v;
        else if (b.ty.name === 'setw') this.cfmt.width = b.v;
        return a;
      }
      let s = this.fmtCout(b);
      if (this.cfmt.width) { s = s.padStart(this.cfmt.width, ' '); this.cfmt.width = 0; }
      this.emit(s);
      return a;
    }
    // >>
    if (a.ty.k !== 'istream') this.err(CL.t(`Use cin with >>.`, '>> ke saath cin use karo.'), n.line);
    const lv = this.evalL(n.r);
    this.readInto(lv, n.line);
    return a;
  };

  P.nextToken = function () {
    const s = this.stdin;
    while (this.inPos < s.length && /\s/.test(s[this.inPos])) this.inPos++;
    if (this.inPos >= s.length) return null;
    let j = this.inPos;
    while (j < s.length && !/\s/.test(s[j])) j++;
    const t = s.slice(this.inPos, j);
    this.inPos = j;
    return t;
  };

  P.readInto = function (lv, line) {
    const ty = lv.ty;
    if (ty.k === 'int' && ty.isChar) {
      const s = this.stdin;
      while (this.inPos < s.length && /\s/.test(s[this.inPos])) this.inPos++;
      if (this.inPos >= s.length) { this.inFail = true; this.notes.push(CL.t(`⚠️ The input ran out (type more values in the Input box).`, '⚠️ Input khatam ho gaya (Input box me aur values daalo).')); return; }
      this.store(lv, { v: s.charCodeAt(this.inPos++), ty: TY.char }, line);
      return;
    }
    const tok = this.nextToken();
    if (tok === null) { this.inFail = true; this.notes.push(CL.t(`⚠️ The input ran out — cin got no more values (type them in the Input box).`, '⚠️ Input khatam ho gaya — cin ko aur values nahi mili (Input box me daalo).')); return; }
    if (ty.k === 'int' || ty.k === 'bool') {
      if (!/^[+-]?\d+$/.test(tok)) { this.inFail = true; this.notes.push(CL.t(`⚠️ "${tok}" is not an integer — cin failed.`, `⚠️ "${tok}" integer nahi hai — cin fail ho gaya.`)); return; }
      this.store(lv, { v: parseInt(tok, 10), ty: TY.long }, line);
    } else if (ty.k === 'float') {
      if (isNaN(parseFloat(tok))) { this.inFail = true; this.notes.push(CL.t(`⚠️ "${tok}" is not a number — cin failed.`, `⚠️ "${tok}" number nahi hai — cin fail ho gaya.`)); return; }
      this.store(lv, { v: parseFloat(tok), ty: TY.double }, line);
    } else if (ty.k === 'string') {
      this.writeCell(lv.addr, tok, line);
    } else this.err(CL.t(`cin >> ${CL.typeName(ty)} is not supported.`, `cin >> ${CL.typeName(ty)} supported nahi.`), line);
    this.notes.push(CL.t(`"${tok}" was read from the input.`, `Input se "${tok}" padha gaya.`));
  };

  // ---------- vector internals ----------
  P.vecCell = function (addr, line) { return this.getCell(addr, line); };
  P.moveCells = function (src, dst, ty) {
    switch (ty.k) {
      case 'struct': for (const f of ty.fields) this.moveCells(src + f.off, dst + f.off, f.type); break;
      case 'array': for (let i = 0; i < ty.n; i++) this.moveCells(src + i * ty.of.size, dst + i * ty.of.size, ty.of); break;
      default: { const s = this.mem.get(src), d = this.mem.get(dst); if (s && d) { d.v = s.v; d.init = s.init; } }
    }
  };
  P.vecAlloc = function (ty, cap) {
    return this.alloc(CL.arrOf(ty.of, cap), 'heap', 'vector data', { zero: false, internal: true });
  };
  P.vecFree = function (addr) {
    const c = this.mem.get(addr);
    if (!c || c.ty.k !== 'vector' || !c.v.data) return;
    const al = this.heapByAddr.get(c.v.data);
    if (c.ty.of.k === 'vector') for (let i = 0; i < c.v.size; i++) this.vecFree(c.v.data + i * c.ty.of.size);
    if (al) this.freeAlloc(al, 'free');
    c.v = { data: 0, size: 0, cap: 0 };
  };
  // write items into vector, growing capacity (x2) when needed
  P.vecSetItems = function (addr, ty, items, line, why) {
    const c = this.getCell(addr, line);
    const v = c.v, need = items.length;
    let cap = v.cap;
    if (need > cap) {
      let nc = cap || 1; while (nc < need) nc *= 2;
      if (why === 'assign') nc = need;
      const nal = this.vecAlloc(ty, nc);
      if (v.data) {
        for (let i = 0; i < Math.min(v.size, need); i++) this.moveCells(v.data + i * ty.of.size, nal.addr + i * ty.of.size, ty.of);
        const old = this.heapByAddr.get(v.data);
        if (old) this.freeAlloc(old, 'free');
        this.notes.push(CL.t(`📦 The vector capacity (${cap}) was full → a NEW memory block with capacity ${nc} was made, the old elements were copied and the old block was freed (iterators/pointers are now invalid!).`, `📦 vector ka capacity (${cap}) bhar gaya → capacity ${nc} ka NAYA memory block bana, purane elements copy hue, purana block free ho gaya (iterators/pointers invalid!).`));
      } else this.notes.push(CL.t(`📦 Room for ${nc} elements was taken on the heap for the vector.`, `📦 vector ke liye heap par ${nc} elements ki jagah li gayi.`));
      v.data = nal.addr; cap = nc;
    }
    this.quiet++;
    try { items.forEach((it, i) => this.writeObj(v.data + i * ty.of.size, ty.of, it, line)); } finally { this.quiet--; }
    v.size = need; v.cap = cap;
  };
  P.vecAssign = function (addr, ty, items, line) {
    const c = this.getCell(addr, line);
    if (c.v.data) this.vecFree(addr);
    c.init = true;
    if (items.length) this.vecSetItems(addr, ty, items, line, 'assign');
    else c.v = { data: 0, size: 0, cap: 0 };
  };
  P.vecItems = function (addr, ty, line) { return this.readObj(addr, ty, line).items; };

  // ---------- method tables ----------
  const ival = (it, n) => it.evalR(n);
  const mkI = (v) => ({ v, ty: TY.ulong });
  const mkB = (v) => ({ v: v ? 1 : 0, ty: TY.bool });
  const VOID = { v: 0, ty: TY.void };

  CL.vecMethods = {
    size(it, lv) { return mkI(it.getCell(lv.addr).v.size); },
    empty(it, lv) { return mkB(it.getCell(lv.addr).v.size === 0); },
    capacity(it, lv) { return mkI(it.getCell(lv.addr).v.cap); },
    push_back(it, lv, a, n) {
      const items = it.vecItems(lv.addr, lv.ty, n.line);
      const x = it.coerce(ival(it, a[0]), lv.ty.of, n.line);
      const sz = items.length;
      items.push(x);
      it.vecSetItems(lv.addr, lv.ty, items, n.line);
      it.notes.push(CL.t(`push_back: the vector size ${sz} → ${sz + 1}.`, `push_back: vector ka size ${sz} → ${sz + 1}.`));
      return VOID;
    },
    pop_back(it, lv, a, n) {
      const c = it.getCell(lv.addr);
      if (!c.v.size) it.err(CL.t(`pop_back() on an empty vector — undefined behaviour!`, 'Khali vector par pop_back() — undefined behaviour!'), n.line);
      c.v.size--; it.notes.push(CL.t(`pop_back: size ${c.v.size + 1} → ${c.v.size}.`, `pop_back: size ${c.v.size + 1} → ${c.v.size}.`)); return VOID;
    },
    clear(it, lv) { it.getCell(lv.addr).v.size = 0; it.notes.push(CL.t(`clear: the size became 0 (the capacity stays the same).`, 'clear: size 0 ho gaya (capacity wahi rahi).')); return VOID; },
    back(it, lv, a, n) { const c = it.getCell(lv.addr).v; if (!c.size) it.err(CL.t(`back() on an empty vector — undefined behaviour!`, 'Khali vector par back() — undefined behaviour!'), n.line); return it.readLV({ addr: c.data + (c.size - 1) * lv.ty.of.size, ty: lv.ty.of }, n.line); },
    front(it, lv, a, n) { const c = it.getCell(lv.addr).v; if (!c.size) it.err(CL.t(`front() on an empty vector — undefined behaviour!`, 'Khali vector par front() — undefined behaviour!'), n.line); return it.readLV({ addr: c.data, ty: lv.ty.of }, n.line); },
    at(it, lv, a, n) {
      const i = Math.trunc(ival(it, a[0]).v), c = it.getCell(lv.addr).v;
      if (i < 0 || i >= c.size) it.err(CL.t(`std::out_of_range: vector::at(${i}) — index ${i} is invalid, the vector size is only ${c.size}.`, `std::out_of_range: vector::at(${i}) — index ${i} galat hai, vector ka size sirf ${c.size} hai.`), n.line);
      return it.readLV({ addr: c.data + i * lv.ty.of.size, ty: lv.ty.of }, n.line);
    },
    begin(it, lv) { return { v: it.getCell(lv.addr).v.data, ty: CL.ptrTo(lv.ty.of) }; },
    end(it, lv) { const c = it.getCell(lv.addr).v; return { v: c.data + c.size * lv.ty.of.size, ty: CL.ptrTo(lv.ty.of) }; },
    data(it, lv) { return { v: it.getCell(lv.addr).v.data, ty: CL.ptrTo(lv.ty.of) }; },
    resize(it, lv, a, n) {
      const items = it.vecItems(lv.addr, lv.ty, n.line), sz = Math.trunc(ival(it, a[0]).v);
      const fill = a[1] ? it.coerce(ival(it, a[1]), lv.ty.of, n.line) : it.defaultData(lv.ty.of);
      while (items.length > sz) items.pop();
      while (items.length < sz) items.push(it.cloneData(fill));
      it.vecSetItems(lv.addr, lv.ty, items, n.line); return VOID;
    },
    reserve(it, lv, a, n) {
      const c = it.getCell(lv.addr).v, want = Math.trunc(ival(it, a[0]).v);
      if (want > c.cap) { const items = it.vecItems(lv.addr, lv.ty, n.line); const sz = items.length; const nal = it.vecAlloc(lv.ty, want); if (c.data) { for (let i = 0; i < sz; i++) it.moveCells(c.data + i * lv.ty.of.size, nal.addr + i * lv.ty.of.size, lv.ty.of); const old = it.heapByAddr.get(c.data); if (old) it.freeAlloc(old, 'free'); } c.data = nal.addr; c.cap = want; it.notes.push(`reserve: capacity ${want} ki jagah pehle se le li.`); }
      return VOID;
    },
    insert(it, lv, a, n) {
      const pos = ival(it, a[0]), items = it.vecItems(lv.addr, lv.ty, n.line), c = it.getCell(lv.addr).v;
      const idx = Math.trunc((pos.v - c.data) / lv.ty.of.size);
      if (idx < 0 || idx > items.length) it.err(CL.t(`insert() got an invalid iterator.`, 'insert() ko galat iterator mila.'), n.line);
      items.splice(idx, 0, it.coerce(ival(it, a[1]), lv.ty.of, n.line));
      it.vecSetItems(lv.addr, lv.ty, items, n.line);
      const c2 = it.getCell(lv.addr).v;
      return { v: c2.data + idx * lv.ty.of.size, ty: CL.ptrTo(lv.ty.of) };
    },
    erase(it, lv, a, n) {
      const pos = ival(it, a[0]), items = it.vecItems(lv.addr, lv.ty, n.line), c = it.getCell(lv.addr).v;
      const idx = Math.trunc((pos.v - c.data) / lv.ty.of.size);
      if (idx < 0 || idx >= items.length) it.err(CL.t(`erase() got an invalid iterator.`, 'erase() ko galat iterator mila.'), n.line);
      items.splice(idx, 1);
      it.vecSetItems(lv.addr, lv.ty, items, n.line);
      return { v: c.data + idx * lv.ty.of.size, ty: CL.ptrTo(lv.ty.of) };
    },
    assign(it, lv, a, n) {
      const cnt = Math.trunc(ival(it, a[0]).v), x = it.coerce(ival(it, a[1]), lv.ty.of, n.line);
      it.vecAssign(lv.addr, lv.ty, Array.from({ length: cnt }, () => it.cloneData(x)), n.line); return VOID;
    }
  };

  const sget = (it, lv) => it.getCell(lv.addr).v;
  const sset = (it, lv, s, line) => it.writeCell(lv.addr, s, line);
  CL.strMethods = {
    length(it, lv) { return mkI(sget(it, lv).length); },
    size(it, lv) { return mkI(sget(it, lv).length); },
    empty(it, lv) { return mkB(sget(it, lv).length === 0); },
    clear(it, lv, a, n) { sset(it, lv, '', n.line); return VOID; },
    push_back(it, lv, a, n) { sset(it, lv, sget(it, lv) + String.fromCharCode(ival(it, a[0]).v), n.line); return VOID; },
    pop_back(it, lv, a, n) { const s = sget(it, lv); if (!s.length) it.err(CL.t(`pop_back() on an empty string!`, 'Khali string par pop_back()!'), n.line); sset(it, lv, s.slice(0, -1), n.line); return VOID; },
    append(it, lv, a, n) { sset(it, lv, sget(it, lv) + it.coerce(ival(it, a[0]), TY.string, n.line), n.line); return VOID; },
    back(it, lv, a, n) { const s = sget(it, lv); return { v: s.charCodeAt(s.length - 1), ty: TY.char }; },
    front(it, lv, a, n) { return { v: sget(it, lv).charCodeAt(0), ty: TY.char }; },
    at(it, lv, a, n) { const s = sget(it, lv), i = Math.trunc(ival(it, a[0]).v); if (i < 0 || i >= s.length) it.err(CL.t(`std::out_of_range: string::at — index ${i} is invalid (length ${s.length}).`, `std::out_of_range: string::at — index ${i} galat hai (length ${s.length}).`), n.line); return { v: s.charCodeAt(i), ty: TY.char }; },
    substr(it, lv, a, n) {
      const s = sget(it, lv), p = Math.trunc(ival(it, a[0]).v), l = a[1] ? Math.trunc(ival(it, a[1]).v) : s.length - p;
      if (p > s.length || p < 0) it.err(CL.t(`std::out_of_range: substr — position ${p} is outside the string.`, `std::out_of_range: substr — position ${p} string se bahar hai.`), n.line);
      return { v: s.substr(p, l), ty: TY.string };
    },
    find(it, lv, a, n) { const x = ival(it, a[0]); const t = x.ty.k === 'string' ? x.v : (x.ty.k === 'ptr' ? it.readCString(x.v) : String.fromCharCode(x.v)); const i = sget(it, lv).indexOf(t); return { v: i < 0 ? 18446744073709552000 : i, ty: TY.ulong, npos: i < 0 }; },
    c_str(it, lv) { return { v: it.strLiteral(sget(it, lv)), ty: CL.ptrTo(TY.char) }; },
    compare(it, lv, a, n) { const t = it.coerce(ival(it, a[0]), TY.string, n.line), s = sget(it, lv); return { v: s < t ? -1 : s > t ? 1 : 0, ty: TY.int }; },
    insert(it, lv, a, n) { const p = Math.trunc(ival(it, a[0]).v), s = sget(it, lv); sset(it, lv, s.slice(0, p) + it.coerce(ival(it, a[1]), TY.string, n.line) + s.slice(p), n.line); return VOID; },
    erase(it, lv, a, n) { const s = sget(it, lv), p = Math.trunc(ival(it, a[0]).v), l = a[1] ? Math.trunc(ival(it, a[1]).v) : s.length - p; sset(it, lv, s.slice(0, p) + s.slice(p + l), n.line); return VOID; }
  };

  // ---------- call dispatch ----------
  P.evalCall = function (n, wantLV) {
    const fnode = n.fn;
    if (fnode.k === 'id') {
      const name = fnode.name;
      const f = this.frames[this.frames.length - 1];
      if (f && f.thisTy && f.thisTy.methods.has(name) && !this.funcs.has(name)) {
        const fn = this.pickOverload(f.thisTy.methods.get(name), n.args, name, n.line);
        return this.finishCall(fn, this.evalArgs(fn.params, n.args, n.line), { addr: f.thisAddr, ty: f.thisTy }, n, wantLV);
      }
      const cands = this.funcs.get(name);
      if (cands) {
        const fn = this.pickOverload(cands, n.args, name, n.line);
        return this.finishCall(fn, this.evalArgs(fn.params, n.args, n.line), null, n, wantLV);
      }
      const lib = CL.lib[name];
      if (lib) return lib.call(this, n.args, n);
      if (this.resolve(name)) this.err(CL.t(`'${name}' is a variable, not a function — it cannot be called.`, `'${name}' function nahi, variable hai — usko call nahi kar sakte.`), n.line);
      this.err(CL.t(`No function named '${name}' was found — check the spelling or define/declare the function.`, `'${name}' naam ka function nahi mila — spelling check karo ya function define/declare karo.`), n.line);
    }
    if (fnode.k === 'member') {
      let lv, bt;
      if (fnode.arrow) {
        const p = this.evalR(fnode.e);
        if (p.ty.k !== 'ptr') this.err(CL.t(`-> works only on pointers.`, '-> sirf pointer par lagta hai.'), n.line);
        if (p.v === 0) this.err(CL.t(`NULL pointer dereference! The pointer is NULL, so '->${fnode.name}()' cannot be called (Segmentation fault).`, `NULL pointer dereference! Pointer NULL hai, isliye '->${fnode.name}()' call nahi ho sakta (Segmentation fault).`), n.line);
        lv = { addr: p.v, ty: p.ty.to };
      } else {
        const bnode = fnode.e;
        if (bnode.k === 'call' || bnode.k === 'construct') {
          const rv = this.evalR(bnode);
          const tmp = this.alloc(rv.ty, 'stack', '(temp)', { zero: true, internal: true });
          if (rv.ty.k === 'string') this.mem.get(tmp.addr).v = rv.v; else this.writeObj(tmp.addr, rv.ty, rv.data, n.line);
          lv = { addr: tmp.addr, ty: rv.ty };
        } else lv = this.evalL(bnode);
      }
      bt = lv.ty;
      const name = fnode.name;
      if (bt.k === 'struct') {
        const cands = bt.methods.get(name);
        if (!cands) this.err(CL.t(`'${bt.name}' has no function (method) named '${name}'.`, `'${bt.name}' me '${name}' naam ka function (method) nahi hai.`), n.line);
        const fn = this.pickOverload(cands, n.args, name, n.line);
        if (bt.isClass && fn.access === 'private' && this.frame.thisTy !== bt) this.err(CL.t(`'${name}()' is private — it cannot be called from outside the class.`, `'${name}()' private hai — class ke bahar se call nahi ho sakta.`), n.line);
        return this.finishCall(fn, this.evalArgs(fn.params, n.args, n.line), { addr: lv.addr, ty: bt }, n, wantLV);
      }
      if (bt.k === 'vector' && CL.vecMethods[name]) return CL.vecMethods[name](this, lv, n.args, n);
      if (bt.k === 'string' && CL.strMethods[name]) return CL.strMethods[name](this, lv, n.args, n);
      this.err(CL.t(`${CL.typeName(bt)} has no function named '${name}'.`, `${CL.typeName(bt)} par '${name}' naam ka function nahi hai.`), n.line);
    }
    this.err(CL.t(`This kind of function call is not supported.`, 'Ye function call supported nahi.'), n.line);
  };

  P.finishCall = function (fn, args, thisInfo, n, wantLV) {
    const r = this.callUser(fn, args, thisInfo, n.line);
    if (r && r.lv) return wantLV ? r : this.readLV(r.lv, n.line);
    return r;
  };
})();
