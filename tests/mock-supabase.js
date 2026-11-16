/* In-memory stand-in for supabase-js, used only by the browser tests. State lives in localStorage so the student page and the teacher page share it. */
(function () {
  const DB = () => JSON.parse(localStorage.getItem('mockdb') || '{"users":[],"classes":[],"students":[],"progress":[]}');
  const save = (d) => localStorage.setItem('mockdb', JSON.stringify(d));
  const uid = () => 'u' + Math.random().toString(36).slice(2, 10);
  globalThis.supabase = {
    createClient() {
      let key = null;
      const sk = () => 'mocksess-' + (key || 'x');
      const sess = () => JSON.parse(sessionStorage.getItem(sk()) || 'null');
      const me = () => { const s = sess(); return s ? s.id : null; };
      const api = {
        auth: {
          async getSession() { return { data: { session: sess() } }; },
          async signInAnonymously() { sessionStorage.setItem(sk(), JSON.stringify({ id: uid(), anon: true })); return { error: null }; },
          async signInWithPassword({ email, password }) { const d = DB(); const u = d.users.find((x) => x.email === email && x.pw === password); if (!u) return { error: { message: 'Invalid login credentials' } }; sessionStorage.setItem(sk(), JSON.stringify({ id: u.id })); return { error: null }; },
          async signUp({ email, password }) { const d = DB(); if (d.users.find((x) => x.email === email)) return { error: { message: 'User already registered' } }; const u = { id: uid(), email, pw: password }; d.users.push(u); save(d); sessionStorage.setItem(sk(), JSON.stringify({ id: u.id })); return { error: null, data: { session: { id: u.id } } }; },
          async signOut() { sessionStorage.removeItem(sk()); return {}; }
        },
        async rpc(name, a) {
          const d = DB(), id = me();
          const out = (data) => { save(d); return { data, error: null }; };
          if (name === 'create_class') { const c = { id: '00000000-0000-4000-8000-' + String(d.classes.length + 1).padStart(12, '0'), teacher_id: id, name: a.p_name, code: 'K7M2-Q' + 'XYZW'[d.classes.length % 4], archived: false, created_at: new Date().toISOString() }; d.classes.push(c); return out(c); }
          if (name === 'join_class') {
            const code = a.p_code.toUpperCase().replace(/[^A-Z0-9]/g, ''); const c = d.classes.find((x) => x.code.replace('-', '') === code && !x.archived);
            if (!c) return out({ error: 'bad_code' }); if (!/^\d{4}$/.test(a.p_pin)) return out({ error: 'bad_pin' });
            let s = d.students.find((x) => x.class_id === c.id && x.name.toLowerCase() === a.p_name.trim().toLowerCase());
            if (s) { if (s.pin !== a.p_pin) { s.fails = (s.fails || 0) + 1; return out({ error: 'wrong_pin' }); } }
            else { s = { id: 's' + uid(), class_id: c.id, name: a.p_name.trim(), pin: a.p_pin, fails: 0 }; d.students.push(s); }
            s.token = uid(); s.last_seen = new Date().toISOString();
            return out({ student_id: s.id, name: s.name, class_name: c.name, token: s.token });
          }
          if (name === 'whoami') { const s = d.students.find((x) => x.token === a.p_token); const c = s && d.classes.find((x) => x.id === s.class_id); return out(s ? { student_id: s.id, name: s.name, class_name: c.name } : null); }
          if (name === 'leave_class') { d.students.forEach((x) => { if (x.token === a.p_token) x.token = null; }); return out(null); }
          if (name === 'my_progress') { const s = d.students.find((x) => x.token === a.p_token); return out(s ? d.progress.filter((p) => p.student_id === s.id) : []); }
          if (name === 'record_progress') {
            const s = d.students.find((x) => x.token === a.p_token); if (!s) return out(null);
            let p = d.progress.find((x) => x.student_id === s.id && x.lesson_id === a.p_lesson && x.lang === a.p_lang);
            if (!p) { p = { student_id: s.id, lesson_id: a.p_lesson, lang: a.p_lang, runs: 0, best_pct: 0, done: false, last_at: '' }; d.progress.push(p); }
            p.runs += a.p_run ? 1 : 0; p.best_pct = Math.max(p.best_pct, a.p_pct); p.done = p.done || a.p_done; p.last_at = new Date().toISOString(); s.last_seen = p.last_at; return out(null);
          }
          if (name === 'reset_pin') { const s = d.students.find((x) => x.id === a.p_student); s.pin = a.p_pin; s.fails = 0; return out(null); }
          return { data: null, error: { message: 'unknown rpc ' + name } };
        },
        from(table) {
          const q = { f: [], upd: null, del: false, ord: null };
          const run = () => {
            const d = DB(), id = me(); let rows = d[table] || [];
            if (table === 'classes') rows = rows.filter((c) => c.teacher_id === id);
            q.f.forEach(([k, v]) => { rows = rows.filter((r) => r[k] === v); });
            if (q.upd) { rows.forEach((r) => Object.assign(r, q.upd)); save(d); return { data: null, error: null }; }
            if (q.del) { const ids = new Set(rows.map((r) => r.id)); d[table] = d[table].filter((r) => !ids.has(r.id)); if (table === 'students') d.progress = d.progress.filter((p) => !ids.has(p.student_id)); save(d); return { data: null, error: null }; }
            if (table === 'students') rows = rows.map((s) => Object.assign({}, s, { progress: d.progress.filter((p) => p.student_id === s.id) }));
            if (q.ord) rows = rows.slice().sort((a, b) => (a[q.ord[0]] > b[q.ord[0]] ? 1 : -1) * (q.ord[1].ascending === false ? -1 : 1));
            return { data: rows, error: null };
          };
          const o = { select() { return o; }, eq(k, v) { q.f.push([k, v]); return o; }, order(k, op) { q.ord = [k, op || {}]; return o; }, update(v) { q.upd = v; return o; }, delete() { q.del = true; return o; }, then(res, rej) { return Promise.resolve(run()).then(res, rej); } };
          return o;
        }
      };
      const orig = api.auth;
      return Object.assign(api, { _setKey(k) { key = k; } });
    }
  };
  // the real client takes the key from options; emulate that
  const real = globalThis.supabase.createClient;
  globalThis.supabase.createClient = function (u, k, opts) { const c = real(); c._setKey(opts && opts.auth && opts.auth.storageKey); return c; };
})();
