import json, subprocess, os, sys, re
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
EXE = r'D:/AISpace/PMTOOL/app/src-tauri/target/release/pmtool.exe'
OUT = r'D:/AISpace/PMTOOL/summary'
d = json.load(open('D:/AISpace/PMTOOL/proj_data.json', encoding='utf-8'))
p = d['project']
tasks = d['tasks']
issues = d['issues']
reqs = d['requirements']
todos = d['todos']
total = len(tasks)
comp = sum(1 for t in tasks if t['status'] == 'COMPLETED')
prog = sum(1 for t in tasks if t['status'] == 'IN_PROGRESS')
pend = sum(1 for t in tasks if t['status'] == 'PENDING')
rate = round(comp / total * 100) if total else 0
overdue = [t for t in tasks if t['status'] != 'COMPLETED' and t.get('end_date') and t['end_date'] < '2026-09-30']
issue_open = [i for i in issues if i.get('status') == 'OPEN']
name = p['project_name']

# helpers
T = '| 任务 | 状态 | 进度 | 负责人 | 计划完成 |\n|---|---|---|---|---|\n'
for t in tasks[:8]:
    T += f'| {t["task_name"]} | {t["status"]} | {t["progress"]}% | {t.get("owner") or "暂未登记"} | {t.get("end_date") or "—"} |\n'

kinds = {}
kinds['project'] = f"""# {name}项目实施情况报告\n\n汇报日期：2026-09-30\n\n## 一、报告摘要\n项目当前处于开发上线阶段，总体进度约 {rate}%，整体明显滞后、需关注。70 项任务中完成 {comp} 项，{len(overdue)} 项逾期（最多延误 55 天）。核心风险集中在金舟接口未定稿与八院数据隔离、泛微定制排期未进场。下一阶段最关键动作是推动方案设计与两项 PRD 签字闭环。\n\n## 二、项目总体评价\n- 项目状态：关注（{len(overdue)} 项逾期、关键任务未启动）\n- 总体进度：{rate}%（{total} 项任务完成 {comp} 项）\n- 一句话评价：前期调研与方案已完成，开发期明显滞后，外部依赖未锁是主要矛盾。\n\n## 三、里程碑执行情况\n| 里程碑 | 状态 | 进度 | 计划完成 | 说明 |\n|---|---|---|---|---|\n| 项目启动与准备 | 已完成 | 100% | 2026-07-30 | 完成 |\n| 需求调研 | 已完成 | 100% | 2026-07-30 | 完成 |\n| 方案设计 | 进行中 | 78% | 2026-08-08 | 逾期 53 天 |\n| 开发上线 | 进行中 | 2% | 2026-10-30 | 滞后 |\n| 验收总结 | 未开始 | 0% | 2026-12-31 | — |\n\n## 四、重点项目进展\n- 方案设计（78%）— 逾期 59 天，为当前最成熟一项。\n- 合同系统定制及集成开发（5%）— 逾期 16 天，刚启动，负责人龚跃军。\n- SRM/合同 PRD 签字确认（0%）— 逾期 61/59 天，是开发前置阻塞，负责人王万成。\n\n## 五、主要风险与应对\n- 中风险：金舟接口未定稿，SRM 无法取中船数据、八院未隔离 — 应对：锁定接口文档与测试账号（王万成）。\n- 中风险：泛微定制排期 44 天未进场 — 应对：明确进场时间纳入排期。\n\n## 六、关键问题与待决\n- SRM 推送 NC 价格审批单：与蓝图不符 — 王万成，需确认后修订。\n- 调整合同名称业务逻辑：待成虎确认 — 兰岚。\n\n## 七、下一步计划与建议\n- 推进合同系统定制开发、完成测试环境数据初始化（作者）。\n- 协调金舟/泛微/用友明确排期与接口。\n\n## 八、数据附录\n- 任务统计：共 {total}，完成 {comp}，进行中 {prog}，待开始 {pend}，逾期 {len(overdue)}。\n- 风险 8 条（低 6 / 中 2，未关闭 2）；问题 4 条（未解决 3）；需求 4 条。\n"""

kinds['weekly'] = f"""# {name}周报（2026-09-22 ~ 2026-09-28）\n\n## 一、本周项目总体情况\n- 项目整体状态：关注\n- 项目进度：{rate}%\n\n## 二、本周完成工作\n| 工作事项 | 负责人 | 完成情况 |\n|---|---|---|\n| 系统部署方案确认 | 作者 | 已完成 |\n| 需求调研收尾 | 刘海东 | 已完成 |\n\n## 三、本周重点成果\n- 完成法务/营销/采购/财务需求调研。\n\n## 四、项目问题\n| 问题 | 影响 | 负责人 | 处理情况 |\n|---|---|---|---|\n| SRM 推送 NC 价格审批单不符 | 开发受阻 | 王万成 | 待确认 |\n\n## 五、下周工作计划\n- 推动方案设计收尾、合同系统定制开发启动。\n"""

kinds['monthly'] = f"""# {name}月报（2026-08）\n\n## 一、项目总体情况\n- 项目状态：关注\n- 本月进度：{rate}%\n\n## 二、本月项目进展\n- 需求调研完成、方案设计进行中 78%。\n\n## 三、重点工作完成情况\n- 法务/营销/采购/财务需求调研；SDM 系统调研。\n\n## 四、项目风险\n- 金舟接口未定稿；泛微排期 44 天未进场。\n\n## 五、下月工作计划\n- 合同系统定制开发、测试环境数据初始化。\n"""

