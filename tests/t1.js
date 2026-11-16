const CL=require('./run.js');
function t(name, src, lang, stdin, expect){
  const r = CL.runCode(src, lang, stdin||'');
  const ok = r.out === expect && !r.error;
  console.log((ok?'PASS ':'FAIL ')+name+(ok?'':'\n  got: '+JSON.stringify(r.out)+' err='+JSON.stringify(r.error)+'\n  exp: '+JSON.stringify(expect)));
  return r;
}
t('hello','#include <stdio.h>\nint main(){ printf("Hello %d\\n", 5); return 0; }','c','', 'Hello 5\n');
t('loop','#include <stdio.h>\nint main(){ int s=0; for(int i=1;i<=5;i++){ s+=i; } printf("%d\\n", s); return 0; }','c','','15\n');
t('func','#include <stdio.h>\nint add(int a,int b){return a+b;}\nint main(){ printf("%d\\n", add(3,4)); return 0; }','c','','7\n');
t('array','#include <stdio.h>\nint main(){ int a[5]={1,2,3}; int s=0; for(int i=0;i<5;i++) s+=a[i]; printf("%d\\n",s); return 0;}','c','','6\n');
t('ptr','#include <stdio.h>\nint main(){ int x=5; int *p=&x; *p=9; printf("%d\\n",x); return 0;}','c','','9\n');
t('malloc','#include <stdio.h>\n#include <stdlib.h>\nint main(){ int *p=(int*)malloc(3*sizeof(int)); for(int i=0;i<3;i++) p[i]=i*i; printf("%d %d\\n",p[1],p[2]); free(p); return 0;}','c','','1 4\n');
t('struct','#include <stdio.h>\nstruct P{int x;int y;};\nint main(){ struct P p={1,2}; p.x+=5; printf("%d %d\\n",p.x,p.y); return 0;}','c','','6 2\n');
t('ll','#include <stdio.h>\n#include <stdlib.h>\ntypedef struct N{int v; struct N*next;}N;\nint main(){ N*h=NULL; for(int i=0;i<3;i++){ N*n=(N*)malloc(sizeof(N)); n->v=i; n->next=h; h=n;} for(N*c=h;c;c=c->next) printf("%d ",c->v); printf("\\n"); return 0;}','c','','2 1 0 \n');
t('fact','#include <stdio.h>\nint f(int n){ if(n<=1) return 1; return n*f(n-1);}\nint main(){ printf("%d\\n", f(5)); return 0;}','c','','120\n');
t('scanf','#include <stdio.h>\nint main(){ int a,b; scanf("%d %d",&a,&b); printf("%d\\n",a+b); return 0;}','c','3 4','7\n');
t('str','#include <stdio.h>\n#include <string.h>\nint main(){ char s[20]="abc"; strcat(s,"def"); printf("%s %d\\n",s,(int)strlen(s)); return 0;}','c','','abcdef 6\n');
t('cout','#include <iostream>\nusing namespace std;\nint main(){ int x=3; cout<<"x="<<x<<endl; return 0;}','cpp','','x=3\n');
t('vec','#include <iostream>\n#include <vector>\nusing namespace std;\nint main(){ vector<int> v; for(int i=0;i<5;i++) v.push_back(i*2); int s=0; for(int x: v) s+=x; cout<<s<<" "<<v.size()<<endl; return 0;}','cpp','','20 5\n');
t('class','#include <iostream>\nusing namespace std;\nclass A{ public: int x; A(int a):x(a){} int dbl(){ return x*2; } };\nint main(){ A a(4); cout<<a.dbl()<<endl; return 0;}','cpp','','8\n');
t('new','#include <iostream>\nusing namespace std;\nint main(){ int*p=new int(7); cout<<*p<<endl; delete p; return 0;}','cpp','','7\n');
t('string','#include <iostream>\n#include <string>\nusing namespace std;\nint main(){ string s="hi"; s+=" there"; cout<<s<<" "<<s.length()<<endl; return 0;}','cpp','','hi there 8\n');
t('cin','#include <iostream>\nusing namespace std;\nint main(){ int a; cin>>a; cout<<a*2<<endl; return 0;}','cpp','21','42\n');
t('float','#include <stdio.h>\nint main(){ float f=3.14159; printf("%.2f %d\\n", f, 7/2); return 0;}','c','','3.14 3\n');
let r=t('null','#include <stdio.h>\nint main(){ int*p=NULL; *p=1; return 0;}','c','','');
console.log('null err:', r.error && r.error.msg.slice(0,40));
r=CL.runCode('int main(){ int x = ; }','c',''); console.log('compile err:', r.error);
r=CL.runCode('#include <stdio.h>\nint main(){ int a=1; a++; return 0;}','c',''); console.log('steps', r.steps.length, r.steps.map(s=>s.line+':'+s.note.slice(0,50)));
