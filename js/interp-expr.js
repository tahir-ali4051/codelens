/* CodeLens — interpreter part 2: values, lvalues, expressions */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  const { TY } = CL;
  const P = CL.Interp.prototype;

  const isStrTy = (t) => t.k === 'string';
  const isNum = (t) => t.k === 'int' || t.k === 'float' || t.k === 'bool';

  // ---------- reading / writing whole objects (as plain JS data) ----------
  P.readObj = function (addr, ty, line) {
    switch (ty.k) {
      case 'struct': return ty.fields.map(f => this.readObj(addr + f.off, f.type, line));
      case 'array': { const a = []; for (let i = 0; i < ty.n; i++) a.push(this.readObj(addr + i * ty.of.size, ty.of, line)); return a; }
      case 'vector': {
        const c = this.getCell(addr, line), items = [];
        for (let i = 0; i < c.v.size; i++) items.push(this.readObj(c.v.data + i * ty.of.size, ty.of, line));
        return { items };
      }
      default: return this.getCell(addr, line).v;
    }
  };
  P.writeObj = function (addr, ty, data, line) {
    switch (ty.k) {
      case 'struct': ty.fields.forEach((f, i) => this.writeObj(addr + f.off, f.type, data[i], line)); break;
      case 'array': for (let i = 0; i < ty.n; i++) this.writeObj(addr + i * ty.of.size, ty.of, data[i], line); break;
      case 'vector': this.vecAssign(addr, ty, data.items, line); break;
      default: this.writeCell(addr, data, line);
    }
  };

  P.readLV = function (lv, line) {
    const ty = lv.ty;
    if (lv.sidx !== undefined) {
      const s = this.getCell(lv.addr, line).v;
      if (lv.sidx < 0 || lv.sidx >= s.length) { if (lv.sidx === s.length) return { v: 0, ty: TY.char }; this.err(`string index ${lv.sidx} out of range (length ${s.length}).`, line); }
      return { v: s.charCodeAt(lv.sidx), ty: TY.char };
    }
    if (ty.k === 'struct' || ty.k === 'vector') return { ty, data: this.readObj(lv.addr, ty, line), addr: lv.addr };
    if (ty.k === 'array') return { v: lv.addr, ty: CL.ptrTo(ty.of), arr: ty };
    const c = this.getCell(lv.addr, line);
    if (!c.init && !this.quiet && ty.k !== 'string' && ty.k !== 'vector') {
      const m = `⚠️ '${this.pathOf(lv.addr)}' ko abhi koi value nahi mili thi, isliye kachra (garbage) value padhi gayi!`;
      if (!this.notes.includes(m)) this.notes.push(m);
    }
    return { v: c.v, ty };
  };

  // convert rv to JS storable data for type ty
  P.coerce = function (rv, ty, line) {
    const st = rv.ty;
    switch (ty.k) {
      case 'int': {
        if (st.k === 'ptr') return CL.wrapInt(rv.v, ty);
        if (!isNum(st)) this.err(`${CL.typeName(st)} ko ${CL.typeName(ty)} me convert nahi kar sakte.`, line);
        return CL.wrapInt(st.k === 'float' ? Math.trunc(rv.v) : +rv.v, ty);
      }
      case 'float': {
        if (!isNum(st)) this.err(`${CL.typeName(st)} ko ${CL.typeName(ty)} me convert nahi kar sakte.`, line);
        return ty.size === 4 ? Math.fround(+rv.v) : +rv.v;
      }
      case 'bool': return (st.k === 'ptr' ? rv.v !== 0 : rv.v) ? 1 : 0;
      case 'ptr': {
        if (st.k === 'int' || st.k === 'bool') { if (rv.v !== 0) this.notes.push('⚠️ Integer ko seedha pointer me daala gaya.'); return rv.v; }
        if (st.k !== 'ptr') this.err(`${CL.typeName(st)} ko pointer me convert nahi kar sakte.`, line);
        if (ty.to.k !== 'void') this.retypeRaw(rv.v, ty.to);
        return rv.v;
      }
      case 'string': {
        if (st.k === 'string') return rv.v;
        if (st.k === 'ptr') return rv.v === 0 ? this.err('NULL char* se string nahi ban sakti.', line) : this.readCString(rv.v, line);
        if (st.k === 'int' && st.isChar) return String.fromCharCode(rv.v);
        this.err(`${CL.typeName(st)} ko string me convert nahi kar sakte.`, line);
      }
      case 'struct': case 'vector':
        if (st.k !== ty.k || (ty.k === 'struct' && st !== ty)) this.err(`${CL.typeName(st)} ko ${CL.typeName(ty)} me convert nahi kar sakte.`, line);
        return rv.data;
    }
    this.err('Ye conversion supported nahi: ' + CL.typeName(st) + ' → ' + CL.typeName(ty), line);
  };

  // give a malloc'ed raw block its element type
  P.retypeRaw = function (addr, elTy) {
    const al = this.heapByAddr.get(addr);
    if (!al || al.type.k !== 'raw') return;
    const es = Math.max(1, elTy.size);
    const n = Math.max(1, Math.floor(al.size / es));
    const ty = n === 1 && !al.forceArr ? elTy : CL.arrOf(elTy, n);
    al.type = ty;
    al.size = Math.max(al.size, ty.size);
    this.initCells(al.addr, ty, al, !!al.calloc);
    if (al.region === 'ro') for (const a of al.cells) this.mem.get(a).ro = true;
  };

  // ---------- store ----------
  P.store = function (lv, rv, line) {
    const ty = lv.ty;
    if (lv.sidx !== undefined) {
      const c = this.getCell(lv.addr, line), s = c.v;
      if (lv.sidx < 0 || lv.sidx >= s.length) this.err('string index out of range.', line);
      const ch = String.fromCharCode(CL.wrapInt(rv.v, TY.char) & 0xff);
      this.writeCell(lv.addr, s.slice(0, lv.sidx) + ch + s.slice(lv.sidx + 1), line);
      return;
    }
    if (ty.k === 'array') this.err("Array ko seedha assign nahi kar sakte (a = b galat hai). Element-by-element ya strcpy/memcpy use karo.", line);
    if (ty.k === 'struct' || ty.k === 'vector') {
      if (rv.ty.k === 'struct' || rv.ty.k === 'vector') { this.writeObj(lv.addr, ty, this.coerce(rv, ty, line), line); return; }
      this.err(`${CL.typeName(rv.ty)} ko ${CL.typeName(ty)} me assign nahi kar sakte.`, line);
    }
    this.writeCell(lv.addr, this.coerce(rv, ty, line), line);
  };

  // ---------- helpers ----------
  P.truthy = function (rv) {
    if (rv.ty.k === 'istream') return !this.inFail;
    if (rv.ty.k === 'string') return rv.v.length > 0;
    return !!rv.v;
  };
  P.arithType = function (a, b) {
    if (a.k === 'float' || b.k === 'float') return (a.k === 'float' && b.k === 'float' && a.size === 4 && b.size === 4) ? TY.float : TY.double;
    const pa = a.k === 'bool' || a.size < 4 ? TY.int : a, pb = b.k === 'bool' || b.size < 4 ? TY.int : b;
    if (pa.size > pb.size) return pa;
    if (pb.size > pa.size) return pb;
    return !pa.signed ? pa : (!pb.signed ? pb : pa);
  };

  P.intOp = function (op, a, b, t, line) {
    let r;
    switch (op) {
      case '+': r = a + b; break;
      case '-': r = a - b; break;
      case '*':
        if (t.bits === 32) { r = t.signed ? Math.imul(a, b) : Math.imul(a, b) >>> 0; if (Math.abs(a * b) > 2147483647 * (t.signed ? 1 : 2) && !this.notes.some(n => n.startsWith('⚠️ Overflow'))) this.notes.push('⚠️ Overflow! Result int ki hadd se bahar gaya, isliye ghalat (wrap) value bani.'); return r; }
        r = a * b; if (!Number.isSafeInteger(r)) r = Number(BigInt.asIntN(64, BigInt(a) * BigInt(b))); break;
      case '/': if (b === 0) this.err('Division by zero! Integer ko 0 se divide nahi kiya ja sakta (program crash).', line); r = Math.trunc(a / b); break;
      case '%': if (b === 0) this.err('Modulo by zero! % ka dusra operand 0 nahi ho sakta.', line); r = a % b; break;
      case '&': r = Number(BigInt.asIntN(64, BigInt(a) & BigInt(b))); break;
      case '|': r = Number(BigInt.asIntN(64, BigInt(a) | BigInt(b))); break;
      case '^': r = Number(BigInt.asIntN(64, BigInt(a) ^ BigInt(b))); break;
      case '<<': r = Number(BigInt.asIntN(64, BigInt(a) << BigInt(b & 63))); break;
      case '>>': r = Number(BigInt(a) >> BigInt(b & 63)); break;
    }
    const w = CL.wrapInt(r, t);
    if (w !== r && (op === '+' || op === '-') && t.bits === 32 && t.signed && !this.notes.some(n => n.startsWith('⚠️ Overflow')))
      this.notes.push('⚠️ Overflow! Result int ki hadd se bahar gaya, isliye ghalat (wrap) value bani.');
    return w;
  };

  P.binop = function (op, a, b, line) {
    const ta = a.ty, tb = b.ty;
    // C++ strings
    if (ta.k === 'string' || tb.k === 'string') {
      const sa = ta.k === 'string' ? a.v : (ta.k === 'ptr' ? this.readCString(a.v, line) : String.fromCharCode(a.v));
      const sb = tb.k === 'string' ? b.v : (tb.k === 'ptr' ? this.readCString(b.v, line) : String.fromCharCode(b.v));
      switch (op) {
        case '+': return { v: sa + sb, ty: TY.string };
        case '==': return { v: sa === sb ? 1 : 0, ty: TY.bool };
        case '!=': return { v: sa !== sb ? 1 : 0, ty: TY.bool };
        case '<': return { v: sa < sb ? 1 : 0, ty: TY.bool };
        case '>': return { v: sa > sb ? 1 : 0, ty: TY.bool };
        case '<=': return { v: sa <= sb ? 1 : 0, ty: TY.bool };
        case '>=': return { v: sa >= sb ? 1 : 0, ty: TY.bool };
      }
      this.err(`string par '${op}' operator nahi chalta.`, line);
    }
    // pointer arithmetic
    if (ta.k === 'ptr' || tb.k === 'ptr') {
      if ((op === '+' || op === '-') && ta.k === 'ptr' && isNum(tb)) {
        const es = Math.max(1, ta.to.size);
        return { v: a.v + (op === '+' ? 1 : -1) * Math.trunc(b.v) * es, ty: ta };
      }
      if (op === '+' && isNum(ta) && tb.k === 'ptr') return { v: b.v + Math.trunc(a.v) * Math.max(1, tb.to.size), ty: tb };
      if (op === '-' && ta.k === 'ptr' && tb.k === 'ptr') return { v: Math.trunc((a.v - b.v) / Math.max(1, ta.to.size)), ty: TY.long };
      const cmp = { '==': a.v === b.v, '!=': a.v !== b.v, '<': a.v < b.v, '>': a.v > b.v, '<=': a.v <= b.v, '>=': a.v >= b.v };
      if (op in cmp) return { v: cmp[op] ? 1 : 0, ty: TY.int };
      this.err(`Pointer par '${op}' operator allowed nahi.`, line);
    }
    if (!isNum(ta) || !isNum(tb)) this.err(`'${op}' operator ${CL.typeName(ta)} aur ${CL.typeName(tb)} par nahi lag sakta.`, line);
    const cmpT = this.arithType(ta, tb);
    switch (op) {
      case '==': return { v: a.v == b.v ? 1 : 0, ty: TY.int };
      case '!=': return { v: a.v != b.v ? 1 : 0, ty: TY.int };
      case '<': return { v: a.v < b.v ? 1 : 0, ty: TY.int };
      case '>': return { v: a.v > b.v ? 1 : 0, ty: TY.int };
      case '<=': return { v: a.v <= b.v ? 1 : 0, ty: TY.int };
      case '>=': return { v: a.v >= b.v ? 1 : 0, ty: TY.int };
    }
    if (cmpT.k === 'float') {
      let r;
      switch (op) {
        case '+': r = a.v + b.v; break; case '-': r = a.v - b.v; break; case '*': r = a.v * b.v; break;
        case '/': r = a.v / b.v; break;
        default: this.err(`'${op}' operator decimal (float/double) par nahi chalta.`, line);
      }
      return { v: cmpT.size === 4 ? Math.fround(r) : r, ty: cmpT };
    }
    const rt = (op === '<<' || op === '>>') ? this.arithType(ta, TY.int) : cmpT;
    return { v: this.intOp(op, a.v, b.v, rt, line), ty: rt };
  };

  // ---------- lvalues ----------
  P.resolve = function (name) {
    const f = this.frames[this.frames.length - 1];
    if (f) {
      for (let i = f.scopes.length - 1; i >= 0; i--) { const b = f.scopes[i].vars.get(name); if (b) return { b }; }
      if (f.thisTy) {
        const fld = f.thisTy.fields.find(x => x.name === name);
        if (fld) return { field: fld };
      }
    }
    const g = this.globals.get(name);
    return g ? { b: g } : null;
  };

  P.evalL = function (n) {
    this.curLine = n.line || this.curLine;
    switch (n.k) {
      case 'id': {
        const r = this.resolve(n.name);
        if (!r) this.err(`'${n.name}' naam ka koi variable nahi mila (declare nahi kiya ya scope se bahar hai).`, n.line);
        if (r.field) return { addr: this.frame.thisAddr + r.field.off, ty: r.field.type };
        return { addr: r.b.addr, ty: r.b.type };
      }
      case 'unary':
        if (n.op === '*') {
          const p = this.evalR(n.e);
          if (p.ty.k !== 'ptr') this.err('* (dereference) sirf pointer par lag sakta hai.', n.line);
          if (p.ty.to.k === 'void') this.err('void* ko dereference nahi kar sakte — pehle usko kisi type ke pointer me cast karo.', n.line);
          if (p.v === 0) this.err('NULL pointer dereference! Pointer 0 (NULL) hai, us address par koi data nahi — Segmentation fault.', n.line);
          return { addr: p.v, ty: p.ty.to };
        }
        if (n.op === 'pre++' || n.op === 'pre--') { this.evalR(n); return this.evalL(n.e); }
        break;
      case 'index': {
        const b = this.evalR(n.e), i = this.evalR(n.i);
        if (b.ty.k === 'string') return { addr: b.lvAddr !== undefined ? b.lvAddr : this.evalL(n.e).addr, ty: TY.char, sidx: Math.trunc(i.v) };
        if (b.ty.k === 'vector') {
          const c = this.getCell(this.evalL(n.e).addr, n.line);
          return { addr: c.v.data + Math.trunc(i.v) * b.ty.of.size, ty: b.ty.of, vecIdx: Math.trunc(i.v), vsize: c.v.size };
        }
        if (b.ty.k !== 'ptr') this.err('[] sirf array/pointer/vector/string par lag sakta hai.', n.line);
        const es = Math.max(1, b.ty.to.size), idx = Math.trunc(i.v), addr = b.v + idx * es;
        this.checkBounds(b.v, addr, idx, n);
        return { addr, ty: b.ty.to };
      }
      case 'member': {
        let base;
        if (n.arrow) {
          const p = this.evalR(n.e);
          if (p.ty.k !== 'ptr') this.err("-> sirf pointer par lagta hai (object par . use karo).", n.line);
          if (p.v === 0) this.err(`NULL pointer dereference! Pointer NULL hai, isliye '->${n.name}' access nahi ho sakta (Segmentation fault).`, n.line);
          base = { addr: p.v, ty: p.ty.to };
        } else base = this.evalL(n.e);
        if (base.ty.k !== 'struct') this.err(`'.${n.name}' sirf struct/class par lagta hai.`, n.line);
        const f = base.ty.fields.find(x => x.name === n.name);
        if (!f) this.err(`'${base.ty.name}' me '${n.name}' naam ka member nahi hai.`, n.line);
        if (base.ty.isClass && f.access === 'private' && !(this.frame.thisTy === base.ty))
          this.err(`'${n.name}' private hai — class ke bahar se access nahi ho sakta.`, n.line);
        return { addr: base.addr + f.off, ty: f.type };
      }
      case 'this': return { addr: this.frame.thisAddr, ty: this.frame.thisTy };
      case 'assign': this.evalR(n); return this.evalL(n.l);
      case 'cond': return this.truthy(this.evalR(n.c)) ? this.evalL(n.a) : this.evalL(n.b);
      case 'call': {
        const r = this.evalCall(n, true);
        if (r && r.lv) return r.lv;
        break;
      }
    }
    this.err('Yahan ek variable (jisme value store ho sake) chahiye, expression nahi.', n.line);
  };

  P.checkBounds = function (base, addr, idx, n) {
    const bc = this.mem.get(base);
    if (!bc || !bc.al) return;
    const al = bc.al;
    if (addr < al.addr || addr >= al.addr + al.size) {
      const nm = al.region === 'heap' ? 'heap block' : `'${al.name}'`;
      const m = `⚠️ Index ${idx} ${nm} ki hadd se BAHAR hai! Ye undefined behaviour hai (kachra value ya crash).`;
      if (!this.notes.includes(m)) this.notes.push(m);
    }
  };

  // ---------- rvalues ----------
  P.evalR = function (n) {
    switch (n.k) {
      case 'num': {
        if (n.isFloat) return { v: n.v, ty: n.suffix.includes('f') ? TY.float : TY.double };
        if (n.suffix.includes('l')) return { v: n.v, ty: n.suffix.includes('u') ? TY.ulong : TY.long };
        if (n.v > 2147483647) return { v: n.v, ty: n.suffix.includes('u') ? TY.ulong : TY.long };
        return { v: n.v, ty: n.suffix.includes('u') ? TY.uint : TY.int };
      }
      case 'chr': return { v: n.v, ty: this.lang === 'cpp' ? TY.char : TY.int, isCh: true };
      case 'bool': return { v: n.v ? 1 : 0, ty: TY.bool };
      case 'null': return { v: 0, ty: CL.ptrTo(TY.void) };
      case 'str': return { v: this.strLiteral(n.v), ty: CL.ptrTo(TY.char), lit: n.v };
      case 'id': return this.evalId(n);
      case 'this': return { v: this.frame.thisAddr, ty: CL.ptrTo(this.frame.thisTy) };
      case 'sizeof': return { v: this.sizeOf(n), ty: TY.ulong };
      case 'initlist': this.err('{...} list yahan allowed nahi (sirf declaration me).', n.line); break;
      case 'cast': {
        const v = this.evalR(n.e);
        if (n.ty.k === 'ptr' || n.ty.k === 'int' || n.ty.k === 'float' || n.ty.k === 'bool') return { v: this.coerce(v, n.ty, n.line), ty: n.ty };
        return { v: v.v, ty: n.ty, data: v.data };
      }
      case 'unary': return this.evalUnary(n);
      case 'binary': return this.evalBinary(n);
      case 'assign': return this.evalAssign(n);
      case 'cond': return this.truthy(this.evalR(n.c)) ? this.evalR(n.a) : this.evalR(n.b);
      case 'index': case 'member': {
        if (n.k === 'member') {
          const bt = this.quietType(n.e);
          if (bt && (bt.k === 'string' || bt.k === 'vector')) this.err(`'${n.name}' ek function hai — usko call karne ke liye () lagao, jaise ${n.name}().`, n.line);
        }
        const lv = this.evalL(n);
        return this.readLV(lv, n.line);
      }
      case 'call': return this.evalCall(n);
      case 'new': return this.evalNew(n);
      case 'delete': return this.evalDelete(n);
      case 'construct': return this.evalConstruct(n);
    }
    this.err('Ye expression samajh nahi aayi: ' + n.k, n.line);
  };

  P.quietType = function (n) {
    this.quiet++;
    try { const lv = (n.k === 'id' || n.k === 'index' || n.k === 'member') ? this.evalL(n) : null; return lv ? lv.ty : this.evalR(n).ty; }
    catch (e) { return null; } finally { this.quiet--; }
  };

  P.sizeOf = function (n) {
    if (n.ty) return n.ty.size;
    const lv = (n.e.k === 'id' || n.e.k === 'index' || n.e.k === 'member' || (n.e.k === 'unary' && n.e.op === '*')) ? (() => { this.quiet++; try { return this.evalL(n.e); } finally { this.quiet--; } })() : null;
    if (lv) return lv.ty.size;
    this.quiet++;
    try { return this.evalR(n.e).ty.size; } finally { this.quiet--; }
  };

  P.evalId = function (n) {
    const r = this.resolve(n.name);
    if (!r) {
      if (this.prog.enums.has(n.name)) return { v: this.prog.enums.get(n.name), ty: TY.int };
      if (this.lang === 'cpp') {
        if (n.name === 'cout' || n.name === 'cerr') return { v: 0, ty: { k: 'ostream', size: 1 } };
        if (n.name === 'cin') return { v: 0, ty: { k: 'istream', size: 1 } };
        if (n.name === 'endl') return { v: '\n', ty: { k: 'manip', name: 'endl', size: 1 } };
        if (n.name === 'fixed' || n.name === 'boolalpha') return { v: n.name, ty: { k: 'manip', name: n.name, size: 1 } };
      }
      const consts = { INT_MAX: 2147483647, INT_MIN: -2147483648, RAND_MAX: 2147483647, EOF: -1, UINT_MAX: 4294967295, CHAR_BIT: 8, M_PI: Math.PI, LLONG_MAX: 9223372036854775807, LONG_MAX: 9223372036854775807 };
      if (n.name in consts) return { v: consts[n.name], ty: n.name === 'M_PI' ? TY.double : (n.name === 'UINT_MAX' ? TY.uint : (n.name.startsWith('L') ? TY.long : TY.int)) };
      if (this.funcs.has(n.name)) this.err(`'${n.name}' ek function hai — usko call karne ke liye () lagao.`, n.line);
      this.err(`'${n.name}' naam ka koi variable nahi mila (declare nahi kiya ya scope se bahar hai).`, n.line);
    }
    const lv = r.field ? { addr: this.frame.thisAddr + r.field.off, ty: r.field.type } : { addr: r.b.addr, ty: r.b.type };
    return this.readLV(lv, n.line);
  };

  P.evalUnary = function (n) {
    const op = n.op;
    if (op === '&') {
      const lv = this.evalL(n.e);
      if (lv.sidx !== undefined) this.err("string ke character ka address nahi le sakte.", n.line);
      return { v: lv.addr, ty: CL.ptrTo(lv.ty) };
    }
    if (op === '*') return this.readLV(this.evalL(n), n.line);
    if (op === '-' || op === '+') {
      const v = this.evalR(n.e);
      if (!isNum(v.ty)) this.err("Unary '" + op + "' sirf numbers par lagta hai.", n.line);
      const t = v.ty.k === 'float' ? v.ty : this.arithType(v.ty, TY.int);
      return { v: op === '-' ? (t.k === 'float' ? -v.v : CL.wrapInt(-v.v, t)) : v.v, ty: t };
    }
    if (op === '!') return { v: this.truthy(this.evalR(n.e)) ? 0 : 1, ty: this.lang === 'cpp' ? TY.bool : TY.int };
    if (op === '~') { const v = this.evalR(n.e); const t = this.arithType(v.ty, TY.int); return { v: CL.wrapInt(~v.v, t), ty: t }; }
    // ++ / --
    const lv = this.evalL(n.e);
    const cur = this.readLV(lv, n.line);
    const d = op.endsWith('++') ? 1 : -1;
    let nv;
    if (cur.ty.k === 'ptr') nv = { v: cur.v + d * Math.max(1, cur.ty.to.size), ty: cur.ty };
    else nv = this.binop('+', cur, { v: d, ty: TY.int }, n.line);
    this.store(lv, nv, n.line);
    return op.startsWith('pre') ? this.readLV(lv, n.line) : cur;
  };

  P.evalBinary = function (n) {
    const op = n.op;
    if (op === '&&') { const a = this.evalR(n.l); if (!this.truthy(a)) return { v: 0, ty: this.lang === 'cpp' ? TY.bool : TY.int }; return { v: this.truthy(this.evalR(n.r)) ? 1 : 0, ty: this.lang === 'cpp' ? TY.bool : TY.int }; }
    if (op === '||') { const a = this.evalR(n.l); if (this.truthy(a)) return { v: 1, ty: this.lang === 'cpp' ? TY.bool : TY.int }; return { v: this.truthy(this.evalR(n.r)) ? 1 : 0, ty: this.lang === 'cpp' ? TY.bool : TY.int }; }
    if (op === ',') { this.evalR(n.l); return this.evalR(n.r); }
    const a = this.evalR(n.l);
    if (this.lang === 'cpp' && (op === '<<' || op === '>>') && (a.ty.k === 'ostream' || a.ty.k === 'istream')) return this.streamOp(op, a, n);
    const b = this.evalR(n.r);
    const r = this.binop(op, a, b, n.line);
    if (this.lang === 'cpp' && r.ty === TY.int && /^(==|!=|<|>|<=|>=)$/.test(op)) r.ty = TY.bool;
    return r;
  };

  P.evalAssign = function (n) {
    if (n.r.k === 'initlist') { const lv0 = this.evalL(n.l); this.initObject(lv0.addr, lv0.ty, n.r, n.line); return this.readLV(lv0, n.line); }
    const rv = this.evalR(n.r);
    const lv = this.evalL(n.l);
    if (n.op === '=') { this.store(lv, rv, n.line); return this.readLV(lv, n.line); }
    const cur = this.readLV(lv, n.line);
    const res = this.binop(n.op.slice(0, -1), cur, rv, n.line);
    this.store(lv, res, n.line);
    return this.readLV(lv, n.line);
  };
})();
