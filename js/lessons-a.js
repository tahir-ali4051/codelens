/* CodeLens — sample lessons, part A (basics). Teacher: add your own via Teacher mode or lessons-custom.json */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  CL.LESSONS = CL.LESSONS || [];
  const L = CL.LESSONS;

  L.push({
    id: 'vars', group: 'Basics', title: 'Variables aur data types',
    concept: 'Variable memory me ek naam wala dibba hai. Har dibbe ka type hota hai (int, float, char) jo batata hai ke andar kis qism ki value rakhi ja sakti hai aur kitni jagah (bytes) lagegi.',
    watch: ['Har variable ka alag dibba (cell) stack par banta hai.', '`score` ko value nahi di gayi — usme ? (kachra/garbage) nazar aayega.', 'Line chalte hi value ka badalna amber rang me chamakta hai.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    int age = 15;
    float height = 5.8;
    char grade = 'A';
    int score;          // no value given! (value nahi di!)

    age = age + 1;
    printf("Age: %d\\n", age);
    printf("Height: %.1f\\n", height);
    printf("Grade: %c\\n", grade);
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

int main() {
    int age = 15;
    float height = 5.8;
    char grade = 'A';
    int score;          // no value given! (value nahi di!)

    age = age + 1;
    cout << "Age: " << age << endl;
    cout << "Height: " << height << endl;
    cout << "Grade: " << grade << endl;
    return 0;
}
` },
      py: { code: `age = 15
height = 5.8
grade = "A"
age = age + 1
print("Age:", age)
print("Height:", height)
print("Grade:", grade)
` }
    }
  });

  L.push({
    id: 'ops', group: 'Basics', title: 'Operators aur integer division',
    concept: 'Do integers ko divide karo to C/C++ me jawab bhi integer aata hai (decimal hissa kat jata hai). % baqi (remainder) deta hai. Decimal jawab chahiye to ek value ko float bana lo.',
    watch: ['7 / 2 ka jawab 3 kyun aaya, 3.5 kyun nahi?', '% remainder nikalta hai: 7 % 2 = 1.', 'BODMAS: pehle *, phir + — isliye 2 + 3 * 4 = 14.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    int a = 7, b = 2;
    int q = a / b;
    int r = a % b;
    float f = (float)a / b;
    int x = 2 + 3 * 4;

    printf("q = %d\\n", q);
    printf("r = %d\\n", r);
    printf("f = %.1f\\n", f);
    printf("x = %d\\n", x);
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

int main() {
    int a = 7, b = 2;
    int q = a / b;
    int r = a % b;
    float f = (float)a / b;
    int x = 2 + 3 * 4;

    cout << "q = " << q << endl;
    cout << "r = " << r << endl;
    cout << "f = " << f << endl;
    cout << "x = " << x << endl;
    return 0;
}
` },
      py: { code: `a = 7
b = 2
q = a // b      # integer division
r = a % b
f = a / b       # in Python, / always gives a decimal (Python me / hamesha decimal deta hai)
x = 2 + 3 * 4
print("q =", q)
print("r =", r)
print("f =", f)
print("x =", x)
` }
    }
  });

  L.push({
    id: 'ifelse', group: 'Basics', title: 'if / else — faisla lena',
    concept: 'if ek shart (condition) check karta hai. Shart TRUE ho to if ka block chalta hai, warna else wala. Computer sirf ek raasta chunta hai.',
    watch: ['Har if par condition ki asli values ke saath TRUE/FALSE likha aayega.', 'Dekho kaunsa block chala aur kaunsa skip hua.', 'Sirf ek hi grade set hota hai.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    int marks = 72;
    char grade;

    if (marks >= 80) {
        grade = 'A';
    } else if (marks >= 60) {
        grade = 'B';
    } else {
        grade = 'C';
    }
    printf("Marks %d -> Grade %c\\n", marks, grade);
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

int main() {
    int marks = 72;
    char grade;

    if (marks >= 80) {
        grade = 'A';
    } else if (marks >= 60) {
        grade = 'B';
    } else {
        grade = 'C';
    }
    cout << "Marks " << marks << " -> Grade " << grade << endl;
    return 0;
}
` },
      py: { code: `marks = 72

if marks >= 80:
    grade = "A"
elif marks >= 60:
    grade = "B"
else:
    grade = "C"

print("Marks", marks, "-> Grade", grade)
` }
    }
  });

  L.push({
    id: 'forloop', group: 'Loops', title: 'for loop — 1 se 5 ka sum',
    concept: 'for loop teen kaam karta hai: shuruaat (i = 1), shart check (i <= 5), aur har round ke baad step (i++). Jab tak shart TRUE hai body dobara dobara chalti hai.',
    watch: ['Har round me `i` aur `sum` kaise badalte hain.', 'Condition FALSE hote hi loop khatam.', 'Sum: 1, 3, 6, 10, 15.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    int sum = 0;
    for (int i = 1; i <= 5; i++) {
        sum = sum + i;
    }
    printf("Sum = %d\\n", sum);
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

int main() {
    int sum = 0;
    for (int i = 1; i <= 5; i++) {
        sum = sum + i;
    }
    cout << "Sum = " << sum << endl;
    return 0;
}
` },
      py: { code: `total = 0
for i in range(1, 6):
    total = total + i
print("Sum =", total)
` }
    }
  });

  L.push({
    id: 'whileloop', group: 'Loops', title: 'while loop — digits ka sum',
    concept: 'while loop tab tak chalta hai jab tak condition TRUE rahe. Yahan n % 10 aakhri digit deta hai aur n / 10 usse hata deta hai.',
    watch: ['n: 1234 → 123 → 12 → 1 → 0.', 'Jab n 0 ho jaye to condition FALSE.', 'Digits: 4 + 3 + 2 + 1 = 10.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    int n = 1234;
    int sum = 0;
    while (n > 0) {
        int digit = n % 10;
        sum = sum + digit;
        n = n / 10;
    }
    printf("Digit sum = %d\\n", sum);
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

int main() {
    int n = 1234;
    int sum = 0;
    while (n > 0) {
        int digit = n % 10;
        sum = sum + digit;
        n = n / 10;
    }
    cout << "Digit sum = " << sum << endl;
    return 0;
}
` },
      py: { code: `n = 1234
total = 0
while n > 0:
    digit = n % 10
    total = total + digit
    n = n // 10
print("Digit sum =", total)
` }
    }
  });

  L.push({
    id: 'nested', group: 'Loops', title: 'Nested loops — star pattern',
    concept: 'Loop ke andar loop. Bahar wala (row) ek baar chalta hai to andar wala (col) poora chakkar lagata hai.',
    watch: ['Row 1 me 1 star, row 2 me 2, row 3 me 3.', 'Andar wala loop har row par dobara 1 se shuru hota hai.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    for (int row = 1; row <= 3; row++) {
        for (int col = 1; col <= row; col++) {
            printf("*");
        }
        printf("\\n");
    }
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

int main() {
    for (int row = 1; row <= 3; row++) {
        for (int col = 1; col <= row; col++) {
            cout << "*";
        }
        cout << endl;
    }
    return 0;
}
` },
      py: { code: `for row in range(1, 4):
    line = ""
    for col in range(row):
        line = line + "*"
    print(line)
` }
    }
  });

  L.push({
    id: 'funcs', group: 'Functions', title: 'Function — pass by value (swap fail!)',
    concept: 'Function ko value di jaye to uski COPY banti hai. Function ke andar copy badalti hai, asli variable nahi. Isliye ye swap kaam nahi karta.',
    watch: ['Function call par naya frame bana — a aur b copies hain.', 'Frame ke andar a, b badal gaye lekin main ke x, y wahi rahe.', 'Frame hatne par copies khatam.'],
    v: {
      c: { code: `#include <stdio.h>

void swap(int a, int b) {
    int t = a;
    a = b;
    b = t;
}

int main() {
    int x = 5, y = 10;
    swap(x, y);
    printf("x=%d y=%d\\n", x, y);
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

void swapValues(int a, int b) {
    int t = a;
    a = b;
    b = t;
}

int main() {
    int x = 5, y = 10;
    swapValues(x, y);
    cout << "x=" << x << " y=" << y << endl;
    return 0;
}
` },
      py: { code: `def swap(a, b):
    t = a
    a = b
    b = t

x = 5
y = 10
swap(x, y)
print("x =", x, "y =", y)
` }
    }
  });

  L.push({
    id: 'recursion', group: 'Functions', title: 'Recursion — factorial',
    concept: 'Recursion me function khud ko call karta hai. Har call ka naya frame stack par upar chadhta jata hai. Base case par ruk kar frames ek ek karke wapas aate hain.',
    watch: ['Stack me frames ka seedhi (ek ke neeche ek) banna: fact(4) → fact(3) → … → fact(1).', 'Base case (n <= 1) par return 1.', 'Wapsi par har frame apna jawab (n × neeche wala jawab) return karta hai.'],
    v: {
      c: { code: `#include <stdio.h>

int fact(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * fact(n - 1);
}

int main() {
    int r = fact(4);
    printf("4! = %d\\n", r);
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

int fact(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * fact(n - 1);
}

int main() {
    int r = fact(4);
    cout << "4! = " << r << endl;
    return 0;
}
` },
      py: { code: `def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

r = fact(4)
print("4! =", r)
` }
    }
  });

  L.push({
    id: 'arrays', group: 'Arrays aur Strings', title: 'Array — marks ka total aur average',
    concept: 'Array ek hi type ke bohat se dibbe hain jo memory me ek ke baad ek (continuous) rakhe jate hain. Index 0 se shuru hota hai.',
    watch: ['5 elements ek line me, index 0 se 4.', 'Har address pichle se 4 bytes aage hai (int ka size).', 'Loop index se har element tak pahunchta hai.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    int marks[5] = {70, 85, 90, 65, 80};
    int total = 0;
    for (int i = 0; i < 5; i++) {
        total += marks[i];
    }
    printf("Total = %d\\n", total);
    printf("Average = %.1f\\n", total / 5.0);
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

int main() {
    int marks[5] = {70, 85, 90, 65, 80};
    int total = 0;
    for (int i = 0; i < 5; i++) {
        total += marks[i];
    }
    cout << "Total = " << total << endl;
    cout << "Average = " << total / 5.0 << endl;
    return 0;
}
` },
      py: { code: `marks = [70, 85, 90, 65, 80]
total = 0
for m in marks:
    total += m
print("Total =", total)
print("Average =", total / len(marks))
` }
    }
  });

  L.push({
    id: 'oob', group: 'Arrays aur Strings', title: 'Galti: array ki hadd se bahar',
    concept: 'Array a[3] me sirf index 0, 1, 2 hain. a[3] likhna array ke baad wali memory par likhna hai — C/C++ rokte nahi, aur koi aur variable kharab ho jata hai!',
    watch: ['a[3] = 99 kis dibbe par likha gaya? Warning note padho.', 'Pas wala variable `safe` badal gaya — halanke humne usse chheda hi nahi.', 'Python me aisa nahi hota — wo error de kar rok deta hai.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    int safe = 10;
    int a[3] = {1, 2, 3};

    a[3] = 99;      // index 3 doesn't exist! (index 3 hai hi nahi!)

    printf("safe = %d\\n", safe);
    return 0;
}
` },
      py: { code: `a = [1, 2, 3]
print(a[2])
a[3] = 99      # index 3 doesn't exist (index 3 hai hi nahi)
print("yahan kabhi nahi pahunchega")
` }
    }
  });

  L.push({
    id: 'strings', group: 'Arrays aur Strings', title: 'String — characters ki qatar',
    concept: 'C me string char array hoti hai jiske aakhir me \\0 (NUL) hota hai jo "yahan khatam" batata hai. C++ ki string aur Python ki str ye sab sambhal leti hain.',
    watch: ['"Ali" = A, l, i aur aakhir me \\0.', 'name[0] = \'B\' se pehla character badal gaya.', 'strlen \\0 se pehle tak ginta hai.'],
    v: {
      c: { code: `#include <stdio.h>
#include <string.h>

int main() {
    char name[10] = "Ali";
    printf("Length = %d\\n", (int)strlen(name));
    name[0] = 'B';
    printf("Name = %s\\n", name);
    return 0;
}
` },
      cpp: { code: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string name = "Ali";
    cout << "Length = " << name.length() << endl;
    name[0] = 'B';
    name += " Khan";
    cout << "Name = " << name << endl;
    return 0;
}
` },
      py: { code: `name = "Ali"
print("Length =", len(name))
new_name = "B" + name[1:]     # a str cannot be changed, a new one is made (nayi banti hai)
print("New name =", new_name)
print("Original =", name)
` }
    }
  });

  L.push({
    id: '2d', group: 'Arrays aur Strings', title: '2D array — table / matrix',
    concept: '2D array array ka array hai: pehle row chunte hain, phir uske andar column.',
    watch: ['Har row ek chhota array hai.', 'm[i][j] = i-th row, j-th column.', 'Row sums: 6 aur 15.'],
    v: {
      c: { code: `#include <stdio.h>

int main() {
    int m[2][3] = {{1, 2, 3}, {4, 5, 6}};
    for (int i = 0; i < 2; i++) {
        int rowSum = 0;
        for (int j = 0; j < 3; j++) {
            rowSum += m[i][j];
        }
        printf("Row %d sum = %d\\n", i, rowSum);
    }
    return 0;
}
` },
      cpp: { code: `#include <iostream>
using namespace std;

int main() {
    int m[2][3] = {{1, 2, 3}, {4, 5, 6}};
    for (int i = 0; i < 2; i++) {
        int rowSum = 0;
        for (int j = 0; j < 3; j++) {
            rowSum += m[i][j];
        }
        cout << "Row " << i << " sum = " << rowSum << endl;
    }
    return 0;
}
` },
      py: { code: `m = [[1, 2, 3], [4, 5, 6]]
for i in range(2):
    row_sum = 0
    for j in range(3):
        row_sum += m[i][j]
    print("Row", i, "sum =", row_sum)
` }
    }
  });
})();
