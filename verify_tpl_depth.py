import json, subprocess, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
EXE = 'D:/AISpace/PMTOOL/app/src-tauri/target/release/pmtool.exe'
def call(kind):
    obj = {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'pmtool__document_template', 'arguments': {'kind': kind}}}
    inp = ''
    for o in ({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}}, obj):
        b = json.dumps(o)
        inp += 'Content-Length: ' + str(len(b)) + '\r\n\r\n' + b
    p = subprocess.run([EXE, '--mcp'], input=inp.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20)
    for f in re.split(r'Content-Length: \d+\r?\n\r?\n', p.stdout.decode('utf-8', 'replace')):
        f = f.strip()
        if not f:
            continue
        try:
            o = json.loads(f)
        except Exception:
            continue
        if o.get('id') == 2:
            return o
    return None

for k in ['project', 'weekly', 'monthly', 'phase', 'blueprint', 'summary', 'requirements', 'manual', 'plan', 'wbs', 'riskplan', 'acceptance', 'lessons']:
    r = call(k)
    if r:
        js = json.loads(r['result']['content'][0]['text'])
        tpl = js.get('template', '')
        spec = js.get('spec', {})
        print('%-13s template=%-4d chars | spec sections=%d | title=%s' % (k, len(tpl), len(spec.get('sections', [])), js.get('name')))
