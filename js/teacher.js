/* CodeLens — teacher dashboard: login, classes, progress grid */
(function () {
  const CL = globalThis.CL, C = CL.Cloud;
  const $ = (s) => document.querySelector(s);
  const main = $('#tmain');
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  let LANG = store.get('codelens.mode', 'both') === 'ur' ? 'ur' : 'en';
  const t = (en, ur) => (LANG === 'ur' ? ur : en);
  const S = { classes: [], cls: null, rows: [], lessons: [], sort: 'name', q: '', timer: null, signedIn: false };

  const ERR = {
    'Invalid login credentials': () => t('Wrong email or password.', 'Email ya password galat hai.'),
    'Email not confirmed': () => t('Please confirm your email first (check your inbox), then sign in.', 'Pehle apni email confirm karo (inbox dekho), phir sign in karo.'),
    'User already registered': () => t('This email already has an account — use Sign in.', 'Is email ka account pehle se hai — Sign in karo.'),
    network: () => t('No internet connection.', 'Internet nahi hai.')
  };
  const errText = (e) => { const m = String(e || ''); const k = Object.keys(ERR).find((x) => m.includes(x)); return k ? ERR[k]() : m; };

  function setLangBtn() {
    $('#tLang').textContent = LANG === 'ur' ? 'UR' : 'EN';
    $('#tBack').textContent = t('Student site', 'Student site');
    $('#tOut').textContent = t('Sign out', 'Sign out');
    $('#bcClose').textContent = t('Close', 'Band karo');
  }

  // ---------- lessons list (built-in + the teacher's lessons-custom.json) ----------
  async function loadLessons() {
    let list = (CL.LESSONS || []).slice(), hide = false;
    try {
      const r = await fetch(CL_CONFIG.customLessonsFile, { cache: 'no-cache' });
      if (r.ok) { const j = await r.json(); const custom = Array.isArray(j) ? j : (j.lessons || []); hide = !Array.isArray(j) && !!j.hideBuiltin; list = (hide ? [] : list).concat(custom); }
    } catch (e) { /* none */ }
    S.lessons = list;
  }
  const lt = (x) => (x && typeof x === 'object' && !Array.isArray(x)) ? (LANG === 'ur' ? (x.ur || x.en) : x.en) : (x || '');

  // ---------- screens ----------
  function viewNotConfigured() {
    main.innerHTML = '<div class="tcard tlogin"><h1>' + esc(t('Accounts are not set up yet', 'Accounts abhi set up nahi hue')) + '</h1><p>' +
      esc(t('Follow SETUP-ACCOUNTS.md (about 10 minutes), then paste the two Supabase values into js/config.js.', 'SETUP-ACCOUNTS.md follow karo (taqreeban 10 minute), phir do Supabase values js/config.js me paste karo.')) + '</p></div>';
  }

  function viewLogin(mode, msg) {
    mode = mode || 'in';
    main.innerHTML = '<form class="tcard tlogin" id="lf"><h1>' + esc(mode === 'in' ? t('Teacher sign in', 'Teacher sign in') : t('Create teacher account', 'Teacher account banao')) + '</h1>' +
      '<p class="tmuted">' + esc(t('Students do not use this page. They join from the normal site with your class code.', 'Students ye page use nahi karte. Wo normal site par tumhare class code se join karte hain.')) + '</p>' +
      '<label for="em">Email</label><input id="em" type="email" autocomplete="email" required>' +
      '<label for="pw">' + esc(t('Password (at least 6 characters)', 'Password (kam az kam 6 characters)')) + '</label><input id="pw" type="password" autocomplete="' + (mode === 'in' ? 'current-password' : 'new-password') + '" minlength="6" required>' +
      '<div class="row"><button class="btn primary" type="submit">' + esc(mode === 'in' ? t('Sign in', 'Sign in') : t('Create account', 'Account banao')) + '</button>' +
      '<button class="btn" type="button" id="swap">' + esc(mode === 'in' ? t('I am new — create account', 'Naya hun — account banao') : t('I have an account', 'Mera account hai')) + '</button></div>' +
      '<p class="tmsg ' + (msg && msg.ok ? 'ok' : 'err') + '" id="lmsg" role="alert">' + esc(msg ? msg.text : '') + '</p></form>';
    $('#swap').onclick = () => viewLogin(mode === 'in' ? 'up' : 'in');
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      const em = $('#em').value.trim(), pw = $('#pw').value;
      const r = mode === 'in' ? await C.teacher.signIn(em, pw) : await C.teacher.signUp(em, pw);
      if (!r.ok) { $('#lmsg').className = 'tmsg err'; $('#lmsg').textContent = errText(r.error); return; }
      if (mode === 'up' && r.needsConfirm) { viewLogin('in', { ok: true, text: t('Account created. Check your email and click the confirm link, then sign in.', 'Account ban gaya. Email me confirm link par click karo, phir sign in karo.') }); return; }
      start();
    };
  }

  async function viewClasses() {
    clearInterval(S.timer); S.cls = null; history.replaceState(null, '', location.pathname);
    $('#tOut').hidden = false;
    main.innerHTML = '<p class="tmuted">' + esc(t('Loading…', 'Load ho raha hai…')) + '</p>';
    try { S.classes = await C.teacher.listClasses(); } catch (e) { main.innerHTML = '<p class="tmsg err">' + esc(errText(e.message || e)) + '</p>'; return; }
    const cards = S.classes.filter((c) => !c.archived).map((c) =>
      '<button class="tcard ccard" data-id="' + esc(c.id) + '"><h3>' + esc(c.name) + '</h3><div class="ccode">' + esc(c.code) + '</div><span class="tmuted">' + esc(t('Open progress →', 'Progress dekho →')) + '</span></button>').join('');
    const old = S.classes.filter((c) => c.archived);
    main.innerHTML = '<div class="thead"><h1>' + esc(t('My classes', 'Meri classes')) + '</h1></div>' +
      '<form class="tnew" id="nf"><input id="nn" maxlength="60" placeholder="' + esc(t('New class name, e.g. Class 9 — Python', 'Nayi class ka naam, jaise Class 9 — Python')) + '" required><button class="btn primary" type="submit">' + esc(t('Create class', 'Class banao')) + '</button></form>' +
      (cards ? '<div class="cgrid">' + cards + '</div>' : '<p class="tmuted">' + esc(t('No class yet. Create your first class above — you get a code to give your students.', 'Abhi koi class nahi. Upar pehli class banao — tumhe ek code milega jo students ko dena hai.')) + '</p>') +
      (old.length ? '<h3 style="margin-top:2rem">' + esc(t('Archived', 'Archived')) + '</h3><div class="trow">' + old.map((c) => '<button class="smallbtn" data-restore="' + esc(c.id) + '">' + esc(c.name) + ' — ' + esc(t('restore', 'wapas lao')) + '</button>').join('') + '</div>' : '');
    main.querySelectorAll('.ccard').forEach((b) => (b.onclick = () => openClass(b.dataset.id)));
    main.querySelectorAll('[data-restore]').forEach((b) => (b.onclick = async () => { await C.teacher.setArchived(b.dataset.restore, false); viewClasses(); }));
    $('#nf').onsubmit = async (e) => {
      e.preventDefault();
      try { const c = await C.teacher.createClass($('#nn').value); openClass(c.id); } catch (er) { alert(errText(er.message || er)); }
    };
  }

  async function openClass(id) {
    S.cls = S.classes.find((c) => c.id === id) || (await C.teacher.listClasses()).find((c) => c.id === id);
    if (!S.cls) return viewClasses();
    history.replaceState(null, '', '#class=' + id);
    await refresh(true);
    clearInterval(S.timer); S.timer = setInterval(() => refresh(false), 15000);
  }

  // per-student summary
  function summarize(st) {
    const by = new Map();
    (st.progress || []).forEach((p) => {
      const cur = by.get(p.lesson_id) || { done: false, started: true, runs: 0, pct: 0, last: null, langs: [] };
      cur.done = cur.done || p.done; cur.runs += p.runs; cur.pct = Math.max(cur.pct, p.best_pct); cur.langs.push(p.lang);
      if (!cur.last || p.last_at > cur.last) cur.last = p.last_at;
      by.set(p.lesson_id, cur);
    });
    let done = 0, last = st.last_seen;
    by.forEach((v) => { if (v.done) done++; if (v.last && v.last > last) last = v.last; });
    return { by, done, last: last || st.last_seen };
  }
  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return t('now', 'abhi'); if (s < 3600) return Math.round(s / 60) + t(' min ago', ' min pehle');
    if (s < 86400) return Math.round(s / 3600) + t(' h ago', ' ghante pehle'); return Math.round(s / 86400) + t(' d ago', ' din pehle');
  };

  async function refresh(first) {
    try { S.rows = await C.teacher.classData(S.cls.id); } catch (e) { if (first) main.innerHTML = '<p class="tmsg err">' + esc(errText(e.message || e)) + '</p>'; return; }
    S.rows.forEach((r) => (r.sum = summarize(r)));
    renderClass();
  }

  function renderClass() {
    const keep = $('.gridwrap'); const sx = keep ? keep.scrollLeft : 0, sy = keep ? keep.scrollTop : 0;
    const L = S.lessons, rows = S.rows.slice();
    const q = S.q.trim().toLowerCase();
    let shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    shown.sort(S.sort === 'low' ? (a, b) => a.sum.done - b.sum.done || a.name.localeCompare(b.name)
      : S.sort === 'high' ? (a, b) => b.sum.done - a.sum.done || a.name.localeCompare(b.name)
      : S.sort === 'recent' ? (a, b) => (b.sum.last || '').localeCompare(a.sum.last || '')
      : (a, b) => a.name.localeCompare(b.name));
    const activeNow = rows.filter((r) => Date.now() - new Date(r.sum.last).getTime() < 10 * 60 * 1000).length;
    const avg = rows.length && L.length ? Math.round((rows.reduce((s, r) => s + r.sum.done, 0) / (rows.length * L.length)) * 100) : 0;
    const notStarted = rows.filter((r) => r.sum.by.size === 0).length;
    const pctRow = L.map((l) => { const n = rows.filter((r) => (r.sum.by.get(l.id) || {}).done).length; const p = rows.length ? Math.round((n / rows.length) * 100) : 0; return '<td class="' + (rows.length >= 5 && p < 30 ? 'low' : '') + '" title="' + esc(lt(l.title)) + '">' + (rows.length ? p + '%' : '') + '</td>'; }).join('');
    const head = L.map((l, i) => '<th title="' + esc(lt(l.title)) + '">' + (i + 1) + '</th>').join('');
    const body = shown.map((r) => {
      const cells = L.map((l) => {
        const p = r.sum.by.get(l.id);
        if (!p) return '<td class="pc"></td>';
        const tip = lt(l.title) + ' — ' + p.runs + t(' runs, reached ', ' runs, pohnche ') + p.pct + '%';
        return '<td class="pc ' + (p.done ? 'done' : 'half') + '" title="' + esc(tip) + '">' + (p.done ? '✔' : '▶') + '</td>';
      }).join('');
      const live = Date.now() - new Date(r.sum.last).getTime() < 10 * 60 * 1000;
      return '<tr><td class="pn">' + esc(r.name) + (r.pin_fails >= 10 ? ' 🔒' : '') + '</td><td><b>' + r.sum.done + '</b>/' + L.length + '</td><td class="' + (live ? 'act' : 'idle') + '">' + (live ? '● ' : '') + esc(ago(r.sum.last)) + '</td>' + cells +
        '<td><button class="smallbtn" data-pin="' + esc(r.id) + '" data-n="' + esc(r.name) + '">' + esc(t('New PIN', 'Naya PIN')) + '</button> <button class="smallbtn danger" data-del="' + esc(r.id) + '" data-n="' + esc(r.name) + '">✕</button></td></tr>';
    }).join('');
    main.innerHTML =
      '<div class="thead"><button class="btn" id="back">← ' + esc(t('Classes', 'Classes')) + '</button><h1>' + esc(S.cls.name) + '</h1><span class="grow"></span>' +
      '<button class="btn primary" id="showCode">' + esc(t('Show class code', 'Class code dikhao')) + ': <b class="ccode" style="font-size:1.1rem">' + esc(S.cls.code) + '</b></button></div>' +
      '<div class="tstats"><div class="tstat"><b>' + rows.length + '</b><span>' + esc(t('students joined', 'students shamil')) + '</span></div>' +
      '<div class="tstat"><b>' + activeNow + '</b><span>' + esc(t('active in last 10 min', 'pichle 10 min me active')) + '</span></div>' +
      '<div class="tstat"><b>' + avg + '%</b><span>' + esc(t('average completion', 'average mukammal')) + '</span></div>' +
      '<div class="tstat"><b>' + notStarted + '</b><span>' + esc(t('not started any lesson', 'koi lesson shuru nahi kiya')) + '</span></div></div>' +
      '<div class="tbar"><input type="search" id="q" placeholder="' + esc(t('Find a student…', 'Student dhoondo…')) + '" value="' + esc(S.q) + '">' +
      '<select id="sort" aria-label="Sort"><option value="name">' + esc(t('Sort: name', 'Sort: naam')) + '</option><option value="low">' + esc(t('Sort: least done first (who needs help)', 'Sort: sab se kam kaam wale pehle (madad chahiye)')) + '</option><option value="high">' + esc(t('Sort: most done first', 'Sort: sab se zyada kaam wale pehle')) + '</option><option value="recent">' + esc(t('Sort: recently active', 'Sort: abhi active')) + '</option></select>' +
      '<button class="btn" id="csv">' + esc(t('Download CSV', 'CSV download')) + '</button><button class="btn" id="arch">' + esc(t('Archive class', 'Class archive karo')) + '</button>' +
      '<span class="legend">✔ ' + esc(t('finished', 'mukammal')) + ' &nbsp; ▶ ' + esc(t('started', 'shuru')) + ' &nbsp; ' + esc(t('updates every 15 s', 'har 15 s me update')) + '</span></div>' +
      (rows.length ? '<div class="gridwrap"><table class="pg"><thead><tr><th class="pn">' + esc(t('Student', 'Student')) + '</th><th>' + esc(t('Done', 'Done')) + '</th><th>' + esc(t('Last seen', 'Aakhri baar')) + '</th>' + head + '<th></th></tr>' +
        '<tr class="pct"><td class="pn">' + esc(t('% of class finished', 'Class ke kitne % ne kiya')) + '</td><td></td><td></td>' + pctRow + '<td></td></tr></thead><tbody>' + body + '</tbody></table></div>' +
        '<div class="lessonkey">' + L.map((l, i) => '<div><b>' + (i + 1) + '.</b> ' + esc(lt(l.title)) + '</div>').join('') + '</div>'
        : '<div class="tcard"><p style="font-size:1.2rem;margin:0">' + esc(t('Nobody has joined yet.', 'Abhi koi shamil nahi hua.')) + '</p><p class="tmuted">' + esc(t('Press “Show class code”, put it on the board, and ask students to open the CodeLens site → Join class.', '“Class code dikhao” dabao, board par lagao aur students se kaho CodeLens site → Join class kholen.')) + '</p></div>');
    $('#sort').value = S.sort;
    const g = $('.gridwrap'); if (g) { g.scrollLeft = sx; g.scrollTop = sy; }
    $('#back').onclick = viewClasses;
    $('#showCode').onclick = showCode;
    $('#q').oninput = (e) => { S.q = e.target.value; renderClass(); const i = $('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
    $('#sort').onchange = (e) => { S.sort = e.target.value; renderClass(); };
    $('#csv').onclick = exportCsv;
    $('#arch').onclick = async () => { if (confirm(t('Archive this class? Students can no longer join it. You can restore it later.', 'Ye class archive karein? Students ab join nahi kar sakenge. Baad me wapas la sakte ho.'))) { await C.teacher.setArchived(S.cls.id, true); viewClasses(); } };
    main.querySelectorAll('[data-pin]').forEach((b) => (b.onclick = () => newPin(b.dataset.pin, b.dataset.n)));
    main.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => removeStudent(b.dataset.del, b.dataset.n)));
  }

  function showCode() {
    const url = location.origin + location.pathname.replace(/teacher\.html$/, '');
    $('#bcHow').textContent = t('Open the CodeLens site → Join class → type this code', 'CodeLens site kholo → Join class → ye code likho');
    $('#bcCode').textContent = S.cls.code;
    $('#bcSite').textContent = url;
    $('#codeDlg').showModal();
  }
  async function newPin(id, name) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    if (!confirm(t('Set a new PIN for ' + name + '?', name + ' ke liye naya PIN set karein?'))) return;
    try { await C.teacher.resetPin(id, pin); alert(t('New PIN for ' + name + ': ' + pin + '\nTell the student. They sign in with the same name and this PIN.', name + ' ka naya PIN: ' + pin + '\nStudent ko bata do. Wo wahi naam aur ye PIN daal kar sign in karega.')); refresh(false); }
    catch (e) { alert(errText(e.message || e)); }
  }
  async function removeStudent(id, name) {
    if (!confirm(t('Remove ' + name + ' and their progress?', name + ' aur uska progress hata dein?'))) return;
    try { await C.teacher.removeStudent(id); refresh(false); } catch (e) { alert(errText(e.message || e)); }
  }
  function exportCsv() {
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const head = ['Student', 'Done', 'Last seen'].concat(S.lessons.map((l) => lt(l.title)));
    const lines = [head.map(q).join(',')].concat(S.rows.map((r) => [r.name, r.sum.done, r.sum.last].concat(S.lessons.map((l) => { const p = r.sum.by.get(l.id); return p ? (p.done ? 'done' : 'started ' + p.pct + '%') : ''; })).map(q).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = (S.cls.name.replace(/[^\w-]+/g, '_') || 'class') + '-progress.csv'; a.click();
  }

  // ---------- start ----------
  async function start() {
    setLangBtn();
    if (!C.enabled) { viewNotConfigured(); return; }
    await loadLessons();
    const sess = await C.teacher.session();
    S.signedIn = !!sess;
    $('#tOut').hidden = !sess;
    if (!sess) { viewLogin('in'); return; }
    const m = /^#class=([0-9a-f-]{36})$/.exec(location.hash);
    if (m) { await viewClasses(); openClass(m[1]); } else viewClasses();
  }
  $('#tOut').onclick = async () => { clearInterval(S.timer); await C.teacher.signOut(); $('#tOut').hidden = true; history.replaceState(null, '', location.pathname); viewLogin('in'); };
  $('#tLang').onclick = () => { LANG = LANG === 'en' ? 'ur' : 'en'; store.set('codelens.mode', LANG); setLangBtn(); if (S.cls) renderClass(); else if (S.signedIn) viewClasses(); else if (C.enabled) viewLogin('in'); else viewNotConfigured(); };
  $('#bcClose').onclick = () => $('#codeDlg').close();
  start();
})();
