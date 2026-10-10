# -*- coding: utf-8 -*-
import json, subprocess, re, io, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
EXE = 'D:/AISpace/PMTOOL/app/src-tauri/target/release/pmtool.exe'
NL = chr(10)
D = json.load(io.open('D:/AISpace/PMTOOL/proj_data.json', encoding='utf-8'))
P = D['project']; TASKS = D['tasks']; ISSUES = D['issues']; REQS = D['requirements']; TODOS = D['todos']
NAME = P['project_name']; CODE = P['project_code']

def n(x, f=''):
    return f if x is None or x == '' else x

def stc(s):
    return {'COMPLETED': '已完成', 'IN_PROGRESS': '进行中', 'PENDING': '待开始', 'EXECUTING': '执行中'}.get(s, n(s))
def lvc(s):
    return {'HIGH': '高', 'MEDIUM': '中', 'LOW': '低', 'CRITICAL': '严重'}.get(s, n(s))
def isc(s):
    return {'OPEN': '未解决', 'CLOSED': '已关闭'}.get(s, n(s))

def tbl(h, r):
    out = ['| ' + ' | '.join(h) + ' |', '|' + '---|' * len(h)]
    for row in r:
        out.append('| ' + ' | '.join(str(c) for c in row) + ' |')
    return out

def tasks_tbl():
    return tbl(['序号', '任务', '负责人', '进度', '状态', '计划开始', '计划完成', '工期'],
        [(t['id'], n(t['task_name']), n(t['owner'], '未提供'), str(int(t.get('progress', 0))) + '%', stc(t['status']),
          (n(t['start_date'])[:10] if t.get('start_date') else '-'), (n(t['end_date'])[:10] if t.get('end_date') else '-'), str(int(t.get('work_days') or 0)) + '天') for t in TASKS])

def issues_tbl():
    return tbl(['编号', '问题', '等级', '状态', '责任人', '计划日期', '解决/说明'],
        [(i['id'], n(i['title']), lvc(i['level']), isc(i['status']), n(i['owner'], '未提供'),
          (n(i['plan_date'])[:10] if i.get('plan_date') else '-'), (n(i['solution'])[-60:] or n(i['resolution'],'-'))) for i in ISSUES])

def reqs_tbl():
    return tbl(['编号', '系统', '需求主题', '提出人', '状态', '需求描述'],
        [(r['id'], n(r['system']), n(r['summary']), n(r['proposer']), isc(r['status']), (n(r['detail'])[:120] + '...') if r.get('detail') else '-') for r in REQS])

def todos_tbl():
    return tbl(['待办事项', '相关人', '计划日期', '状态'],
        [(t['content'], n(t['related_people'], '-'), (n(t['plan_date'])[:10] if t.get('plan_date') else '-'), isc(t['status'])) for t in TODOS])

comp = sum(1 for t in TASKS if t['status'] == 'COMPLETED')
prog = sum(1 for t in TASKS if t['status'] == 'IN_PROGRESS')
pend = sum(1 for t in TASKS if t['status'] == 'PENDING')
tot = len(TASKS)
rate = round(comp * 100 / tot) if tot else 0
openi = [i for i in ISSUES if i['status'] == 'OPEN']
med = [i for i in ISSUES if i['level'] in ('HIGH', 'MEDIUM')]
overdue_t = [t for t in TASKS if t['status'] != 'COMPLETED' and t['end_date'] and t['end_date'] < '2026-09-30']

# ---- build all kinds ----
M = {}
def b(k, title, lines):
    M[k] = (title, lines)

# merge kind content modules
for mf in ['kinds_report.py', 'kinds_rest.py', 'kinds_docs.py', 'kinds_docs2.py']:
    exec(open(mf, encoding='utf-8').read(), globals())

print('TOTAL kinds:', len(M), '->', ', '.join(M.keys()))

# ---- generate via interface ----
def gen(kind, title, md):
    payload = {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'pmtool__document_generate', 'arguments': {'title': title, 'markdown': md, 'format': 'docx', 'kind': kind}}}
    inp = ''
    for o in ({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}}, payload):
        b = json.dumps(o)
        inp += 'Content-Length: ' + str(len(b)) + chr(13) + chr(10) + chr(13) + chr(10) + b
    try:
        p = subprocess.run([EXE, '--mcp'], input=inp.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=40)
    except Exception as e:
        print(' %-11s ERROR %s' % (kind, e))
        return None
    for f in re.split(r'Content-Length: \d+\r?\n\r?\n', p.stdout.decode('utf-8', 'replace')):
        f = f.strip()
        if not f:
            continue
        try:
            o = json.loads(f)
        except Exception:
            continue
        if o.get('id') == 2:
            try:
                return json.loads(o['result']['content'][0]['text'])
            except Exception:
                return None
    return None

for kind in sorted(M.keys()):
    title, lines = M[kind]
    md = NL.join(lines)
    js = gen(kind, NAME + '-deep-' + title, md)
    if js:
        print(' %-11s chars=%-5d state=%-10s' % (kind, len(md), (js.get('quality') or {}).get('state')))
    else:
        print(' %-11s FAILED' % kind)
print('DONE all deep')
