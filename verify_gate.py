import json, subprocess, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
EXE = 'D:/AISpace/PMTOOL/app/src-tauri/target/debug/pmtool.exe'

def call(obj):
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

# READY case
md = '# 项目周报\n\n## 本周状态与一句话判断\n总体受控。\n\n## 本周完成事项与交付成果\n需求调研收尾。\n\n## 关键里程碑和任务偏差\n方案设计逾期。\n\n## 下周承诺计划\n完成方案设计，责任人 作者，截止 2026-10-10。\n\n## 需协同与需决策事项\n需决策：接口锁定，决策人 王万成，截止 2026-10-05，影响：阻开发。'
r = call({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'pmtool__document_generate', 'arguments': {'title': 'x', 'markdown': md, 'format': 'docx', 'kind': 'weekly'}}})
q = json.loads(r['result']['content'][0]['text'])['quality']
print('READY?', q['state'], '| checks:', len(q['checks']), '| sug:', len(q['suggestions']))

# DRAFT case
md2 = '# 项目周报\n\n只有一句话。'
r = call({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'pmtool__document_generate', 'arguments': {'title': 'y', 'markdown': md2, 'format': 'docx', 'kind': 'weekly'}}})
q2 = json.loads(r['result']['content'][0]['text'])['quality']
print('DRAFT?', q2['state'], '| checks:', len(q2['checks']))
