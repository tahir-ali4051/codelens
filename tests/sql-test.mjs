import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create role anon; create role authenticated;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
`);
const sql = fs.readFileSync('/home/claude/codelens/supabase/schema.sql', 'utf8');
await db.exec(sql); await db.exec(sql);
console.log('schema loaded twice OK');
const T1 = '11111111-1111-1111-1111-111111111111', T2 = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users(id,email) values ('${T1}','t1@x'),('${T2}','t2@x')`);
// teacher = authenticated with uid; student = anon (no uid)
async function as(role, uid, q, params) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${uid || ''}',false), set_config('request.jwt.claims','${JSON.stringify(uid ? { sub: uid } : {})}',false);`);
  try { return (await db.query(q, params)).rows; } catch (e) { return 'ERR:' + e.message; } finally { await db.exec('reset role'); }
}
const teacher = (u, q, p) => as('authenticated', u, q, p), student = (q, p) => as('anon', null, q, p);
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const has = (r, w) => JSON.stringify(r).includes(w);
let r = await student(`select create_class('x')`); ok(has(r, 'ERR'), 'student (anon) cannot create a class');
r = await teacher(T1, `select (create_class('Class 9A')).code as code`); const code = r[0].code; ok(/^[A-Z2-9]{4}-[A-Z2-9]{2}$/.test(code), 'teacher creates class, code ' + code);
r = await student(`select join_class($1,'Ali Khan','1234') as j`, [code.toLowerCase().replace('-', ' ')]); const tokAli = r[0].j.token; ok(!!tokAli, 'student joins with sloppy code and gets a token');
r = await student(`select join_class($1,'ali  khan','9999') as j`, [code]); ok(has(r, 'wrong_pin'), 'wrong pin rejected');
r = await student(`select join_class($1,'ali  khan','1234') as j`, [code]); const tokAli2 = r[0].j.token; ok(tokAli2 && tokAli2 !== tokAli, 'same name+pin on a new device gets a new token');
r = await student(`select whoami($1) as w`, [tokAli]); ok(r[0].w === null, 'old device token is dead');
r = await student(`select whoami($1) as w`, [tokAli2]); ok(r[0].w.class_name === 'Class 9A', 'new token works');
r = await student(`select join_class('ZZZZ-ZZ','Bob','1111')`); ok(has(r, 'bad_code'), 'bad code rejected');
r = await student(`select join_class($1,'Bob','12')`, [code]); ok(has(r, 'bad_pin'), 'bad pin format rejected');
r = await student(`select join_class($1,'Sara','5555') as j`, [code]); const tokSara = r[0].j.token; ok(!!tokSara, 'second student joins');
await student(`select record_progress($1,'vars','c',40,false,true)`, [tokAli2]);
await student(`select record_progress($1,'vars','c',100,true,true)`, [tokAli2]);
await student(`select record_progress($1,'vars','c',10,false,false)`, [tokAli2]);
await student(`select record_progress($1,'vars','c',20,false,true)`, [tokSara]);
await student(`select record_progress('00000000-0000-0000-0000-000000000000','vars','c',100,true,true)`); // bogus token: ignored
r = await student(`select * from my_progress($1)`, [tokAli2]); ok(r.length === 1 && r[0].runs === 2 && r[0].best_pct === 100 && r[0].done === true, 'progress accumulates: ' + JSON.stringify(r));
r = await student(`select * from my_progress($1)`, [tokSara]); ok(r.length === 1 && r[0].done === false, 'other student has own progress');
r = await student(`select * from my_progress('00000000-0000-0000-0000-000000000000')`); ok(r.length === 0, 'bogus token sees nothing');
// students cannot read tables or call teacher functions
r = await student(`select * from students`); ok(has(r, 'ERR'), 'student cannot read students table');
r = await student(`select * from progress`); ok(has(r, 'ERR'), 'student cannot read progress table');
r = await student(`select * from classes`); ok(has(r, 'ERR'), 'student cannot read classes table (codes stay secret)');
r = await student(`select reset_pin((select id from students limit 1),'0000')`); ok(has(r, 'ERR'), 'student cannot reset PINs');
// teacher views
r = await teacher(T1, `select name from students order by name`); ok(r.length === 2, 'teacher sees both students');
r = await teacher(T1, `select count(*)::int n from progress`); ok(r[0].n === 2, 'teacher sees class progress');
r = await teacher(T2, `select count(*)::int n from students`); ok(r[0].n === 0, 'other teacher sees nothing');
r = await teacher(T2, `select count(*)::int n from progress`); ok(r[0].n === 0, 'other teacher sees no progress');
r = await teacher(T2, `select count(*)::int n from classes`); ok(r[0].n === 0, 'other teacher sees no classes');
r = await teacher(T2, `select reset_pin((select id from students limit 1),'0000')`); ok(has(r, 'ERR'), 'other teacher cannot reset PIN');
// lockout + reset
for (let i = 0; i < 10; i++) await student(`select join_class($1,'Sara','0000')`, [code]);
r = await student(`select join_class($1,'Sara','5555')`, [code]); ok(has(r, 'locked'), 'locks after 10 wrong PINs');
const sara = (await teacher(T1, `select id from students where name='Sara'`))[0].id;
await teacher(T1, `select reset_pin($1,'7777')`, [sara]);
r = await student(`select join_class($1,'Sara','7777') as j`, [code]); ok(r[0] && r[0].j.name === 'Sara', 'teacher PIN reset unlocks');
// remove / archive / leave
r = await teacher(T1, `delete from students where name='Ali Khan' returning id`); ok(r.length === 1, 'teacher removes student');
r = await teacher(T1, `select count(*)::int n from progress`); ok(r[0].n === 1, 'progress of removed student gone');
r = await student(`select whoami($1) as w`, [tokAli2]); ok(r[0].w === null, 'removed student token is dead');
await teacher(T1, `update classes set archived = true`); r = await student(`select join_class($1,'New','1111')`, [code]); ok(has(r, 'bad_code'), 'archived class cannot be joined');
await teacher(T1, `update classes set archived = false`);
await student(`select leave_class($1)`, [tokSara]); r = await student(`select whoami($1) as w`, [tokSara]); ok(r[0].w === null, 'leave_class works');
