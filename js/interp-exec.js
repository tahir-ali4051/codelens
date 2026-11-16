/* CodeLens — interpreter part 3: statements, declarations, calls, new/delete */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  const { TY } = CL;
  const P = CL.Interp.prototype;
  const fv = CL.fmtVal;

  // ---------- explain an expression with live values ----------
  P.pure = function (n) {
    if (!n || typeof n !== 'object') return true;
    switch (n.k) {
      case 'assign': case 'call': case 'new': case 'delete': case 'construct': return false;
      case 'unary': if (/\+\+|--/.test(n.op)) return false; return this.pure(n.e);
      case 'binary': return this.pure(n.l) && this.pure(n.r);
      case 'index': return this.pure(n.e) && this.pure(n.i);
      case 'member': return this.pure(n.e);
      case 'cast': return this.pure(n.e);
      case 'cond': return this.pure(n.c) && this.pure(n.a) && this.pure(n.b);
      default: return true;
    }
  };
  P.ex = function (n, top) {
    switch (n.k) {
      case 'num': return String(n.v);
      case 'chr': return CL.fmtChar(n.v);
      case 'str': return JSON.stringify(n.v);
      case 'bool': return n.v ? 'true' : 'false';
      case 'null': return 'NULL';
      case 'id': case 'index': case 'member': case 'this': {
        this.quiet++;
        try {
          const rv = this.evalR(n);
          if (rv.arr || rv.ty.k === 'struct' || rv.ty.k === 'vector') return n.name || '…';
          return fv(rv.ty, rv.v);
        } catch (e) { return '?'; } finally { this.quiet--; }
      }
      case 'unary': {
        if (n.op === '*') { this.quiet++; try { const rv = this.evalR(n); return fv(rv.ty, rv.v); } catch (e) { return '*?'; } finally { this.quiet--; } }
        return n.op + this.ex(n.e);
      }
      case 'binary': { const s = this.ex(n.l) + ' ' + n.op + ' ' + this.ex(n.r); return top ? s : '(' + s + ')'; }
      case 'cast': return this.ex(n.e);
    }
    return '…';
  };
  P.explain = function (n) {
    if (!n || !this.pure(n)) return '';
    const s = this.ex(n, true);
    return s.replace(/\s+/g, '') === (n.src || '').replace(/\s+/g, '') ? '' : s;
  };

  // ---------- globals ----------
  P.initGlobals = function () {
    this.pushFrame('<globals>', null);
    this.frame.hidden = true;
    for (const g of this.prog.globals) this.execDecl(g, 'global');
    this.frames.pop();
    this.sp = 0x7ffe4000;
    if (this.prog.globals.length) this.snap(this.prog.globals[this.prog.globals.length - 1].line, CL.t(`Global variables created (they are available in the whole program and live in "Global" memory).`, 'Global variables bane (ye poore program me available hain, "Global" memory me rehte hain).'));
  };

  // ---------- statements ----------
  P.execBlock = function (stmts) {
    this.pushScope();
    let sig;
    for (const s of stmts) { sig = this.exec(s); if (sig) break; }
    this.popScope();
    return sig;
  };
  P.execBody = function (s) {
    if (s.k === 'block') return this.execBlock(s.body);
    return this.exec(s);
  };

  P.exec = function (s) {
    this.tick();
    this.curLine = s.line;
    if (this.frame) this.frame.line = s.line;
    switch (s.k) {
      case 'block': return this.execBlock(s.body);
      case 'empty': return;
      case 'decl': this.execDecl(s, 'stack'); return;
      case 'expr': {
        const rv = this.evalR(s.e);
        let note = '';
        if (s.e.k === 'call' && !this.changes.length && !this.notes.length) note = '';
        this.snap(s.line, note);
        return;
      }
      case 'if': {
        const c = this.evalR(s.c), t = this.truthy(c), x = this.explain(s.c);
        this.snap(s.line, CL.t(`Condition (${s.c.src})${x ? ' → ' + x : ''} → ${t ? 'TRUE ✅ — the if block will run.' : 'FALSE ❌ — ' + (s.b ? 'the else block will run.' : 'the if block is skipped.')}`, `Condition (${s.c.src})${x ? ' → ' + x : ''} → ${t ? 'TRUE ✅ — if ka block chalega.' : 'FALSE ❌ — ' + (s.b ? 'else ka block chalega.' : 'if ka block skip hoga.')}`));
        if (t) return this.execBody(s.a);
        if (s.b) return this.execBody(s.b);
        return;
      }
      case 'while': case 'dowhile': {
        let iter = 0;
        const isDo = s.k === 'dowhile';
        for (;;) {
          if (!(isDo && iter === 0)) {
            this.curLine = s.line;
            const c = this.evalR(s.c), t = this.truthy(c), x = this.explain(s.c);
            this.snap(s.line, CL.t(`Loop condition (${s.c.src})${x ? ' → ' + x : ''} → ${t ? `TRUE ✅ — loop round #${iter + 1} will run.` : 'FALSE ❌ — the loop ends.'}`, `Loop condition (${s.c.src})${x ? ' → ' + x : ''} → ${t ? `TRUE ✅ — loop #${iter + 1} chalega.` : 'FALSE ❌ — loop khatam.'}`));
            if (!t) break;
          }
          iter++;
          const sig = this.execBody(s.body);
          if (sig) { if (sig.t === 'break') break; if (sig.t === 'return') return sig; }
          if (isDo && iter > 0) {
            const c = this.evalR(s.c), t = this.truthy(c), x = this.explain(s.c);
            this.snap(s.line, CL.t(`do-while condition (${s.c.src})${x ? ' → ' + x : ''} → ${t ? 'TRUE ✅ — the loop runs again.' : 'FALSE ❌ — the loop ends.'}`, `do-while condition (${s.c.src})${x ? ' → ' + x : ''} → ${t ? 'TRUE ✅ — loop dobara chalega.' : 'FALSE ❌ — loop khatam.'}`));
            if (!t) break;
          }
        }
        return;
      }
      case 'for': {
        this.pushScope();
        if (s.init) {
          if (s.init.k === 'decl') this.execDecl(s.init, 'stack', true); else { this.evalR(s.init.e); }
          this.snap(s.line, CL.t(`Loop start: the initialization (${s.init.src}) ran once.`, `Loop shuru: initialization (${s.init.src}) ek baar chali.`));
        }
        let iter = 0, ret;
        for (;;) {
          this.curLine = s.line;
          if (s.c) {
            const c = this.evalR(s.c), t = this.truthy(c), x = this.explain(s.c);
            this.snap(s.line, CL.t(`Condition (${s.c.src})${x ? ' → ' + x : ''} → ${t ? `TRUE ✅ — iteration #${iter + 1} will run.` : 'FALSE ❌ — the loop ends.'}`, `Condition (${s.c.src})${x ? ' → ' + x : ''} → ${t ? `TRUE ✅ — iteration #${iter + 1} chalegi.` : 'FALSE ❌ — loop khatam.'}`));
            if (!t) break;
          }
          iter++;
          const sig = this.execBody(s.body);
          if (sig) { if (sig.t === 'break') break; if (sig.t === 'return') { ret = sig; break; } }
          if (s.step) { this.curLine = s.line; this.evalR(s.step); this.snap(s.line, CL.t(`Step (${s.step.src}) ran.`, `Step (${s.step.src}) chala.`)); }
        }
        this.popScope();
        return ret;
      }
      case 'rfor': return this.execRangeFor(s);
      case 'switch': {
        const v = this.evalR(s.e);
        let start = -1;
        for (let i = 0; i < s.cases.length; i++) {
          if (s.cases[i].test) { const t = this.evalR(s.cases[i].test); if (t.v == v.v) { start = i; break; } }
        }
        if (start < 0) start = s.cases.findIndex(c => !c.test);
        this.snap(s.line, CL.t(`The value of switch (${s.e.src}) is ${fv(v.ty, v.v)} → ${start < 0 ? 'no case matched.' : (s.cases[start].test ? 'jump to the matching case.' : 'jump to default.')}`, `switch (${s.e.src}) ki value ${fv(v.ty, v.v)} hai → ${start < 0 ? 'koi case match nahi hua.' : (s.cases[start].test ? 'matching case par jump.' : 'default par jump.')}`));
        if (start < 0) return;
        this.pushScope();
        let sig;
        outer: for (let i = start; i < s.cases.length; i++) {
          for (const st of s.cases[i].body) { sig = this.exec(st); if (sig) break outer; }
        }
        this.popScope();
        if (sig && sig.t === 'break') return;
        return sig;
      }
      case 'break': this.snap(s.line, CL.t(`break: leave the loop/switch immediately.`, 'break: loop/switch se foran bahar.')); return { t: 'break' };
      case 'continue': this.snap(s.line, CL.t(`continue: skip the rest of this iteration.`, 'continue: is iteration ka baaki code skip.')); return { t: 'continue' };
      case 'return': return this.execReturn(s);
    }
    this.err(CL.t(`This statement is not supported: ${s.k}`, 'Ye statement supported nahi: ' + s.k), s.line);
  };

  P.execReturn = function (s) {
    const f = this.frame, fn = f.fn;
    let val = null, note = '';
    if (s.e) {
      if (fn.ret.k === 'ref') {
        const lv = this.evalL(s.e);
        val = { lv, ty: fn.ret.to, v: 0 };
        note = CL.t(`return — a reference is returned.`, `return — reference wapas gaya.`);
      } else if (fn.ret.k === 'void' || fn.isCtor) {
        this.evalR(s.e);
      } else {
        const rv = this.evalR(s.e);
        const d = this.coerce(rv, fn.ret, s.line);
        val = (fn.ret.k === 'struct' || fn.ret.k === 'vector') ? { ty: fn.ret, data: d } : { v: d, ty: fn.ret };
        if (fn.ret.k === 'ptr' && d !== 0) {
          const cell = this.mem.get(d);
          if (cell && cell.al && cell.al.region === 'stack' && d >= this.sp && d < f.spStart + 4096 && !cell.al.freed)
            this.notes.push(CL.t(`⚠️ WARNING: '${cell.al.name}' is a local variable — its address is being returned, but this memory becomes invalid as soon as the function ends (dangling pointer)!`, `⚠️ DHYAN: '${cell.al.name}' local variable hai — uska address return ho raha hai, lekin function khatam hote hi ye memory invalid ho jayegi (dangling pointer)!`));
        }
        const shown = fn.ret.k === 'struct' ? 'struct' : fn.ret.k === 'vector' ? 'vector' : fv(fn.ret, d);
        note = CL.t(`return ${shown}: ${f.name === 'main' ? 'the exit code of the program' : 'this value goes back to the caller'}. The stack frame of this function will now be removed.`, `return ${shown}: ${f.name === 'main' ? 'program ka exit code' : 'ye value caller ko wapas milegi'}. Ab ye function ka stack frame hat jayega.`);
      }
    } else note = CL.t(`return: the function ends here.`, 'return: function yahin khatam.');
    this.snap(s.line, note);
    return { t: 'return', val };
  };

  P.execRangeFor = function (s) {
    this.pushScope();
    const collLV = (s.coll.k === 'id' || s.coll.k === 'member' || s.coll.k === 'index') ? this.evalL(s.coll) : null;
    let ty = collLV ? collLV.ty : this.evalR(s.coll).ty;
    let n = 0, get;
    if (ty.k === 'array') { n = ty.n; get = (i) => ({ addr: collLV.addr + i * ty.of.size, ty: ty.of }); }
    else if (ty.k === 'vector') { get = (i) => { const c = this.getCell(collLV.addr).v; return { addr: c.data + i * ty.of.size, ty: ty.of }; }; n = () => this.getCell(collLV.addr).v.size; }
    else if (ty.k === 'string') { n = () => this.getCell(collLV.addr).v.length; get = (i) => ({ addr: collLV.addr, ty: TY.char, sidx: i }); }
    else this.err(CL.t(`Range-for works only on arrays, vectors and strings.`, 'Range-for sirf array, vector ya string par chal sakta hai.'), s.line);
    let ret;
    for (let i = 0; i < (typeof n === 'function' ? n() : n); i++) {
      this.tick();
      this.pushScope();
      const el = get(i);
      const isRef = s.ty.k === 'ref';
      let vt = s.ty.k === 'ref' ? s.ty.to : s.ty;
      if (vt.k === 'auto') vt = el.ty;
      if (isRef && el.sidx === undefined) {
        this.frame.scopes[this.frame.scopes.length - 1].vars.set(s.name, { name: s.name, addr: el.addr, type: vt, isRef: true });
      } else {
        const b = this.declareVar(s.name, vt, { zero: true });
        this.store({ addr: b.addr, ty: vt }, this.readLV(el, s.line), s.line);
      }
      this.snap(s.line, CL.t(`Range-for iteration #${i + 1}: '${s.name}' is now ${isRef ? 'an alias (reference) of the element' : 'a copy of the element'}.`, `Range-for iteration #${i + 1}: '${s.name}' ab ${isRef ? 'element ka alias (reference)' : 'element ki copy'} hai.`));
      const sig = this.execBody(s.body);
      this.popScope();
      if (sig) { if (sig.t === 'break') break; if (sig.t === 'return') { ret = sig; break; } }
    }
    this.snap(s.line, CL.t(`Range-for finished.`, 'Range-for khatam.'));
    this.popScope();
    return ret;
  };

  // ---------- declarations ----------
  P.zeroFill = function (addr, ty) {
    switch (ty.k) {
      case 'array': for (let i = 0; i < ty.n; i++) this.zeroFill(addr + i * ty.of.size, ty.of); break;
      case 'struct': for (const f of ty.fields) this.zeroFill(addr + f.off, f.type); break;
      case 'string': case 'vector': break;
      default: { const c = this.mem.get(addr); if (c) { c.v = 0; c.init = true; } }
    }
  };

  P.initObject = function (addr, ty, list, line) {
    if (ty.k === 'array') {
      this.zeroFill(addr, ty);
      if (list.items.length > ty.n) this.err(CL.t(`The array has room for only ${ty.n} elements but ${list.items.length} values were given.`, `Array me sirf ${ty.n} elements ki jagah hai, lekin ${list.items.length} values di gayi.`), line);
      list.items.forEach((it, i) => {
        const ea = addr + i * ty.of.size;
        if (it.k === 'initlist') this.initObject(ea, ty.of, it, line);
        else if (ty.of.k === 'array' || ty.of.k === 'struct') this.err(CL.t(`A nested initializer needs {} braces.`, 'Nested initializer ke liye {} braces chahiye.'), line);
        else this.store({ addr: ea, ty: ty.of }, this.evalR(it), line);
      });
    } else if (ty.k === 'struct') {
      this.zeroFill(addr, ty);
      let pos = 0;
      for (const it of list.items) {
        let f;
        if (it.k === 'desig') { f = ty.fields.find(x => x.name === it.name); if (!f) this.err(CL.t(`There is no member named '${it.name}'.`, `'${it.name}' naam ka member nahi hai.`), line); }
        else f = ty.fields[pos++];
        if (!f) this.err(CL.t(`The struct does not have as many members as the values given.`, 'Struct me itne members nahi hain jitni values di gayi.'), line);
        const e = it.k === 'desig' ? it.e : it;
        if (e.k === 'initlist') this.initObject(addr + f.off, f.type, e, line);
        else this.store({ addr: addr + f.off, ty: f.type }, this.evalR(e), line);
      }
    } else if (ty.k === 'vector') {
      const items = list.items.map(it => this.coerce(this.evalR(it), ty.of, line));
      this.vecAssign(addr, ty, items, line);
    } else if (list.items.length) this.store({ addr, ty }, this.evalR(list.items[0]), line);
    else this.zeroFill(addr, ty);
  };

  P.execDecl = function (s, region, quietSnap) {
    const names = [];
    for (const d of s.declarators) {
      if (d.isStatic && region === 'stack') {
        const key = d;
        if (!this.statics) this.statics = new Map();
        const ex = this.statics.get(key);
        if (ex) { this.frame.scopes[this.frame.scopes.length - 1].vars.set(d.name, ex); continue; }
      }
      this.declareOne(d, d.isStatic && region === 'stack' ? 'static' : region);
      names.push(d);
    }
    if (!quietSnap && region !== 'global') this.snap(s.line, this.declNote(names));
  };

  P.declNote = function (ds) {
    if (!ds.length) return '';
    return ds.map(d => {
      const b = this.lookupVar(d.name);
      if (!b) return '';
      const ty = b.type;
      if (b.isRef) return CL.t(`'${d.name}' is a reference (alias) — another name for another variable, no new memory was made.`, `'${d.name}' ek reference (alias) hai — dusre variable ka doosra naam, naya memory nahi bana.`);
      if (ty.k === 'array') return CL.t(`Array '${d.name}' created: ${ty.n} elements × ${ty.of.size} bytes = ${ty.size} bytes, one after another in continuous memory.${d.init ? '' : ' The values are not initialized (garbage ?).'}`, `Array '${d.name}' bana: ${ty.n} elements × ${ty.of.size} bytes = ${ty.size} bytes, ek ke baad ek continuous memory me.${d.init ? '' : ' Values initialize nahi hui (kachra ?).'}`);
      if (ty.k === 'struct') return CL.t(`'${d.name}' (${CL.typeName(ty)}) created — ${ty.size} bytes, the members are kept together in memory.`, `'${d.name}' (${CL.typeName(ty)}) bana — ${ty.size} bytes, members memory me ek saath rakhe gaye.`);
      if (ty.k === 'ptr') return CL.t(`'${d.name}' is a pointer (8 bytes) — it stores the address of some other memory.${d.init ? '' : ' Right now it holds a garbage (wild) address!'}`, `'${d.name}' ek pointer hai (8 bytes) — ye kisi aur memory ka address store karta hai.${d.init ? '' : ' Abhi ye kachra (wild) address rakhta hai!'}`);
      if (d.init || d.ctorArgs) return CL.t(`'${d.name}' (${CL.typeName(ty)}, ${ty.size} bytes) created and given a value.`, `'${d.name}' (${CL.typeName(ty)}, ${ty.size} bytes) bana aur value mili.`);
      return CL.t(`'${d.name}' (${CL.typeName(ty)}, ${ty.size} bytes) created, but no value was given — it holds garbage.`, `'${d.name}' (${CL.typeName(ty)}, ${ty.size} bytes) bana, lekin koi value nahi di — isme kachra (garbage) hai.`);
    }).filter(Boolean).join(' ');
  };

  P.declareOne = function (d, region) {
    let ty = d.ty;
    const line = d.line;
    // deduce / resolve sizes
    if (ty.k === 'ref') {
      if (!d.init) this.err(CL.t(`A reference must be bound to a variable when it is created.`, 'Reference ko banate waqt hi kisi variable se bind karna zaroori hai.'), line);
      const lv = this.evalL(d.init);
      const sc = this.frame.scopes[this.frame.scopes.length - 1];
      sc.vars.set(d.name, { name: d.name, addr: lv.addr, type: ty.to.k === 'auto' ? lv.ty : ty.to, isRef: true });
      return;
    }
    let initRv = null;
    if (ty.k === 'auto') {
      if (!d.init) this.err(CL.t(`An 'auto' variable needs an initial value to find out its type.`, "'auto' variable ko type pata karne ke liye initial value chahiye."), line);
      initRv = this.evalR(d.init);
      ty = initRv.ty.k === 'ostream' ? TY.int : initRv.ty;
      if (initRv.arr) ty = CL.ptrTo(initRv.arr.of);
    } else if (ty.k === 'array') {
      let t = ty;
      if (t.n === null) {
        if (t.dimExpr) {
          const nv = this.evalR(t.dimExpr).v;
          if (!(nv > 0)) this.err(CL.t(`The array size must be positive (got: ${nv}).`, `Array ka size positive hona chahiye (mila: ${nv}).`), line);
          t = CL.arrOf(t.of, Math.trunc(nv));
        } else if (d.init && d.init.k === 'initlist') t = CL.arrOf(t.of, d.init.items.length);
        else if (d.init && d.init.k === 'str') t = CL.arrOf(t.of, d.init.v.length + 1);
        else this.err(CL.t(`The array size must be written (or initialize it with {..}).`, 'Array ka size likhna zaroori hai (ya {..} se initialize karo).'), line);
        ty = t;
      }
    }
    let b;
    if (region === 'global') {
      const al = this.alloc(ty, 'global', d.name, { zero: true });
      b = { name: d.name, addr: al.addr, type: ty, al, region: 'global' };
      this.globals.set(d.name, b);
    } else if (region === 'static') {
      const al = this.alloc(ty, 'global', d.name + ' (static)', { zero: true });
      b = { name: d.name, addr: al.addr, type: ty, al, region: 'global' };
      this.statics.set(d, b);
      this.frame.scopes[this.frame.scopes.length - 1].vars.set(d.name, b);
    } else {
      b = this.declareVar(d.name, ty, { zero: false });
    }
    const lv = { addr: b.addr, ty };
    // initialization
    if (d.ctorArgs) { this.constructAt(b.addr, ty, d.ctorArgs, line); return; }
    if (d.init) {
      if (d.init.k === 'initlist') {
        if (ty.k === 'struct' && ty.ctors.length) this.callCtor(ty, b.addr, d.init.items, line);
        else this.initObject(b.addr, ty, d.init, line);
      }
      else if (ty.k === 'array' && ty.of.isChar && d.init.k === 'str') {
        if (d.init.v.length + 1 > ty.n) this.err(CL.t(`The string "${d.init.v}" does not fit in the array (it needs ${d.init.v.length + 1} bytes, the array has ${ty.n}).`, `String "${d.init.v}" array me fit nahi hoti (${d.init.v.length + 1} bytes chahiye, array ${ty.n} ka hai).`), line);
        const s = d.init.v;
        for (let i = 0; i < ty.n; i++) this.writeCell(b.addr + i, i < s.length ? s.charCodeAt(i) & 0xff : 0, line);
      } else if (ty.k === 'struct' && ty.ctors.length && d.init.k !== 'call' && d.init.k !== 'id' && d.init.k !== 'member') {
        this.callCtor(ty, b.addr, [d.init], line);
      } else {
        const rv = initRv || this.evalR(d.init);
        this.store(lv, rv, line);
      }
      return;
    }
    // no initializer
    if (ty.k === 'struct') {
      const dc = ty.ctors.find(c => c.params.length === 0 || c.params.every(p => p.def));
      if (dc) this.callCtor(ty, b.addr, [], line);
      else if (region !== 'stack') this.zeroFill(b.addr, ty);
    }
  };

  // C++: T x(args) / T x{args}
  P.constructAt = function (addr, ty, args, line) {
    if (ty.k === 'struct') {
      if (ty.ctors.length) this.callCtor(ty, addr, args, line);
      else this.initObject(addr, ty, { k: 'initlist', items: args }, line);
    } else if (ty.k === 'vector') {
      if (args.length === 0) return;
      const a0 = this.evalR(args[0]);
      if (a0.ty.k === 'vector') { this.vecAssign(addr, ty, a0.data.items, line); return; }
      const n = Math.trunc(a0.v);
      if (n < 0) this.err(CL.t(`A vector size cannot be negative.`, 'vector ka size negative nahi ho sakta.'), line);
      const fill = args[1] ? this.coerce(this.evalR(args[1]), ty.of, line) : this.defaultData(ty.of);
      this.vecAssign(addr, ty, Array.from({ length: n }, () => this.cloneData(fill)), line);
    } else if (ty.k === 'string') {
      if (args.length === 0) return;
      const a0 = this.evalR(args[0]);
      if (args.length === 2) { this.writeCell(addr, String.fromCharCode(this.evalR(args[1]).v).repeat(Math.max(0, a0.v)), line); return; }
      this.writeCell(addr, this.coerce(a0, TY.string, line), line);
    } else {
      this.store({ addr, ty }, this.evalR(args[0]), line);
    }
  };
  P.cloneData = function (d) { return typeof d === 'object' && d !== null ? JSON.parse(JSON.stringify(d)) : d; };
  P.defaultData = function (ty) {
    switch (ty.k) {
      case 'struct': return ty.fields.map(f => this.defaultData(f.type));
      case 'array': return Array.from({ length: ty.n }, () => this.defaultData(ty.of));
      case 'vector': return { items: [] };
      case 'string': return '';
      default: return 0;
    }
  };

  // ---------- functions ----------
  P.argStr = function (args) {
    return args.map(a => a.lv ? '&' + this.pathOf(a.lv.addr) : (a.rv.ty.k === 'struct' ? 'struct' : a.rv.ty.k === 'vector' ? 'vector' : fv(a.rv.ty, a.rv.v))).join(', ');
  };

  P.evalArgs = function (params, argNodes, line) {
    return argNodes.map((a, i) => {
      const p = params[i];
      if (p && p.ty.k === 'ref') return { lv: this.evalL(a) };
      return { rv: this.evalR(a) };
    });
  };

  P.pickOverload = function (cands, argNodes, name, line) {
    let c = cands.filter(f => f.params.length === argNodes.length || (f.params.length > argNodes.length && f.params.slice(argNodes.length).every(p => p.def) ) || (f.params.variadic && argNodes.length >= f.params.length));
    if (!c.length) {
      const f = cands[0];
      this.err(CL.t(`'${name}' was given ${argNodes.length} arguments but it needs ${f.params.length}.`, `'${name}' ko ${argNodes.length} arguments diye gaye, lekin wo ${f.params.length} chahta hai.`), line);
    }
    if (c.length === 1) return c[0];
    // score by types
    const tys = argNodes.map(a => this.quietType(a));
    let best = c[0], bs = -1;
    for (const f of c) {
      let sc = 0;
      f.params.forEach((p, i) => {
        const t = tys[i]; if (!t) return;
        const pt = p.ty.k === 'ref' ? p.ty.to : p.ty;
        if (CL.typeName(pt) === CL.typeName(t)) sc += 3;
        else if (pt.k === t.k) sc += 2;
        else if ((pt.k === 'int' || pt.k === 'float' || pt.k === 'bool') && (t.k === 'int' || t.k === 'float' || t.k === 'bool')) sc += 1;
      });
      if (sc > bs) { bs = sc; best = f; }
    }
    return best;
  };

  P.callUser = function (fn, args, thisInfo, line, callerName) {
    const caller = this.frame;
    const cname = callerName || (caller ? caller.name : '');
    const fname = fn.struct ? fn.struct.name + '::' + fn.name : fn.name;
    const f = this.pushFrame(fname, fn);
    if (thisInfo) { f.thisAddr = thisInfo.addr; f.thisTy = thisInfo.ty; }
    fn.params.forEach((p, i) => {
      const a = args[i];
      if (!a) {
        if (!p.def) this.err(CL.t(`Argument ${i + 1} ('${p.name}') was not given.`, `Argument ${i + 1} ('${p.name}') nahi diya gaya.`), line);
        const rv = this.evalR(p.def);
        const b = this.declareVar(p.name, p.ty, { zero: true });
        this.store({ addr: b.addr, ty: p.ty }, rv, line);
        return;
      }
      if (p.ty.k === 'ref') {
        const lv = a.lv || (() => { this.err(CL.t(`A reference parameter needs a variable (not a value).`, 'Reference parameter ko variable chahiye (value nahi).'), line); })();
        this.frame.scopes[0].vars.set(p.name, { name: p.name, addr: lv.addr, type: p.ty.to, isRef: true });
      } else {
        const b = this.declareVar(p.name, p.ty, { zero: true });
        const rv = a.rv || this.readLV(a.lv, line);
        this.store({ addr: b.addr, ty: p.ty }, rv, line);
      }
    });
    f.line = fn.line;
    if (!fn.isCtor && !fn.isDtor && cname !== '<globals>') {
      const shown = this.argStr(args);
      const refs = fn.params.some(p => p.ty.k === 'ref');
      this.snap(fn.line, fn.name === 'main' ? CL.t('main() started — every C/C++ program begins here.', 'main() shuru hua — har C/C++ program yahin se chalta hai.') :
        CL.t(`${cname}() called ${fname}(${shown}). A new stack frame was created${fn.params.length ? ': the parameter values were ' + (refs ? 'copied (reference parameters are aliases of the real variables)' : 'COPIED (pass-by-value)') + '.' : '.'}`,
          `${cname}() ne ${fname}(${shown}) ko call kiya. Naya stack frame bana${fn.params.length ? ': parameters me values ' + (refs ? 'copy hui (reference wale asli variable ke alias hain)' : 'COPY hui (pass-by-value)') + '.' : '.'}`));
    }
    const sig = this.execBlock(fn.body.body);
    let result = { v: 0, ty: TY.void };
    if (sig && sig.t === 'return' && sig.val) result = sig.val;
    else if (fn.name === 'main') result = { v: 0, ty: TY.int };
    else if (fn.ret.k !== 'void' && !fn.isCtor) this.notes.push(CL.t(`⚠️ No return statement ran in ${fn.name}() — a garbage value will be returned (undefined behaviour).`, `⚠️ ${fn.name}() me return statement nahi chala — kachra value milegi (undefined behaviour).`));
    if (fn.ret.k === 'ref' && result.lv) result = { lv: result.lv, v: 0, ty: fn.ret.to };
    if (sig && sig.t !== 'return') { /* break/continue outside loop: ignore */ }
    this.popFrame();
    if (!fn.isCtor && !fn.isDtor && fn.name !== 'main')
      {
      const rvs = fn.ret.k !== 'void' && result.ty && result.ty.k !== 'void' && result.v !== undefined && result.ty.k !== 'struct' && result.ty.k !== 'vector' ? fv(result.ty, result.v) : null;
      this.notes.push('↩ ' + CL.t(`${fname}() finished — its stack frame was removed${rvs !== null ? ', return value: ' + rvs : ''}.`, `${fname}() khatam — iska stack frame hat gaya${rvs !== null ? ', return value: ' + rvs : ''}.`));
    }
    return result;
  };

  P.callCtor = function (st, addr, argNodes, line) {
    const cands = st.ctors.filter(c => c.params.length >= argNodes.length && c.params.slice(argNodes.length).every(p => p.def) || (c.params.length === argNodes.length));
    if (!st.ctors.length) {
      if (argNodes.length) this.initObject(addr, st, { k: 'initlist', items: argNodes }, line);
      return;
    }
    if (!cands.length) this.err(CL.t(`No constructor of '${st.name}' takes ${argNodes.length} arguments.`, `'${st.name}' ka koi constructor ${argNodes.length} arguments nahi leta.`), line);
    const fn = this.pickOverload(cands, argNodes, st.name, line);
    const args = this.evalArgs(fn.params, argNodes, line);
    this.callMember(fn, args, { addr, ty: st }, line, true);
  };

  // run ctor / method with this
  P.callMember = function (fn, args, thisInfo, line, isCtor) {
    if (!isCtor) return this.callUser(fn, args, thisInfo, line);
    // ctor: bind params, run init list, run body
    const caller = this.frame;
    const f = this.pushFrame(fn.struct.name + '::' + fn.struct.name, fn);
    f.thisAddr = thisInfo.addr; f.thisTy = thisInfo.ty;
    fn.params.forEach((p, i) => {
      const a = args[i];
      if (p.ty.k === 'ref') { this.frame.scopes[0].vars.set(p.name, { name: p.name, addr: a.lv.addr, type: p.ty.to, isRef: true }); return; }
      const b = this.declareVar(p.name, p.ty, { zero: true });
      this.store({ addr: b.addr, ty: p.ty }, a ? (a.rv || this.readLV(a.lv, line)) : this.evalR(p.def), line);
    });
    f.line = fn.line;
    this.snap(fn.line, CL.t(`Constructor ${fn.struct.name}(${this.argStr(args)}) ran — the object is built at ${CL.hex(thisInfo.addr)}.`, `Constructor ${fn.struct.name}(${this.argStr(args)}) chala — object ${CL.hex(thisInfo.addr)} par bana.`));
    for (const ini of (fn.inits || [])) {
      const fld = fn.struct.fields.find(x => x.name === ini.name);
      if (!fld) this.err(CL.t(`'${ini.name}' is not a member of this class.`, `'${ini.name}' is class ka member nahi hai.`), line);
      this.constructAt(thisInfo.addr + fld.off, fld.type, ini.args, line);
    }
    if (fn.inits && fn.inits.length) this.snap(fn.line, CL.t(`Members were set from the initializer list.`, 'Initializer list se members set hue.'));
    const sig = this.execBlock(fn.body.body);
    this.popFrame();
    return { v: 0, ty: TY.void };
  };

  P.callDtor = function (st, addr) {
    if (!st.dtor) return;
    const f = this.pushFrame(st.name + '::~' + st.name, st.dtor);
    f.thisAddr = addr; f.thisTy = st; f.line = st.dtor.line;
    this.snap(st.dtor.line, CL.t(`Destructor ~${st.name}() ran (cleanup before the object ends).`, `Destructor ~${st.name}() chala (object khatam hone se pehle cleanup).`));
    this.execBlock(st.dtor.body.body);
    this.popFrame();
  };

  // ---------- new / delete ----------
  P.evalNew = function (n) {
    const ty = n.ty;
    let al;
    if (n.count) {
      const c = Math.trunc(this.evalR(n.count).v);
      if (c < 0) this.err(CL.t(`The size of new[] cannot be negative.`, 'new[] ka size negative nahi ho sakta.'), n.line);
      al = this.alloc(CL.arrOf(ty, Math.max(c, 0)), 'heap', 'heap', { zero: false, origin: `new ${CL.typeName(ty)}[${c}]` });
      al.isArrayNew = true;
      this.notes.push(CL.t(`new ${CL.typeName(ty)}[${c}] → got a block of ${al.size} bytes on the heap (${CL.hex(al.addr)}).`, `new ${CL.typeName(ty)}[${c}] → heap par ${al.size} bytes ka block mila (${CL.hex(al.addr)}).`));
      if (ty.k === 'struct' && ty.ctors.length) for (let i = 0; i < c; i++) this.callCtor(ty, al.addr + i * ty.size, [], n.line);
      return { v: al.addr, ty: CL.ptrTo(ty) };
    }
    al = this.alloc(ty, 'heap', 'heap', { zero: false, origin: 'new ' + CL.typeName(ty) });
    this.notes.push(CL.t(`new ${CL.typeName(ty)} → got a block of ${al.size} bytes on the heap (${CL.hex(al.addr)}).`, `new ${CL.typeName(ty)} → heap par ${al.size} bytes ka block mila (${CL.hex(al.addr)}).`));
    if (n.args) {
      if (ty.k === 'struct' || ty.k === 'vector' || ty.k === 'string') this.constructAt(al.addr, ty, n.args, n.line);
      else if (n.args.length) this.store({ addr: al.addr, ty }, this.evalR(n.args[0]), n.line);
      else this.zeroFill(al.addr, ty);
    } else if (ty.k === 'struct' && ty.ctors.length) this.callCtor(ty, al.addr, [], n.line);
    return { v: al.addr, ty: CL.ptrTo(ty) };
  };

  P.evalDelete = function (n) {
    const p = this.evalR(n.e);
    if (p.ty.k !== 'ptr') this.err(CL.t(`delete works only on pointers.`, 'delete sirf pointer par lagta hai.'), n.line);
    if (p.v === 0) { this.notes.push(CL.t(`delete NULL: nothing happened (it is safe).`, 'delete NULL: kuch nahi hua (safe hai).')); return { v: 0, ty: TY.void }; }
    this.freeHeap(p.v, n.line, 'delete', n.isArr);
    return { v: 0, ty: TY.void };
  };

  P.freeHeap = function (addr, line, who, isArr) {
    const al = this.heapByAddr.get(addr);
    if (!al || al.internal) {
      if (this.dead.some(d => d.lo === addr && d.why === 'free')) this.err(CL.t(`Double free! This memory was already ${who === 'delete' ? 'deleted' : 'freed'} — freeing it again crashes the program.`, `Double free! Ye memory pehle hi ${who === 'delete' ? 'delete' : 'free'} ho chuki hai — dobara free karna crash karta hai.`), line);
      this.err(CL.t(`${who}() was given a pointer that is not the start of a heap block (or not on the heap at all). Only free a pointer you got from malloc/new.`, `${who}() ko aisa pointer diya gaya jo heap block ki shuruaat nahi hai (ya heap ka hai hi nahi). Sirf malloc/new se mila hua pointer free karo.`), line);
    }
    const ty = al.type;
    if (ty.k === 'struct') this.callDtor(ty, al.addr);
    else if (ty.k === 'array' && ty.of.k === 'struct' && ty.of.dtor) for (let i = ty.n - 1; i >= 0; i--) this.callDtor(ty.of, al.addr + i * ty.of.size);
    const visit = (a, t) => { if (t.k === 'vector') this.vecFree(a); else if (t.k === 'array') for (let i = 0; i < t.n; i++) visit(a + i * t.of.size, t.of); else if (t.k === 'struct') for (const f of t.fields) visit(a + f.off, f.type); };
    if (ty.k !== 'raw') visit(al.addr, ty);
    this.freeAlloc(al, 'free');
    this.notes.push(CL.t(`${who}: heap #${al.n} (${CL.hex(al.addr)}, ${al.size} bytes) was given back to the system. Do not use this pointer any more!`, `${who}: heap #${al.n} (${CL.hex(al.addr)}, ${al.size} bytes) wapas system ko de di gayi. Is pointer ko ab use na karo!`));
  };

  P.evalConstruct = function (n) {
    const ty = n.ty;
    if (ty.k === 'int' || ty.k === 'float' || ty.k === 'bool') {
      const v = this.evalR(n.args[0] || { k: 'num', v: 0, suffix: '' });
      return { v: this.coerce(v, ty, n.line), ty };
    }
    const al = this.alloc(ty, 'stack', '(temp)', { zero: true, internal: true });
    try {
      this.constructAt(al.addr, ty, n.args, n.line);
      const data = this.readObj(al.addr, ty, n.line);
      if (ty.k === 'string') return { v: data, ty };
      return { ty, data };
    } finally { if (ty.k === 'vector') this.vecFree(al.addr); this.freeAlloc(al, 'scope'); }
  };
})();
