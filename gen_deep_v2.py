# -*- coding: utf-8 -*-
import json, subprocess, io, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
EXE = 'D:/AISpace/PMTOOL/app/src-tauri/target/release/pmtool.exe'
NL = chr(10)
D = json.load(io.open('D:/AISpace/PMTOOL/proj_data.json', encoding='utf-8'))
P = D['project']; TASKS = D['tasks']; ISSUES = D['issues']; REQS = D['requirements']; TODOS = D['todos']
NAME = P['project_name']; CODE = P['project_code']

def n(x, f=''):
    return f if x is None else x

def stc(s):
    return {'COMPLETED': '已完成', 'IN_PROGRESS': '进行中', 'PENDING': '待开始'}.get(s, n(s))
def lvc(s):
    return {'HIGH': '高', 'MEDIUM': '中', 'LOW': '低'}.get(s, n(s))
def isc(s):
    return {'OPEN': '未解决', 'CLOSED': '已关闭'}.get(s, n(s))

comp = sum(1 for t in TASKS if t['status'] == 'COMPLETED')
prog = sum(1 for t in TASKS if t['status'] == 'IN_PROGRESS')
pend = sum(1 for t in TASKS if t['status'] == 'PENDING')
tot = len(TASKS)
rate = round(comp * 100 / tot) if tot else 0
openi = [i for i in ISSUES if i['status'] == 'OPEN']
openi_ct = len(openi)
med = [i for i in ISSUES if i['level'] in ('HIGH', 'MEDIUM')]
overdue_t = [t for t in TASKS if t['status'] != 'COMPLETED' and t['end_date'] and t['end_date'] < '2026-09-30']

# ---- shared full-data renderers ----
def tbl(header, rows2):
    out = ['| ' + ' | '.join(header) + ' |', '|' + '---|' * len(header)]
    for r in rows2:
        out.append('| ' + ' | '.join(str(c) for c in r) + ' |')
    return out

def tasks_tbl():
    return tbl(['序号', '任务', '负责人', '进度', '状态', '计划开始', '计划完成', '计划工期'],
        [(t['id'], n(t['task_name']), n(t['owner'], '-'), str(int(t.get('progress', 0))) + '%',
          stc(t['status']), n(t['start_date'])[:10] if t.get('start_date') else '-',
          n(t['end_date'])[:10] if t.get('end_date') else '-', str(int(t.get('work_days') or 0)) + ' 天') for t in TASKS])

def issues_tbl():
    return tbl(['编号', '问题', '等级', '状态', '责任人', '计划', '方案'],
        [(i['id'], n(i['title']), lvc(i['level']), isc(i['status']), n(i['owner'], '-'),
          n(i['plan_date'])[:10] if i.get('plan_date') else '-', n(i['solution'], '-')[:60]) for i in ISSUES])

def reqs_tbl():
    return tbl(['编号', '系统', '需求', '提出人', '状态'],
        [(r['id'], n(r['system']), n(r['summary'])[:90], n(r['proposer']), isc(r['status'])) for r in REQS])

def todos_tbl():
    return tbl(['待办', '相关人', '计划', '状态'],
        [(t['content'], n(t['related_people'], '-'), n(t['plan_date'])[:10] if t.get('plan_date') else '-', isc(t['status'])) for t in TODOS])

M = {}
def b(k, title, lines):
    M[k] = (title, lines)

# ================= PROJECT (flagship, FULL data) =================
L = []
L.append('# ' + NAME + ' 项目实施情况报告')
L.append('')
L.append('## 文档控制')
L.extend(tbl(['项', '内容'], [['文档编号', 'XM-BG-001'], ['报告类型', '进展汇报'], ['项目编号', CODE],
    ['项目周期', n(P['start_date']) + ' ~ ' + n(P['end_date'])], ['编制人', '项目组'], ['报告日期', '2026-09-30'],
    ['汇报对象', '项目决策层 / 项目指导委员会'], ['保密级别', '机密']]))
