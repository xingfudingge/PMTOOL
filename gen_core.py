import json, subprocess, io, sys, os, shutil, threading, queue, time, re
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
EXE = 'D:/AISpace/PMTOOL/app/src-tauri/target/release/pmtool.exe'
OUT = 'D:/AISpace/PMTOOL/summary'
d = json.load(io.open('D:/AISpace/PMTOOL/proj_data.json', encoding='utf-8'))
p = d['project']; tasks = d['tasks']; issues = d['issues']; reqs = d['requirements']
total = len(tasks)
comp = sum(1 for t in tasks if t['status'] == 'COMPLETED')
prog = sum(1 for t in tasks if t['status'] == 'IN_PROGRESS')
pend = sum(1 for t in tasks if t['status'] == 'PENDING')
rate = round(comp / total * 100) if total else 0
overdue = [t for t in tasks if t['status'] != 'COMPLETED' and t.get('end_date') and t['end_date'] < '2026-09-30']
name = p['project_name']
med = [i for i in issues if i.get('level') == 'MEDIUM']
opn = [i for i in issues if i.get('status') == 'OPEN']

def gen(title, md):
    payload = {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': 'pmtool__document_generate', 'arguments': {'title': title, 'markdown': md, 'format': 'docx'}}}
    inp = ''
    for obj in ({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}}, payload):
        b = json.dumps(obj)
        inp += 'Content-Length: ' + str(len(b)) + chr(13) + chr(10) + chr(13) + chr(10) + b
    proc = subprocess.run([EXE, '--mcp'], input=inp.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15)
    txt = proc.stdout.decode('utf-8', 'replace')
    for f in re.split(r'Content-Length: ' + r'\d+' + r'\r?\n\r?\n', txt):
        f = f.strip()
        if not f:
            continue
        try:
            obj = json.loads(f)
        except Exception:
            continue
        if obj.get('id') != 3:
            continue
        content = obj.get('result', {}).get('content', [])
        if content:
            try:
                return json.loads(content[0]['text']).get('path')
            except Exception:
                return None
    return None

md_project = '# ' + name + '项目实施情况报告\n\n项目编号：' + p['project_code'] + '　项目名称：' + name + '　汇报日期：2026-09-30\n\n> 本报告面向项目决策层。让领导读一页、看三分钟，即知项目走向、风险与下一步。\n\n## 一、项目概况\n- 项目名称：' + name + '（' + p['project_code'] + '）\n- 当前阶段：开发上线\n- 项目状态：关注（' + str(len(overdue)) + ' 项逾期、关键任务未启动）\n- 项目周期：' + (p['start_date'] or '暂未登记') + ' ~ ' + (p['end_date'] or '暂未登记') + '（计划）　预算：暂未登记\n- 项目负责人：暂未登记　客户方：暂未登记\n\n## 二、本期关键结论\n项目处于开发上线阶段，总体进度 ' + str(rate) + '%，明显滞后。' + str(total) + ' 项任务完成 ' + str(comp) + ' 项，' + str(len(overdue)) + ' 项逾期。核心风险是外部供应商（金舟接口、泛微二开、用友 NC）方案与排期未锁定。下期最关键动作是推动方案设计与两项 PRD 签字闭环。\n\n## 三、进度执行情况\n### 3.1 总体进度\n- 任务总数 ' + str(total) + ' 项：完成 ' + str(comp) + '、进行中 ' + str(prog) + '、待开始 ' + str(pend) + '、逾期 ' + str(len(overdue)) + '。\n- 总体完成率 ' + str(rate) + '%（平均进度 37%）。\n\n### 3.2 关键里程碑\n| 里程碑 | 状态 | 计划完成 | 当前 | 说明 |\n|---|---|---|---|---|\n| 项目启动与准备 | 已完成 | 2026-07-30 | 完成 | 100% |\n| 需求调研 | 已完成 | 2026-07-30 | 完成 | 100% |\n| 方案设计 | 进行中 | 2026-08-08 | 78% | 逾期 53 天 |\n| 开发上线 | 进行中 | 2026-10-30 | 2% | 滞后 |\n| 验收总结 | 未开始 | 2026-12-31 | 0% | 未启动 |\n\n### 3.3 超期聚焦\n- 方案设计 78%，影响后续开发启动。\n- 合同系统定制及集成开发 5%，负责人龚跃军。\n\n## 四、本期重点事项\n### 4.1 方案设计：完成需求与原型 78%，逾期 53 天，需关注。\n### 4.2 开发上线：刚启动 2%，外部接口与 PRD 未签，受阻。\n> 只写影响判断的关键项；全量明细见文末数据附录。\n\n## 五、主要风险\n| 编号 | 风险 | 等级 | 现状 | 应对 | 责任人 |\n|---|---|---|---|---|---|\n| R-1 | 金舟接口未定稿 | 中 | 未关闭 | 锁定接口文档与测试账号 | 王万成 |\n| R-2 | 泛微定制排期 44 天未进场 | 中 | 未关闭 | 明确进场时间 | 暂未登记 |\n\n## 六、关键问题\n| 问题 | 影响 | 责任人 | 截止期 | 进展 | 需决策 |\n|---|---|---|---|---|---|\n| SRM 推送 NC 价格审批单不符 | 开发受阻 | 王万成 | 2026-10-03 | 待确认 | 是 |\n\n## 七、需求与变更\n- 本期变更：增加销售合同电子签接口（CONFIRMED）。\n\n## 八、资源与协同\n- 外部依赖：金舟接口、泛微二开、用友 NC（未锁定，为阻塞点）。\n\n## 九、结论与下期计划\n- 本期整体：关注，开发期明显滞后，外部依赖未锁是主要矛盾。\n- 下期动作：1. 推动方案设计与 PRD 签字（王万成 10-03）；2. 测试环境初始化（作者 10-05）；3. 锁定外部接口与排期。\n\n## 十、数据附录\n### 任务明细\n| 任务 | 状态 | 进度 | 负责人 | 计划完成 |\n|---|---|---|---|---|\n' + '\n'.join(['| ' + t['task_name'] + ' | ' + t['status'] + ' | ' + str(t['progress']) + '% | ' + (t['owner'] or '暂未登记') + ' | ' + (t['end_date'] or '-') + ' |' for t in tasks[:6]]) + '\n\n### 风险登记\n| 编号 | 风险 | 等级 | 状态 |\n|---|---|---|---|\n' + '\n'.join(['| R-' + str(i+1) + ' | ' + x['title'][:30] + ' | ' + (x['level'] or '-') + ' | ' + x['status'] + ' |' for i, x in enumerate(med)]) + '\n\n### 需求登记\n| 编号 | 需求 | 状态 |\n|---|---|---|\n' + '\n'.join(['| REQ-' + str(i+1).zfill(3) + ' | ' + r['summary'][:30] + ' | ' + r['status'] + ' |' for i, r in enumerate(reqs)]) + '\n'

