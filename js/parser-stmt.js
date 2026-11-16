/* CodeLens — C/C++ parser, part 2: statements and expressions */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  const P = CL.Parser.prototype;
  const { TY } = CL;

  // ---------- statements ----------
  P.parseBlock = function () {
    const open = this.expectOp('{');
    const body = [];
    while (!this.isOp('}')) {
      if (this.at().t === 'eof') this.err(CL.t(`Block is not closed: '}' is missing`, "Block band nahi hua: '}' missing hai"), open);
      body.push(this.parseStatement());
    }
    const close = this.expectOp('}');
    return { k: 'block', body, line: open.line, endLine: close.line };
  };

  P.parseStatement = function () {
    const t = this.at();
    const line = t.line;
    let s;
    if (t.t === 'op' && t.v === '{') return this.parseBlock();
    if (t.t === 'op' && t.v === ';') { this.next(); return { k: 'empty', line }; }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'if': return this.parseIf();
        case 'for': return this.parseFor();
        case 'while': {
          this.next(); this.expectOp('(');
          const c = this.parseExprSrc(); this.expectOp(')');
          return { k: 'while', c, body: this.parseStatement(), line, src: 'while (' + c.src + ')' };
        }
        case 'do': {
          this.next();
          const body = this.parseStatement();
          if (!this.acceptKw('while')) this.err(CL.t(`Expected 'while' after 'do'`, "do ke baad while expected tha"));
          this.expectOp('('); const c = this.parseExprSrc(); this.expectOp(')'); this.expectOp(';');
          return { k: 'dowhile', c, body, line: this.toks[this.p - 1].line, src: 'while (' + c.src + ')' };
        }
        case 'switch': return this.parseSwitch();
        case 'return': {
          this.next();
          let e = null;
          if (!this.isOp(';')) e = this.parseExpr();
          this.expectOp(';');
          return { k: 'return', e, line, src: this.srcFrom(t) };
        }
        case 'break': this.next(); this.expectOp(';'); return { k: 'break', line, src: 'break;' };
        case 'continue': this.next(); this.expectOp(';'); return { k: 'continue', line, src: 'continue;' };
        case 'goto': this.err(CL.t(`goto is not supported yet`, 'goto abhi supported nahi hai'));
        case 'delete': {
          this.next();
          let isArr = false;
          if (this.isOp('[')) { this.next(); this.expectOp(']'); isArr = true; }
          const e = this.parseUnary();
          this.expectOp(';');
          return { k: 'expr', e: { k: 'delete', e, isArr, line }, line, src: this.srcFrom(t) };
        }
        case 'typedef': this.parseTypedef(); return { k: 'empty', line };
        case 'using': while (!this.isOp(';') && this.at().t !== 'eof') this.next(); this.next(); return { k: 'empty', line };
      }
    }
    if (this.isTypeStart() && !(t.t === 'id' && this.isOp('(', 1))) return this.parseDeclStmt();
    const e = this.parseExpr();
    this.expectOp(';');
    return { k: 'expr', e, line, src: this.srcFrom(t) };
  };

  P.parseDeclStmt = function (noSemi) {
    const t = this.at();
    const { ty: base, isStatic } = this.parseBaseType();
    if (!noSemi && this.acceptOp(';')) return { k: 'empty', line: t.line };
    const declarators = [];
    for (;;) {
      const d = this.parseDeclarator(base);
      if (!d.name) this.err(CL.t(`A variable needs a name`, 'Variable ka naam chahiye'));
      declarators.push(this.parseInitDeclarator(d, isStatic, base));
      if (!this.acceptOp(',')) break;
    }
    if (!noSemi) this.expectOp(';');
    return { k: 'decl', declarators, line: t.line, src: this.srcFrom(t) };
  };

  P.parseIf = function () {
    const t = this.next();
    this.expectOp('(');
    const c = this.parseExprSrc();
    this.expectOp(')');
    const a = this.parseStatement();
    let b = null;
    if (this.acceptKw('else')) b = this.parseStatement();
    return { k: 'if', c, a, b, line: t.line, src: 'if (' + c.src + ')' };
  };

  P.parseFor = function () {
    const t = this.next();
    this.expectOp('(');
    let init = null;
    // range-for?
    if (this.isTypeStart()) {
      const save = this.p;
      const { ty: base } = this.parseBaseType();
      const d = this.parseDeclarator(base);
      if (this.isOp(':') && this.lang === 'cpp') {
        this.next();
        const coll = this.parseExpr();
        this.expectOp(')');
        const body = this.parseStatement();
        return { k: 'rfor', ty: d.ty, name: d.name, coll, body, line: t.line, src: this.srcFrom(t).replace(/\)[^)]*$/, ')') };
      }
      this.p = save;
      init = this.parseDeclStmt(true);
      this.expectOp(';');
    } else if (!this.isOp(';')) {
      const st = this.at();
      const e = this.parseExpr();
      init = { k: 'expr', e, line: st.line, src: this.srcFrom(st) };
      this.expectOp(';');
    } else this.next();
    let c = null;
    if (!this.isOp(';')) c = this.parseExprSrc();
    this.expectOp(';');
    let step = null;
    if (!this.isOp(')')) step = this.parseExprSrc();
    this.expectOp(')');
    const body = this.parseStatement();
    const hdr = 'for (' + (init ? init.src : '') + '; ' + (c ? c.src : '') + '; ' + (step ? step.src : '') + ')';
    return { k: 'for', init, c, step, body, line: t.line, src: hdr };
  };

  P.parseSwitch = function () {
    const t = this.next();
    this.expectOp('(');
    const e = this.parseExprSrc();
    this.expectOp(')');
    this.expectOp('{');
    const cases = [];
    let cur = null;
    while (!this.isOp('}')) {
      if (this.at().t === 'eof') this.err(CL.t(`switch is not closed`, "switch band nahi hua"));
      if (this.isKw('case')) {
        const ct = this.next();
        const test = this.parseTernary();
        this.expectOp(':');
        cur = { test, body: [], line: ct.line };
        cases.push(cur);
      } else if (this.isKw('default')) {
        const ct = this.next(); this.expectOp(':');
        cur = { test: null, body: [], line: ct.line };
        cases.push(cur);
      } else {
        if (!cur) this.err(CL.t(`A switch cannot have statements before the first case/default`, 'switch me case/default se pehle statement nahi likh sakte'));
        cur.body.push(this.parseStatement());
      }
    }
    this.expectOp('}');
    return { k: 'switch', e, cases, line: t.line, src: 'switch (' + e.src + ')' };
  };

  // ---------- expressions ----------
  P.parseExprSrc = function () {
    const st = this.at();
    const e = this.parseExpr();
    e.src = this.srcFrom(st);
    return e;
  };

  P.parseExpr = function () {
    let e = this.parseAssign();
    while (this.isOp(',')) {
      const t = this.next();
      const r = this.parseAssign();
      e = { k: 'binary', op: ',', l: e, r, line: t.line };
    }
    return e;
  };

  const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
  P.parseAssign = function () {
    const st = this.at();
    const l = this.parseTernary();
    const t = this.at();
    if (t.t === 'op' && ASSIGN.has(t.v)) {
      this.next();
      const r = this.isOp('{') ? this.parseInitList() : this.parseAssign();
      return { k: 'assign', op: t.v, l, r, line: t.line, src: this.srcFrom(st) };
    }
    return l;
  };

  P.parseTernary = function () {
    const c = this.parseBinary(1);
    if (this.isOp('?')) {
      const t = this.next();
      const a = this.parseExpr();
      this.expectOp(':');
      const b = this.parseAssign();
      return { k: 'cond', c, a, b, line: t.line };
    }
    return c;
  };

  const PREC = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
  P.parseBinary = function (minPrec) {
    let l = this.parseUnary();
    for (;;) {
      const t = this.at();
      if (t.t !== 'op' || !(t.v in PREC) || PREC[t.v] < minPrec) break;
      this.next();
      const r = this.parseBinary(PREC[t.v] + 1);
      l = { k: 'binary', op: t.v, l, r, line: t.line };
    }
    return l;
  };

  P.parseUnary = function () {
    const t = this.at();
    if (t.t === 'op') {
      if (t.v === '-' || t.v === '+' || t.v === '!' || t.v === '~' || t.v === '*' || t.v === '&') {
        this.next();
        return { k: 'unary', op: t.v, e: this.parseUnary(), line: t.line };
      }
      if (t.v === '++' || t.v === '--') {
        this.next();
        return { k: 'unary', op: 'pre' + t.v, e: this.parseUnary(), line: t.line };
      }
      if (t.v === '(' && this.isTypeStart(1)) { // cast
        this.next();
        const ty = this.parseTypeName();
        this.expectOp(')');
        return { k: 'cast', ty, e: this.parseUnary(), line: t.line };
      }
    }
    if (t.t === 'kw') {
      if (t.v === 'sizeof') {
        this.next();
        if (this.isOp('(') && this.isTypeStart(1)) {
          this.next(); const ty = this.parseTypeName(); this.expectOp(')');
          return { k: 'sizeof', ty, line: t.line };
        }
        return { k: 'sizeof', e: this.parseUnary(), line: t.line };
      }
      if (t.v === 'new') return this.parseNew();
    }
    return this.parsePostfix();
  };

  P.parseNew = function () {
    const t = this.next();
    const { ty: base } = this.parseBaseType();
    let ty = base;
    while (this.acceptOp('*')) ty = CL.ptrTo(ty);
    if (this.isOp('[')) {
      this.next();
      const cnt = this.parseExpr();
      this.expectOp(']');
      return { k: 'new', ty, count: cnt, line: t.line };
    }
    let args = null;
    if (this.isOp('(')) {
      this.next(); args = [];
      while (!this.isOp(')')) { args.push(this.parseAssign()); if (!this.acceptOp(',')) break; }
      this.expectOp(')');
    } else if (this.isOp('{')) {
      args = this.parseInitList().items;
    }
    return { k: 'new', ty, args, line: t.line };
  };

  P.parsePostfix = function () {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.at();
      if (t.t !== 'op') break;
      if (t.v === '(') {
        this.next();
        const args = [];
        while (!this.isOp(')')) { args.push(this.parseAssign()); if (!this.acceptOp(',')) break; }
        this.expectOp(')');
        e = { k: 'call', fn: e, args, line: t.line };
      } else if (t.v === '[') {
        this.next();
        const i = this.parseExpr();
        this.expectOp(']');
        e = { k: 'index', e, i, line: t.line };
      } else if (t.v === '.' || t.v === '->') {
        this.next();
        const nm = this.expectId();
        e = { k: 'member', e, name: nm.v, arrow: t.v === '->', line: t.line };
      } else if (t.v === '++' || t.v === '--') {
        this.next();
        e = { k: 'unary', op: 'post' + t.v, e, line: t.line };
      } else break;
    }
    return e;
  };

  P.parsePrimary = function () {
    const t = this.at();
    switch (t.t) {
      case 'num': this.next(); return { k: 'num', v: t.v, isFloat: t.isFloat, suffix: t.suffix, line: t.line };
      case 'chr': this.next(); return { k: 'chr', v: t.v, line: t.line };
      case 'str': this.next(); return { k: 'str', v: t.v, line: t.line };
      case 'kw':
        if (t.v === 'true' || t.v === 'false') { this.next(); return { k: 'bool', v: t.v === 'true', line: t.line }; }
        if (t.v === 'nullptr') { this.next(); return { k: 'null', line: t.line }; }
        if (t.v === 'this') { this.next(); return { k: 'this', line: t.line }; }
        if (this.isTypeStart()) { // functional cast: int(x), double(x), string("..")
          const ty = this.parseTypeName();
          this.expectOp('(');
          const args = [];
          while (!this.isOp(')')) { args.push(this.parseAssign()); if (!this.acceptOp(',')) break; }
          this.expectOp(')');
          return { k: 'construct', ty, args, line: t.line };
        }
        break;
      case 'id':
        if ((this.lang === 'cpp' && t.v === 'vector' && this.isOp('<', 1)) || (this.structs.has(t.v) && this.isOp('(', 1)) || (this.typedefs.has(t.v) && this.isOp('(', 1))) {
          const ty = this.parseTypeName();
          const args = [];
          if (this.isOp('{')) args.push(...this.parseInitList().items);
          else { this.expectOp('('); while (!this.isOp(')')) { args.push(this.parseAssign()); if (!this.acceptOp(',')) break; } this.expectOp(')'); }
          return { k: 'construct', ty, args, line: t.line };
        }
        this.next();
        if (t.v === 'NULL') return { k: 'null', line: t.line };
        if (this.lang === 'cpp' && (t.v === 'string') && this.isOp('(')) {
          this.next();
          const args = [];
          while (!this.isOp(')')) { args.push(this.parseAssign()); if (!this.acceptOp(',')) break; }
          this.expectOp(')');
          return { k: 'construct', ty: TY.string, args, line: t.line };
        }
        return { k: 'id', name: t.v, line: t.line };
      case 'op':
        if (t.v === '(') {
          this.next();
          const e = this.parseExpr();
          this.expectOp(')');
          return e.k === 'id' || e.k === 'num' ? Object.assign({}, e, { paren: true }) : e;
        }
        if (t.v === '{') return this.parseInitList();
        break;
    }
    this.err(CL.t(`Could not understand '${t.v}' in this expression`, `Expression me '${t.v}' ka matlab samajh nahi aaya`));
  };
})();
