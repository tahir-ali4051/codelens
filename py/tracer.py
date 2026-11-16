import sys, json, builtins, reprlib, types, ast


def T(en, ur):
    return '\x01' + en + '\x02' + ur + '\x03'


_HINTS = {
    'ZeroDivisionError': T('You cannot divide by zero.', 'Zero se divide nahi kar sakte.'),
    'NameError': T('This name is not defined yet — check the spelling, or create the variable first.', 'Ye naam abhi define nahi hua — spelling check karo, ya variable pehle banao.'),
    'UnboundLocalError': T('The variable was used before it got a value.', 'Variable ko value milne se pehle use kiya gaya.'),
    'IndexError': T('The index is outside the range of the list/string (there are not that many elements).', 'Index list/string ki range se bahar hai (itne elements hain hi nahi).'),
    'KeyError': T('This key does not exist in the dictionary.', 'Dictionary me ye key maujood nahi.'),
    'TypeError': T('An operation with the wrong type (like number + string, or wrong arguments).', 'Galat type ke saath operation (jaise number + string, ya galat arguments).'),
    'ValueError': T('The value has a wrong format (like turning "abc" into an int).', 'Value ka format galat hai (jaise "abc" ko int banana).'),
    'AttributeError': T('This object has no such attribute/method.', 'Is object me ye attribute/method hota hi nahi.'),
    'RecursionError': T('The recursion went too deep — check the base case (the stopping condition).', 'Recursion bohat gehri ho gayi — base case (rukne ki shart) check karo.'),
    'EOFError': T('The input ran out — type the values in the "Input" box.', 'Input khatam ho gaya — "Input" box me values daalo.'),
    'IndentationError': T('The indentation (spaces) is wrong — code inside a block must be indented.', 'Indentation (spaces) galat hai — Python me block ke andar ka code aage hona chahiye.'),
    'SyntaxError': T('The syntax is wrong — check colons (:), brackets or spelling.', 'Syntax galat hai — colon (:), brackets ya spelling check karo.'),
    'StopIteration': T('The iterator has no more elements.', 'Iterator me aur elements nahi bache.'),
}


class _StepLimit(BaseException):
    pass


class _Out:
    def __init__(self):
        self.parts = []
        self.n = 0

    def write(self, s):
        s = str(s)
        self.parts.append(s)
        self.n += len(s)
        return len(s)

    def flush(self):
        pass

    def getvalue(self):
        return ''.join(self.parts)


_rp = reprlib.Repr()
_rp.maxlist = 8
_rp.maxtuple = 8
_rp.maxdict = 6
_rp.maxset = 8
_rp.maxstring = 24
_rp.maxother = 40
_rp.maxlevel = 3


def _short(v):
    try:
        if isinstance(v, (types.FunctionType, types.BuiltinFunctionType)):
            return '<function ' + v.__name__ + '>'
        if hasattr(v, '__dict__') and not isinstance(v, type) and type(v).__module__ == '__main__' or (hasattr(v, '__dict__') and type(v).__module__ == '__user__'):
            return type(v).__name__ + _rp.repr(v.__dict__)
        return _rp.repr(v)
    except Exception:
        return '<?>'


