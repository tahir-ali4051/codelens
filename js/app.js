/* CodeLens — application: editor ↔ engines ↔ visualizer ↔ lessons */
(function () {
  const CL = globalThis.CL;
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  const LANG_NAME = { c: 'C', cpp: 'C++', py: 'Python' };
  const STARTER = {
    c: '#include <stdio.h>\n\nint main() {\n    int x = 5;\n    printf("x = %d\\n", x);\n    return 0;\n}\n',
    cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int x = 5;\n    cout << "x = " << x << endl;\n    return 0;\n}\n',
    py: 'x = 5\nprint("x =", x)\n'
  };
  const icon = (id) => '<svg><use href="#i-' + id + '"/></svg>';

  let S_MODE = 'both';
  const S = { lang: 'c', trace: null, i: 0, timer: null, lesson: null, lessons: [], bps: new Set(), teacher: false, tab: 'mem', io: 'out', busy: false };
  let editor;

  // ---------- small helpers ----------
  const T = CL.t;
  const MODES = ['both', 'en', 'ur'];
  S_MODE = store.get('codelens.mode', 'both'); if (!MODES.includes(S_MODE)) S_MODE = 'both';
  const tx = (s) => CL.tr(s, S_MODE === 'ur' ? 'ur' : 'en');                 // one language (status, titles)
  const txb = (s) => S_MODE === 'both' ? CL.tr(s, 'en') + '\n' + CL.tr(s, 'ur') : tx(s); // toast: both stacked
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = txb(msg); t.setAttribute('role', 'status');
    document.body.append(t); setTimeout(() => t.remove(), 2600);
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  // block HTML from a bilingual string: English, then Roman Urdu underneath (in "both" mode)
  const bs = (s) => {
    const en = CL.tr(s, 'en'), ur = CL.tr(s, 'ur');
    if (S_MODE === 'ur') return fmt(ur);
    if (S_MODE === 'en' || en === ur) return fmt(en);
    return fmt(en) + '<span class="ur">' + fmt(ur) + '</span>';
  };
  // lesson text may be a plain string or { en, ur }
  const lt = (x) => (x && typeof x === 'object' && !Array.isArray(x)) ? T(x.en || '', x.ur || x.en || '') : (x == null ? '' : String(x));
  const md = (x) => bs(lt(x));
  function variantFor(l, lang) { return l.v[lang] || (lang === 'cpp' && l.v.c ? l.v.c : null); }
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const unb64 = (s) => decodeURIComponent(escape(atob(s)));

  // ---------- Python engine (Pyodide in a Web Worker) ----------
  const py = { worker: null, ready: false, failed: null, waiters: [], runs: new Map(), id: 0 };
  async function pickPyBase() {
    const local = new URL(CL_CONFIG.pyodideBase, location.href).href;
    try { const r = await fetch(local + 'pyodide.js', { method: 'HEAD' }); if (r.ok) return local; } catch (e) { /* fall through */ }
    return CL_CONFIG.pyodideFallback;
  }
  function pyStart() {
    if (py.worker || py.failed || py.starting) return;
    py.starting = true;
    if (S.lang === 'py') setStatus(T('Loading the Python engine (the first time takes a while, then it is remembered)…', 'Python engine load ho raha hai (pehli baar thora waqt lagta hai, phir yaad rahega)…'));
    pickPyBase().then((base) => {
      py.starting = false;
      if (py.worker || py.failed) return;
      const src = `importScripts(${JSON.stringify(base + 'pyodide.js')});
let ready = null, run = null;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    ready = (async () => { const p = await loadPyodide({ indexURL: ${JSON.stringify(base)} }); p.runPython(m.tracer); run = p.globals.get('run'); postMessage({ type: 'ready' }); })()
      .catch(err => { postMessage({ type: 'initerror', msg: String(err) }); throw err; });
  } else if (m.type === 'run') {
    try { await ready; postMessage({ type: 'result', id: m.id, json: run(m.src, m.stdin) }); }
    catch (err) { postMessage({ type: 'result', id: m.id, error: String(err) }); }
  }
};`;
      try {
        py.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      } catch (e) { pyFail(T('The Python engine could not start in this browser.', 'Is browser me Python engine start nahi ho saka.')); return; }
      py.worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') { py.ready = true; setStatus(T('Python is ready.', 'Python taiyar hai.'), 'ok'); py.waiters.splice(0).forEach(w => w.ok()); }
        else if (m.type === 'initerror') pyFail(PYERR);
        else if (m.type === 'result') {
          const r = py.runs.get(m.id); if (!r) return; py.runs.delete(m.id);
          if (m.error) r.reject(new Error(m.error)); else r.resolve(JSON.parse(m.json));
        }
      };
      py.worker.onerror = () => pyFail(PYERR);
      py.worker.postMessage({ type: 'init', tracer: CL.PY_TRACER_SRC });
    });
  }
  const PYERR = T('The Python engine did not load. Check the internet, or upload the pyodide folder with the site.', 'Python engine load nahi hua. Internet check karo, ya pyodide folder site ke saath upload karo.');
  function pyFail(msg) {
    py.failed = msg; py.waiters.splice(0).forEach(w => w.fail(new Error(msg)));
    for (const r of py.runs.values()) r.reject(new Error(msg));
    py.runs.clear();
    if (py.worker) { py.worker.terminate(); py.worker = null; }
    setStatus(msg, 'err');
  }
  function pyReady() {
    if (py.ready) return Promise.resolve();
    if (py.failed) { py.failed = null; py.worker = null; }
    pyStart();
    return new Promise((ok, fail) => py.waiters.push({ ok, fail }));
  }
  function pyRun(src, stdin) {
    return pyReady().then(() => new Promise((resolve, reject) => {
      const id = ++py.id;
      py.runs.set(id, { resolve, reject });
      py.worker.postMessage({ type: 'run', id, src, stdin });
      setTimeout(() => {
        if (py.runs.has(id)) { py.runs.delete(id); reject(new Error(T('The program ran for too long (timeout). The Python engine is restarting.', 'Program bohat der chala (timeout). Python engine dobara start ho raha hai.'))); py.worker && py.worker.terminate(); py.worker = null; py.ready = false; py.failed = null; pyStart(); }
      }, 40000);
    }));
  }

  // ---------- running code ----------
  function runEngine(code, lang, stdin) {
    if (lang === 'py') return pyRun(code, stdin);
    try { return Promise.resolve(CL.runCode(code, lang, stdin)); }
    catch (e) { return Promise.resolve({ steps: [], out: '', error: { kind: 'runtime', msg: T('An internal engine problem: ' + e.message + ' — this may be a CodeLens bug, try changing the code a little.', 'Engine ke andar masla aaya: ' + e.message + ' — ye CodeLens ka bug ho sakta hai, code thora badal kar dekho.'), line: 0 }, truncated: false }); }
  }

  async function run() {
    if (S.busy) return;
    stopPlay();
    S.busy = true;
    $('#btnRun').disabled = true;
    setStatus(S.lang === 'py' && !py.ready ? T('Loading the Python engine…', 'Python engine load ho raha hai…') : T('Running…', 'Chal raha hai…'));
    const code = editor.value, stdin = $('#stdin').value;
    let res;
    try { res = await runEngine(code, S.lang, stdin); }
    catch (e) { res = { steps: [], out: '', error: { kind: 'runtime', msg: e.message, line: 0 }, truncated: false }; }
    S.busy = false;
    $('#btnRun').disabled = false;
    res.lang = S.lang === 'py' ? 'py' : 'c';
    S.trace = res; S.i = 0;
    editor.setError(0);
    if (res.error && res.error.kind === 'compile') {
      editor.setError(res.error.line);
      setStatus(T('Error in the code: line ' + res.error.line, 'Code me galti: line ' + res.error.line), 'err');
      showConsole(res, null);
      renderNote(null);
      setControls(false);
      renderMemPlaceholder(T('Fix the error in the code first', 'Pehle code ki galti theek karo'), T('Compile error: ', 'Compile error: ') + res.error.msg);
      $('#note').classList.add('error');
      $('#note').innerHTML = '<div class="note-head"><span class="step-pill">Compile error</span><span class="src-line">line ' + res.error.line + '</span></div><div class="note-body"><div class="n-err">' + msgHtml(res.error.msg) + '</div></div>';
      S.trace = null;
      return;
    }
    setTab('mem');
    editor.setReadOnly(true);
    $('#btnEdit').hidden = false;
    $('#btnRun').innerHTML = icon('play') + tx(T('Run again', 'Dobara run karo'));
    setControls(true);
    $('#cSlider').max = Math.max(0, res.steps.length - 1);
    let msg = T(res.steps.length + ' steps are ready. Press Next or Play.', res.steps.length + ' steps tayyar. Next dabao ya Play chalao.');
    if (res.truncated) msg = T('The program was long — showing the first ' + res.steps.length + ' steps.', 'Program lamba tha — pehle ' + res.steps.length + ' steps dikhaye ja rahe hain.');
    setStatus(msg, res.error ? 'err' : 'ok');
    show(0);
  }

  function edit() {
    stopPlay();
    S.trace = null;
    editor.setReadOnly(false); editor.setCurrent(0); editor.setError(0);
    $('#btnEdit').hidden = true;
    $('#btnRun').innerHTML = icon('play') + tx(T('Run', 'Run karo'));
    setControls(false);
    renderNote(null); renderMemPlaceholder();
    $('#console').innerHTML = placeholderOut();
    setStatus(READY);
    editor.focus();
  }

  // ---------- showing a step ----------
  function show(i) {
    const t = S.trace; if (!t || !t.steps.length) return;
    i = Math.max(0, Math.min(t.steps.length - 1, i));
    S.i = i;
    const snap = t.steps[i], prev = i > 0 ? t.steps[i - 1] : null;
    editor.setCurrent(snap.line);
    CL.Viz.render($('#mem'), $('#arrows'), snap, prev, t.lang);
    renderNote(snap, i, t.steps.length);
    $('#cSlider').value = i;
    $('#cCount').textContent = (i + 1) + ' / ' + t.steps.length;
    $('#cFirst').disabled = $('#cPrev').disabled = i === 0;
    $('#cNext').disabled = $('#cLast').disabled = i === t.steps.length - 1;
    showConsole(t, snap, prev);
    if (i === t.steps.length - 1 && !snap.error) setStatus(t.error ? T('The program stopped at an error.', 'Program error par ruk gaya.') : T('The program finished. ✔', 'Program khatam. ✔'), t.error ? 'err' : 'ok');
  }

  function srcLine(n) { const ls = editor.value.split('\n'); return n > 0 && n <= ls.length ? ls[n - 1].trim() : ''; }

  const READY = T('Ctrl + Enter also runs the code', 'Ctrl + Enter se bhi run hota hai');
  const placeholderOut = () => '<span class="placeholder">' + esc(tx(T('Output will appear here.', 'Output yahan aayega.'))) + '</span>';
  // a possibly multi-line bilingual message → HTML
  function msgHtml(s) {
    return String(s).split('\n').map(ln => {
      const en = CL.tr(ln, 'en'), ur = CL.tr(ln, 'ur');
      if (S_MODE === 'ur') return esc(ur);
      if (S_MODE === 'en' || en === ur || CL.isDataLine(ln)) return esc(en);
      return esc(en) + '<span class="ur">' + esc(ur) + '</span>';
    }).join('<br>');
  }
  const TAG = /^(⚠️|💥|↩|🖨️|📦|✎|✅|💡)\s*/;
  function renderNote(snap, i, total) {
    const box = $('#note');
    box.classList.remove('error');
    if (!snap) { box.innerHTML = '<div class="note-body"><div class="placeholder">' + bs(T('Write some code and press **Run**. Then every step is explained here: what ran, what changed, what happened in memory.', 'Code likho aur **Run karo** dabao. Phir yahan har step ki wazahat aayegi: kya chala, kya badla, memory me kya hua.')) + '</div></div>'; return; }
    if (snap.error) box.classList.add('error');
    const rows = (snap.note || '').split('\n').filter(Boolean).map(ln => {
      const en = CL.tr(ln, 'en'), ur = CL.tr(ln, 'ur');
      const m = TAG.exec(en), tag = m ? m[1] : '';
      const cls = { '⚠️': 'n-warn', '💥': 'n-err', '🖨️': 'n-out', '↩': 'n-ret', '📦': 'n-vec', '✎': 'n-chg', '✅': 'n-out' }[tag] || 'n-plain';
      const one = (txt) => esc(txt);
      let h;
      if (S_MODE === 'ur') h = one(ur);
      else if (S_MODE === 'en' || en === ur || CL.isDataLine(ln)) h = one(en);
      else h = one(en) + '<span class="ur">' + one(ur.replace(TAG, '')) + '</span>';
      return '<div class="' + cls + '">' + h + '</div>';
    }).join('') || '<div class="placeholder">—</div>';
    const line = snap.line ? '<span class="src-line" title="' + esc(tx(T('This line just ran', 'Ye line abhi chali'))) + '">line ' + snap.line + ': ' + esc(srcLine(snap.line)) + '</span>' : '';
    box.innerHTML = '<div class="note-head"><span class="step-pill">Step ' + (i + 1) + ' / ' + total + '</span>' + line + '</div><div class="note-body">' + rows + '</div>';
  }

  function showConsole(t, snap, prev) {
    const c = $('#console');
    if (!snap) {
      c.innerHTML = t.error ? '<span class="errmsg">' + msgHtml(t.error.msg) + '</span>' : '';
      return;
    }
    const upto = snap.outLen || 0, from = prev ? Math.min(prev.outLen || 0, upto) : 0;
    const text = t.out.slice(0, upto);
    let h = esc(text.slice(0, from)) + (upto > from ? '<span class="new">' + esc(text.slice(from)) + '</span>' : '');
    if (!text) h = '<span class="placeholder">' + esc(tx(T('(nothing printed yet)', '(abhi kuch print nahi hua)'))) + '</span>';
    if (snap.error && t.error) h += '<span class="errmsg">' + msgHtml(t.error.msg) + '</span>';
    c.innerHTML = h;
    c.scrollTop = c.scrollHeight;
  }

  function renderMemPlaceholder(title, sub) {
    const mem = $('#mem');
    Array.from(mem.children).forEach(c => { if (c.id !== 'arrows') c.remove(); });
    $('#arrows').innerHTML = '';
    const d = document.createElement('div'); d.className = 'placeholder-big';
    d.innerHTML = '<div><b>' + esc(tx(title || T('The memory picture will appear here', 'Yahan memory ki tasveer banegi'))) + '</b>' + esc(tx(sub || T('Press Run — then step through and watch what happens to variables, the stack and the heap.', 'Run karo — phir ek ek step chala kar dekho ke variables, stack aur heap me kya ho raha hai.'))) + '</div>';
    mem.append(d);
  }

  function setControls(on) {
    ['cFirst', 'cPrev', 'cPlay', 'cNext', 'cLast', 'cBp', 'cSlider', 'cSpeed'].forEach(id => { $('#' + id).disabled = !on; });
    if (!on) $('#cCount').textContent = '';
  }

  // ---------- playback ----------
  function setPlayIcon(p) { $('#cPlay').innerHTML = icon(p ? 'pause' : 'play'); $('#cPlay').title = tx(p ? T('Pause (Space)', 'Roko (Space)') : T('Auto play (Space)', 'Auto play (Space)')); }
  function stopPlay() { if (S.timer) { clearInterval(S.timer); S.timer = null; } setPlayIcon(false); }
  function togglePlay() {
    if (!S.trace) return;
    if (S.timer) { stopPlay(); return; }
    if (S.i >= S.trace.steps.length - 1) show(0);
    setPlayIcon(true);
    S.timer = setInterval(() => {
      if (S.i >= S.trace.steps.length - 1) { stopPlay(); return; }
      show(S.i + 1);
    }, +$('#cSpeed').value);
  }
  function toBreakpoint() {
    const t = S.trace; if (!t) return;
    stopPlay();
    let k = S.i + 1;
    if (S.bps.size) while (k < t.steps.length && !S.bps.has(t.steps[k].line)) k++;
    else k = t.steps.length;
    show(Math.min(k, t.steps.length - 1));
  }

  // ---------- tabs ----------
  function setTab(t) {
    S.tab = t;
    $('#tabMem').setAttribute('aria-selected', t === 'mem');
    $('#tabLesson').setAttribute('aria-selected', t === 'lesson');
    $('#viewMem').hidden = t !== 'mem';
    $('#viewLesson').hidden = t !== 'lesson';
    if (t === 'mem') requestAnimationFrame(() => CL.Viz.redraw());
  }
  function setIO(t) {
    S.io = t;
    $('#tabOut').setAttribute('aria-selected', t === 'out');
    $('#tabIn').setAttribute('aria-selected', t === 'in');
    $('#console').hidden = t !== 'out';
    $('#stdin').hidden = t !== 'in';
  }
  function setStatus(msg, kind) { S.statusRaw = [msg, kind]; const s = $('#status'); s.textContent = tx(msg); s.className = 'status' + (kind ? ' ' + kind : ''); }

  // ---------- language & lessons ----------
  function setLang(lang, keepCode) {
    if (lang === S.lang && keepCode) return;
    if (S.trace) edit();
    S.lang = lang;
    document.querySelectorAll('.langs button').forEach(b => b.setAttribute('aria-selected', b.dataset.lang === lang));
    editor.setLang(lang === 'py' ? 'py' : lang);
    if (lang === 'py') pyStart();
    if (keepCode) return;
    const v = S.lesson && variantFor(S.lesson, lang);
    if (v) { editor.value = v.code; $('#stdin').value = v.stdin || ''; }
    else {
      S.lesson = null;
      editor.value = store.get('codelens.code.' + lang, STARTER[lang]);
      $('#stdin').value = '';
    }
    renderLessonBar(); renderLessonPane(); renderDrawer();
    setStatus(READY);
  }

  function openLesson(l, lang) {
    if (S.trace) edit();
    const order = [lang || S.lang, 'c', 'cpp', 'py'];
    const useLang = order.find(x => variantFor(l, x));
    S.lesson = l;
    if (useLang !== S.lang) { S.lang = useLang; document.querySelectorAll('.langs button').forEach(b => b.setAttribute('aria-selected', b.dataset.lang === useLang)); editor.setLang(useLang); if (useLang === 'py') pyStart(); }
    const v = variantFor(l, useLang);
    editor.value = v.code; $('#stdin').value = v.stdin || '';
    renderLessonBar(); renderLessonPane(); renderDrawer();
    renderNote(null); renderMemPlaceholder(); $('#console').innerHTML = placeholderOut();
    setControls(false);
    setTab('lesson');
    closeDrawer();
    store.set('codelens.lesson', l.id);
    setStatus(T('First think: what will this code do? Then press Run.', 'Pehle socho: ye code kya karega? Phir Run karo.'));
  }

  function renderLessonBar() {
    const b = $('#lessonBar');
    if (!S.lesson) { b.innerHTML = '<span class="lesson-title">' + esc(tx(T('My own code', 'Apna code'))) + '</span><span class="lesson-group">' + LANG_NAME[S.lang] + ' · ' + esc(tx(T('free practice', 'khuli practice'))) + '</span>'; return; }
    const idx = S.lessons.indexOf(S.lesson);
    b.innerHTML = '<span class="lesson-title">' + esc(tx(lt(S.lesson.title))) + '</span><span class="lesson-group">' + esc(tx(lt(S.lesson.group))) + '</span><span style="margin-left:auto;display:flex;gap:.3rem"><button class="btn icon ghost" id="lPrev" aria-label="' + esc(tx(T('Previous lesson', 'Pichla lesson'))) + '" title="' + esc(tx(T('Previous lesson', 'Pichla lesson'))) + '">‹</button><button class="btn icon ghost" id="lNext" aria-label="' + esc(tx(T('Next lesson', 'Agla lesson'))) + '" title="' + esc(tx(T('Next lesson', 'Agla lesson'))) + '">›</button></span>';
    $('#lPrev').onclick = () => { const n = S.lessons[idx - 1]; if (n) openLesson(n); };
    $('#lNext').onclick = () => { const n = S.lessons[idx + 1]; if (n) openLesson(n); };
  }

  let expectedCache = new Map();
  function renderLessonPane() {
    const p = $('#viewLesson'), l = S.lesson;
    if (!l) { p.innerHTML = '<div class="lesson-empty"><p>' + bs(T('No lesson is selected.', 'Koi lesson select nahi hai.')) + '</p><p>' + bs(T('Open **Lessons** above and pick a topic, or just write your own code and press Run.', 'Upar **Lessons** khol kar topic chuno, ya seedha apna code likh kar Run karo.')) + '</p><button class="btn primary" id="lpOpen">' + esc(tx(T('Browse lessons', 'Lessons dekho'))) + '</button></div>'; $('#lpOpen').onclick = openDrawer; return; }
    const v = variantFor(l, S.lang);
    const watch = (v && v.watch) || l.watch || [];
    p.innerHTML = '<h2>' + esc(tx(lt(l.title))) + '</h2><div class="lesson-group" style="color:var(--muted)">' + esc(tx(lt(l.group))) + ' · ' + LANG_NAME[S.lang] + '</div>' +
      (l.concept ? '<h3>Concept</h3><p>' + md(l.concept) + '</p>' : '') +
      (watch.length ? '<h3>' + esc(tx(T('Watch closely while it runs', 'Run karte waqt dhyan se dekho'))) + '</h3><ul>' + watch.map(w => '<li>' + md(w) + '</li>').join('') + '</ul>' : '') +
      '<h3>Expected output</h3><div class="answer" id="answer"><p style="color:var(--muted)">' + bs(T('First think about what this code will output. Then reveal the answer and press Run to confirm.', 'Pehle khud socho ke is code ka output kya hoga. Phir jawab dekho aur Run karke tasdeeq karo.')) + '</p><button class="btn" id="btnReveal">' + esc(tx(T('Show answer', 'Jawab dekho'))) + '</button></div>' +
      '<div class="lesson-actions"><button class="btn primary" id="lpRun">' + icon('play') + esc(tx(T('Run', 'Run karo'))) + '</button><button class="btn" id="lpReset">' + esc(tx(T('Restore original code', 'Code wapas original karo'))) + '</button></div>';
    $('#btnReveal').onclick = revealExpected;
    $('#lpRun').onclick = run;
    $('#lpReset').onclick = () => { if (S.trace) edit(); editor.value = v.code; $('#stdin').value = v.stdin || ''; toast(T('The original code is back.', 'Original code wapas aa gaya.')); };
  }

  async function revealExpected() {
    const l = S.lesson, v = l && variantFor(l, S.lang); if (!v) return;
    const box = $('#answer');
    box.innerHTML = '<p style="color:var(--muted)">' + esc(tx(T('Working it out…', 'Nikal raha hoon…'))) + '</p>';
    const key = S.lang + '|' + v.code + '|' + (v.stdin || '');
    let r = expectedCache.get(key);
    if (!r) {
      try { r = await runEngine(v.code, S.lang, v.stdin || ''); } catch (e) { r = { out: '', error: { msg: e.message } }; }
      expectedCache.set(key, r);
    }
    if (S.lesson !== l) return;
    box.innerHTML = '<pre>' + (r.out ? esc(r.out) : esc(tx(T('(nothing is printed)', '(kuch print nahi hota)')))) + '</pre>' + (r.error ? '<pre class="err">' + msgHtml(r.error.msg) + '</pre>' : '');
  }

  // ---------- lessons drawer ----------
  function openDrawer() { $('#drawer').classList.add('open'); $('#scrim').hidden = false; }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#scrim').hidden = true; }
  function renderDrawer() {
    const body = $('#drawerBody');
    const groups = [];
    S.lessons.forEach(l => { const gn = tx(lt(l.group)); let g = groups.find(x => x.name === gn); if (!g) groups.push(g = { name: gn, items: [] }); g.items.push(l); });
    let h = '';
    if (S.teacher) h += '<div style="padding:.3rem .5rem;font-size:.85rem;color:var(--muted)"><label><input type="checkbox" id="hideBuiltin"' + (store.get('codelens.hideBuiltin', '0') === '1' ? ' checked' : '') + '> ' + esc(tx(T('Hide sample lessons (show only mine)', 'Sample lessons chhupao (sirf apne dikhao)'))) + '</label></div>';
    h += '<button class="lesson-item' + (!S.lesson ? ' on' : '') + '" data-id="">' + esc(tx(T('My own code (free practice)', 'Apna code (khuli practice)'))) + '</button>';
    groups.forEach(g => {
      h += '<h4>' + esc(g.name) + '</h4>';
      g.items.forEach(l => {
        const tags = ['c', 'cpp', 'py'].filter(x => l.v[x]).map(x => '<span class="tag">' + LANG_NAME[x] + '</span>').join('');
        h += '<div style="display:flex;align-items:center"><button class="lesson-item' + (S.lesson === l ? ' on' : '') + '" data-id="' + esc(l.id) + '" style="flex:1">' + esc(tx(lt(l.title))) + '<span class="tags">' + tags + '</span></button>' + (S.teacher && l.custom ? '<button class="del" data-del="' + esc(l.id) + '" title="Delete" aria-label="Delete lesson">✕</button>' : '') + '</div>';
      });
    });
    if (S.teacher) h += '<div style="padding:1rem .5rem;display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn" id="btnExport">' + esc(tx(T('Export lessons (.json)', 'Lessons export (.json)'))) + '</button></div>';
    body.innerHTML = h;
    body.querySelectorAll('.lesson-item').forEach(b => b.onclick = () => {
      const l = S.lessons.find(x => x.id === b.dataset.id);
      if (l) openLesson(l); else { S.lesson = null; editor.value = store.get('codelens.code.' + S.lang, STARTER[S.lang]); renderLessonBar(); renderLessonPane(); renderDrawer(); closeDrawer(); if (S.trace) edit(); }
    });
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm(tx(T('Delete this lesson?', 'Ye lesson delete kar dein?')))) { deleteCustom(b.dataset.del); } });
    const hb = $('#hideBuiltin'); if (hb) hb.onchange = () => { store.set('codelens.hideBuiltin', hb.checked ? '1' : '0'); buildLessons(); };
    const ex = $('#btnExport'); if (ex) ex.onclick = exportLessons;
  }

  // ---------- lesson sources ----------
  let fileLessons = [];
  function readCustomLocal() { try { return JSON.parse(store.get('codelens.custom', '[]')); } catch (e) { return []; } }
  function writeCustomLocal(a) { store.set('codelens.custom', JSON.stringify(a)); }
  function buildLessons() {
    const hide = store.get('codelens.hideBuiltin', '0') === '1' || (fileLessons.hideBuiltin && !S.teacher);
    const custom = S.teacher ? readCustomLocal() : fileLessons.list || [];
    custom.forEach(l => { l.custom = true; });
    S.lessons = (hide ? [] : CL.LESSONS).concat(custom);
    if (S.lesson && !S.lessons.includes(S.lesson)) S.lesson = S.lessons.find(x => x.id === S.lesson.id) || null;
    renderDrawer(); renderLessonBar();
  }
  async function loadFileLessons() {
    fileLessons = { list: [], hideBuiltin: false };
    try {
      const r = await fetch(CL_CONFIG.customLessonsFile, { cache: 'no-cache' });
      if (!r.ok) return;
      const j = await r.json();
      fileLessons.list = Array.isArray(j) ? j : (j.lessons || []);
      fileLessons.hideBuiltin = !Array.isArray(j) && !!j.hideBuiltin;
    } catch (e) { /* no custom file — fine */ }
    if (S.teacher && !store.get('codelens.custom', null) && fileLessons.list.length) { writeCustomLocal(fileLessons.list); if (fileLessons.hideBuiltin) store.set('codelens.hideBuiltin', '1'); }
  }
  function deleteCustom(id) { writeCustomLocal(readCustomLocal().filter(l => l.id !== id)); if (S.lesson && S.lesson.id === id) S.lesson = null; buildLessons(); renderLessonPane(); }
  function exportLessons() {
    const data = { hideBuiltin: store.get('codelens.hideBuiltin', '0') === '1', lessons: readCustomLocal().map(l => { const c = Object.assign({}, l); delete c.custom; return c; }) };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'lessons-custom.json'; a.click();
    toast(T('lessons-custom.json was downloaded — put it in the project folder and deploy again.', 'lessons-custom.json download ho gayi — usko project folder me rakh kar dobara deploy karo.'));
  }
  function openSave() {
    const dl = $('#groupList'); dl.innerHTML = [...new Set(S.lessons.map(l => l.group))].map(g => '<option value="' + esc(g) + '">').join('');
    const pick = (x, k) => (x && typeof x === 'object' && !Array.isArray(x)) ? (x[k] || '') : (k === 'en' ? (x || '') : '');
    const L0 = S.lesson || {};
    $('#sTitle').value = pick(L0.title, 'en') || (typeof L0.title === 'string' ? L0.title : ''); $('#sTitleUr').value = pick(L0.title, 'ur');
    $('#sGroup').value = pick(L0.group, 'en') || (typeof L0.group === 'string' ? L0.group : '');
    $('#sConcept').value = pick(L0.concept, 'en') || (typeof L0.concept === 'string' ? L0.concept : ''); $('#sConceptUr').value = pick(L0.concept, 'ur');
    const wl = (L0.watch || []).map(w => typeof w === 'string' ? { en: w, ur: '' } : w);
    $('#sWatch').value = wl.map(w => w.en || '').join('\n'); $('#sWatchUr').value = wl.map(w => w.ur || '').join('\n');
    $('#sLang').textContent = LANG_NAME[S.lang];
    $('#saveDlg').showModal();
  }
  function saveLesson() {
    const title = $('#sTitle').value.trim(), titleUr = $('#sTitleUr').value.trim(), group = $('#sGroup').value.trim() || 'My lessons';
    if (!title) { toast(T('Write the lesson title.', 'Lesson ka naam likho.')); return; }
    const list = readCustomLocal();
    const nameOf = (x) => (x && typeof x === 'object') ? x.en : x;
    let l = list.find(x => nameOf(x.title) === title && nameOf(x.group) === group);
    if (!l) { l = { id: 'u' + Date.now().toString(36), group, title, concept: '', watch: [], v: {} }; list.push(l); }
    l.title = titleUr ? { en: title, ur: titleUr } : title;
    const cEn = $('#sConcept').value.trim(), cUr = $('#sConceptUr').value.trim();
    l.concept = cUr ? { en: cEn, ur: cUr } : cEn;
    const wEn = $('#sWatch').value.split('\n').map(s => s.trim()), wUr = $('#sWatchUr').value.split('\n').map(s => s.trim());
    l.watch = wEn.map((e, k) => ({ e, u: wUr[k] || '' })).filter(x => x.e || x.u).map(x => x.u ? { en: x.e, ur: x.u } : x.e);
    l.v[S.lang] = { code: editor.value, stdin: $('#stdin').value };
    writeCustomLocal(list);
    $('#saveDlg').close();
    buildLessons();
    S.lesson = S.lessons.find(x => x.id === l.id) || null;
    renderLessonBar(); renderLessonPane(); renderDrawer();
    toast(T('Lesson saved. Use Export in the drawer to get the file.', 'Lesson save ho gaya. Drawer me Export se file nikal sakte ho.'));
  }
  function enableTeacher() {
    if (S.teacher) return;
    S.teacher = true; store.set('codelens.teacher', '1');
    const a = document.createElement('button'); a.className = 'btn'; a.id = 'btnSave'; a.textContent = tx(T('Save as lesson', 'Lesson me save karo'));
    a.onclick = openSave; $('.top-actions').prepend(a);
    buildLessons(); toast(T('Teacher mode is on — the drawer now has export and delete options.', 'Teacher mode on — drawer me export aur delete ke options aa gaye.'));
  }

  // ---------- share ----------
  function shareLink() {
    const url = location.origin + location.pathname + '#' + S.lang + '=' + b64(editor.value);
    const done = () => toast(T('Link copied — send it to anyone.', 'Link copy ho gaya — kisi ko bhi bhej do.'));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt(tx(T('Copy the link:', 'Link copy karo:')), url));
    else prompt(tx(T('Copy the link:', 'Link copy karo:')), url);
  }

  // ---------- language mode (English / Roman Urdu / both) ----------
  const CHROME = [
    ['#btnLessons', 'html', T('Lessons', 'Lessons')],
    ['#btnShare', 'text', T('Copy link', 'Link copy')], ['#btnShare', 'title', T('Copy a link to this code', 'Is code ka link copy karo')],
    ['#btnFontDn', 'title', T('Smaller font', 'Chhota font')], ['#btnFontUp', 'title', T('Bigger font', 'Bara font')],
    ['#btnTheme', 'title', T('Light / Dark', 'Light / Dark')], ['#btnHelp', 'title', T('Help', 'Madad')],
    ['#btnEdit', 'html', T('Edit code', 'Code badlo')],
    ['#tabIn', 'text', T('Input (scanf / cin / input)', 'Input (scanf / cin / input)')], ['#tabOut', 'text', T('Output', 'Output')],
    ['#stdin', 'placeholder', T('If the program asks for input, write the values here — one per line or separated by spaces. Write them first, then press Run.', 'Agar program input maangta hai to yahan values likho — har value naye line par ya space se alag. Pehle yahan likho, phir Run karo.')],
    ['#tabMem', 'text', T('Memory', 'Memory')], ['#tabLesson', 'text', T('Lesson', 'Lesson')],
    ['#cFirst', 'title', T('Start (Home)', 'Shuru (Home)')], ['#cPrev', 'title', T('Previous step (←)', 'Pichla step (←)')], ['#cPlay', 'title', T('Auto play (Space)', 'Auto play (Space)')],
    ['#cNext', 'title', T('Next step (→)', 'Agla step (→)')], ['#cLast', 'title', T('Go to the end (End)', 'Aakhir tak (End)')],
    ['#cBp', 'title', T('Run to the next breakpoint (click a line number to set one)', 'Agle breakpoint tak (line number par click karke breakpoint lagao)')],
    ['#drawerTitle', 'text', T('Lessons', 'Lessons')], ['#helpOk', 'text', T('Got it', 'Samajh gaya')],
    ['#sCancel', 'text', T('Cancel', 'Cancel')], ['#sSave', 'text', T('Save', 'Save karo')]
  ];
  const SPEEDS = [T('Slow', 'Dheema'), T('Normal', 'Normal'), T('Fast', 'Tez'), T('Very fast', 'Bohat tez')];
  function helpHtml() {
    const items = [
      T('Pick a language at the top, write code (or choose one from **Lessons**) and press **Run**.', 'Upar se language chuno, code likho (ya **Lessons** se koi chuno) aur **Run karo** dabao.'),
      T('The program does not run all at once — you move through it **one step at a time**. On every step the memory picture on the right changes.', 'Program foran nahi chalta — tum use **ek ek step** chalate ho. Har step par right side me memory ki tasveer badalti hai.'),
      T('A box flashing in **amber** has just changed. An **arrow** shows where a pointer / reference points.', '**Amber rang** me chamakne wala dibba abhi badla hai. **Teer** batata hai pointer / reference kahan point kar raha hai.'),
      T('Keyboard: → next, ← previous, Space play/pause, Ctrl+Enter run.', 'Keyboard: → agla, ← pichla, Space play/pause, Ctrl+Enter run.'),
      T('Click a line number to set a **breakpoint**, then press ⏩ to jump straight there.', 'Code ki line number par click karke **breakpoint** lagao, phir ⏩ dabao — wahan tak seedha pahunch jao.'),
      T('If the program needs input (scanf / cin / input), write the values first in the **Input** tab below.', 'Program ko input chahiye (scanf / cin / input) to neeche **Input** tab me pehle values likho.'),
      T('The link button turns your code into a link — you can send it to a friend or teacher.', 'Link wala button tumhara code ek link me bana deta hai — dost ya teacher ko bhej sakte ho.')
    ];
    return '<h2>' + esc(tx(T('How to use CodeLens', 'CodeLens kaise use karein'))) + '</h2><ul>' + items.map(i => '<li>' + bs(i) + '</li>').join('') + '</ul><div class="row"><button class="btn primary" id="helpOk">' + esc(tx(T('Got it', 'Samajh gaya'))) + '</button></div>';
  }
  function applyMode() {
    document.documentElement.dataset.mode = S_MODE;
    CL.Viz.mode = S_MODE;
    document.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === S_MODE));
    CHROME.forEach(([sel, kind, str]) => {
      const e = $(sel); if (!e) return;
      const v = tx(str);
      if (kind === 'text') e.textContent = v;
      else if (kind === 'html') { const svg = e.querySelector('svg'); e.textContent = v; if (svg) e.prepend(svg); }
      else { e.setAttribute(kind, v); if (kind === 'title') e.setAttribute('aria-label', v); }
    });
    const lessonsBtn = $('#btnLessons'); if (lessonsBtn && !lessonsBtn.querySelector('svg')) lessonsBtn.insertAdjacentHTML('afterbegin', icon('menu'));
    const sp = $('#cSpeed'); Array.from(sp.options).forEach((o, k) => { o.textContent = tx(SPEEDS[k]); });
    $('#helpDlg').innerHTML = helpHtml(); $('#helpOk').onclick = () => $('#helpDlg').close();
    if (S.statusRaw) setStatus(S.statusRaw[0], S.statusRaw[1]); else setStatus(READY);
    setPlayIcon(!!S.timer);
    const btnEdit = $('#btnEdit'); if (btnEdit && !btnEdit.querySelector('svg')) btnEdit.insertAdjacentHTML('afterbegin', icon('edit'));
    $('#btnRun').innerHTML = icon('play') + esc(tx(S.trace ? T('Run again', 'Dobara run karo') : T('Run', 'Run karo')));
    if (S.trace) { show(S.i); } else { renderNote(null); if (!$('#mem .placeholder-big')) { /* keep */ } else renderMemPlaceholder(); $('#console').innerHTML = placeholderOut(); }
    renderLessonBar(); renderLessonPane(); renderDrawer();
    const sb = $('#btnSave'); if (sb) sb.textContent = tx(T('Save as lesson', 'Lesson me save karo'));
  }
  function setMode(m) { S_MODE = m; store.set('codelens.mode', m); applyMode(); }

  // ---------- init ----------
  function init() {
    const theme = store.get('codelens.theme', window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    let fs = parseFloat(store.get('codelens.fs', '17')) || 17;
    document.documentElement.style.setProperty('--fs', fs + 'px');

    editor = new CL.Editor($('#editor'), {
      onChange() { if (!S.lesson) store.set('codelens.code.' + S.lang, editor.value); },
      onBreakpoints(b) { S.bps = new Set(b); }
    });
    editor.setLang('c');

    document.querySelectorAll('.langs button').forEach(b => b.onclick = () => setLang(b.dataset.lang));
    $('#btnRun').onclick = run; $('#btnEdit').onclick = edit;
    $('#tabMem').onclick = () => setTab('mem'); $('#tabLesson').onclick = () => setTab('lesson');
    $('#tabOut').onclick = () => setIO('out'); $('#tabIn').onclick = () => setIO('in');
    $('#cFirst').onclick = () => { stopPlay(); show(0); };
    $('#cPrev').onclick = () => { stopPlay(); show(S.i - 1); };
    $('#cNext').onclick = () => { stopPlay(); show(S.i + 1); };
    $('#cLast').onclick = () => { stopPlay(); show(S.trace.steps.length - 1); };
    $('#cPlay').onclick = togglePlay; $('#cBp').onclick = toBreakpoint;
    $('#cSlider').oninput = (e) => { stopPlay(); show(+e.target.value); };
    $('#cSpeed').onchange = () => { if (S.timer) { stopPlay(); togglePlay(); } };
    $('#btnLessons').onclick = openDrawer; $('#btnCloseDrawer').onclick = closeDrawer; $('#scrim').onclick = closeDrawer;
    $('#btnShare').onclick = shareLink;
    $('#btnTheme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; store.set('codelens.theme', t); };
    const setFs = (d) => { fs = Math.max(13, Math.min(28, fs + d)); document.documentElement.style.setProperty('--fs', fs + 'px'); store.set('codelens.fs', String(fs)); requestAnimationFrame(() => CL.Viz.redraw()); };
    $('#btnFontUp').onclick = () => setFs(1.5); $('#btnFontDn').onclick = () => setFs(-1.5);
    $('#btnHelp').onclick = () => $('#helpDlg').showModal();
    document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
    $('#sCancel').onclick = () => $('#saveDlg').close(); $('#sSave').onclick = saveLesson;
    let taps = 0, tapT; $('#brand').onclick = () => { taps++; clearTimeout(tapT); tapT = setTimeout(() => taps = 0, 1500); if (taps >= 5) { taps = 0; enableTeacher(); } };
    window.addEventListener('resize', () => CL.Viz.redraw());
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); return; }
      if (e.key === 'Escape') { closeDrawer(); return; }
      const tg = e.target.tagName;
      if (tg === 'TEXTAREA' || tg === 'INPUT' && e.target.type === 'text' || tg === 'SELECT' || !S.trace) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); stopPlay(); show(S.i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stopPlay(); show(S.i - 1); }
      else if (e.key === ' ' && tg !== 'BUTTON') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'Home') { e.preventDefault(); stopPlay(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); stopPlay(); show(S.trace.steps.length - 1); }
    });

    setControls(false); renderNote(null); renderMemPlaceholder();
    $('#console').innerHTML = placeholderOut();
    applyMode();

    (async () => {
      if (/[?&]teacher=1/.test(location.search) || store.get('codelens.teacher', '0') === '1') S.teacher = false, S._wantTeacher = true;
      await loadFileLessons();
      if (S._wantTeacher) { S.teacher = false; enableTeacher(); } else buildLessons();
      const m = /^#(c|cpp|py)=(.+)$/.exec(location.hash);
      if (m) {
        try { S.lang = m[1]; document.querySelectorAll('.langs button').forEach(b => b.setAttribute('aria-selected', b.dataset.lang === S.lang)); editor.setLang(S.lang); editor.value = unb64(m[2]); S.lesson = null; renderLessonBar(); renderLessonPane(); renderDrawer(); setTab('mem'); setStatus(T('The shared code is open — press Run.', 'Shared code khul gaya — Run karo.')); if (S.lang === 'py') pyStart(); return; }
        catch (e) { toast(T('The code in the link could not be read.', 'Link ka code padha nahi ja saka.')); }
      }
      const last = store.get('codelens.lesson', 'vars');
      const first = S.lessons.find(l => l.id === last) || S.lessons[0];
      if (first) openLesson(first, 'c'); else { editor.value = STARTER.c; renderLessonBar(); renderLessonPane(); }
      if (!store.get('codelens.seen', '')) { store.set('codelens.seen', '1'); $('#helpDlg').showModal(); }
    })();
  }

  CL.App = { S, run, show };
  document.addEventListener('DOMContentLoaded', init);
})();
