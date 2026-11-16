/* CodeLens — sample lessons, part B (pointers, memory, C++, Python) */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  CL.LESSONS = CL.LESSONS || [];
  const L = CL.LESSONS;

  L.push({
    id: 'ptr1', group: 'Pointers aur Memory', title: 'Pointer — address ka variable',
    concept: 'Pointer wo variable hai jisme value nahi, kisi aur variable ka ADDRESS hota hai. & address nikalta hai, * us address par pahunch kar value padhta/badalta hai.',
    watch: ['`p` ke dibbe se `x` tak arrow jata hai.', '*p = 20 likhne se x badal gaya — p ne x ko nahi, x ke address ko use kiya.', 'p aur x ka address wahi hai jahan arrow ruka.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    int x = 10;
    int *p = &x;

    *p = 20;

    printf("x = %d\\n", x);
    printf("*p = %d\\n", *p);
    return 0;
}
` }
    }
  });

  L.push({
    id: 'ptr2', group: 'Pointers aur Memory', title: 'Pointer aur array',
    concept: 'Array ka naam uske pehle element ka address hota hai. p++ pointer ko agle element par le jata hai (4 bytes aage, kyunke int 4 bytes ka hai).',
    watch: ['p shuru me a[0] par hai, p++ ke baad a[1] par.', '*p us waqt ka element deta hai.', 'Arrow har step par ek dibba aage kooda.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    int a[4] = {10, 20, 30, 40};
    int *p = a;
    for (int i = 0; i < 4; i++) {
        printf("%d ", *p);
        p++;
    }
    printf("\\n");
    return 0;
}
` }
    }
  });

  L.push({
    id: 'ptr3', group: 'Pointers aur Memory', title: 'Pass by pointer — asli swap',
    concept: 'Agar function ko variable ka ADDRESS de dein to wo asli variable tak pahunch kar usse badal sakta hai. Pichle "swap fail" ka ilaaj.',
    watch: ['swap ke a aur b ke arrow main ke x aur y par ja rahe hain.', '*a, *b ko badalna asli x, y ko badalta hai.', 'Frame hatne ke baad bhi x, y badle rehte hain.'],
    v: {
      c: { code: `#include <stdio.h>

void swap(int *a, int *b) {
    int t = *a;
    *a = *b;
    *b = t;
}

int main() {
    int x = 5, y = 10;
    swap(&x, &y);
    printf("x=%d y=%d\\n", x, y);
    return 0;
}
` }
    }
  });

  L.push({
    id: 'struct', group: 'Pointers aur Memory', title: 'struct — apna data type',
    concept: 'struct kai alag-alag variables ko ek naam ke neeche jama karta hai. Memory me members ek ke baad ek hote hain (kabhi kabhi beech me khali jagah / padding).',
    watch: ['Student ke teen members ek hi box me.', 'sizeof 20 hai, 10 + 4 + 4 nahi? Beech me padding (khali bytes) aati hai taake int sahi address par rahe.'],
    v: {
      c: { code: `#include <stdio.h>

struct Student {
    char name[10];
    int age;
    float gpa;
};

int main() {
    struct Student s;
    s.name[0] = 'A'; s.name[1] = 'l'; s.name[2] = 'i'; s.name[3] = '\\0';
    s.age = 16;
    s.gpa = 3.5;
    printf("%s is %d, GPA %.1f\\n", s.name, s.age, s.gpa);
    printf("Size = %d bytes\\n", (int)sizeof(struct Student));
    return 0;
}
` }
    }
  });

  L.push({
    id: 'malloc', group: 'Pointers aur Memory', title: 'Heap — malloc aur free',
    concept: 'Stack ki memory function khatam hote hi khud saaf ho jati hai. Heap ki memory hum khud maangte (malloc/new) aur khud wapas karte (free/delete) hain, tab tak wo zinda rehti hai.',
    watch: ['malloc ke baad heap me naya block aata hai, p us par arrow se pointing.', 'Block me abhi ? (kachra) hota hai jab tak hum values na likhen.', 'free ke baad block gayab — kaam khatam.'],
    v: {
      c: { code: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int n = 4;
    int *p = (int*)malloc(n * sizeof(int));

    for (int i = 0; i < n; i++) {
        p[i] = (i + 1) * (i + 1);
    }
    for (int i = 0; i < n; i++) {
        printf("%d ", p[i]);
    }
    printf("\\n");

    free(p);
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

int main() {
    int n = 4;
    int *p = new int[n];

    for (int i = 0; i < n; i++) {
        p[i] = (i + 1) * (i + 1);
    }
    for (int i = 0; i < n; i++) {
        cout << p[i] << " ";
    }
    cout << endl;

    delete[] p;
    return 0;
}
` }
    }
  });

  L.push({
    id: 'leak', group: 'Pointers aur Memory', title: 'Galti: memory leak',
    concept: 'Agar pointer badal diya aur purani heap memory free nahi ki, to wo block hamesha ke liye "kho" jata hai — kisi ke paas uska address nahi. Isse memory leak kehte hain.',
    watch: ['Har round me naya heap block banta hai.', 'p dobara naye block ko point karta hai — purane blocks ke arrow kat gaye.', 'Aakhir me teeno blocks heap me "Leak" likhe hue dikhte hain.'],
    v: {
      c: { code: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int *p;
    for (int i = 0; i < 3; i++) {
        p = (int*)malloc(sizeof(int));
        *p = i * 10;
        printf("Allocated %d\\n", *p);
        // forgot free(p)! (free(p) bhool gaye!)
    }
    return 0;
}
` }
    }
  });

  L.push({
    id: 'dangling', group: 'Pointers aur Memory', title: 'Galti: free ke baad use (dangling pointer)',
    concept: 'free ke baad pointer ab bhi purana address rakhta hai, lekin us memory par ab humara haq nahi. Use karna undefined behaviour hai — crash ya galat data.',
    watch: ['free ke baad heap block gayab, lekin p ka arrow ab bhi wahi address dikhata hai (ab kisi box par nahi).', 'Agli line par program crash hota hai.', 'Ilaaj: free ke baad p = NULL likho.'],
    v: {
      c: { code: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int *p = (int*)malloc(sizeof(int));
    *p = 42;
    printf("Before free: %d\\n", *p);

    free(p);

    printf("After free: %d\\n", *p);   // mistake! (galti!)
    return 0;
}
` }
    }
  });

  L.push({
    id: 'll', group: 'Pointers aur Memory', title: 'Linked list — nodes jo aapas me judte hain',
    concept: 'Har node me data aur agle node ka pointer hota hai. Nodes heap par alag alag jagah hote hain, bas pointers unhe jodte hain.',
    watch: ['head se pehle node, phir next ke arrows ka silsila.', 'Nayi node hamesha aage lagti hai, isliye order ulta (30, 20, 10).', 'Aakhir me NULL = list khatam.'],
    v: {
      c: { code: `#include <stdio.h>
#include <stdlib.h>

struct Node {
    int data;
    struct Node *next;
};

int main() {
    struct Node *head = NULL;

    for (int i = 1; i <= 3; i++) {
        struct Node *n = (struct Node*)malloc(sizeof(struct Node));
        n->data = i * 10;
        n->next = head;
        head = n;
    }

    struct Node *cur = head;
    while (cur != NULL) {
        printf("%d -> ", cur->data);
        cur = cur->next;
    }
    printf("NULL\\n");
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

struct Node {
    int data;
    Node *next;
};

int main() {
    Node *head = NULL;

    for (int i = 1; i <= 3; i++) {
        Node *n = new Node;
        n->data = i * 10;
        n->next = head;
        head = n;
    }

    Node *cur = head;
    while (cur != NULL) {
        cout << cur->data << " -> ";
        cur = cur->next;
    }
    cout << "NULL" << endl;
    return 0;
}
` }
    }
  });

  L.push({
    id: 'ref', group: 'C++ khaas', title: 'Reference — variable ka doosra naam',
    concept: 'Reference naya variable nahi banata, usi variable ka doosra naam (alias) hai. Isliye function me reference dene se asli variable badalta hai — pointer ke bina.',
    watch: ['`r` ke paas apna alag dibba nahi — wo x ka alias hai (dotted line).', 'Function me a, b asli x, y ke alias hain, copy nahi.', 'Swap kamyab: x=10 y=5.'],
    v: {
      cpp: { code: `#include <iostream>
using namespace std;

void swapValues(int &a, int &b) {
    int t = a;
    a = b;
    b = t;
}

int main() {
    int x = 5, y = 10;
    int &r = x;
    r = 7;
    cout << "x after r=7: " << x << endl;
    x = 5;
    swapValues(x, y);
    cout << "x=" << x << " y=" << y << endl;
    return 0;
}
` }
    }
  });

  L.push({
    id: 'vector', group: 'C++ khaas', title: 'vector — badhne wala array',
    concept: 'vector khud memory sambhalta hai. Jab jagah (capacity) bhar jaye to ek bara naya block leta, purane elements copy karta aur purana free kar deta hai.',
    watch: ['size = kitne elements hain, capacity = kitni jagah li hui hai.', 'Capacity 1 → 2 → 4 → 8: har baar double.', 'Capacity badhte hi naya buffer bana aur purana gayab.'],
    v: {
      cpp: { code: `#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> v;
    for (int i = 1; i <= 5; i++) {
        v.push_back(i * 10);
    }
    int sum = 0;
    for (int x : v) {
        sum += x;
    }
    cout << "size = " << v.size() << endl;
    cout << "sum = " << sum << endl;
    return 0;
}
` }
    }
  });

  L.push({
    id: 'class', group: 'C++ khaas', title: 'Class, object, constructor, destructor',
    concept: 'Class naqsha hai, object asli cheez. Constructor object banate waqt khud chalta hai, destructor scope khatam hote waqt.',
    watch: ['Object banate hi constructor ka frame chala aur members set hue.', 'Method call me `this` us object ko point karta hai.', 'Block khatam hote hi destructor chalta hai.'],
    v: {
      cpp: { code: `#include <iostream>
using namespace std;

class Counter {
public:
    int count;
    Counter(int start) {
        count = start;
    }
    void add() {
        count = count + 1;
    }
    ~Counter() {
        cout << "Counter khatam, count = " << count << endl;
    }
};

int main() {
    {
        Counter c(5);
        c.add();
        c.add();
        cout << "count = " << c.count << endl;
    }
    cout << "Block ke bahar" << endl;
    return 0;
}
` }
    }
  });

  L.push({
    id: 'pylist', group: 'Python khaas', title: 'List aur aliasing',
    concept: 'Python me variable dibba nahi, object ka label hai. b = a se naya list nahi banti, bas ek aur label usi list par lagta hai. Isliye b badalne se a bhi badal jata hai.',
    watch: ['a aur b ke arrow ek hi list object par.', 'b.append(4) se a me bhi 4 nazar aaya.', 'a.copy() se asli nayi list (alag object) banti hai.'],
    v: {
      py: { code: `a = [1, 2, 3]
b = a
b.append(4)
c = a.copy()
c.append(5)
print("a =", a)
print("b =", b)
print("c =", c)
` }
    }
  });

  L.push({
    id: 'pydict', group: 'Python khaas', title: 'Dictionary — key aur value',
    concept: 'Dictionary naam se value dhoondhne ka tareeqa hai: har key ke saath ek value jodi hoti hai.',
    watch: ['Har key: value ki jodi alag row me.', 'Existing key par naya value pehle wale ko badal deta hai.', 'Nayi key par nayi row jur jati hai.'],
    v: {
      py: { code: `marks = {"Ali": 80, "Sara": 92}
marks["Ali"] = 85
marks["Bilal"] = 70
total = 0
for name in marks:
    total += marks[name]
print(marks)
print("Total =", total)
` }
    }
  });

  L.push({
    id: 'pymut', group: 'Python khaas', title: 'Function aur mutable / immutable',
    concept: 'Number ya string (immutable) function ke andar badlo to bahar asar nahi hota. List (mutable) badlo to wahi asli list badalti hai kyunke function ko usi object ka label mila.',
    watch: ['inc(n): n function me nayi value ban jati hai, bahar wala n wahi rehta hai.', 'add_item(items): items aur nums ek hi list ko point karte hain.', 'Isi liye list bahar bhi badal gayi.'],
    v: {
      py: { code: `def inc(n):
    n = n + 1

def add_item(items):
    items.append(99)

num = 5
nums = [1, 2]
inc(num)
add_item(nums)
print(num)
print(nums)
` }
    }
  });

  L.push({
    id: 'pyclass', group: 'Python khaas', title: 'Class aur object',
    concept: 'Class se objects banate hain. __init__ naya object banate waqt chalta hai aur self us naye object ka naam hai.',
    watch: ['Student(...) call par naya object bana aur self us par point kar raha hai.', 'Har object ke apne attributes (name, marks).', 's1 aur s2 alag alag objects hain.'],
    v: {
      py: { code: `class Student:
    def __init__(self, name, marks):
        self.name = name
        self.marks = marks

    def passed(self):
        return self.marks >= 50

s1 = Student("Ali", 72)
s2 = Student("Sara", 41)
print(s1.name, s1.passed())
print(s2.name, s2.passed())
` }
    }
  });
})();
