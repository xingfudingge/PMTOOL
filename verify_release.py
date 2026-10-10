import json, subprocess, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
EXE = 'D:/AISpace/PMTOOL/app/src-tauri/target/release/pmtool.exe'
def call(obj):
    inp = ''
    for o in ({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}}, obj):
        b = json.dumps(o) if isinstance(o, dict) else json.dumps(o)
        inp += 'Content-Length: ' + str(len(b)) + '\r\n\r\n' + b
    p = subprocess.run([EXE, '--mcp'], input=inp.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=25)
    out = None
    for f in re.split(r'Content-Length: \d+\r?\n\r?\n', p.stdout.decode('utf-8', 'replace')):
        f = f.strip()
        if not f:
            continue
        try:
            o = json.loads(f)
        except Exception:
            continue
        if o.get('id') == 2:
            out = o
    return out

# 1) template with kind
r = call({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'pmtool__document_template', 'arguments': {'kind': 'project'}}})
sp = json.loads(r['result']['content'][0]['text'])['spec']
print('[template] project spec: sections=%d, required=%s' % (len(sp['sections']), [s['id'] for s in sp['sections'] if s['required']]))

# 2) generate with kind, READY markdown
md = '# 晨曦智能印章项目 实施情况报告\n\n## 执行摘要\n总体状态：黄。三条结论：进度 34% 滞后；外部接口未锁；需决策锁定接口。\n\n## 项目健康度仪表盘\n| 维度 | 状态 | 依据 |\n|---|---|---|\n| 进度 | 黄 | 34% 滞后 |\n| 风险 | 黄 | 接口未锁 |\n\n## 里程碑与进度偏差\n| 里程碑 | 计划 | 预测 | 偏差 | 状态 | 责任人 | 恢复 |\n|---|---|---|---|---|---|---|\n| 方案设计 | 08-08 | 10-10 | 53天 | 滞后 | 作者 | 收尾 |\n\n## 本期完成与关键成果\n- 需求调研完成，交付调研报告。\n\n## Top 风险与问题\n| 风险 | 影响 | 行动 | 责任人 | 截止 | 升级 |\n|---|---|---|---|---|---|\n| 金舟接口未定稿 | 阻开发 | 锁接口 | 王万成 | 10-05 | 否 |\n\n## 范围、需求与变更\n新增销售合同电子签接口，待评审。\n\n## 资源、外部依赖与协同\n外部依赖：金舟接口、泛微二开，需锁定进场。\n\n## 下期计划与管理层决策\n下期目标：方案设计收尾。需决策：接口与排期锁定，决策人 王万成，截止 10-05，延迟影响：阻开发。'
r = call({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'pmtool__document_generate', 'arguments': {'title': '晨曦-项目进展', 'markdown': md, 'format': 'docx', 'kind': 'project'}}})
text = json.loads(r['result']['content'][0]['text'])
q = text['quality']
print('[generate] state=%s | checks=%d | path=%s' % (q['state'], len(q['checks']), text['path']))
print('  suggestions:', q['suggestions'][:3])
