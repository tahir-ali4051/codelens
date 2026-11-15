/* CodeLens — C/C++ tracing interpreter, part 1: memory, frames, snapshots */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  const { TY, CLError } = CL;

  const hex = (a) => '0x' + Math.floor(a).toString(16);
  CL.hex = hex;

  function fmtChar(c) {
    if (c === 0) return "'\\0'";
    if (c === 10) return "'\\n'";
    if (c === 9) return "'\\t'";
    if (c === 13) return "'\\r'";
    if (c === 32) return "' '";
    if (c < 32 || c > 126) return String(c);
    return "'" + String.fromCharCode(c) + "'";
  }
  function fmtFloat(v, ty) {
    if (!Number.isFinite(v)) return Number.isNaN(v) ? 'nan' : (v < 0 ? '-inf' : 'inf');
    let s = String(+v.toPrecision(ty && ty.size === 4 ? 7 : 15));
    if (/e/.test(s)) return s;
    if (!/\./.test(s)) s += '.0';
    return s;
  }
  CL.fmtChar = fmtChar;
  CL.fmtFloat = fmtFloat;

  function fmtVal(ty, v) {
    if (!ty) return String(v);
    switch (ty.k) {
      case 'int': return ty.isChar ? fmtChar(v) : String(v);
      case 'float': return fmtFloat(v, ty);
      case 'bool': return v ? 'true' : 'false';
      case 'ptr': return v === 0 ? 'NULL' : hex(v);
      case 'string': return '"' + v + '"';
      default: return String(v);
    }
  }
  CL.fmtVal = fmtVal;

  class Interp {
    constructor(prog, opts) {
      opts = opts || {};
      this.prog = prog;
      this.lang = opts.lang || 'c';
      this.stdin = opts.stdin || '';
      this.inPos = 0;
      this.record = opts.record !== false;
      this.maxSnaps = opts.maxSnaps || 4000;
      this.maxOps = opts.maxOps || 4e6;
      this.maxDepth = opts.maxDepth || 1000;
      this.ops = 0;
      this.mem = new Map();
      this.allocs = new Map();
      this.heapByAddr = new Map();
      this.live = [];
      this.nextId = 1;
      this.heapCount = 0;
      this.sp = 0x7ffe4000;
      this.hp = 0x55a3c2a0;
      this.gp = 0x00404040;
      this.rp = 0x00402010;
      this.dead = [];
      this.frames = [];
      this.globals = new Map();
      this.statics = new Map();
      this.strLits = new Map();
      this.funcs = new Map();
      this.out = '';
      this.snaps = [];
      this.truncated = false;
      this.changes = [];
      this.quiet = 0;
      this.notes = [];
      this.randState = 1;
      this.lastLine = 0;
      for (const f of prog.funcs) {
        if (!this.funcs.has(f.name)) this.funcs.set(f.name, []);
        this.funcs.get(f.name).push(f);
      }
    }

    err(msg, line) { throw new CLError('runtime', msg, line || this.curLine || 0); }
    tick() { if (++this.ops > this.maxOps) this.err('Program bahut zyada der chala (shayad infinite loop hai). Condition check karo — kya wo kabhi false hogi?'); }

    // ---------- memory ----------
    garbage(addr, ty) {
      const h = (Math.imul(addr, 2654435761) >>> 0);
      if (ty.k === 'ptr') return 0x7ffe00000000 + (h % 0xffff) * 8;
      if (ty.k === 'float') return (h % 20000) / 100 - 100;
      if (ty.k === 'bool') return 0;
      if (ty.isChar) return 33 + (h % 90);
      return (h % 200000) - 100000;
    }

    initCells(addr, ty, al, zero) {
      switch (ty.k) {
        case 'array': {
          const es = ty.of.size;
          for (let i = 0; i < ty.n; i++) this.initCells(addr + i * es, ty.of, al, zero);
          break;
        }
        case 'struct':
          for (const f of ty.fields) this.initCells(addr + f.off, f.type, al, zero);
          break;
        case 'string':
          this.mem.set(addr, { a: addr, ty, v: '', init: true, al });
          al.cells.push(addr);
          break;
        case 'vector':
          this.mem.set(addr, { a: addr, ty, v: { data: 0, size: 0, cap: 0 }, init: true, al });
          al.cells.push(addr);
          break;
        default:
          this.mem.set(addr, { a: addr, ty, v: zero ? 0 : this.garbage(addr, ty), init: !!zero, al });
          al.cells.push(addr);
      }
    }

    alloc(ty, region, name, opts) {
      opts = opts || {};
      const size = Math.max(1, ty.size);
      const al = { id: this.nextId++, name, region, type: ty, size, freed: false, cells: [], internal: !!opts.internal, line: this.curLine };
      const align = Math.max(1, Math.min(16, CL.alignOf(ty)));
      if (region === 'stack') {
        this.sp = Math.floor((this.sp - size) / align) * align;
        if (this.sp < 0x7ffe4000 - 8 * 1024 * 1024) this.err('Stack Overflow! Stack memory khatam ho gayi — recursion kabhi rukti nahi ya local array bahut bara hai.');
        al.addr = this.sp;
      } else if (region === 'heap') {
        al.addr = Math.ceil(this.hp / 16) * 16;
        this.hp = al.addr + Math.ceil(size / 16) * 16 + 16;
        al.n = ++this.heapCount;
      } else if (region === 'global') {
        this.gp = Math.ceil(this.gp / align) * align;
        al.addr = this.gp; this.gp += size;
      } else { // ro
        al.addr = this.rp; this.rp += Math.ceil(size / 8) * 8;
      }
      if (ty.k !== 'raw') this.initCells(al.addr, ty, al, opts.zero !== undefined ? opts.zero : region !== 'stack');
      if (opts.origin) al.origin = opts.origin;
      if (region === 'heap') this.heapByAddr.set(al.addr, al);
      this.allocs.set(al.id, al);
      this.live.push(al);
      if (region === 'ro') for (const a of al.cells) this.mem.get(a).ro = true;
      return al;
    }

    freeAlloc(al, why) {
      if (al.freed) return;
      al.freed = true;
      this.heapByAddr.delete(al.addr);
      for (const a of al.cells) this.mem.delete(a);
      const i = this.live.indexOf(al);
      if (i >= 0) this.live.splice(i, 1);
      this.dead.push({ lo: al.addr, hi: al.addr + al.size, why, name: al.name, region: al.region });
      if (this.dead.length > 400) this.dead.shift();
    }

    getCell(addr, line) {
      const c = this.mem.get(addr);
      if (c) return c;
      if (addr === 0) this.err('NULL pointer dereference! Pointer ki value 0 (NULL) hai, us address par koi data nahi — program crash (Segmentation fault).', line);
      for (let i = this.dead.length - 1; i >= 0; i--) {
        const d = this.dead[i];
        if (addr >= d.lo && addr < d.hi) {
          if (d.why === 'free') this.err('Use-after-free! Ye memory pehle free() / delete ho chuki hai, ab dobara use nahi kar sakte (undefined behaviour).', line);
          this.err(`Dangling pointer! '${d.name}' ka scope khatam ho chuka hai, uski stack memory ab valid nahi.`, line);
        }
      }
      this.err(`Invalid memory access (${hex(addr)}). Pointer kisi valid variable/array ko point nahi kar raha — wild pointer ya array ki hadd se bahar access (Segmentation fault).`, line);
    }

    writeCell(addr, v, line) {
      const c = this.getCell(addr, line);
      if (c.ro) this.err('Read-only memory me likhne ki koshish! String literal ("...") ko modify nahi kar sakte — char array use karo.', line);
      if (!this.quiet && this.record) this.changes.push({ addr, old: c.init ? c.v : undefined, ty: c.ty });
      c.v = v;
      c.init = true;
      if (!this.quiet && this.record) this.changes[this.changes.length - 1].nu = v;
      return c;
    }

    strLiteral(s) {
      let al = this.strLits.get(s);
      if (al && !al.freed) return al.addr;
      const ty = CL.arrOf(TY.char, s.length + 1);
      al = this.alloc(ty, 'ro', 'literal', { zero: true });
      for (let i = 0; i < s.length; i++) { const c = this.mem.get(al.addr + i); c.v = s.charCodeAt(i) & 0xff; }
      al.literal = s;
      this.strLits.set(s, al);
      return al.addr;
    }

    readCString(addr, line) {
      let s = '';
      for (let n = 0; n < 100000; n++) {
        const c = this.getCell(addr + n, line);
        if (c.v === 0) return s;
        s += String.fromCharCode(c.v & 0xff);
      }
      return s;
    }

    // ---------- frames & scopes ----------
    get frame() { return this.frames[this.frames.length - 1]; }

    pushFrame(name, fn) {
      if (this.frames.length >= this.maxDepth) this.err('Stack Overflow! Function bohat zyada baar khud ko call kar raha hai (recursion ka base case check karo).');
      const f = { name, fn, scopes: [], spStart: this.sp, line: this.curLine, thisAddr: 0, thisTy: null };
      this.frames.push(f);
      this.pushScope();
      return f;
    }
    popFrame() {
      const f = this.frames[this.frames.length - 1];
      while (f.scopes.length) this.popScope(true);
      this.frames.pop();
      this.sp = f.spStart;
    }
    pushScope() { this.frame.scopes.push({ vars: new Map(), sp0: this.sp }); }
    popScope(silent) {
      const f = this.frame;
      const sc = f.scopes.pop();
      const list = [...sc.vars.values()].reverse();
      for (const b of list) {
        if (b.isRef || !b.al) continue;
        if (b.type.k === 'struct' && b.type.dtor && !b.noDtor) this.callDtor(b.type, b.addr);
      }
      for (const b of list) {
        if (b.isRef || !b.al || b.region === 'global') continue;
        if (b.type.k === 'vector') this.vecFree(b.addr);
        this.freeAlloc(b.al, 'scope');
      }
      this.sp = sc.sp0;
      if (!silent && list.length && !f.hidden) this.notes.push(`Scope khatam: ${list.map(b => b.name).join(', ')} memory se hat gaye.`);
    }

    declareVar(name, ty, opts) {
      opts = opts || {};
      const sc = this.frame.scopes[this.frame.scopes.length - 1];
      const al = this.alloc(ty, 'stack', name, { zero: opts.zero });
      const b = { name, addr: al.addr, type: ty, al, region: 'stack' };
      sc.vars.set(name, b);
      return b;
    }

    lookupVar(name) {
      const f = this.frames[this.frames.length - 1];
      if (f) {
        for (let i = f.scopes.length - 1; i >= 0; i--) {
          const b = f.scopes[i].vars.get(name);
          if (b) return b;
        }
      }
      return this.globals.get(name) || null;
    }

    // ---------- snapshots ----------
    pathOf(addr) {
      for (const al of this.live) {
        if (addr >= al.addr && addr < al.addr + al.size) {
          let base = al.name;
          if (al.region === 'heap') base = `heap#${al.n}`;
          return base + this.subPath(al.type, addr - al.addr);
        }
      }
      return hex(addr);
    }
    subPath(ty, off) {
      if (ty.k === 'array') {
        const es = ty.of.size || 1, i = Math.floor(off / es);
        return `[${i}]` + this.subPath(ty.of, off - i * es);
      }
      if (ty.k === 'struct') {
        for (const f of ty.fields) if (off >= f.off && off < f.off + f.type.size) return '.' + f.name + this.subPath(f.type, off - f.off);
      }
      return '';
    }

    nodeAt(addr, ty, depth) {
      depth = depth || 0;
      switch (ty.k) {
        case 'array': {
          const n = ty.n, es = ty.of.size, shown = Math.min(n, 48);
          const items = [];
          for (let i = 0; i < shown; i++) items.push(this.nodeAt(addr + i * es, ty.of, depth + 1));
          const isStr = ty.of.isChar;
          return { k: 'array', ty: CL.typeName(ty), items, more: n - shown, n, addr: hex(addr), str: isStr };
        }
        case 'struct': {
          const fields = ty.fields.map(f => ({ name: f.name, node: this.nodeAt(addr + f.off, f.type, depth + 1) }));
          return { k: 'struct', ty: CL.typeName(ty), fields, addr: hex(addr) };
        }
        case 'string': {
          const c = this.mem.get(addr);
          return { k: 'string', id: 'm' + addr, text: c ? c.v : '', addr: hex(addr) };
        }
        case 'vector': {
          const c = this.mem.get(addr);
          const v = c ? c.v : { data: 0, size: 0, cap: 0 };
          const es = ty.of.size, shown = Math.min(v.cap, 48), items = [];
          for (let i = 0; i < shown; i++) {
            if (i < v.size) items.push(this.nodeAt(v.data + i * es, ty.of, depth + 1));
            else items.push({ k: 'empty' });
          }
          return { k: 'vec', id: 'm' + addr, ty: CL.typeName(ty), size: v.size, cap: v.cap, items, more: v.cap - shown, addr: hex(addr), data: v.data ? hex(v.data) : null };
        }
        default: {
          const c = this.mem.get(addr);
          if (!c) return { k: 'val', id: 'm' + addr, ty: CL.typeName(ty), text: '?', init: false, kind: ty.k };
          const node = { k: 'val', id: 'm' + addr, ty: CL.typeName(ty), kind: ty.k, init: c.init, addr: hex(addr) };
          if (!c.init) { node.text = '?'; node.garbage = fmtVal(c.ty, c.v); }
          else node.text = fmtVal(c.ty, c.v);
          if (ty.k === 'int' && ty.isChar && c.init) node.sub = String(c.v);
          if (ty.k === 'ptr') {
            node.raw = c.v;
            if (c.v === 0) node.null = true;
            else node.target = this.targetId(c.v);
            if (c.init && c.v !== 0 && !this.mem.has(c.v) && node.target === null) node.invalid = true;
          }
          return node;
        }
      }
    }

    targetId(addr) {
      const cell = this.mem.get(addr);
      if (!cell) return null;
      const al = cell.al;
      if (al && al.addr === addr && (al.type.k === 'struct' || al.type.k === 'array') && !al.internal) return 'c' + addr;
      return 'm' + addr;
    }

    bindingNode(b) {
      if (b.isRef) {
        const tc = this.mem.get(b.addr);
        return { k: 'ref', ty: CL.typeName(b.type) + '&', target: tc ? this.targetId(b.addr) : null, text: tc ? this.path(b.addr) : '?', val: tc ? this.nodeAt(b.addr, b.type) : null };
      }
      const n = this.nodeAt(b.addr, b.type);
      n.cid = 'c' + b.addr;
      return n;
    }
    path(addr) { return this.pathOf(addr); }

    frameView(f, idx) {
      const vars = [];
      for (const sc of f.scopes) for (const b of sc.vars.values()) {
        if (b.hidden) continue;
        vars.push({ name: b.name, node: this.bindingNode(b) });
      }
      return { name: f.name, line: f.line, vars, idx, thisId: f.thisAddr ? 'c' + f.thisAddr : null, thisAddr: f.thisAddr ? hex(f.thisAddr) : null };
    }

    snap(line, note, extra) {
      if (!this.record) return;
      if (this.snaps.length >= this.maxSnaps) { this.truncated = true; this.changes.length = 0; this.notes.length = 0; return; }
      const frames = this.frames.filter(f => !f.hidden).map((f, i) => this.frameView(f, i));
      const globals = [];
      for (const b of this.globals.values()) if (!b.hidden) globals.push({ name: b.name, node: this.bindingNode(b) });
      const heap = [], ro = [];
      const refd = new Set();
      for (const c of this.mem.values()) if (c.ty.k === 'ptr' && c.v) {
        const t = this.mem.get(c.v);
        if (t && t.al) refd.add(t.al.id);
      }
      for (const al of this.live) {
        if (al.internal) continue;
        if (al.region === 'heap') heap.push({ id: 'c' + al.addr, label: `heap #${al.n}`, origin: al.origin || '', ty: al.type.k === 'raw' ? 'untyped' : CL.typeName(al.type), size: al.size, addr: hex(al.addr), node: al.type.k === 'raw' ? { k: 'raw', bytes: al.size } : this.nodeAt(al.addr, al.type), leaked: !!extra && !!extra.final });
        else if (al.region === 'ro' && refd.has(al.id)) ro.push({ id: 'c' + al.addr, text: al.literal, addr: hex(al.addr), node: this.nodeAt(al.addr, al.type) });
      }
      let text = note || '';
      const ch = this.describeChanges();
      if (ch) text += (text ? ' ' : '') + ch;
      if (this.notes.length) text += ' ' + this.notes.join(' ');
      this.notes.length = 0;
      if (this.out.length > (this.prevOut || 0)) {
        const chunk = this.out.slice(this.prevOut || 0);
        const shown = chunk.length > 60 ? chunk.slice(0, 57) + '…' : chunk;
        text += (text ? ' ' : '') + '🖨️ Screen par aaya: "' + shown.replace(/\n/g, '↵') + '"';
      }
      this.prevOut = this.out.length;
      const s = { line, note: text.trim(), outLen: this.out.length, frames, globals, heap, ro };
      if (extra) Object.assign(s, extra);
      this.snaps.push(s);
      this.lastLine = line;
    }

    describeChanges() {
      if (!this.changes.length) return '';
      const map = new Map();
      for (const c of this.changes) {
        const m = map.get(c.addr);
        if (m) m.nu = c.nu; else map.set(c.addr, { addr: c.addr, old: c.old, nu: c.nu, ty: c.ty });
      }
      this.changes.length = 0;
      const parts = [];
      for (const m of map.values()) {
        const p = this.pathOf(m.addr);
        if (m.old === m.nu && m.old !== undefined) continue;
        const nv = CL.fmtVal(m.ty, m.nu);
        parts.push(m.old === undefined ? `${p} = ${nv}` : `${p}: ${CL.fmtVal(m.ty, m.old)} → ${nv}`);
        if (parts.length >= 4) { parts.push('…'); break; }
      }
      return parts.length ? 'Badlaav: ' + parts.join(', ') + '.' : '';
    }

    // ---------- run ----------
    run() {
      let error = null, exit = 0;
      try {
        this.curLine = 1;
        const mains = this.funcs.get('main');
        if (!mains) throw new CLError('compile', 'main() function nahi mila — program main() se shuru hota hai.', 1);
        // globals
        this.pushFrame('<globals>', null);
        this.frames.pop();
        this.snap(0, 'Program shuru hua. Abhi koi variable nahi hai.');
        this.initGlobals();
        const margs = [];
        if (mains[0].params.length >= 1) margs.push({ rv: { v: 1, ty: TY.int } });
        if (mains[0].params.length >= 2) {
          const arr = this.alloc(CL.arrOf(CL.ptrTo(TY.char), 2), 'global', 'argv', { zero: true });
          this.mem.get(arr.addr).v = this.strLiteral('./program');
          margs.push({ rv: { v: arr.addr, ty: CL.ptrTo(CL.ptrTo(TY.char)) } });
        }
        const r = this.callUser(mains[0], margs, null, mains[0].line, 'OS');
        exit = r && typeof r.v === 'number' ? r.v : 0;
        this.curLine = this.lastLine;
        const leaks = this.live.filter(a => a.region === 'heap' && !a.internal);
        const bytes = leaks.reduce((s, a) => s + a.size, 0);
        let note = `main() khatam hua (exit code ${exit}). Program poora chal gaya.`;
        if (leaks.length) note += ` ⚠️ MEMORY LEAK: ${leaks.length} heap block(s) (${bytes} bytes) free() nahi hue!`;
        else if (this.heapCount) note += ' ✅ Saari heap memory free ho chuki hai — koi leak nahi.';
        this.snap(this.lastLine, note, { final: true, leak: leaks.length > 0 });
      } catch (e) {
        if (e instanceof CLError) {
          error = { kind: e.kind, msg: e.message, line: e.line };
          if (this.record && this.frames.length) {
            this.changes.length = 0; this.notes.length = 0;
            const saveMax = this.maxSnaps; this.maxSnaps += 1;
            this.snap(e.line || this.lastLine, '💥 ' + e.message, { error: true });
            this.maxSnaps = saveMax;
          }
        } else if (e instanceof RangeError) {
          error = { kind: 'runtime', msg: 'Stack Overflow! Recursion bahut gehri ho gayi.', line: this.lastLine };
        } else if (e && e.__exit !== undefined) {
          exit = e.__exit;
        } else throw e;
      }
      return { steps: this.snaps, out: this.out, error, truncated: this.truncated, exit };
    }
  }
  CL.Interp = Interp;

  CL.runCode = function (src, lang, stdin, opts) {
    let prog;
    try { prog = CL.parse(src, lang); }
    catch (e) {
      if (e instanceof CLError) return { steps: [], out: '', error: { kind: 'compile', msg: e.message, line: e.line }, truncated: false };
      throw e;
    }
    const it = new CL.Interp(prog, Object.assign({ lang, stdin }, opts || {}));
    const res = it.run();
    res.src = src;
    return res;
  };
})();
