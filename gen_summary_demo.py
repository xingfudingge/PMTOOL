# -*- coding: utf-8 -*-
import json, subprocess, re, io, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
EXE = 'D:/AISpace/PMTOOL/app/src-tauri/target/release/pmtool.exe'
NL = chr(10)
D = json.load(io.open('D:/AISpace/PMTOOL/proj_data.json', encoding='utf-8'))
P = D['project']; TASKS = D['tasks']; ISSUES = D['issues']

L = []
add = L.append
add('# 晨曦智能印章项目 项目总结')
add('')
add('## 项目基本信息')
add('| 项目编号 | ' + P['project_code'] + ' | 项目名称 | ' + P['project_name'] + ' |')
add('|---|---|---|')
add('| 项目周期 | ' + (P.get('start_date') or '未提供') + ' ~ ' + (P.get('end_date') or '未提供') + ' | 负责人 | 未提供 |')
add('')
add('## 一、项目概况')
add('本项目系集团合同/供应商管理一体化建设，目标为上线合同管理系统（采购/销售全生命周期）并完成与 OA、NC、电子签章、档案等系统的集成。项目于 ' + (P.get('start_date') or '未提供') + ' 启动，计划 ' + (P.get('end_date') or '未提供') + ' 完成验收。')
add('')
add('截至 2026-09-30，项目已完成需求调研与系统部署方案，方案设计进行至 78%，尚未进入开发上线阶段。整体进度明显滞后于计划。')
add('')
add('## 二、目标与总体达成情况')
add('对照立项目标：合同/电子签/SRM 一体化上线、打通业财数据，目前仅完成需求与方案阶段，开发与集成尚未启动，整体达成度约三分一，与 ' + (P.get('end_date') or '未提供') + ' 验收目标存在较明显差距。')
add('')
add('**原因判断**：进度滞后的主要原因不在项目组内部，而在外部依赖未早期锁定——相关外部接口文档未定稿，部分供应商开发排期迟迟未能进场，导致方案设计无法闭合、开发无法启动。这类外部依赖若不尽快锁定，将成为关键路径上的持续阻塞。')
add('')
add('## 三、实施过程与关键节点')
add('项目按 启动→需求调研→方案设计→开发上线→验收 五阶段推进。启动与需求调研如期完成；方案设计为当前瓶颈；开发上线与验收尚未启动。各阶段完成情况：')
add('')
add('- 启动与准备：已完成；')
add('- 需求调研：已完成，覆盖法务、营销、采购、财务四线业务；')
add('- 方案设计：进行中 78%，超期约 53 天，为主要阻滞；')
add('- 开发上线：尚未启动，待方案收尾与外部接口锁定；')
add('- 验收总结：未开始。')
add('')
add('## 四、关键成果')
add('1. 完成需求调研报告，覆盖四线业务，为后续设计与实施提供了清晰需求基线。')
add('2. 完成系统部署方案，为上线运维做准备。')
add('3. 方案设计与原型完成 78%，形成主要页面与流程蓝图。')
add('')
add('## 五、进度情况')
add('当前项目总体完成率约 34%，共 ' + str(len(TASKS)) + ' 项任务，其中已完成、进行中、待开始任务分布存在较明显的不均衡，关键路径（方案设计→开发上线）滞后。')
add('')
add('**判断**：滞后主要影响后续开发与集成联调窗口，若不在近期锁定外部接口与排期并完成方案收尾，将难以在计划验收期前形成可用交付。')
add('')
add('## 六、主要问题与风险')
add('项目目前最突出的是外部依赖与里程碑偏差：')
add('')
for i in ISSUES:
    add('- ' + i['title'] + '（等级 ' + (i.get('level') or '-') + '，状态 ' + (i.get('status') or '-') + '）。')
add('')
add('其中，接口未定稿与供应商排期未进场风险等级最高，建议尽快升级至管理层协调，明确责任人与截止时间。')
add('')
add('## 七、经验与教训')
add('- 做得好的：需求调研覆盖完整，为设计、开发、验收提供了清晰基线；')
add('- 待改进的：外部依赖（接口/排期）未在项目早期明确并纳入关键路径管理，导致方案设计与开发时序被外部因素反复挤压。')
add('')
add('**教训**：类似项目应尽早与外部供应商/平台方确认接口文档、测试账号与进场排期，并将其列为关键路径的前置条件，避免后期被动。')
add('')
add('## 八、遗留事项与后续建议')
add('1. 方案设计收尾与 PRD 签认：由设计负责人完成，建议本周内闭环；')
add('2. 外部接口与排期锁定：建议升级至管理层协调，明确三方确认时间；')
add('3. 开发上线启动：在方案收尾与接口锁定后启动，作为后续关键动作。')
add('')
add('## 九、详细管理数据')
add('完整任务清单、问题清单、需求清单与待办作为独立项目管理数据维护，如需要可作为附录输出，此处不展开。')

md = NL.join(L)
print('summary demo markdown: %d lines, %d chars' % (len(L), len(md)))

payload = {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'pmtool__document_generate', 'arguments': {'title': '晨曦智能印章项目-项目总结', 'markdown': md, 'format': 'docx', 'kind': 'summary'}}}
inp = ''
for o in ({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}}, payload):
    b = json.dumps(o)
    inp += 'Content-Length: ' + str(len(b)) + '\r\n\r\n' + b
p = subprocess.run([EXE, '--mcp'], input=inp.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=25)
for f in re.split(r'Content-Length: \d+\r?\n\r?\n', p.stdout.decode('utf-8', 'replace')):
    if not f.strip():
        continue
    try:
        o = json.loads(f)
    except Exception:
        continue
    if o.get('id') == 2:
        js = json.loads(o['result']['content'][0]['text'])
        print('path:', js.get('path'))
        q = js.get('quality', {})
        print('state:', q.get('state'))
        for c in (q.get('checks') or []):
            print('   ', c.get('pass'), c.get('check'))
        break
