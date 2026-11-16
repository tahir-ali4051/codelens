/* CodeLens — bilingual messages. CL.t(english, romanUrdu) embeds both languages in one string;
   CL.tr(text, 'en' | 'ur') picks one when it is shown to the student. */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});
  const RE = /\u0001([^\u0002]*)\u0002([^\u0003]*)\u0003/g;
  CL.t = (en, ur) => '\u0001' + en + '\u0002' + ur + '\u0003';
  CL.tr = (s, mode) => (s == null ? s : String(s).replace(RE, (m, en, ur) => (mode === 'ur' ? ur : en)));
  // true when most of the line is data (numbers, names) rather than words — then it is shown once, not twice
  CL.isDataLine = (s) => {
    let marked = 0;
    String(s).replace(RE, (m, en) => { marked += en.length; return ''; });
    const outside = String(s).replace(RE, '').length;
    return outside >= marked;
  };
})();
