/* CodeLens — C/C++ type objects */
(function () {
  const CL = (globalThis.CL = globalThis.CL || {});

  const mkInt = (name, size, signed, extra) => Object.assign({ k: 'int', name, size, signed, bits: size * 8 }, extra || {});
  const TY = {
    char: mkInt('char', 1, true, { isChar: true }),
    uchar: mkInt('unsigned char', 1, false, { isChar: true }),
    short: mkInt('short', 2, true),
    ushort: mkInt('unsigned short', 2, false),
    int: mkInt('int', 4, true),
    uint: mkInt('unsigned int', 4, false),
    long: mkInt('long', 8, true),
    ulong: mkInt('unsigned long', 8, false),
    llong: mkInt('long long', 8, true),
    ullong: mkInt('unsigned long long', 8, false),
    float: { k: 'float', name: 'float', size: 4 },
    double: { k: 'float', name: 'double', size: 8 },
    bool: { k: 'bool', name: 'bool', size: 1 },
    void: { k: 'void', name: 'void', size: 1 },
    string: { k: 'string', name: 'string', size: 32 }
  };
  CL.TY = TY;

  CL.ptrTo = (to) => ({ k: 'ptr', to, size: 8, name: CL.typeName(to) + '*' });
  CL.arrOf = (of, n, dimExpr) => ({ k: 'array', of, n, dimExpr, size: (n || 0) * of.size });
  CL.refTo = (to) => ({ k: 'ref', to, size: 8, name: CL.typeName(to) + '&' });
  CL.vecOf = (of) => ({ k: 'vector', of, size: 24, name: 'vector<' + CL.typeName(of) + '>' });

  CL.typeName = function typeName(t) {
    if (!t) return '?';
    switch (t.k) {
      case 'ptr': return typeName(t.to) + '*';
      case 'ref': return typeName(t.to) + '&';
      case 'array': return typeName(t.of) + '[' + (t.n != null ? t.n : '') + ']';
      case 'struct': return (t.isClass ? 'class ' : 'struct ') + (t.name || '');
      case 'vector': return 'vector<' + typeName(t.of) + '>';
      case 'string': return 'string';
      default: return t.name;
    }
  };

  CL.alignOf = function alignOf(t) {
    switch (t.k) {
      case 'array': return alignOf(t.of);
      case 'struct': return t.align || 1;
      case 'string': case 'vector': return 8;
      default: return Math.min(t.size || 1, 8);
    }
  };

  CL.isScalar = (t) => t.k === 'int' || t.k === 'float' || t.k === 'bool' || t.k === 'ptr';
  CL.isIntLike = (t) => t.k === 'int' || t.k === 'bool';

  // finalize struct layout (fields: [{name,type}])
  CL.layoutStruct = function (st) {
    let off = 0, maxA = 1;
    for (const f of st.fields) {
      const a = CL.alignOf(f.type);
      if (a > maxA) maxA = a;
      off = Math.ceil(off / a) * a;
      f.off = off;
      off += f.type.size;
    }
    st.align = maxA;
    st.size = Math.max(1, Math.ceil(off / maxA) * maxA);
    if (!st.fields.length) st.size = 1;
    return st;
  };

  // wrap a JS number into the integer type's range
  CL.wrapInt = function (v, t) {
    if (!Number.isFinite(v)) return 0;
    v = Math.trunc(v);
    const bits = t.bits;
    if (bits === 8) return t.signed ? (v << 24) >> 24 : v & 0xff;
    if (bits === 16) return t.signed ? (v << 16) >> 16 : v & 0xffff;
    if (bits === 32) return t.signed ? v | 0 : v >>> 0;
    // 64-bit: use BigInt for exact wrap when out of safe range
    if (Number.isSafeInteger(v)) {
      if (t.signed || v >= 0) return v;
    }
    const b = BigInt.asIntN(64, BigInt(v));
    return t.signed ? Number(b) : Number(BigInt.asUintN(64, b));
  };
})();
