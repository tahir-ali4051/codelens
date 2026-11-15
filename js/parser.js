/* CodeLens — C/C++ parser, part 1: core, types, declarations, top level */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  const { TY, CLError } = CL;

  const TYPE_KW = new Set(['const', 'static', 'unsigned', 'signed', 'long', 'short', 'int', 'char', 'float', 'double',
    'void', 'bool', 'struct', 'class', 'union', 'enum', 'auto', 'extern', 'register', 'volatile', 'inline']);

  class Parser {
    constructor(src, lang) {
      this.src = src;
      this.lang = lang || 'c';
      const raw = CL.lex(src);
      // drop "std ::" prefixes
      this.toks = [];
      for (let i = 0; i < raw.length; i++) {
        if (raw[i].t === 'id' && raw[i].v === 'std' && raw[i + 1] && raw[i + 1].v === '::') { i++; continue; }
        this.toks.push(raw[i]);
      }
      this.p = 0;
      this.typedefs = new Map();
      this.structs = new Map();
      this.enums = new Map();
      this.funcs = [];
      this.globals = [];
      this.anonCount = 0;
      const seed = { size_t: TY.ulong, ssize_t: TY.long, int8_t: TY.char, uint8_t: TY.uchar, int16_t: TY.short, uint16_t: TY.ushort,
        int32_t: TY.int, uint32_t: TY.uint, int64_t: TY.long, uint64_t: TY.ulong, ptrdiff_t: TY.long };
      for (const k in seed) this.typedefs.set(k, seed[k]);
    }

    // ---------- token helpers ----------
    at(o) { return this.toks[Math.min(this.p + (o || 0), this.toks.length - 1)]; }
    next() { const t = this.toks[this.p]; if (this.p < this.toks.length - 1) this.p++; return t; }
    isOp(v, o) { const t = this.at(o); return t.t === 'op' && t.v === v; }
    isKw(v, o) { const t = this.at(o); return t.t === 'kw' && t.v === v; }
    acceptOp(v) { if (this.isOp(v)) { this.next(); return true; } return false; }
    acceptKw(v) { if (this.isKw(v)) { this.next(); return true; } return false; }
    err(msg, tok) { throw new CLError('compile', msg, (tok || this.at()).line); }
    expectOp(v) {
      if (!this.isOp(v)) {
        const t = this.at();
        const prev = this.toks[this.p - 1];
        const ln = (v === ';' || v === ')' || v === '}') && prev ? prev.line : t.line;
        throw new CLError('compile', `'${v}' expected tha, lekin '${t.v}' mila`, ln);
      }
      return this.next();
    }
    expectId() {
      const t = this.at();
      if (t.t !== 'id') this.err(`Naam (identifier) expected tha, lekin '${t.v}' mila`);
      return this.next();
    }
    expectGT() { // handles '>>' in templates
      const t = this.at();
      if (t.t === 'op' && t.v === '>') { this.next(); return; }
      if (t.t === 'op' && t.v === '>>') { this.toks[this.p] = Object.assign({}, t, { v: '>' }); return; }
      this.err("'>' expected tha");
    }
    srcFrom(startTok) {
      const prev = this.toks[this.p - 1] || startTok;
      return this.src.slice(startTok.pos, prev.end).replace(/\s+/g, ' ').trim();
    }

    // ---------- types ----------
    isTypeStart(o) {
      const t = this.at(o);
      if (t.t === 'kw') return TYPE_KW.has(t.v);
      if (t.t === 'id') {
        if (this.typedefs.has(t.v) || this.structs.has(t.v)) return true;
        if (this.lang === 'cpp' && (t.v === 'string' || t.v === 'vector')) {
          const n = this.at((o || 0) + 1);
          return n.t === 'id' || (n.t === 'op' && (n.v === '<' || n.v === '*' || n.v === '&'));
        }
      }
      return false;
    }

    parseBaseType() {
      let isStatic = false, isUnsigned = false, isSigned = false, longs = 0, isShort = false, base = null, any = false;
      for (;;) {
        const t = this.at();
        if (t.t === 'kw') {
          const v = t.v;
          if (v === 'const' || v === 'volatile' || v === 'register' || v === 'inline' || v === 'extern') { this.next(); continue; }
          if (v === 'static') { isStatic = true; this.next(); continue; }
          if (v === 'unsigned') { isUnsigned = true; any = true; this.next(); continue; }
          if (v === 'signed') { isSigned = true; any = true; this.next(); continue; }
          if (v === 'long') { longs++; any = true; this.next(); continue; }
          if (v === 'short') { isShort = true; any = true; this.next(); continue; }
          if (base === null && (v === 'int' || v === 'char' || v === 'float' || v === 'double' || v === 'void' || v === 'bool')) {
            base = v; any = true; this.next(); continue;
          }
          if (base === null && !any && (v === 'struct' || v === 'class' || v === 'union')) { return { ty: this.parseStructSpec(), isStatic }; }
          if (base === null && !any && v === 'enum') { return { ty: this.parseEnumSpec(), isStatic }; }
          if (base === null && !any && v === 'auto') { this.next(); return { ty: { k: 'auto', size: 8, name: 'auto' }, isStatic }; }
          break;
        }
        if (t.t === 'id' && base === null && !any) {
          if (this.typedefs.has(t.v)) { this.next(); return { ty: this.typedefs.get(t.v), isStatic }; }
          if (this.structs.has(t.v)) { this.next(); return { ty: this.structs.get(t.v), isStatic }; }
          if (this.lang === 'cpp' && t.v === 'string') { this.next(); return { ty: TY.string, isStatic }; }
          if (this.lang === 'cpp' && t.v === 'vector' && this.isOp('<', 1)) {
            this.next(); this.next();
            const el = this.parseTypeName();
            this.expectGT();
            return { ty: CL.vecOf(el), isStatic };
          }
        }
        break;
      }
      if (!any) this.err(`Type ka naam expected tha, lekin '${this.at().v}' mila`);
      let ty;
      if (base === 'char') ty = isUnsigned ? TY.uchar : TY.char;
      else if (base === 'float') ty = TY.float;
      else if (base === 'double') ty = TY.double;
      else if (base === 'void') ty = TY.void;
      else if (base === 'bool') ty = TY.bool;
      else if (isShort) ty = isUnsigned ? TY.ushort : TY.short;
      else if (longs >= 2) ty = isUnsigned ? TY.ullong : TY.llong;
      else if (longs === 1) ty = isUnsigned ? TY.ulong : TY.long;
      else ty = isUnsigned ? TY.uint : TY.int;
      if (base === 'double' && longs) ty = TY.double;
      return { ty, isStatic };
    }

    // type without a declared name (casts, sizeof, new, template args)
    parseTypeName() {
      const { ty } = this.parseBaseType();
      return this.parseAbstractDecl(ty);
    }
    parseAbstractDecl(ty) {
      while (this.acceptOp('*')) { ty = CL.ptrTo(ty); while (this.acceptKw('const')); }
      if (this.isOp('&')) { this.next(); ty = CL.refTo(ty); }
      const dims = [];
      while (this.isOp('[')) {
        this.next();
        if (this.isOp(']')) { dims.push(null); } else dims.push(this.parseAssign());
        this.expectOp(']');
      }
      return this.foldDims(ty, dims);
    }
    foldDims(ty, dims) {
      for (let i = dims.length - 1; i >= 0; i--) {
        const d = dims[i];
        if (d === null) ty = CL.arrOf(ty, null, null);
        else {
          const c = this.constEval(d);
          ty = c !== undefined ? CL.arrOf(ty, c, null) : CL.arrOf(ty, null, d);
        }
      }
      return ty;
    }

    parseDeclarator(base) {
      let ty = base;
      while (this.acceptOp('*')) { ty = CL.ptrTo(ty); while (this.acceptKw('const')); }
      let isRef = false;
      if (this.isOp('&')) { this.next(); isRef = true; }
      if (this.isOp('(') && this.isOp('*', 1)) this.err('Function pointers abhi supported nahi hain');
      let nameTok = null, qual = null;
      if (this.at().t === 'id') nameTok = this.next();
      if (nameTok && this.isOp('::')) { // out-of-class member definition
        qual = nameTok.v; this.next();
        if (this.isOp('~')) { this.next(); nameTok = Object.assign({}, this.expectId(), { v: '~' + this.toks[this.p - 1].v }); }
        else nameTok = this.expectId();
      }
      const dims = [];
      while (this.isOp('[')) {
        this.next();
        if (this.isOp(']')) dims.push(null); else dims.push(this.parseAssign());
        this.expectOp(']');
      }
      ty = this.foldDims(ty, dims);
      if (isRef) ty = CL.refTo(ty);
      return { name: nameTok ? nameTok.v : null, ty, nameTok, qual };
    }

    parseParams() {
      this.expectOp('(');
      const params = [];
      let variadic = false;
      if (this.isKw('void') && this.isOp(')', 1)) { this.next(); }
      while (!this.isOp(')')) {
        if (this.acceptOp('...')) { variadic = true; break; }
        const { ty: base } = this.parseBaseType();
        const d = this.parseDeclarator(base);
        let ty = d.ty;
        if (ty.k === 'array') ty = CL.ptrTo(ty.of); // arrays decay in params
        let def = null;
        if (this.acceptOp('=')) def = this.parseAssign();
        params.push({ name: d.name || '_', ty, def, line: (d.nameTok || this.at()).line });
        if (!this.acceptOp(',')) break;
      }
      this.expectOp(')');
      params.variadic = variadic;
      return params;
    }

    // ---------- struct / enum ----------
    parseStructSpec() {
      const kwTok = this.next();
      const isClass = kwTok.v === 'class';
      let name = null;
      if (this.at().t === 'id') name = this.next().v;
      let st = name ? this.structs.get(name) : null;
      if (!st || (this.isOp('{') && st.defined)) {
        st = { k: 'struct', name: name || ('anon' + (++this.anonCount)), fields: [], methods: new Map(), ctors: [], dtor: null,
          isClass, size: 1, align: 1, defined: false, isUnion: kwTok.v === 'union' };
        if (name) this.structs.set(name, st);
      }
      if (this.isOp(':') && this.lang === 'cpp') this.err('Inheritance abhi supported nahi hai');
      if (this.isOp('{')) {
        this.next();
        this.parseStructBody(st);
        this.expectOp('}');
        st.defined = true;
        CL.layoutStruct(st);
        if (st.isUnion) { for (const f of st.fields) f.off = 0; st.size = Math.max(1, ...st.fields.map(f => f.type.size)); }
      } else if (!name) this.err('struct ka naam ya body chahiye');
      return st;
    }

    parseStructBody(st) {
      let access = st.isClass ? 'private' : 'public';
      while (!this.isOp('}')) {
        if (this.at().t === 'eof') this.err("struct band nahi hua ('}' missing)");
        const t = this.at();
        if (t.t === 'kw' && (t.v === 'public' || t.v === 'private' || t.v === 'protected') && this.isOp(':', 1)) {
          access = t.v; this.next(); this.next(); continue;
        }
        if (t.t === 'kw' && (t.v === 'virtual' || t.v === 'friend' || t.v === 'operator' || t.v === 'template'))
          this.err(`'${t.v}' abhi supported nahi hai`);
        // constructor
        if (t.t === 'id' && t.v === st.name && this.isOp('(', 1)) {
          this.next();
          const params = this.parseParams();
          this.parseCtorRest(st, params, t.line);
          continue;
        }
        // destructor
        if (t.t === 'op' && t.v === '~') {
          this.next(); this.expectId();
          this.expectOp('('); this.expectOp(')');
          const body = this.isOp('{') ? this.parseBlock() : (this.expectOp(';'), null);
          if (body) st.dtor = { k: 'func', name: '~' + st.name, ret: TY.void, params: [], body, line: t.line, struct: st, isDtor: true };
          continue;
        }
        const { ty: base } = this.parseBaseType();
        for (;;) {
          const d = this.parseDeclarator(base);
          if (!d.name) this.err('Member ka naam chahiye');
          if (this.isOp('(')) { // method
            const params = this.parseParams();
            while (this.acceptKw('const'));
            if (this.isOp('{')) {
              const body = this.parseBlock();
              const fn = { k: 'func', name: d.name, ret: d.ty, params, body, line: d.nameTok.line, struct: st, access };
              if (!st.methods.has(d.name)) st.methods.set(d.name, []);
              st.methods.get(d.name).push(fn);
            } else this.expectOp(';');
            break;
          }
          st.fields.push({ name: d.name, type: d.ty, access });
          if (this.acceptOp(',')) continue;
          this.expectOp(';');
          break;
        }
      }
    }

    parseCtorRest(st, params, line) {
      const inits = [];
      if (this.acceptOp(':')) {
        do {
          const nm = this.expectId().v;
          const open = this.at();
          const close = open.v === '{' ? '}' : ')';
          this.next();
          const args = [];
          while (!this.isOp(close)) { args.push(this.parseAssign()); if (!this.acceptOp(',')) break; }
          this.expectOp(close);
          inits.push({ name: nm, args });
        } while (this.acceptOp(','));
      }
      let body = null;
      if (this.isOp('{')) body = this.parseBlock(); else this.expectOp(';');
      if (body) st.ctors.push({ k: 'func', name: st.name, ret: TY.void, params, body, inits, line, struct: st, isCtor: true });
    }

    parseEnumSpec() {
      this.next();
      let name = null;
      if (this.at().t === 'id') name = this.next().v;
      if (this.isOp('{')) {
        this.next();
        let val = 0;
        while (!this.isOp('}')) {
          const id = this.expectId().v;
          if (this.acceptOp('=')) {
            const e = this.parseAssign();
            const c = this.constEval(e);
            if (c === undefined) this.err('enum ki value constant honi chahiye');
            val = c;
          }
          this.enums.set(id, val++);
          if (!this.acceptOp(',')) break;
        }
        this.expectOp('}');
      }
      if (name) this.typedefs.set(name, TY.int);
      return TY.int;
    }

    // ---------- constant folding (for array sizes, enums) ----------
    constEval(n) {
      switch (n.k) {
        case 'num': return n.isFloat ? undefined : n.v;
        case 'chr': return n.v;
        case 'bool': return n.v ? 1 : 0;
        case 'id': return this.enums.has(n.name) ? this.enums.get(n.name) : undefined;
        case 'sizeof': return n.ty ? n.ty.size : undefined;
        case 'unary': {
          const v = this.constEval(n.e); if (v === undefined) return undefined;
          return n.op === '-' ? -v : n.op === '+' ? v : n.op === '~' ? ~v : n.op === '!' ? (v ? 0 : 1) : undefined;
        }
        case 'binary': {
          const a = this.constEval(n.l), b = this.constEval(n.r);
          if (a === undefined || b === undefined) return undefined;
          switch (n.op) {
            case '+': return a + b; case '-': return a - b; case '*': return a * b;
            case '/': return b ? Math.trunc(a / b) : undefined; case '%': return b ? a % b : undefined;
            case '<<': return a << b; case '>>': return a >> b; case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
          }
          return undefined;
        }
        case 'cast': return this.constEval(n.e);
      }
      return undefined;
    }

    // ---------- top level ----------
    parseProgram() {
      while (this.at().t !== 'eof') this.parseTopLevel();
      return { funcs: this.funcs, globals: this.globals, structs: this.structs, enums: this.enums, src: this.src };
    }

    parseTopLevel() {
      const t = this.at();
      if (t.t === 'op' && t.v === ';') { this.next(); return; }
      if (t.t === 'kw' && t.v === 'using') { while (!this.isOp(';') && this.at().t !== 'eof') this.next(); this.next(); return; }
      if (t.t === 'kw' && t.v === 'template') this.err('Templates abhi supported nahi hain');
      if (t.t === 'kw' && t.v === 'typedef') { this.parseTypedef(); return; }
      if (!this.isTypeStart()) this.err(`Yahan function ya variable ki declaration expected thi, lekin '${t.v}' mila`);
      const { ty: base, isStatic } = this.parseBaseType();
      if (this.acceptOp(';')) return; // plain struct/enum declaration
      // Class::member without return type (ctor/dtor defined outside)
      if (this.isOp('::') && base.k === 'struct') {
        this.next();
        const isD = this.acceptOp('~');
        const nm = this.expectId();
        const params = this.parseParams();
        if (isD) { const body = this.parseBlock(); base.dtor = { k: 'func', name: '~' + base.name, ret: TY.void, params, body, line: nm.line, struct: base, isDtor: true }; }
        else this.parseCtorRest(base, params, nm.line);
        return;
      }
      let first = true;
      for (;;) {
        const d = this.parseDeclarator(base);
        if (!d.name) this.err('Naam expected tha');
        if (first && this.isOp('(')) {
          const params = this.parseParams();
          while (this.acceptKw('const'));
          if (this.isOp('{')) {
            const body = this.parseBlock();
            const fn = { k: 'func', name: d.name, ret: d.ty, params, body, line: d.nameTok.line, endLine: this.toks[this.p - 1].line };
            if (d.qual) {
              const st = this.structs.get(d.qual);
              if (!st) this.err(`'${d.qual}' naam ka class/struct nahi mila`, d.nameTok);
              fn.struct = st;
              if (!st.methods.has(d.name)) st.methods.set(d.name, []);
              st.methods.get(d.name).push(fn);
            } else this.funcs.push(fn);
          } else this.expectOp(';'); // prototype
          return;
        }
        first = false;
        const decl = this.parseInitDeclarator(d, isStatic, base);
        this.globals.push({ k: 'decl', declarators: [decl], line: d.nameTok.line, src: decl.src, global: true });
        if (this.acceptOp(',')) continue;
        this.expectOp(';');
        return;
      }
    }

    parseTypedef() {
      this.next();
      const { ty: base } = this.parseBaseType();
      for (;;) {
        const d = this.parseDeclarator(base);
        if (!d.name) this.err('typedef ka naam chahiye');
        this.typedefs.set(d.name, d.ty);
        if (d.ty.k === 'struct' && d.ty.name.startsWith('anon')) d.ty.name = d.name;
        if (!this.acceptOp(',')) break;
      }
      this.expectOp(';');
    }

    // declarator + optional initializer: returns {name, ty, init, ctorArgs, isStatic, line, src}
    parseInitDeclarator(d, isStatic, base) {
      const startTok = d.nameTok;
      const out = { name: d.name, ty: d.ty, init: null, ctorArgs: null, isStatic: !!isStatic, line: startTok.line };
      if (this.acceptOp('=')) {
        out.init = this.isOp('{') ? this.parseInitList() : this.parseAssign();
      } else if (this.isOp('{') && this.lang === 'cpp') {
        out.init = this.parseInitList();
      } else if (this.isOp('(') && this.lang === 'cpp' && d.ty.k !== 'array') {
        this.next();
        const args = [];
        while (!this.isOp(')')) { args.push(this.parseAssign()); if (!this.acceptOp(',')) break; }
        this.expectOp(')');
        out.ctorArgs = args;
      }
      out.src = this.srcFrom(startTok);
      return out;
    }

    parseInitList() {
      const open = this.expectOp('{');
      const items = [];
      while (!this.isOp('}')) {
        if (this.isOp('.') && this.at(1).t === 'id' && this.isOp('=', 2)) {
          this.next(); const nm = this.next().v; this.next();
          items.push({ k: 'desig', name: nm, e: this.isOp('{') ? this.parseInitList() : this.parseAssign() });
        } else items.push(this.isOp('{') ? this.parseInitList() : this.parseAssign());
        if (!this.acceptOp(',')) break;
      }
      this.expectOp('}');
      return { k: 'initlist', items, line: open.line };
    }
  }
  CL.Parser = Parser;

  CL.parse = function (src, lang) {
    const p = new Parser(src, lang);
    return p.parseProgram();
  };
})();