L.append('')
L.append('## 修订记录')
L.extend(tbl(['版本', '日期', '修订人', '内容'], [['v1.0', '2026-09-30', '项目组', '初版']]))
L.append('')
L.append('> 本报告面向项目决策层。让领导读一页、看三分钟，即知项目是否受控、需要做什么决策。')
L.append('')
L.append('### 1.0 数据质量提示')
L.append('> 截至报告日：项目负责人、客户单位、预算未登记，已标注 未提供；对资源/成本维度判断受限，进度结论不受影响。')
L.append('')
L.append('## 一、执行摘要')
L.append('')
L.append('### 1.1 总体状态')
L.extend(tbl(['维度', '状态', '一句话判断'], [
    ['范围', '黄', '范围基本稳定：' + str(len(REQS)) + ' 项需求登记，1 项待确认、1 项新变更待评审'],
    ['进度', '红', '总体完成率 ' + str(rate) + '%，关键路径方案设计逾期，开发期明显滞后'],
    ['成本', '黄', '预算未提供，无法评估'],
    ['质量', '黄', '需求/方案待评审，无验收证据'],
    ['资源', '黄', '外部供应商排期未锁定'],
    ['风险', '红', str(openi_ct) + ' 项开放式问题，含高等级接口未定稿']]))
L.append('')
L.append('### 1.2 项目概况')
L.append('- 项目名称：' + NAME + '（' + CODE + '）')
L.append('- 立项背景：' + n(P['background']))
L.append('- 建设目标：' + n(P['objective']))
L.append('- 项目范围：' + n(P['scope']))
L.append('- 项目周期：' + n(P['start_date']) + ' ~ ' + n(P['end_date']) + '（计划）　优先级：' + n(P['priority']))
L.append('')
L.append('### 1.3 三条关键结论')
L.append('1. ' + NAME + ' 处于开发上线阶段，总体完成率 ' + str(rate) + '%，明显滞后；' + str(len(overdue_t)) + ' 项超期任务沿关键路径阻塞开发启动。')
L.append('3. 需要决策层尽快拍板：外部接口与排期锁定方案，以及待签认的 PRD。')
L.append('')
L.append('### 1.4 需决策事项')
L.extend(tbl(['决策项', '推荐方案', '备选', '决策人', '截止', '延迟影响'], [
    ['外部接口与供应商排期锁定', '本周与三方确认接口文档与进场时间', '先开发不依赖外部接口的模块', '王万成', '2026-10-05', '每延 1 周顺延约 2 周'],
    ['方案设计 PRD 签字', '本周完成签字', '先评审后签字', '王万成', '2026-10-03', '阻塞开发启动']]))
L.append('')
L.append('## 二、项目健康度仪表盘')
L.extend(tbl(['维度', '状态', '依据（数据/事实）'], [
    ['范围', '黄', '需求登记 ' + str(len(REQS)) + ' 项；1 项新增、1 项待确认、1 项已确认'],
    ['进度', '红', str(comp) + '/' + str(tot) + ' 完成，进行中 ' + str(prog) + '，待开始 ' + str(pend) + '，超期 ' + str(len(overdue_t)) + ' 项'],
    ['成本', '黄', '预算未提供，无法评估'],
    ['质量', '黄', '需求调研完成、方案设计 ' + str(next((t['progress'] for t in TASKS if '方案设计' in n(t['task_name'])), 0)) + '%，无评审验收证据'],
    ['资源', '黄', '外部供应商排期未锁定'],
    ['风险', '红', '开放式问题 ' + str(openi_ct) + ' 项，高/中等级 ' + str(len(med)) + ' 项']]))
