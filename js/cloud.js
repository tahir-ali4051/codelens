/* CodeLens — classes & progress (Supabase). Everything here is optional: if the URL/key are empty, CL.Cloud.enabled is false. */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  const cfg = globalThis.CL_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && globalThis.supabase);
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

  // Teachers sign in (Supabase Auth). Students do NOT sign in: they hold a secret token that the database gave them when they joined,
  // so a whole school can join at the same moment without hitting any sign-in limits.
  const clients = {};
  function client(kind) {
    if (!enabled) return null;
    if (!clients[kind]) clients[kind] = globalThis.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { storageKey: 'codelens-' + kind + '-auth', persistSession: kind === 'teacher', autoRefreshToken: kind === 'teacher', detectSessionInUrl: false }
    });
    return clients[kind];
  }
  const errCode = (e) => {
    const m = String((e && e.message) || e || '');
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'network';
    if (/Could not find the function|schema cache|does not exist/i.test(m)) return 'nofunc';
    return m;
  };

  // ---------------- student side ----------------
  const S = { me: null, token: null, progress: new Map(), queue: [], sent: new Map(), ready: false };
  const key = (lesson, lang) => lesson + '|' + lang;
  try { S.queue = JSON.parse(lsGet('codelens.queue', '[]')) || []; } catch (e) { S.queue = []; }
  const saveQueue = () => lsSet('codelens.queue', JSON.stringify(S.queue.slice(-200)));

  async function init() {
    if (!enabled) return null;
    S.token = lsGet('codelens.stoken', '') || null;
    if (S.token) {
      try {
        const r = await client('student').rpc('whoami', { p_token: S.token });
        if (r.error) throw r.error;
        S.me = r.data || null;
        if (S.me) await loadProgress(); else { S.token = null; lsSet('codelens.stoken', ''); }   // token was replaced (joined on another device) or removed
      } catch (e) { /* offline: keep the token and try again later */ }
    }
    S.ready = true;
    flush();
    return S.me;
  }

  async function joinClass(code, name, pin) {
    try {
      const r = await client('student').rpc('join_class', { p_code: code, p_name: name, p_pin: pin });
      if (r.error) return { ok: false, error: errCode(r.error) };
      if (r.data && r.data.error) return { ok: false, error: r.data.error };
      S.me = { student_id: r.data.student_id, name: r.data.name, class_name: r.data.class_name };
      S.token = r.data.token; lsSet('codelens.stoken', S.token);
      S.sent.clear(); S.queue = []; saveQueue();
      await loadProgress();
      return { ok: true, me: S.me };
    } catch (e) { return { ok: false, error: errCode(e) }; }
  }

  async function leave() {
    try { if (S.token) await client('student').rpc('leave_class', { p_token: S.token }); } catch (e) { /* ignore */ }
    S.me = null; S.token = null; lsSet('codelens.stoken', ''); S.progress.clear(); S.sent.clear(); S.queue = []; saveQueue();
  }

  async function loadProgress() {
    const r = await client('student').rpc('my_progress', { p_token: S.token });
    S.progress.clear();
    (r.data || []).forEach((p) => S.progress.set(key(p.lesson_id, p.lang), p));
  }

  // Called by the app: on every run (isRun) and as the student steps through (pct = how far, 0..100).
  function record(lesson, lang, pct, done, isRun) {
    if (!enabled || !S.me || !lesson) return;
    pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    const k = key(lesson, lang), prev = S.sent.get(k) || { pct: -1, done: false };
    if (!isRun && pct < prev.pct + 20 && !(done && !prev.done)) return;           // send only meaningful jumps
    S.sent.set(k, { pct: Math.max(prev.pct, pct), done: prev.done || !!done });
    const local = S.progress.get(k) || { lesson_id: lesson, lang, runs: 0, best_pct: 0, done: false };
    local.runs += isRun ? 1 : 0; local.best_pct = Math.max(local.best_pct, pct); local.done = local.done || !!done;
    S.progress.set(k, local);
    S.queue.push({ l: lesson, g: lang, p: pct, d: !!done, r: !!isRun });
    saveQueue(); flush();
  }

  let flushing = false;
  async function flush() {
    if (flushing || !enabled || !S.me || !S.token || !S.queue.length) return;
    flushing = true;
    try {
      const c = client('student');
      while (S.queue.length) {
        const e = S.queue[0];
        const r = await c.rpc('record_progress', { p_token: S.token, p_lesson: e.l, p_lang: e.g, p_pct: e.p, p_done: e.d, p_run: e.r });
        if (r.error) throw r.error;
        S.queue.shift(); saveQueue();
      }
    } catch (e) { /* will retry on the next event / when the browser is online again */ }
    flushing = false;
  }
  if (typeof window !== 'undefined') window.addEventListener('online', flush);

  // ---------------- teacher side ----------------
  const T = {
    client: () => client('teacher'),
    async session() { const c = client('teacher'); const { data } = await c.auth.getSession(); return data.session; },
    async signIn(email, password) { const r = await client('teacher').auth.signInWithPassword({ email, password }); return r.error ? { ok: false, error: errCode(r.error) } : { ok: true }; },
    async signUp(email, password) {
      const r = await client('teacher').auth.signUp({ email, password });
      if (r.error) return { ok: false, error: errCode(r.error) };
      return { ok: true, needsConfirm: !r.data.session };
    },
    async signOut() { await client('teacher').auth.signOut(); },
    async listClasses() {
      const r = await client('teacher').from('classes').select('id,name,code,archived,created_at').order('created_at', { ascending: false });
      if (r.error) throw r.error; return r.data || [];
    },
    async createClass(name) { const r = await client('teacher').rpc('create_class', { p_name: name }); if (r.error) throw r.error; return r.data; },
    async setArchived(id, v) { const r = await client('teacher').from('classes').update({ archived: v }).eq('id', id); if (r.error) throw r.error; },
    async deleteClass(id) { const r = await client('teacher').from('classes').delete().eq('id', id); if (r.error) throw r.error; },
    async classData(id) {
      const r = await client('teacher').from('students').select('id,name,last_seen,pin_fails,progress(lesson_id,lang,runs,best_pct,done,last_at)').eq('class_id', id).order('name');
      if (r.error) throw r.error; return r.data || [];
    },
    async resetPin(studentId, pin) { const r = await client('teacher').rpc('reset_pin', { p_student: studentId, p_pin: pin }); if (r.error) throw r.error; },
    async removeStudent(id) { const r = await client('teacher').from('students').delete().eq('id', id); if (r.error) throw r.error; }
  };

  CL.Cloud = {
    enabled,
    init, joinClass, leave, record, flush,
    get me() { return S.me; },
    progressFor(lesson, lang) { return S.progress.get(key(lesson, lang)) || null; },
    lessonDone(lesson) { return ['c', 'cpp', 'py'].some((g) => { const p = S.progress.get(key(lesson, g)); return p && p.done; }); },
    lessonStarted(lesson) { return ['c', 'cpp', 'py'].some((g) => S.progress.has(key(lesson, g))); },
    teacher: T
  };
})();
