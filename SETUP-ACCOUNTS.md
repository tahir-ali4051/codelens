# Classes & progress — setup (about 10 minutes, free)
*Classes aur progress — setup (taqreeban 10 minute, free)*

This is **optional**. Until you finish it, CodeLens works exactly as before and the "Join class" button stays hidden.
*Ye optional hai. Jab tak ye na karo, CodeLens pehle jaisa chalta hai aur "Join class" button nazar nahi aata.*

## What you get / Kya milega
- You create a **class** and get a code like `K7M2-QX`. *Tum class banate ho, ek code milta hai.*
- Students open the site → **Join class** → code + name + 4-digit PIN. No email, no password. *Students sirf code, naam aur 4-digit PIN dalte hain.*
- Lessons get a ✔ when the student steps through to the last step of the lesson. *Lesson ke aakhri step tak pohnchne par ✔ lagta hai.*
- You open `teacher.html` and see a table: every student × every lesson, who is active now, which lesson the class finds hard, CSV download. *Teacher page par poori class ka table.*

## Steps / Tareeqa

**1. Create the database.** Go to <https://supabase.com> → sign in with GitHub → **New project**. Name `codelens`, choose a region close to you (e.g. Mumbai), set a database password (save it), **Create**. Wait ~2 minutes.
*Supabase par free project banao.*

**2. Add the tables.** In the project: left menu **SQL Editor** → **New query** → open the file `supabase/schema.sql` from this folder, copy **everything**, paste, press **Run**. You should see "Success. No rows returned".
*SQL Editor me schema.sql ka poora text paste karke Run karo.*

**3. Turn off email confirmation (simplest).** **Authentication** → **Sign In / Providers** → **Email** → switch **Confirm email** OFF → Save. (Otherwise your first sign-up needs an email link.)
*"Confirm email" band kar do.*

**4. Copy two values.** **Project Settings** → **API** (or **Data API**): copy the **Project URL** and the **anon public** key. Open `js/config.js` and paste them:
```js
supabaseUrl: 'https://xxxxxxxx.supabase.co',
supabaseAnonKey: 'eyJhbGciOi…',
```
The anon key is *meant* to be public — the database rules protect the data. Never paste the `service_role` key anywhere.
*Sirf anon key paste karo, service_role kabhi nahi.*

**5. Upload again.** Put the changed files on GitHub (same way as before). Vercel updates the site in a minute.
*GitHub par dobara upload karo, Vercel khud update kar dega.*

**6. Create your teacher account.** Open `https://YOUR-SITE/teacher.html` → **I am new — create account** → email + password. Then **Create class**. Press **Show class code** and put it on the board.
*teacher.html kholo, account banao, class banao, code board par dikhao.*

**7. Lock the door (recommended).** After you (and any other teachers) have accounts: **Authentication** → **Sign In / Providers** → turn **Allow new users to sign up** OFF. Students are not affected (they never sign up).
*Apne account banne ke baad sign-ups band kar do.*

**8. Keep it awake (recommended).** Free Supabase projects pause after 7 days of no use. In your GitHub repo add two secrets (**Settings → Secrets and variables → Actions**): `SUPABASE_URL`, `SUPABASE_ANON_KEY`. The file `.github/workflows/keepalive.yml` then pings the database daily.
*Free project 7 din khali rahe to so jata hai — ye daily ping usay jagaye rakhta hai.*

## In class / Class me
1. Teacher: `teacher.html` → open class → **Show class code** (big, for the smart board / portal screen).
2. Students: open CodeLens → **Join class** → code, name, new 4-digit PIN.
3. Students run lessons as usual. Teacher watches the table fill in (updates every 15 s).

## Questions / Sawal
- **Student forgot the PIN** → teacher table → **New PIN** next to the name, tell the student. *Teacher "Naya PIN" dabaye.*
- **Same student on a phone and a laptop** → join again with the **same name and PIN**; progress is the same. Only the newest device stays signed in. *Wahi naam aur PIN.*
- **Two students with the same name** → add something: `Ali K`, `Ali Raza`. *Naam me farq rakho.*
- **Is it safe?** Students hold a random secret token, never see other students, and cannot read the tables. Teachers see only their own classes. Only first names/nicknames are stored; no email, phone or age.
- **Limits (free plan)** → 100+ students is fine; the data is tiny (a few MB). The only thing to watch is the 7-day pause (step 8).
- **Remove everything of a class** → open the class → **Archive class**, or delete students one by one with ✕.