# 其余 7 类用精炼但完整结构
md_weekly = '# ' + name + '项目周报\n\n报告周期：2026-09-22 ~ 2026-09-28　项目状态：关注\n\n> 面向管理层：一页看清本周进展、问题、风险、下周动作。\n\n## 一、本周小结\n本周完成需求调研收尾与部署方案确认，整体进度 ' + str(rate) + '%，关键 PRD 待签署。\n\n## 二、本周完成工作\n| 工作事项 | 负责人 | 完成时间 | 说明 |\n|---|---|---|---|\n| 系统部署方案确认 | 作者 | 09-25 | 已完成 |\n| 需求调研收尾 | 刘海东 | 09-26 | 已完成 |\n\n## 三、本周重点成果\n- 完成法务/营销/采购/财务需求调研。\n\n## 四、本周问题\n| 问题 | 影响 | 责任人 | 期限 | 进展 |\n|---|---|---|---|---|\n| SRM 推送 NC 价格审批单不符 | 开发受阻 | 王万成 | 10-03 | 待确认 |\n\n## 五、下周计划\n- 推动方案设计收尾、合同系统定制开发启动。\n'

md_monthly = '# ' + name + '项目月报\n\n报告月份：2026-08　项目状态：关注\n\n> 面向管理层：一月看趋势、看偏差、看风险与下月计划。\n\n## 一、月度小结\n本月需求调研完成、方案设计进行中 78%，总体进度 ' + str(rate) + '%，滞后于计划。\n\n## 二、本月项目进展\n| 维度 | 本月情况 | 与计划比较 |\n|---|---|---|\n| 进度 | ' + str(rate) + '% | 滞后 |\n| 里程碑 | 需求调研完成 | 达成 |\n| 交付物 | 调研报告、方案设计与原型 | 78% |\n\n## 三、本月风险\n- 金舟接口未定稿；泛微排期 44 天未进场。\n\n## 四、下月计划\n- 合同系统定制开发、测试环境数据初始化。\n'

md_phase = '# ' + name + '项目阶段汇报\n\n汇报阶段：方案设计　项目状态：关注\n\n> 面向评审方：本阶段干成了什么、有何问题、下阶段怎么走。\n\n## 一、项目概况\n| 项 | 内容 |\n|---|---|\n| 名称/编号 | ' + name + ' / ' + p['project_code'] + ' |\n| 当前阶段 | 方案设计 |\n| 周期 | ' + (p['start_date'] or '-') + ' ~ ' + (p['end_date'] or '-') + ' |\n\n## 二、本阶段完成情况\n| 交付物 | 完成度 | 说明 |\n|---|---|---|\n| 需求调研 | 100% | 完成 |\n| 方案设计 | 78% | 逾期 53 天 |\n\n## 三、当前问题\n- 合同系统 PRD、SRM 集成 PRD 签字确认未完成（王万成）。\n\n## 四、下一阶段计划\n- 推动方案设计收尾、进入合同系统定制开发。\n'

