# CodeLens — code ko chalte hue dekho

C, C++ aur Python ka code **ek ek step** chala kar dikhata hai: variables, stack frames, heap, pointers (teer), arrays, struct, vector, list, dict — sab kuch. Har step ke saath Roman Urdu me wazahat aati hai (kya chala, kya badla, kahan galti hai).

Ye ek **static website** hai: koi server, database ya paise nahi chahiye. Bacche sirf link kholte hain.

---

## 1. Apne computer par chalana (test ke liye)

Folder me terminal kholo:

```
python -m http.server 8000
```

Browser me `http://localhost:8000` kholo. (index.html par double-click bhi chalta hai, lekin lessons-custom.json aur Python ke liye server wala tareeqa behtar hai.)

---

## 2. Publish karna (bachon ke liye free link)

Supabase ki zaroorat nahi — Supabase Storage HTML ko plain text bana kar deta hai, is liye wahan website host nahi hoti. Neeche ke teeno tareeqe free hain.

### Tareeqa A — Vercel (GitHub ke zariye, sabse behtar)

1. **github.com** par free account banao.
2. Upar **+ → New repository** dabao. Naam `codelens`, **Public**, **Create repository**.
3. Naye repo ke page par **uploading an existing file** link dabao.
4. `codelens` folder ke **andar ki saari cheezein** (`index.html`, `css`, `js`, `py`, `pyodide`, `lessons-custom.json`, `README.md`) drag karke chhodo. Neeche **Commit changes**.
5. **vercel.com** par jao → **Continue with GitHub**.
6. **Add New → Project** → `codelens` ke saamne **Import**.
7. **Framework Preset: Other** rehne do. Build Command aur Output Directory **khali** chhodo. **Deploy** dabao.
8. 30 second baad link milega, jaise `https://codelens-abc.vercel.app`. Ye link WhatsApp group me bhej do.

**Update karna:** GitHub me file kholo → pencil (edit) → badlo → **Commit**. Vercel khud naya version laga deta hai.

### Tareeqa B — Netlify Drop (sabse aasan, bina GitHub)

1. **app.netlify.com/drop** kholo (free account banao).
2. Poora `codelens` folder page par drag karo.
3. Link mil jata hai. Naam badalna ho to Site settings → Change site name.

### Tareeqa C — Vercel CLI (computer se seedha)

```
npm install -g vercel
cd codelens
vercel          # pehli baar sawalon ke jawab: sab Enter
vercel --prod   # final link
```

---

## 3. Apne lectures ka code daalna (Teacher mode)

Tum khud lesson daloge — ye tareeqa hai:

1. Site ko `...vercel.app/?teacher=1` se kholo (ya logo par 5 baar tap karo).
2. **Lessons** drawer → **Apna code**. Editor me apna code likho (C, C++ ya Python — upar tab se chuno).
3. Upar **Lesson me save karo** dabao. Likho: naam, group (jaise *Loops*), concept (1-2 jumlay), aur "dhyan se dekho" ke points (har line ek point).
4. Same naam se doosri language me code save karoge to wo us lesson ka ek aur version ban jata hai (bachon ko tab milenge).
5. Input chahiye (scanf / cin / input)? **Input** tab me values likh kar save karo — wo lesson ke saath save hongi.
6. Sab lessons ban jayen to drawer ke neeche **Lessons export (.json)** dabao. `lessons-custom.json` file download hogi.
7. Is file ko project folder me purani `lessons-custom.json` ki jagah rakho aur dobara publish karo (GitHub me file replace karo → Vercel khud update).

Bachon ko tumhare lessons file se milte hain. Tumhare browser ka local copy sirf tumhare paas rehta hai.

**Expected output** automatically nikalta hai: bache "Jawab dekho" dabate hain to engine wahi code chala kar sahi output dikha deta hai — tumhe haath se likhna nahi padta. "Dhyan se dekho" wale points hi tumhara "expected process" hain.

Sample lessons nahi chahiye? Teacher mode me drawer ke upar **Sample lessons chhupao** tick karo, phir export karo.

Direct file edit karna chaho to `lessons-custom.json` ka format:

```json
{
  "hideBuiltin": false,
  "lessons": [
    {
      "id": "mera1", "group": "Loops", "title": "Table of 5",
      "concept": "Loop se table banate hain.",
      "watch": ["i har round me 1 se badhta hai", "total badhta jata hai"],
      "v": {
        "c":   { "code": "#include <stdio.h>\nint main(){...}", "stdin": "" },
        "py":  { "code": "for i in range(1, 11):\n    print(5 * i)" }
      }
    }
  ]
}
```

---

## 4. Bachon ke liye kuch tips

- **Next** (→) ya **Play** se step chalao. Slider se kisi bhi step par seedha jao, piche bhi.
- **Line number par click** = breakpoint (laal dot). Phir ⏩ dabao: wahan tak seedha.
- **Link copy** = bache apna code ek link me bana kar tumhe bhej sakte hain, tum same code apni screen par khol lo.
- **A+ / A−** smart board ke liye font bara kar deta hai. Dark mode bhi hai.

---

## 5. Kya support hai aur kya nahi (imaandari se)

**Python:** asli Python (Pyodide) chalta hai, isliye poora language kaam karta hai. Memory ki tasveer list, dict, tuple, set aur objects ke liye hai.

**C / C++:** ye asli compiler nahi — CodeLens ka apna chhota interpreter hai jo is liye banaya gaya ke memory dikha sake. Isme ye sab chalta hai:

- int/float/char/bool, operators, if/else, switch, for/while/do-while, functions, recursion, arrays (1D/2D), strings
- pointers, pointer arithmetic, `&`, `*`, struct, typedef, enum, `malloc/calloc/realloc/free`, `sizeof`
- `printf/scanf`, `puts`, `strlen/strcpy/strcat/strcmp`, `math.h`, `rand`
- C++: `cout/cin/endl`, `string`, `vector`, references, `new/delete`, class (constructor, destructor, methods, private/public), range-for, `auto`, `sort`, `swap`

Abhi **nahi** chalte: templates, inheritance/virtual, function pointers, file handling (`fopen`), STL ke `map/set/queue`, lambda, `goto`, function-like `#define`. Aisa code aaye to saaf message milta hai ("abhi supported nahi").

Memory ke **addresses nakli** hain (har run me wahi, sirf samajhne ke liye). `int` 4 bytes, pointer 8 bytes, struct padding asli compiler jaisi.

Galtiyan jo pakri jati hain: NULL pointer, use-after-free, double free, dangling pointer, array ki hadd se bahar, uninitialized variable, memory leak, infinite loop, stack overflow, division by zero.

**Limits:** ek program ke zyada se zyada 4000 steps dikhte hain (lamba loop ho to pehle 4000). Infinite loop khud ruk jata hai.

---

## 6. Folder ka naqsha

```
index.html          page
css/style.css       design
js/lexer.js … lib.js    C/C++ interpreter
js/viz.js           memory ki tasveer + teer
js/editor.js        code editor
js/app.js           sab ko jodta hai
js/lessons-a.js, lessons-b.js   sample lessons
py/tracer.py        Python tracer (build.js isse js/pytracer.js banata hai)
pyodide/            Python engine (offline chalta hai)
lessons-custom.json teacher ke lessons
tests/              engine ke tests (node tests/t1.js)
```

`py/tracer.py` badlo to `node build.js` chalao.

## Bilingual mode (English + Roman Urdu)

The header has an **EN / UR / EN+UR** switch (default EN+UR). Every explanation, hint, error and lesson shows English first with the Roman Urdu line underneath; the choice is remembered per browser.

**Your own lessons** can carry both languages. In Teacher mode the *Save as lesson* box has English and Roman Urdu fields. In `lessons-custom.json` any of `title`, `group`, `concept` and each `watch` item may be a plain string (shown as it is) or `{ "en": "...", "ur": "..." }`:

```json
{ "id": "my1", "group": { "en": "Loops", "ur": "Loops" },
  "title": { "en": "while loop", "ur": "while loop" },
  "concept": { "en": "Runs while the condition is TRUE.", "ur": "Jab tak condition TRUE ho chalta hai." },
  "watch": [ { "en": "Watch i change.", "ur": "i ko badalte dekho." } ],
  "v": { "c": { "code": "..." } } }
```

## Classes & progress (optional)
Teachers create classes, students join with a code, and you see everyone's progress on `teacher.html`. Setup: **SETUP-ACCOUNTS.md**. Database: `supabase/schema.sql` (tested with `tests/sql-test.mjs`).
