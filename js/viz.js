/* CodeLens — memory visualizer (C/C++ and Python snapshots → DOM + SVG arrows) */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  const shortHex = (h) => (h && h.length > 10 ? '…' + h.slice(-6) : h || '');
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

  // ---------- previous-state maps (for change flashes) ----------
  function collectC(nodeList, map) {
    const walk = (n) => {
      if (!n) return;
      switch (n.k) {
        case 'val': map.set(n.id, n.text); break;
        case 'array': n.items.forEach(walk); break;
        case 'struct': n.fields.forEach(f => walk(f.node)); break;
        case 'vec': map.set(n.id, n.size + '/' + n.cap); n.items.forEach(walk); break;
        case 'string': map.set(n.id, n.text); break;
        case 'ref': map.set('ref' + n.text, n.text); walk(n.val); break;
      }
    };
    nodeList.forEach(walk);
  }
  function prevMapC(snap) {
    const m = new Map();
    if (!snap) return m;
    const nodes = [];
    snap.globals.forEach(v => nodes.push(v.node));
    snap.frames.forEach(f => f.vars.forEach(v => nodes.push(v.node)));
    snap.heap.forEach(h => nodes.push(h.node));
    collectC(nodes, m);
    return m;
  }

  // ---------- C / C++ ----------
  function renderC(root, snap, prev) {
    const pm = prevMapC(prev);
    const ctx = { pm, arrows: [], extra: [], prevFrames: prev ? prev.frames.length : 0 };

    const left = el('div', 'col col-stack');
    const right = el('div', 'col col-heap');

    // globals
    if (snap.globals.length) {
      const g = el('section', 'region region-global');
      g.append(el('h3', 'region-title', 'Global memory'));
      g.append(el('p', 'region-hint', 'Poore program me available'));
      snap.globals.forEach(v => g.append(varRow(v, ctx)));
      left.append(g);
    }
    // stack
    const st = el('section', 'region region-stack');
    const th = el('h3', 'region-title', 'Stack');
    st.append(th);
    st.append(el('p', 'region-hint', 'Har function call ka apna frame — neeche wala sabse naya'));
    if (!snap.frames.length) st.append(el('div', 'empty', 'Abhi koi function nahi chal raha'));
    snap.frames.forEach((f, i) => {
      const active = i === snap.frames.length - 1;
      const fe = el('div', 'frame' + (active ? ' active' : '') + (i >= ctx.prevFrames ? ' fresh' : ''));
      const hd = el('div', 'frame-head');
      hd.append(el('span', 'frame-name', f.name + '()'));
      if (f.line) hd.append(el('span', 'frame-line', 'line ' + f.line));
      fe.append(hd);
      if (f.thisId) {
        const row = el('div', 'var var-inline');
        row.append(el('span', 'var-name', 'this'));
        const c = el('div', 'cell k-ptr');
        c.append(el('span', 'cell-v', '→'), el('span', 'cell-a', shortHex(f.thisAddr)));
        row.append(c);
        ctx.arrows.push({ from: c, to: f.thisId });
        fe.append(row);
      }
      if (!f.vars.length && !f.thisId) fe.append(el('div', 'empty small', 'koi local variable nahi'));
      f.vars.forEach(v => fe.append(varRow(v, ctx)));
      st.append(fe);
    });
    left.append(st);

    // heap
    const hp = el('section', 'region region-heap');
    hp.append(el('h3', 'region-title', 'Heap'));
    hp.append(el('p', 'region-hint', 'malloc / new se li gayi memory — khud free karni padti hai'));
    if (!snap.heap.length) hp.append(el('div', 'empty', 'Heap khali hai'));
    const hwrap = el('div', 'heap-wrap');
    snap.heap.forEach(h => {
      const b = el('div', 'hblock' + (h.leaked ? ' leaked' : ''));
      b.dataset.tid = h.id;
      const hh = el('div', 'hblock-head');
      hh.append(el('span', 'hblock-name', h.label));
      hh.append(el('span', 'hblock-meta', (h.origin ? h.origin + ' · ' : '') + h.size + ' bytes · ' + shortHex(h.addr)));
      b.append(hh);
      if (h.leaked) b.append(el('div', 'leak-flag', 'Leak: free nahi hua'));
      if (h.node.k === 'raw') b.append(el('div', 'raw', h.node.bytes + ' bytes (abhi type nahi mila)'));
      else b.append(renderNode(h.node, ctx));
      hwrap.append(b);
    });
    hp.append(hwrap);
    right.append(hp);

    // vectors' data blocks
    if (ctx.extra.length) {
      const vp = el('section', 'region region-vec');
      vp.append(el('h3', 'region-title', 'Vector ka buffer (heap par)'));
      const w = el('div', 'heap-wrap');
      for (let i = 0; i < ctx.extra.length; i++) {
        const n = ctx.extra[i];
        const b = el('div', 'hblock vecbuf');
        b.dataset.tid = 'vd' + n.id;
        const hh = el('div', 'hblock-head');
        hh.append(el('span', 'hblock-name', 'buffer'));
        hh.append(el('span', 'hblock-meta', n.cap + ' elements ki jagah · ' + shortHex(n.data)));
        b.append(hh);
        const items = el('div', 'arr-items');
        n.items.forEach((it, idx) => items.append(slot(it, idx, ctx, idx >= n.size)));
        if (n.more > 0) items.append(el('div', 'more', '+' + n.more));
        b.append(items);
        w.append(b);
      }
      vp.append(w);
      right.append(vp);
    }

    // read-only
    if (snap.ro && snap.ro.length) {
      const rp = el('section', 'region region-ro');
      rp.append(el('h3', 'region-title', 'Read-only (string literals)'));
      const w = el('div', 'heap-wrap');
      snap.ro.forEach(r => {
        const b = el('div', 'hblock rob');
        b.dataset.tid = r.id;
        b.append(el('div', 'hblock-head', '"' + r.text + '"'));
        b.append(renderNode(r.node, ctx));
        w.append(b);
      });
      rp.append(w);
      right.append(rp);
    }

    const cols = el('div', 'cols');
    cols.append(left, right);
    root.append(cols);
    return ctx;
  }

  function varRow(v, ctx) {
    const n = v.node;
    const block = n.k === 'array' || n.k === 'struct' || n.k === 'vec' || n.k === 'string';
    const row = el('div', 'var' + (block ? ' var-block' : ' var-inline'));
    const nm = el('span', 'var-name', v.name);
    if (n.k === 'val' && n.ty) nm.title = n.ty;
    row.append(nm);
    if (n.ty && block) nm.append(el('span', 'var-type', n.ty));
    row.append(renderNode(n, ctx, true));
    return row;
  }

  function slot(node, idx, ctx, dim) {
    const s = el('div', 'slot' + (dim ? ' dim' : ''));
    if (node.k === 'empty') { s.append(el('div', 'cell k-empty', '')); }
    else s.append(renderNode(node, ctx));
    s.append(el('span', 'idx', String(idx)));
    return s;
  }

  function renderNode(n, ctx, top) {
    switch (n.k) {
      case 'val': return cellEl(n, ctx);
      case 'array': {
        const isStr = n.str;
        const a = el('div', 'arr' + (isStr ? ' arr-str' : ''));
        if (n.cid) a.dataset.tid = n.cid;
        if (top === undefined && n.addr) a.title = n.ty + ' @ ' + n.addr;
        const items = el('div', 'arr-items');
        n.items.forEach((it, i) => items.append(slot(it, i, ctx)));
        if (n.more > 0) items.append(el('div', 'more', '+' + n.more + ' aur'));
        a.append(items);
        return a;
      }
      case 'struct': {
        const s = el('div', 'struct');
        if (n.cid) s.dataset.tid = n.cid;
        s.append(el('div', 'struct-title', n.ty));
        n.fields.forEach(f => {
          const nested = f.node.k === 'array' || f.node.k === 'struct' || f.node.k === 'vec' || f.node.k === 'string';
          const r = el('div', 'field' + (nested ? ' field-block' : ''));
          r.append(el('span', 'field-name', f.name));
          r.append(renderNode(f.node, ctx));
          s.append(r);
        });
        return s;
      }
      case 'string': {
        const s = el('div', 'cppstr');
        s.dataset.tid = n.id;
        const chg = ctx.pm.has(n.id) && ctx.pm.get(n.id) !== n.text;
        if (chg) s.classList.add('chg');
        s.append(el('span', 'q', '"'));
        const chars = el('span', 'chars');
        for (const ch of n.text.slice(0, 40)) chars.append(el('span', 'ch', ch === ' ' ? '␣' : ch));
        if (n.text.length > 40) chars.append(el('span', 'ch', '…'));
        if (!n.text.length) chars.append(el('span', 'ch emptyq', ''));
        s.append(chars, el('span', 'q', '"'), el('span', 'cppstr-len', n.text.length + ' chars'));
        return s;
      }
      case 'vec': {
        const v = el('div', 'vec');
        v.dataset.tid = n.id;
        const key = n.size + '/' + n.cap;
        if (ctx.pm.has(n.id) && ctx.pm.get(n.id) !== key) v.classList.add('chg');
        const hd = el('div', 'vec-head');
        hd.append(el('span', 'vec-stat', 'size ' + n.size), el('span', 'vec-stat', 'capacity ' + n.cap));
        const dp = el('div', 'cell k-ptr' + (n.data ? '' : ' null'));
        dp.append(el('span', 'cell-v', n.data ? '→' : 'NULL'), el('span', 'cell-a', 'data'));
        hd.append(dp);
        v.append(hd);
        if (n.data) { ctx.arrows.push({ from: dp, to: 'vd' + n.id }); ctx.extra.push(n); }
        return v;
      }
      case 'ref': {
        const r = el('div', 'refcell');
        const c = el('div', 'cell k-ref');
        c.append(el('span', 'cell-v', n.val && n.val.text !== undefined ? n.val.text : '…'), el('span', 'cell-a', 'alias of ' + n.text));
        if (n.val && n.val.id && ctx.pm.has(n.val.id) && ctx.pm.get(n.val.id) !== n.val.text) c.classList.add('chg');
        r.append(c);
        if (n.target) ctx.arrows.push({ from: c, to: n.target, dashed: true });
        return r;
      }
    }
    return el('span', 'cell', '?');
  }

  function cellEl(n, ctx) {
    const c = el('div', 'cell k-' + (n.kind === 'int' && /char/.test(n.ty) ? 'char' : n.kind));
    c.dataset.tid = n.id;
    c.title = n.ty + (n.addr ? ' @ ' + n.addr : '');
    const v = el('span', 'cell-v');
    if (!n.init) { c.classList.add('uninit'); v.textContent = '?'; if (n.garbage !== undefined) c.title += ' — garbage: ' + n.garbage; }
    else if (n.kind === 'ptr') {
      if (n.null) { v.textContent = 'NULL'; c.classList.add('null'); }
      else { v.textContent = '→'; if (n.target) ctx.arrows.push({ from: c, to: n.target }); else c.classList.add('bad'); }
    } else v.textContent = n.text;
    c.append(v);
    if (n.kind === 'ptr' && n.init && !n.null) {
      c.append(el('span', 'cell-a', n.invalid || !n.target ? 'invalid!' : shortHex(n.addr ? '0x' + (n.raw || 0).toString(16) : '')));
    } else if (n.sub !== undefined) c.append(el('span', 'cell-a', 'ascii ' + n.sub));
    else if (n.addr) c.append(el('span', 'cell-a', shortHex(n.addr)));
    if (ctx.pm.has(n.id) && ctx.pm.get(n.id) !== n.text) c.classList.add('chg');
    else if (!ctx.pm.has(n.id) && ctx.pm.size) c.classList.add('fresh');
    return c;
  }

  // ---------- Python ----------
  function prevMapPy(snap) {
    const m = new Map();
    if (!snap) return m;
    const addVars = (pre, vars) => vars.forEach(v => m.set(pre + v.name, nodeSig(v.node)));
    addVars('g:', snap.globals);
    snap.frames.forEach((f, i) => addVars('f' + i + ':', f.vars));
    snap.heap.forEach(h => m.set(h.id, objSig(h)));
    return m;
  }
  const nodeSig = (n) => n.k === 'val' ? n.text : 'ref:' + n.id;
  const objSig = (h) => JSON.stringify(h.items ? h.items.map(nodeSig) : h.entries ? h.entries.map(e => nodeSig(e.key) + '=' + nodeSig(e.val)) : h.attrs ? h.attrs.map(a => a.name + nodeSig(a.node)) : h.text);

  function renderPy(root, snap, prev) {
    const pm = prevMapPy(prev);
    const ctx = { pm, arrows: [], prevFrames: prev ? prev.frames.length : 0 };
    const left = el('div', 'col col-stack');
    const right = el('div', 'col col-heap');

    const g = el('section', 'region region-global');
    g.append(el('h3', 'region-title', 'Global frame'));
    g.append(el('p', 'region-hint', 'Function ke bahar wale variables'));
    if (!snap.globals.length) g.append(el('div', 'empty small', 'abhi koi variable nahi'));
    snap.globals.forEach(v => g.append(pyVar(v, 'g:', ctx)));
    left.append(g);

    snap.frames.forEach((f, i) => {
      const active = i === snap.frames.length - 1;
      const fe = el('section', 'region frame py-frame' + (active ? ' active' : '') + (i >= ctx.prevFrames ? ' fresh' : ''));
      const hd = el('div', 'frame-head');
      hd.append(el('span', 'frame-name', f.name + '()'));
      fe.append(hd);
      if (!f.vars.length) fe.append(el('div', 'empty small', 'koi local variable nahi'));
      f.vars.forEach(v => fe.append(pyVar(v, 'f' + i + ':', ctx)));
      if (active && snap.ret && snap.ret.frame === f.name) {
        const r = el('div', 'retval');
        r.append(el('span', 'var-name', 'Returns'), el('span', 'pill pill-ret', snap.ret.text));
        fe.append(r);
      }
      left.append(fe);
    });

    const hp = el('section', 'region region-heap');
    hp.append(el('h3', 'region-title', 'Objects'));
    hp.append(el('p', 'region-hint', 'List, dict, object — variable inme se kisi ko point karta hai'));
    if (!snap.heap.length) hp.append(el('div', 'empty', 'Abhi koi list/dict/object nahi'));
    const w = el('div', 'obj-wrap');
    snap.heap.forEach(h => w.append(pyObj(h, ctx)));
    hp.append(w);
    right.append(hp);

    const cols = el('div', 'cols');
    cols.append(left, right);
    root.append(cols);
    return ctx;
  }

  function pill(n, ctx, key) {
    if (n.k === 'ref') {
      const p = el('span', 'port');
      p.dataset.src = key || '';
      p.title = n.ty;
      ctx.arrows.push({ from: p, to: n.id });
      return p;
    }
    const p = el('span', 'pill pill-' + n.ty, n.text);
    p.title = n.ty + (n.len !== undefined ? ' (len ' + n.len + ')' : '');
    return p;
  }
  function pyVar(v, pre, ctx) {
    const row = el('div', 'var var-inline');
    row.append(el('span', 'var-name', v.name));
    const p = pill(v.node, ctx, pre + v.name);
    const key = pre + v.name;
    if (ctx.pm.has(key)) { if (ctx.pm.get(key) !== nodeSig(v.node)) p.classList.add('chg'); }
    else if (ctx.pm.size) p.classList.add('fresh');
    row.append(p);
    return row;
  }
  function pyObj(h, ctx) {
    const o = el('div', 'obj obj-' + h.kind);
    o.dataset.tid = h.id;
    const hd = el('div', 'obj-head');
    hd.append(el('span', 'obj-type', h.kind === 'instance' ? h.cls + ' object' : h.kind), el('span', 'obj-id', '#' + h.n));
    o.append(hd);
    const sg = objSig(h);
    if (ctx.pm.has(h.id) ? ctx.pm.get(h.id) !== sg : ctx.pm.size) o.classList.add(ctx.pm.has(h.id) ? 'chg' : 'fresh');
    if (h.kind === 'list' || h.kind === 'tuple' || h.kind === 'set' || h.kind === 'frozenset') {
      const items = el('div', 'arr-items');
      if (!h.items.length) items.append(el('div', 'empty small', 'khali'));
      h.items.forEach((n, i) => {
        const s = el('div', 'slot');
        const c = el('div', 'cell k-py');
        c.append(pill(n, ctx));
        s.append(c);
        if (h.kind !== 'set' && h.kind !== 'frozenset') s.append(el('span', 'idx', String(i)));
        items.append(s);
      });
      if (h.more > 0) items.append(el('div', 'more', '+' + h.more + ' aur'));
      o.append(items);
    } else if (h.kind === 'dict') {
      const t = el('div', 'dict');
      if (!h.entries.length) t.append(el('div', 'empty small', 'khali'));
      h.entries.forEach(e => {
        const r = el('div', 'dict-row');
        const k = el('div', 'dict-key'); k.append(pill(e.key, ctx));
        const v = el('div', 'dict-val'); v.append(pill(e.val, ctx));
        r.append(k, v); t.append(r);
      });
      o.append(t);
    } else if (h.kind === 'instance') {
      const t = el('div', 'attrs');
      if (!h.attrs.length) t.append(el('div', 'empty small', 'abhi koi attribute nahi'));
      h.attrs.forEach(a => {
        const r = el('div', 'attr');
        r.append(el('span', 'attr-name', a.name));
        r.append(pill(a.node, ctx));
        t.append(r);
      });
      o.append(t);
    } else o.append(el('div', 'raw', h.text));
    return o;
  }

  // ---------- arrows ----------
  function drawArrows(root, svg, arrows) {
    svg.innerHTML = '';
    const rr = root.getBoundingClientRect();
    const sw = root.scrollWidth, sh = root.scrollHeight;
    svg.setAttribute('width', sw);
    svg.setAttribute('height', sh);
    svg.style.width = sw + 'px'; svg.style.height = sh + 'px';
    const NS = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(NS, 'defs');
    svg.append(defs);
    for (let i = 0; i < 6; i++) {
      const m = document.createElementNS(NS, 'marker');
      m.setAttribute('id', 'ah' + i); m.setAttribute('viewBox', '0 0 10 10'); m.setAttribute('refX', '9'); m.setAttribute('refY', '5');
      m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7'); m.setAttribute('orient', 'auto-start-reverse');
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', 'M0,1 L10,5 L0,9 z'); p.setAttribute('class', 'ah ah' + i);
      m.append(p); defs.append(m);
    }
    const pos = (e) => {
      const r = e.getBoundingClientRect();
      return { l: r.left - rr.left + root.scrollLeft, r: r.right - rr.left + root.scrollLeft, t: r.top - rr.top + root.scrollTop, b: r.bottom - rr.top + root.scrollTop };
    };
    arrows.forEach((a, idx) => {
      const to = root.querySelector('[data-tid="' + a.to + '"]');
      if (!to || !a.from.isConnected) return;
      const f = pos(a.from), t = pos(to);
      const ci = hash((a.from.dataset.tid || a.from.dataset.src || '') + a.to) % 6;
      const sx = f.r - 2, sy = (f.t + f.b) / 2;
      let ex, ey, d;
      if (t.l > sx + 24) { ex = t.l; ey = Math.min(Math.max(sy, t.t + 10), t.b - 10); ey = (t.t + t.b) / 2 > sy + 80 || (t.t + t.b) / 2 < sy - 80 ? t.t + 14 : ey; const dx = Math.max(40, (ex - sx) / 2); d = `M${sx},${sy} C${sx + dx},${sy} ${ex - dx},${ey} ${ex},${ey}`; }
      else if (t.r < f.l - 24) { ex = t.r; ey = t.t + 14; const dx = Math.max(40, (f.l - ex) / 2); d = `M${f.l},${sy} C${f.l - dx},${sy} ${ex + dx},${ey} ${ex},${ey}`; }
      else { ex = t.r; ey = (t.t + t.b) / 2; const o = 46 + (idx % 3) * 10; d = `M${sx},${sy} C${sx + o},${sy} ${ex + o},${ey} ${ex},${ey}`; }
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'arrow c' + ci + (a.dashed ? ' dashed' : ''));
      path.setAttribute('marker-end', 'url(#ah' + ci + ')');
      svg.append(path);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', sx); dot.setAttribute('cy', sy); dot.setAttribute('r', 3.5); dot.setAttribute('class', 'adot c' + ci);
      svg.append(dot);
    });
  }

  // ---------- public ----------
  CL.Viz = {
    render(root, svg, snap, prev, lang) {
      const keep = root.scrollTop;
      Array.from(root.children).forEach(c => { if (c !== svg) c.remove(); });
      const ctx = lang === 'py' ? renderPy(root, snap, prev) : renderC(root, snap, prev);
      root.scrollTop = keep;
      requestAnimationFrame(() => drawArrows(root, svg, ctx.arrows));
      this._last = { root, svg, ctx };
    },
    redraw() { const l = this._last; if (l) drawArrows(l.root, l.svg, l.ctx.arrows); }
  };
})();