md_blueprint = '# ' + name + '项目蓝图汇报\n\n汇报日期：2026-09-30　对象：评审方\n\n> 蓝图汇报面向评审，一页一个核心观点。\n\n## 一、项目背景\n### 1.1 项目背景\n建设合同/电子签/SRM 一体化系统，覆盖法务、营销、采购、财务。\n### 1.2 建设目标\n打通合同起草、审签、用印到采购、NC 财务一体化。\n\n## 二、现状分析\n现有合同、SRM、NC 独立，流程未打通，效率与风控受限。\n\n## 三、总体蓝图\n### 3.1 总体业务蓝图\n合同 → 采购寻源 → 电子签归档 → NC 财务。\n### 3.2 系统架构\n合同系统 + SRM 集成 + 电子签 + NC 对接。\n\n## 四、业务方案\n核心流程：合同审批、采购寻源、电子签归档。\n\n## 五、系统方案\n架构：合同系统、SRM、电子签、NC 四方集成。\n\n## 六、实施规划\n阶段：启动（完成）→ 需求调研（完成）→ 方案设计（78%）→ 开发上线（2%）→ 验收。\n\n## 七、风险与保障\n- 金舟接口、泛微排期需锁定。\n\n## 八、后续工作\n- 推动方案设计收尾、定制开发启动。\n'

md_summary = '# ' + name + '项目总结\n\n总结日期：2026-09-30\n\n> 面向管理层：项目干成了没有、达成与否、经验与遗留。\n\n## 一、项目基本信息\n| 项 | 内容 |\n|---|---|\n| 项目编号 | ' + p['project_code'] + ' |\n| 项目名称 | ' + name + ' |\n| 客户单位 | 暂未登记 |\n| 项目周期 | ' + (p['start_date'] or '-') + ' ~ ' + (p['end_date'] or '-') + ' |\n| 负责人 | 暂未登记 |\n\n## 二、项目目标\n实施智能印章、合同与 SRM 系统集成。\n\n## 三、项目交付成果\n| 交付物 | 完成情况 |\n|---|---|\n| 需求调研 | 完成 |\n| 方案设计 | 78% |\n\n## 四、关键里程碑\n启动与准备（完成）、需求调研（完成）、方案设计（进行中）。\n\n## 五、项目问题与解决\n- 3.2.11 SRM 推送 NC 价格审批单与蓝图不符（王万成）。\n\n## 六、后续建议\n- 补齐项目负责人、客户、起止日期字段；锁定外部接口排期。\n'

md_requirements = '# ' + name + '需求规格说明书\n\n版本：V1.0　日期：2026-09-30　编制：项目组\n\n## 一、文档说明\n- 文档用途：明确本项目需求范围与验收标准。\n- 读者对象：项目组、客户、开发。\n\n## 二、项目背景\n建设合同/电子签/SRM 一体化系统，打通采购与财务。\n\n## 三、业务目标\n- 上线合同系统、SRM 集成、电子签接口。\n\n## 四、需求范围\n- 范围内：合同、电子签、SRM 集成；范围外：蓝图之外的扩展。\n\n## 五、功能需求\n| 功能编号 | 功能名称 | 业务背景 | 功能说明 | 状态 |\n|---|---|---|---|---|\n' + '\n'.join(['| REQ-' + str(i+1).zfill(3) + ' | ' + r['summary'][:28] + ' | 合同/采购 | ' + r['summary'][:30] + ' | ' + r['status'] + ' |' for i, r in enumerate(reqs)]) + '\n\n## 六、验收标准\n- 按登记需求逐项验收；未确认项列待决。\n'

md_manual = '# ' + name + '系统使用手册\n\n版本：V1.0　适用对象：业务用户\n\n## 一、系统简介\n合同/电子签/SRM 一体化系统。\n\n## 二、登录系统\n| 步骤 | 操作 | 说明 |\n|---|---|---|\n| 1 | 输入账号密码登录 | 进入首页 |\n\n## 三、功能模块\n| 模块 | 功能 | 说明 |\n|---|---|---|\n| 合同管理 | 起草/审签/用印 | 合同全流程 |\n| SRM 采购 | 寻源/比价 | 对接供应商 |\n| 电子签 | 签署归档 | 单方签署比对 |\n\n## 四、业务操作流程\n| 功能 | 操作 | 结果 |\n|---|---|---|\n| 合同起草 | 填要素发起 | 生成审签单 |\n| 电子签 | 签署 | 归档 |\n\n## 五、常见问题\n- 外部接口未通时提示联系管理员。\n'

os.makedirs(OUT, exist_ok=True)
for kind, md in [('project', md_project), ('weekly', md_weekly), ('monthly', md_monthly), ('phase', md_phase), ('blueprint', md_blueprint), ('summary', md_summary), ('requirements', md_requirements), ('manual', md_manual)]:
    path = gen(name + '-' + kind, md)
    print(kind + ': ' + str(path))
    if path and path.startswith('C:'):
        shutil.copy(path, os.path.join(OUT, name + '-' + kind + '.docx'))
print('DONE core batch')
