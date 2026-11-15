require('./run.js');
require('../js/lessons-a.js'); require('../js/lessons-b.js');
let bad = 0, count = 0;
for (const l of CL.LESSONS) for (const lang of ['c','cpp']) {
  const v = l.v[lang] || (lang==='cpp' ? l.v.c : null); if (!v) continue;
  count++;
  const r = CL.runCode(v.code, lang, v.stdin||'');
  const expectErr = ['oob','dangling'].includes(l.id);
  const ok = expectErr ? !!r.error : !r.error;
  if (!ok) bad++;
  console.log((ok?'ok  ':'BAD ')+l.id+'/'+lang+' steps='+r.steps.length+(r.truncated?' TRUNC':'')+' out='+JSON.stringify(r.out.slice(0,60))+(r.error?' err='+r.error.msg.slice(0,70):''));
}
console.log('checked', count, 'bad', bad);
