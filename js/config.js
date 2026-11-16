/* CodeLens — settings you may change */
globalThis.CL_CONFIG = {
  // Python engine (Pyodide). It is bundled in the "pyodide" folder, so Python works without internet once the site has loaded.
  // If that folder is missing, the app falls back to the CDN below.
  pyodideBase: './pyodide/',
  pyodideFallback: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',

  // Extra lessons made by the teacher (see README). Optional file, ignored if missing.
  customLessonsFile: 'lessons-custom.json',

  // Classes & progress (optional). Leave both empty and the site works exactly as before, without accounts.
  // Fill them in after following SETUP-ACCOUNTS.md  (Supabase → Project Settings → API).
  supabaseUrl: 'https://npydtdplromxmnnfpwzd.supabase.co',
  supabaseAnonKey: 'sb_publishable_V9WorLhtRT0BgWP7_z804w_hZbQluxv'
};
