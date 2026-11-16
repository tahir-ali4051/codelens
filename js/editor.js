/* CodeLens — tiny code editor: syntax colours, line numbers, current-line marker, breakpoints */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});

  const KW = {
    c: 'if else for while do switch case default break continue return struct union typedef enum sizeof static const extern unsigned signed goto',
    cpp: 'if else for while do switch case default break continue return struct union class typedef enum sizeof static const extern unsigned signed new delete public private protected using namespace true false nullptr auto this virtual template',
    py: 'if elif else for while break continue return def class import from as pass in not and or is None True False lambda try except finally raise with global nonlocal yield del assert'
  };
  const TY = {
    c: 'int char float double void long short bool size_t FILE',
    cpp: 'int char float double void long short bool size_t string vector',
    py: 'print input len range int float str list dict set tuple bool type sum min max abs sorted enumerate zip'
  };
  const toSet = (s) => new Set(s.split(' '));
  const SETS = {};
  for (const k of ['c', 'cpp', 'py']) SETS[k] = { kw: toSet(KW[k]), ty: toSet(TY[k]) };

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function highlight(text, lang) {
    const L = SETS[lang] || SETS.c;
    const isPy = lang === 'py';
    const out = [];
    let cur = '';
    let i = 0;
    const n = text.length;
    const push = (cls, s) => {
      // s may contain newlines — split so every line is self-contained
      const parts = s.split('\n');
      parts.forEach((p, idx) => {
        if (idx > 0) { out.push(cur); cur = ''; }
        if (p) cur += cls ? `<span class="t-${cls}">${esc(p)}</span>` : esc(p);
      });
    };
    while (i < n) {
      const c = text[i];
      if (isPy && c === '#') { let j = text.indexOf('\n', i); if (j < 0) j = n; push('cm', text.slice(i, j)); i = j; continue; }
      if (!isPy && c === '/' && text[i + 1] === '/') { let j = text.indexOf('\n', i); if (j < 0) j = n; push('cm', text.slice(i, j)); i = j; continue; }
      if (!isPy && c === '/' && text[i + 1] === '*') { let j = text.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; push('cm', text.slice(i, j)); i = j; continue; }
      if (!isPy && c === '#' && /^\s*$/.test(text.slice(text.lastIndexOf('\n', i - 1) + 1, i))) { let j = text.indexOf('\n', i); if (j < 0) j = n; push('pp', text.slice(i, j)); i = j; continue; }
      if (c === '"' || c === "'") {
        let q = c, j = i + 1;
        if (isPy && text.startsWith(q.repeat(3), i)) { q = q.repeat(3); j = i + 3; }
        while (j < n) {
          if (text[j] === '\\') { j += 2; continue; }
          if (text.startsWith(q, j)) { j += q.length; break; }
          if (text[j] === '\n' && q.length === 1) break;
          j++;
        }
        push('st', text.slice(i, j)); i = j; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] || ''))) {
        let j = i + 1; while (j < n && /[0-9a-fA-FxX._]/.test(text[j])) j++;
        push('nu', text.slice(i, j)); i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i + 1; while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++;
        const w = text.slice(i, j);
        let cls = '';
        if (L.kw.has(w)) cls = 'kw'; else if (L.ty.has(w)) cls = 'ty';
        else { let k = j; while (text[k] === ' ') k++; if (text[k] === '(') cls = 'fn'; }
        push(cls, w); i = j; continue;
      }
      let j = i + 1;
      while (j < n && !/[A-Za-z0-9_"'#\/.\n]/.test(text[j]) && j - i < 40) j++;
      push('', text.slice(i, j)); i = j;
    }
    out.push(cur);
    return out;
  }
  CL.highlight = highlight;

  class Editor {
    constructor(root, opts) {
      this.root = root;
      this.opts = opts || {};
      this.lang = 'c';
      this.cur = 0; this.err = 0;
      this.bps = new Set();
      root.classList.add('ed');
      root.innerHTML = '<div class="ed-gutter" aria-hidden="true"></div><div class="ed-body"><pre class="ed-back" aria-hidden="true"></pre><textarea class="ed-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Code editor"></textarea></div>';
      this.gutter = root.querySelector('.ed-gutter');
      this.back = root.querySelector('.ed-back');
      this.ta = root.querySelector('.ed-ta');
      this.ta.addEventListener('input', () => { this.refresh(); this.opts.onChange && this.opts.onChange(); });
      this.ta.addEventListener('keydown', (e) => this.key(e));
      this.gutter.addEventListener('click', (e) => {
        const g = e.target.closest('.g'); if (!g) return;
        const ln = +g.dataset.l;
        if (this.bps.has(ln)) this.bps.delete(ln); else this.bps.add(ln);
        this.paintGutter();
        this.opts.onBreakpoints && this.opts.onBreakpoints(this.bps);
      });
    }
    get value() { return this.ta.value; }
    set value(v) { this.ta.value = v; this.cur = 0; this.err = 0; this.bps.clear(); this.refresh(); }
    setLang(l) { this.lang = l; this.refresh(); }
    setReadOnly(b) { this.ta.readOnly = b; this.root.classList.toggle('locked', b); }
    focus() { this.ta.focus(); }
    lineCount() { return this.ta.value.split('\n').length; }

    refresh() {
      const text = this.ta.value;
      const lines = highlight(text, this.lang);
      this.nlines = lines.length;
      this.back.innerHTML = lines.map((h, i) => `<div class="ln${i + 1 === this.cur ? ' cur' : ''}${i + 1 === this.err ? ' err' : ''}">${h || ' '}</div>`).join('');
      const maxLen = text.split('\n').reduce((m, s) => Math.max(m, s.replace(/\t/g, '    ').length), 0);
      this.ta.style.height = this.nlines + 'lh';
      this.ta.style.width = 'calc(' + (maxLen + 6) + 'ch + 1.5rem)';
      this.back.style.width = this.ta.style.width;
      this.paintGutter();
    }
    paintGutter() {
      let h = '';
      for (let i = 1; i <= this.nlines; i++)
        h += `<div class="g${i === this.cur ? ' cur' : ''}${i === this.err ? ' err' : ''}${this.bps.has(i) ? ' bp' : ''}" data-l="${i}"><span class="bpdot"></span><span class="gn">${i}</span><span class="garrow">▶</span></div>`;
      this.gutter.innerHTML = h;
    }
    setCurrent(line, scroll) {
      this.cur = line || 0;
      const lns = this.back.children;
      for (let i = 0; i < lns.length; i++) lns[i].classList.toggle('cur', i + 1 === this.cur);
      const gs = this.gutter.children;
      for (let i = 0; i < gs.length; i++) gs[i].classList.toggle('cur', i + 1 === this.cur);
      if (this.cur && scroll !== false) this.reveal(this.cur);
    }
    setError(line) {
      this.err = line || 0;
      const lns = this.back.children, gs = this.gutter.children;
      for (let i = 0; i < lns.length; i++) lns[i].classList.toggle('err', i + 1 === this.err);
      for (let i = 0; i < gs.length; i++) gs[i].classList.toggle('err', i + 1 === this.err);
      if (this.err) this.reveal(this.err);
    }
    reveal(line) {
      const lh = this.back.firstElementChild ? this.back.firstElementChild.getBoundingClientRect().height : 24;
      const top = (line - 1) * lh, r = this.root;
      if (top < r.scrollTop + lh || top > r.scrollTop + r.clientHeight - lh * 3) r.scrollTop = Math.max(0, top - r.clientHeight / 2);
    }
    key(e) {
      const ta = this.ta;
      if (e.key === 'Tab') {
        e.preventDefault();
        if (ta.readOnly) return;
        const s = ta.selectionStart, en = ta.selectionEnd;
        document.execCommand && document.execCommand('insertText', false, '    ') || (ta.setRangeText('    ', s, en, 'end'), ta.dispatchEvent(new Event('input')));
        return;
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !ta.readOnly) {
        const s = ta.selectionStart, v = ta.value;
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const line = v.slice(ls, s);
        let ind = /^[ \t]*/.exec(line)[0];
        const t = line.trimEnd();
        const opens = this.lang === 'py' ? t.endsWith(':') : t.endsWith('{');
        if (opens) ind += '    ';
        e.preventDefault();
        const ins = '\n' + ind;
        document.execCommand && document.execCommand('insertText', false, ins) || (ta.setRangeText(ins, s, ta.selectionEnd, 'end'), ta.dispatchEvent(new Event('input')));
        return;
      }
      if (this.lang !== 'py' && e.key === '}' && !ta.readOnly) {
        const s = ta.selectionStart, v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1;
        if (/^ {4}$|^\t$/.test(v.slice(ls, s)) || /^\s+$/.test(v.slice(ls, s))) {
          const rm = Math.min(4, s - ls);
          ta.setSelectionRange(s - rm, s);
        }
      }
    }
  }
  CL.Editor = Editor;
})();