def run(src, stdin_text, max_snaps=3000, max_events=300000):
    result = {'steps': [], 'out': '', 'error': None, 'truncated': False, 'lang': 'py'}
    src_lines = src.split('\n')
    try:
        code = compile(src, '<user>', 'exec')
    except SyntaxError as e:
        nm = type(e).__name__
        result['error'] = {'kind': 'compile', 'line': e.lineno or 1,
                           'msg': '%s: %s\n💡 %s' % (nm, e.msg, _HINTS.get(nm, _HINTS['SyntaxError']))}
        return json.dumps(result)

    out = _Out()
    snaps = result['steps']
    ids = {}
    keep = []
    state = {'events': 0, 'prev_out': 0, 'trunc': False}
    last = {}      # frame id -> pending line
    prev_vars = {}  # frame key -> {name: sig}

    in_lines = stdin_text.split('\n') if stdin_text else []
    if in_lines and in_lines[-1] == '':
        in_lines.pop()
    pos = [0]

    def fake_input(prompt=''):
        out.write(str(prompt))
        if pos[0] >= len(in_lines):
            raise EOFError('Input khatam ho gaya')
        s = in_lines[pos[0]]
        pos[0] += 1
        out.write(s + '\n')
        return s

    def oid(v):
        k = id(v)
        if k not in ids:
            ids[k] = len(ids) + 1
            keep.append(v)
        return ids[k]

    class Enc:
        def __init__(self):
            self.heap = {}

        def node(self, v):
            t = type(v)
            if v is None:
                return {'k': 'val', 'ty': 'NoneType', 'text': 'None'}
            if t in (bool, int, float, complex):
                return {'k': 'val', 'ty': t.__name__, 'text': repr(v)}
            if t is str:
                r = repr(v)
                if len(r) > 40:
                    r = r[:37] + "...'"
                return {'k': 'val', 'ty': 'str', 'text': r, 'len': len(v)}
            if isinstance(v, (types.FunctionType, types.BuiltinFunctionType, types.MethodType)):
                return {'k': 'val', 'ty': 'function', 'text': 'function ' + getattr(v, '__name__', '?')}
            if isinstance(v, type):
                return {'k': 'val', 'ty': 'class', 'text': 'class ' + v.__name__}
            if isinstance(v, types.ModuleType):
                return {'k': 'val', 'ty': 'module', 'text': 'module ' + v.__name__}
            n = oid(v)
            key = 'o%d' % n
            if key not in self.heap:
                self.heap[key] = {'id': key, 'n': n}  # placeholder (cycles)
                self.heap[key].update(self.body(v))
            return {'k': 'ref', 'id': key, 'n': n, 'ty': self.label(v)}

        def label(self, v):
            t = type(v)
            if t in (list, tuple, set, frozenset, dict):
                return t.__name__
            return t.__name__

        def body(self, v):
            t = type(v)
            if t in (list, tuple):
                items = [self.node(x) for x in v[:40]]
                return {'kind': t.__name__, 'items': items, 'more': max(0, len(v) - 40)}
            if t in (set, frozenset):
                lst = list(v)[:30]
                return {'kind': t.__name__, 'items': [self.node(x) for x in lst], 'more': max(0, len(v) - 30)}
            if t is dict:
                ents = []
                for k, x in list(v.items())[:30]:
                    ents.append({'key': self.node(k), 'val': self.node(x)})
                return {'kind': 'dict', 'entries': ents, 'more': max(0, len(v) - 30)}
            if hasattr(v, '__dict__'):
                attrs = [{'name': k, 'node': self.node(x)} for k, x in list(v.__dict__.items())[:30]]
                return {'kind': 'instance', 'cls': t.__name__, 'attrs': attrs}
            return {'kind': 'other', 'cls': t.__name__, 'text': _rp.repr(v)}

    def user_chain(frame):
        chain = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == '<user>':
                chain.append(f)
            f = f.f_back
        chain.reverse()
        return chain

    def visible(name, v):
        if name.startswith('__') and name.endswith('__'):
            return False
        if isinstance(v, types.ModuleType):
            return False
        return True

    def diff_note(chain):
        parts = []
        for f in chain:
            if f.f_code.co_name == '<module>':
                items = f.f_globals.items()
                key = 'g'
            else:
                items = f.f_locals.items()
                key = id(f)
            cur = {}
            for k, v in items:
                if visible(k, v) and not isinstance(v, (types.FunctionType, type)):
                    cur[k] = _short(v)
            pv = prev_vars.get(key)
            if pv is not None:
                for k, s in cur.items():
                    if k not in pv:
                        parts.append("'%s' = %s" % (k, s))
                    elif pv[k] != s:
                        parts.append('%s: %s → %s' % (k, pv[k], s))
            else:
                for k, s in cur.items():
                    parts.append("'%s' = %s" % (k, s))
            prev_vars[key] = cur
        if not parts:
            return ''
        if len(parts) > 4:
            parts = parts[:4] + ['…']
        return '✎ ' + T('Changed: ', 'Badlaav: ') + ', '.join(parts) + '.'

    def snap(line, note, frame, extra=None):
        if state['trunc']:
            return
        if len(snaps) >= max_snaps:
            state['trunc'] = True
            result['truncated'] = True
            return
        chain = user_chain(frame)
        enc = Enc()
        glob = []
        frs = []
        for f in chain:
            if f.f_code.co_name == '<module>':
                for k, v in list(f.f_globals.items()):
                    if visible(k, v):
                        glob.append({'name': k, 'node': enc.node(v)})
            else:
                vs = []
                for k, v in list(f.f_locals.items()):
                    if visible(k, v):
                        vs.append({'name': k, 'node': enc.node(v)})
                nm = getattr(f.f_code, 'co_qualname', f.f_code.co_name)
                frs.append({'name': nm, 'line': f.f_lineno, 'vars': vs})
        lines = [note] if note else []
        d = diff_note(chain)
        if extra and extra.get('nodiff'):
            d = ''
            extra = {k: v for k, v in extra.items() if k != 'nodiff'}
        if d:
            lines.append(d)
        if out.n > state['prev_out']:
            chunk = out.getvalue()[state['prev_out']:]
            shown = chunk if len(chunk) <= 60 else chunk[:57] + '…'
            lines.append('🖨️ ' + T('Printed on screen: ', 'Screen par aaya: ') + '"' + shown.replace('\n', '↵') + '"')
            state['prev_out'] = out.n
        s = {'line': line, 'note': '\n'.join(lines), 'outLen': out.n, 'frames': frs, 'globals': glob,
             'heap': list(enc.heap.values())}
        if extra:
            s.update(extra)
        snaps.append(s)

    def explain_cond(lineno, frame):
        # returns (kind, cond_src, substituted) for if/elif/while lines
        try:
            txt = src_lines[lineno - 1].strip()
            kw = None
            for k in ('elif ', 'if ', 'while '):
                if txt.startswith(k):
                    kw = k.strip()
                    break
            if kw is None:
                return None
            body = txt[len(kw):].strip()
            if not body.endswith(':'):
                return None
            cond = body[:-1].strip()
            tree = ast.parse(cond, mode='eval')
            if any(isinstance(n, (ast.Call, ast.Lambda, ast.NamedExpr, ast.Await, ast.Yield)) for n in ast.walk(tree)):
                return (kw, cond, None)
            env = dict(frame.f_globals)
            env.update(frame.f_locals)

            class Sub(ast.NodeTransformer):
                def visit_Name(self, n):
                    if n.id in env and isinstance(env[n.id], (int, float, str, bool, type(None))):
                        return ast.copy_location(ast.Constant(env[n.id]), n)
                    return n
            sub = ast.unparse(Sub().visit(ast.parse(cond, mode='eval')))
            return (kw, cond, None if sub == cond else sub)
        except Exception:
            return None

    def indent_of(n):
        if n < 1 or n > len(src_lines):
            return 0
        s = src_lines[n - 1]
        return len(s) - len(s.lstrip())

    def line_note(prev_line, next_line, frame):
        txt = src_lines[prev_line - 1].strip() if 0 < prev_line <= len(src_lines) else ''
        deeper = next_line is not None and next_line > prev_line and indent_of(next_line) > indent_of(prev_line)
        c = explain_cond(prev_line, frame)
        if c and next_line is not None:
            kw, cond, sub = c
            res = deeper
            ex = ' → ' + sub if sub else ''
            if kw == 'while':
                return T('Loop condition (%s)%s → %s' % (cond, ex, 'TRUE ✅ — the loop body runs.' if res else 'FALSE ❌ — the loop ends.'), 'Loop condition (%s)%s → %s' % (cond, ex, 'TRUE ✅ — loop body chalegi.' if res else 'FALSE ❌ — loop khatam.'))
            return T('Condition (%s)%s → %s' % (cond, ex, 'TRUE ✅ — this block runs.' if res else 'FALSE ❌ — this block is skipped.'), 'Condition (%s)%s → %s' % (cond, ex, 'TRUE ✅ — ye block chalega.' if res else 'FALSE ❌ — ye block skip hoga.'))
        if txt.startswith('for ') and txt.endswith(':') and next_line is not None:
            return T('for loop: got the next item, the loop body runs.', 'for loop: agla item mila, loop body chalegi.') if deeper else T('for loop finished — no items are left.', 'for loop khatam — ab koi item nahi bacha.')
        if txt.startswith('def '):
            nm = txt[4:].split('(')[0].strip()
            return T("Function '%s' was DEFINED (only created, it has not run — it runs when you call it)." % nm, "Function '%s' DEFINE hua (sirf bana hai, abhi chala nahi — tab chalega jab call karoge)." % nm)
        if txt.startswith('class '):
            cn = txt[6:].split('(')[0].split(':')[0].strip()
            return T("Class '%s' was defined." % cn, "Class '%s' define hui." % cn)
        if txt.startswith('import ') or txt.startswith('from '):
            return T('The module was imported.', 'Module import hua.')
        if txt.startswith('break'):
            return T('break: leave the loop immediately.', 'break: loop se foran bahar.')
        if txt.startswith('continue'):
            return T('continue: skip the rest of this iteration.', 'continue: is iteration ka baaki code skip.')
        return ''

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != '<user>':
            return None
        if frame.f_code.co_name != '<module>' and not (frame.f_code.co_flags & 0x1):
            return None  # class body (not an optimized function frame)
        state['events'] += 1
        if state['events'] > max_events:
            raise _StepLimit()
        fid = id(frame)
        if event == 'call':
            last[fid] = None
            if frame.f_code.co_name == '<module>':
                snap(0, T('Program started.', 'Program shuru hua.'), frame)
                return tracer
            caller = frame.f_back
            cname = 'Main program'
            if caller is not None and caller.f_code.co_filename == '<user>' and caller.f_code.co_name != '<module>':
                cname = getattr(caller.f_code, 'co_qualname', caller.f_code.co_name) + '()'
            nm = getattr(frame.f_code, 'co_qualname', frame.f_code.co_name)
            args = ', '.join('%s=%s' % (k, _short(v)) for k, v in frame.f_locals.items())
            snap(frame.f_code.co_firstlineno, T('%s called %s(%s). A new frame was created and the parameters got their values.' % (cname, nm, args), '%s ne %s(%s) ko call kiya. Naya frame bana, parameters me values mili.' % (cname, nm, args)), frame, {'nodiff': True})
            return tracer
        if event == 'line':
            pl = last.get(fid)
            if pl is not None:
                snap(pl, line_note(pl, frame.f_lineno, frame), frame)
            last[fid] = frame.f_lineno
            return tracer
        if event == 'return':
            pl = last.get(fid)
            if frame.f_code.co_name == '<module>':
                if pl is not None:
                    snap(pl, line_note(pl, None, frame), frame)
                snap(pl or 0, T('The program ran to the end.', 'Program poora chal gaya.'), frame, {'final': True})
                return tracer
            nm = getattr(frame.f_code, 'co_qualname', frame.f_code.co_name)
            rv = _short(arg)
            if pl is not None:
                snap(pl, T("return %s: %s() gives this value back to the caller, then its frame is removed." % (rv, nm), "return %s: %s() ye value caller ko wapas dega, phir iska frame hat jayega." % (rv, nm)), frame, {'ret': {'frame': nm, 'text': rv}})
            last.pop(fid, None)
            return tracer
        if event == 'exception':
            return tracer
        return tracer

    g = {'__name__': '__main__', '__builtins__': builtins}
    old_out, old_in = sys.stdout, builtins.input
    sys.stdout = out
    builtins.input = fake_input
    cur_frame = [None]
    try:
        sys.settrace(tracer)
        exec(code, g)
        sys.settrace(None)
    except _StepLimit:
        sys.settrace(None)
        result['error'] = {'kind': 'runtime', 'line': 0, 'msg': T('The program ran for too long (maybe an infinite loop). Check the loop condition — will it ever become false?', 'Program bahut der chala (shayad infinite loop hai). Loop ki condition check karo — kya wo kabhi false hogi?')}
        result['truncated'] = True
    except BaseException as e:
        sys.settrace(None)
        tb = e.__traceback__
        line = 0
        frame_for_snap = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == '<user>':
                line = tb.tb_lineno
                frame_for_snap = tb.tb_frame
            tb = tb.tb_next
        nm = type(e).__name__
        msg = '%s: %s' % (nm, e) if str(e) else nm
        hint = _HINTS.get(nm)
        full = msg + ('\n💡 ' + hint if hint else '')
        result['error'] = {'kind': 'runtime', 'line': line, 'msg': full}
        try:
            if frame_for_snap is not None:
                state['trunc'] = False
                max_snaps += 1
                snap(line, '💥 ' + msg, frame_for_snap, {'error': True})
        except Exception:
            pass
    finally:
        sys.settrace(None)
        sys.stdout = old_out
        builtins.input = old_in
    result['out'] = out.getvalue()
    return json.dumps(result)
