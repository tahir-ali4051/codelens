/* CodeLens — settings you may change */
globalThis.CL_CONFIG = {
  // Python engine (Pyodide). It is bundled in the "pyodide" folder, so Python works without internet once the site has loaded.
  // If that folder is missing, the app falls back to the CDN below.
  pyodideBase: './pyodide/',
  pyodideFallback: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',

  // Extra lessons made by the teacher (see README). Optional file, ignored if missing.
  customLessonsFile: 'lessons-custom.json'
};