L.append('')
L.append('## 三、里程碑与进度偏差')
L.append('### 3.1 总体进度')
L.append('- 任务总数 ' + str(tot) + ' 项：完成 ' + str(comp) + '、进行中 ' + str(prog) + '、待开始 ' + str(pend) + '、超期 ' + str(len(overdue_t)) + '。')
L.append('- 总体完成率 ' + str(rate) + '%；平均进度持续爬升，但关键路径滞后。')
L.append('')
L.append('### 3.2 关键里程碑')
L.extend(tbl(['里程碑', '计划', '当前', '说明'], [
    ['项目启动与准备', '2026-07-30', '已完成', '100%'],
    ['需求调研', '2026-07-30', '已完成', '100%'],
    ['方案设计', '2026-08-08', '进行中', '逾期'],
    ['开发上线', '2026-10-30', '待启动', '滞后'],
    ['验收总结', '2026-12-31', '未开始', '未启动']]))
L.append('')
L.append('### 3.3 超期聚焦')
for t in overdue_t:
    L.append('- ' + n(t['task_name']) + '：进度 ' + str(int(t.get('progress', 0))) + '%，逾期，负责人 ' + n(t['owner'], '未提供') + '。')
L.append('')
L.append('## 四、本期完成与关键成果')
L.append('- 需求调研完成：法务/营销/采购/财务调研覆盖完整，形成需求规格。')
L.append('- 系统部署方案确认：形成部署方案。')
L.append('> 只列有交付物或验收证据的成果；需求/方案无评审证据，写 进展/待评审，不写 通过。')
L.append('')
L.append('## 五、Top 风险与问题')
L.extend(tbl(['序号', '风险/问题', '影响', '等级', '行动', '责任人', '截止', '升级'], [
    [str(i + 1), n(ic['title'])[:40], '开发受阻', lvc(ic['level']), n(ic['solution'], '-')[:40], n(ic['owner'], '未提供'), (n(ic['plan_date'], '')[:10] or '-'), '是' if ic['status'] == 'OPEN' else '否']
    for i, ic in enumerate(ISSUES)]) if ISSUES else [])
L.append('')
L.append('## 六、范围、需求与变更')
L.extend(tbl(['编号', '系统', '需求', '状态'], [(r['id'], n(r['system']), n(r['summary'])[:60], isc(r['status'])) for r in REQS]))
L.append('')
L.append('## 七、资源、外部依赖与协同')
L.append('### 7.1 待办与协调')
L.extend(todos_tbl())
L.append('')
L.append('## 八、下期计划与管理层决策')
L.extend(tbl(['下期目标', '行动承诺', '需决策', '推荐', '决策人', '截止', '延迟影响'], [
    ['方案设计收尾', '完成模板 + PRD 签字', '接口与排期锁定', '三方确认', '王万成', '2026-10-05', '每延 1 周顺延 2 周'],
    ['开发启动', '定制开发 + 测试环境初始化', '-', '-', '龚跃军', '2026-10-08', '阻开发']]))
L.append('')
L.append('## 九、数据附录')
L.append('### 任务明细（全部 ' + str(tot) + ' 项）')
L.extend(tasks_tbl())
L.append('')
L.append('### 风险问题登记（全部 ' + str(len(ISSUES)) + ' 项）')
L.extend(issues_tbl())
L.append('')
L.append('### 需求登记（全部 ' + str(len(REQS)) + ' 项）')
L.extend(reqs_tbl())
L.append('')
L.append('### 待办清单（全部 ' + str(len(TODOS)) + ' 项）')
L.extend(todos_tbl())
b('project', '项目进展汇报', L)

# ---- generation loop ----
def gen(kind, title, md):
    payload = {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'pmtool__document_generate', 'arguments': {'title': title, 'markdown': md, 'format': 'docx', 'kind': kind}}}
    inp = ''
    for o in ({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}}, payload):
        b = json.dumps(o)
        inp += 'Content-Length: ' + str(len(b)) + '\r\n\r\n' + b
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
        print(' %-11s chars=%-5d paras-bytes=%-6d state=%-10s' % (kind, len(md), js.get('bytes', 0), (js.get('quality') or {}).get('state')))
    else:
        print(' %-11s FAILED' % kind)
print('DONE')
