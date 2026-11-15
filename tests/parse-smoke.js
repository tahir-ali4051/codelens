require('../js/lexer.js'); require('../js/types.js'); require('../js/parser.js'); require('../js/parser-stmt.js');
const src = `
#include <stdio.h>
#define N 5
struct P { int x; int y; };
typedef struct Node { int v; struct Node *next; } Node;
int add(int a, int b) { return a + b; }
int main() {
  int a[N] = {1,2,3};
  struct P p = {1, 2};
  for (int i = 0; i < N; i++) { a[i] += i * 2; }
  Node *n = (Node*)malloc(sizeof(Node));
  n->v = 3;
  printf("%d\\n", add(a[1], p.x));
  return 0;
}`;
const prog = CL.parse(src, 'c');
console.log(prog.funcs.map(f=>f.name), prog.structs.get('P').size, prog.structs.get('Node').size);
const cpp = `
using namespace std;
class S { public: string n; int a; S(string n, int a): n(n), a(a) {} void show() { cout << n << a << endl; } };
int main(){ vector<vector<int>> v(3, vector<int>(2,0)); S s("x", 3); s.show(); for (auto &r : v) r.push_back(1); return 0; }`;
const p2 = CL.parse(cpp, 'cpp'); console.log(p2.funcs.length, p2.structs.get('S').ctors.length);