kinds['phase'] = f"""# {name}项目阶段汇报\n\n汇报阶段：方案设计\n\n## 一、项目概况\n- 项目状态：关注\n- 项目进度：{rate}%\n\n## 二、本阶段完成情况\n- 完成需求调研、招标需求原型设计。\n- 方案设计进行中 78%，逾期 59 天。\n\n## 三、当前问题\n- 合同系统 PRD、SRM 集成 PRD 签字确认未完成（王万成）。\n\n## 四、下一阶段计划\n- 推动方案设计收尾、进入合同系统定制开发。\n"""

kinds['summary'] = f"""# {name}项目总结\n\n总结日期：2026-09-30\n\n## 一、项目基本信息\n- 项目编号：{p['project_code']}\n- 项目名称：{name}\n- 当前状态：{p['status']}\n\n## 二、项目建设目标\n- 实施智能印章、合同与 SDM 系统集成（暂未登记完整目标）。\n\n## 三、项目交付成果\n- 完成需求调研、方案设计 78%。\n\n## 四、项目关键里程碑\n- 启动与准备（完成）、需求调研（完成）、方案设计（进行中）。\n\n## 五、项目问题与解决\n- 3.2.11 SDM 推送 NC 价格审批单与蓝图不符（王万成）。\n\n## 六、后续建议\n- 补齐项目负责人、客户、起止日期字段；锁定外部接口排期。\n"""

kinds['requirements'] = f"""# {name}需求规格书\n\n## 一、文档说明\n- 文档用途：明确本项目需求范围与验收标准。\n\n## 二、背景与目标\n- 建设合同、SDM、电子签一体化系统。\n\n## 三、功能需求\n| 编号 | 需求 | 状态 |\n|---|---|---|\n{''.join(f'| REQ-{i:03d} | {r["summary"]} | {r["status"]} |\n' for i, r in enumerate(reqs, 1))}\n\n## 四、验收标准\n- 按登记需求逐项验收；未确认项列待决。\n"""

kinds['charter'] = f"""# {name}项目章程\n\n版本：V1.0 · 编制人：{p.get('owner') or '暂未登记'} · 日期：2026-09-30\n\n## 一、项目背景\n- 建设合同/电子签/SDM 一体化系统，覆盖法务、营销、采购、财务。\n\n## 二、项目目标与成功标准\n- 上线合同系统、SDM 集成、电子签接口；按里程碑交付。\n\n## 三、项目范围\n- 范围：合同/电子签/SDM 系统建设与集成；不包含：蓝图之外的范围。\n\n## 四、关键干系人\n| 角色 | 负责人 |\n|---|---|\n| 项目经理 | {p.get('owner') or '暂未登记'} |\n| 客户方 | {p.get('customer_name') or '暂未登记'} |\n\n## 五、总体计划\n- 计划起止：{p.get('start_date') or '暂未登记'} ~ {p.get('end_date') or '暂未登记'}\n\n## 六、主要风险\n- 金舟接口未定稿；泛微排期 44 天未进场。\n"""

kinds['acceptance'] = f"""# {name}验收报告\n\n验收日期：2026-09-30\n\n## 一、验收范围\n- 本阶段验收：需求调研、方案设计成果。\n\n## 二、验收标准\n- 按里程碑交付物逐项核验。\n\n## 三、验收过程与结果\n| 验收项 | 结果 | 结论 |\n|---|---|---|\n| 需求调研 | 完成 | 通过 |\n| 方案设计 | 78% | 有条件通过 |\n\n## 四、遗留问题\n- 方案设计未完全收尾；外部接口未锁定。\n\n## 五、验收结论\n- 有条件通过，待方案设计收尾与接口锁定后终验。\n"""

kinds['plan'] = f"""# {name}项目实施计划\n\n## 一、项目概述\n- 目标：合同/电子签/SDM 系统建设与集成\n- 范围：{total} 项任务\n\n## 二、实施阶段\n- 阶段：启动 → 需求调研 → 方案设计 → 开发上线 → 验收总结\n\n## 三、进度计划（关键里程碑）\n| 阶段 | 计划完成 | 现状 |\n|---|---|---|\n| 启动与准备 | 2026-07-30 | 完成 |\n| 需求调研 | 2026-07-30 | 完成 |\n| 方案设计 | 2026-08-08 | 78% 逾期 |\n| 开发上线 | 2026-10-30 | 2% |\n\n## 四、风险与应对\n- 金舟接口、泛微排期需锁定。\n"""

# generate all
os.makedirs(OUT, exist_ok=True)
def gen(title, md):
    payload = {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'pmtool__document_generate', 'arguments': {'title': title, 'markdown': md, 'format': 'docx'}}}
    inp = ''
    for obj in ({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}}, payload):
        b = json.dumps(obj)
        inp += 'Content-Length: ' + str(len(b)) + '

' + b
    try:
        proc = subprocess.run([EXE, '--mcp'], input=inp.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=12)
    except Exception as e:
        return 'ERR:' + str(e)
    txt = proc.stdout.decode('utf-8', 'replace')
    frames = re.split(r'Content-Length: \d+\r?\n\r?\n', txt)
    for f in frames:
        f = f.strip()
        if not f:
            continue
        try:
            obj = json.loads(f)
        except Exception:
            continue
        if obj.get('id') != 2:
            continue
        res = obj.get('result', {})
        content = res.get('content', [])
        if content:
            try:
                return json.loads(content[0]['text']).get('path')
            except Exception:
                return 'PARSE_ERR:' + content[0]['text'][:80]
    return 'NO_FRAME:' + txt[:120]

for kind, md in kinds.items():
    path = gen(name + '-' + kind, md)
    print(f'{kind}: {path}')
    if path:
        import shutil
        shutil.copy(path, os.path.join(OUT, f'{name}-{kind}.docx'))
print('DONE first batch, kinds:', list(kinds.keys()))
