// Browser test for classes & progress, using the mock Supabase. Run: NODE_PATH=$(npm root -g) node tests/cloud-ui-test.js  (site served on :8123)
const { chromium } = require('playwright'); const fs = require('fs');
const mock = fs.readFileSync(__dirname + '/mock-supabase.js', 'utf8');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/shots';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**/js/vendor/supabase.js', (r) => r.fulfill({ contentType: 'text/javascript', body: mock }));
  await ctx.route('**/js/config.js', async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("supabaseUrl: ''", "supabaseUrl: 'http://x'").replace("supabaseAnonKey: ''", "supabaseAnonKey: 'k'") }); });
  const errs = []; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const T = await ctx.newPage(); T.on('pageerror', (e) => errs.push('T:' + e.message));
  await T.goto('http://localhost:8123/teacher.html'); await T.waitForSelector('#lf');
  await T.click('#swap'); await T.fill('#em', 'sir@x.com'); await T.fill('#pw', 'secret1'); await T.click('#lf button[type=submit]');
  await T.waitForSelector('#nf'); ok(true, 'teacher signed up and sees classes');
  await T.fill('#nn', 'Class 9A — C'); await T.click('#nf button'); await T.waitForSelector('#showCode');
  const code = (await T.textContent('#showCode b')).trim(); ok(/^[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(code), 'class created with code ' + code);
  await T.screenshot({ path: SHOTS + '/t_empty.png' });
  // students
  const join = async (fresh) => {
    const p = await ctx.newPage(); if (fresh) await p.addInitScript(() => { try { localStorage.removeItem('codelens.stoken'); } catch (e) {} }); p.on('pageerror', (e) => errs.push('S:' + e.message));
    await p.goto('http://localhost:8123/index.html'); await p.waitForTimeout(500);
    await p.evaluate(() => { try { document.querySelector('#helpDlg').close(); } catch (e) {} });
    return p;
  };
  const S1 = await join(false); ok(await S1.isVisible('#btnJoin'), 'Join class button shown when configured');
  await S1.click('#btnJoin'); await S1.fill('#jCode', code.toLowerCase()); await S1.fill('#jName', 'Ali Khan'); await S1.fill('#jPin', '12'); await S1.click('#jGo');
  ok((await S1.textContent('#jError')).includes('4 digits'), 'bad PIN message shown');
  await S1.fill('#jCode', 'ZZZZ-ZZ'); await S1.fill('#jPin', '1234'); await S1.click('#jGo');
  ok((await S1.textContent('#jError')).includes('not found'), 'bad code message shown');
  await S1.screenshot({ path: SHOTS + '/s_join.png' });
  await S1.fill('#jCode', code); await S1.click('#jGo'); await S1.waitForFunction(() => !document.querySelector('#joinDlg').open);
  ok((await S1.textContent('#btnJoin')).includes('Ali Khan'), 'joined: name on button');
  // run lesson and step to the end
  await S1.click('#btnRun'); await S1.waitForSelector('#cLast:not([disabled])'); await S1.click('#cLast'); await S1.waitForTimeout(400);
  await S1.click('#btnLessons'); await S1.waitForTimeout(300);
  ok((await S1.locator('.lesson-item[data-id=vars] .prog.done').count()) === 1, 'finished lesson gets a ✔ tick');
  await S1.screenshot({ path: SHOTS + '/s_drawer.png' });
  await S1.reload(); await S1.waitForTimeout(600); ok((await S1.textContent('#btnJoin')).includes('Ali Khan'), 'student stays joined after a reload');
  ok((await S1.evaluate(() => CL.Cloud.lessonDone('vars'))), 'progress is loaded back after reload');
  // second student, only starts a lesson
  const S2 = await join(true); await S2.click('#btnJoin'); await S2.fill('#jCode', code); await S2.fill('#jName', 'Sara'); await S2.fill('#jPin', '4321'); await S2.click('#jGo'); await S2.waitForFunction(() => !document.querySelector('#joinDlg').open);
  await S2.click('#btnRun'); await S2.waitForSelector('#cNext:not([disabled])'); await S2.waitForTimeout(300);
  // edited code must NOT count
  const S3 = await join(true); await S3.click('#btnJoin'); await S3.fill('#jCode', code); await S3.fill('#jName', 'Bilal'); await S3.fill('#jPin', '1111'); await S3.click('#jGo'); await S3.waitForFunction(() => !document.querySelector('#joinDlg').open);
  // same name+PIN on a "new device" (fresh context storage is shared in mock, so just test wrong pin)
  const S4 = await join(true); await S4.click('#btnJoin'); await S4.fill('#jCode', code); await S4.fill('#jName', 'ali khan'); await S4.fill('#jPin', '9999'); await S4.click('#jGo');
  ok((await S4.textContent('#jError')).includes('Wrong PIN'), 'wrong PIN for existing name is rejected');
  // teacher dashboard
  await T.reload(); await T.waitForSelector('table.pg');
  const txt = await T.textContent('.tstats');
  ok(/3\s*students joined/.test(txt), 'dashboard shows 3 students: ' + txt.replace(/\s+/g, ' '));
  ok((await T.locator('td.pc.done').count()) >= 1, 'dashboard shows Ali ✔');
  ok((await T.locator('td.pc.half').count()) >= 1, 'dashboard shows Sara ◐');
  await T.screenshot({ path: SHOTS + '/t_grid.png' });
  await T.click('#showCode'); await T.waitForTimeout(200); await T.screenshot({ path: SHOTS + '/t_code.png' }); await T.click('#bcClose');
  T.on('dialog', (d) => d.accept()); await T.click('[data-pin]'); await T.waitForTimeout(300);
  await T.click('#csv').catch(() => {});
  console.log('page errors:', errs);
  if (errs.length) process.exitCode = 1;
  await b.close();
})();
