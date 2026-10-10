import json, subprocess, io, sys, os, shutil, re
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
EXE = 'D:/AISpace/PMTOOL/app/src-tauri/target/release/pmtool.exe'
OUT = 'D:/AISpace/PMTOOL/summary'
d = json.load(io.open('D:/AISpace/PMTOOL/proj_data.json', encoding='utf-8'))
p = d['project']; tasks = d['tasks']; issues = d['issues']; reqs = d['requirements']
total = len(tasks)
comp = sum(1 for t in tasks if t['status'] == 'COMPLETED')
rate = round(comp / total * 100) if total else 0
name = p['project_name']
med = [i for i in issues if i.get('level') == 'MEDIUM']

mask = lambda v: (v if v else '暂未登记')
nm = name

def gen(title, md):
    payload = {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': 'pmtool__document_generate', 'arguments': {'title': title, 'markdown': md, 'format': 'docx'}}}
    inp = ''
    for obj in ({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}}, payload):
        b = json.dumps(obj)
        inp += 'Content-Length: ' + str(len(b)) + chr(13) + chr(10) + chr(13) + chr(10) + b
    proc = subprocess.run([EXE, '--mcp'], input=inp.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15)
    for f in re.split(r'Content-Length: ' + r'\d+' + r'\r?\n\r?\n', proc.stdout.decode('utf-8', 'replace')):
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

mds = {}
mds['focus'] = '# ' + nm + '重点工作专项报告\n\n专项名称：方案设计收尾与开发启动　报告日期：2026-09-30\n\n> 面向决策层：这项重点工作干得怎样、卡在哪、下一步怎么推。\n\n## 一、专项概述\n推动方案设计收尾、启动合同系统定制开发。\n\n## 二、进展与成果\n| 成果 | 完成度 | 说明 |\n|---|---|---|\n| 方案设计 | 78% | 逾期 53 天 |\n| 需求调研 | 100% | 完成 |\n\n## 三、问题与风险\n- 两项 PRD 签字确认未完成（王万成）；外部接口未锁定。\n\n## 四、下一步计划\n| 事项 | 责任人 | 期限 |\n|---|---|---|\n| PRD 签字 | 王万成 | 10-03 |\n| 锁定接口 | 项目组 | 10-05 |\n'

mds['progress'] = '# ' + nm + '工程进度报告\n\n报告日期：2026-09-30\n\n> 面向管理层：工程干到哪了、延期在哪、下一步安排。\n\n## 一、进度总体情况\n| 项 | 情况 |\n|---|---|\n| 当前阶段 | 开发上线 |\n| 总体进度 | ' + str(rate) + '% |\n| 计划完成 | 2026-12-31 |\n| 偏差 | 滞后 |\n\n## 二、本期完成任务\n| 任务 | 负责人 | 完成时间 | 状态 |\n|---|---|---|---|\n| 需求调研 | 刘海东 | 09-26 | 完成 |\n| 部署方案 | 作者 | 09-25 | 完成 |\n\n## 三、延期与偏差\n| 任务 | 计划 | 实际 | 偏差 | 原因 |\n|---|---|---|---|---|\n| 方案设计 | 08-08 | 78% | 53天 | 规划延迟 |\n\n## 四、下一期计划\n- 合同系统定制开发、测试环境初始化。\n'

mds['charter'] = '# ' + nm + '项目章程\n\n版本：V1.0　编制：项目组　日期：2026-09-30\n\n> 项目章程是项目正式启动的授权文件。\n\n## 一、项目背景\n建设合同/电子签/SRM 一体化系统，覆盖法务、营销、采购、财务。\n\n## 二、项目目标与成功标准\n- 交付目标：上线合同系统、SRM 集成、电子签接口。\n- 成功标准：按里程碑交付。\n\n## 三、项目范围\n- 范围内：合同/电子签/SRM 建设与集成；范围外：蓝图之外。\n\n## 四、关键干系人\n| 角色 | 姓名 | 职责 |\n|---|---|---|\n| 项目经理 | ' + mask(p['owner']) + ' | 总协调 |\n| 客户方 | ' + mask(p['customer_name']) + ' | 业务 |\n\n## 五、总体计划\n- 计划起止：' + mask(p['start_date']) + ' ~ ' + mask(p['end_date']) + '\n\n## 六、主要风险\n- 金舟接口未定稿；泛微排期 44 天未进场。\n'

mds['kickoff'] = '# ' + nm + '立项报告\n\n立项日期：2026-09-30\n\n> 面向审批层：项目值不值得做、怎么算成功。\n\n## 一、立项结论\n批准立项，建设合同/电子签/SRM 一体化系统。\n\n## 二、项目基本信息\n| 项 | 内容 |\n|---|---|\n| 名称 | ' + nm + ' |\n| 编号 | ' + p['project_code'] + ' |\n| 负责人 | ' + mask(p['owner']) + ' |\n| 客户 | ' + mask(p['customer_name']) + ' |\n| 优先级 | ' + (p['priority'] or '-') + ' |\n\n## 三、立项背景\n打通合同、采购、财务一体化流程，提升效率与风控。\n\n## 四、目标与范围\n- 目标：合同/SRM/电子签上线；范围：' + str(total) + ' 项任务。\n\n## 五、风险与应对\n- 金舟接口、泛微排期需锁定。\n\n## 六、决策结论\n- 批准立项。\n'

mds['scope'] = '# ' + nm + '项目范围说明书\n\n版本：V1.0　日期：2026-09-30\n\n> 明确项目做什么、不做什么、验收标准。\n\n## 一、背景与目标\n建设合同/电子签/SRM 一体化系统。\n\n## 二、项目范围\n- 交付物：合同系统、SRM 集成、电子签接口。\n- 不包含：蓝图之外的扩展。\n\n## 三、验收标准\n| 验收项 | 标准 |\n|---|---|\n| 需求 | 逐项验收 |\n| 方案 | 评审通过 |\n\n## 四、范围变更控制\n- 变更走流程，经审批执行。\n'

mds['plan'] = '# ' + nm + '项目实施计划\n\n版本：V1.0　编制：项目组　日期：2026-09-30\n\n> 项目执行总纲：怎么做、何时做、谁来做。\n\n## 一、项目概述\n- 目标：合同/电子签/SRM 建设与集成；范围：' + str(total) + ' 项任务。\n\n## 二、实施阶段\n| 阶段 | 主要任务 | 交付物 |\n|---|---|---|\n| 启动 | 组织准备 | 章程 |\n| 需求调研 | 各部门调研 | 需求规格 |\n| 方案设计 | 原型设计 | 方案 |\n| 开发上线 | 定制开发集成 | 系统 |\n| 验收 | 测试验收 | 验收报告 |\n\n## 三、进度计划\n| 阶段 | 计划结束 | 现状 |\n|---|---|---|\n| 启动与准备 | 07-30 | 完成 |\n| 需求调研 | 07-30 | 完成 |\n| 方案设计 | 08-08 | 78% |\n| 开发上线 | 10-30 | 2% |\n\n## 四、风险管理\n- 金舟接口、泛微排期需锁定。\n'

mds['wbs'] = '# ' + nm + '工作分解结构（WBS）\n\n版本：V1.0　日期：2026-09-30\n\n> 将项目按可交付成果逐层分解。\n\n## 一、分解说明\n按阶段分解到任务。\n\n## 二、WBS 层级\n- L1：启动、需求调研、方案设计、开发上线、验收。\n\n## 三、任务与责任人\n| 层级 | 任务 | 责任人 | 状态 |\n|---|---|---|---|\n' + '\n'.join(['| L2 | ' + t['task_name'] + ' | ' + mask(t['owner']) + ' | ' + t['status'] + ' |' for t in tasks[:8]]) + '\n\n## 四、交付物清单\n- 章程、需求规格、方案、系统、验收报告。\n'

mds['schedule'] = '# ' + nm + '项目进度计划\n\n版本：V1.0　基准日期：2026-09-30\n\n> 项目执行时间基准。\n\n## 一、计划说明\n基准至 2026-12-31 验收；关键里程碑为方案设计、开发上线。\n\n## 二、阶段进度表\n| 阶段 | 任务 | 负责人 | 计划结束 | 状态 |\n|---|---|---|---|---|\n' + '\n'.join(['| ' + t['status'] + ' | ' + t['task_name'] + ' | ' + mask(t['owner']) + ' | ' + mask(t['end_date']) + ' | ' + str(t['progress']) + '% |' for t in tasks[:8]]) + '\n\n## 三、进度风险\n- 金舟接口、泛微排期需锁定。\n'

mds['riskplan'] = '# ' + nm + '风险管理计划\n\n版本：V1.0　日期：2026-09-30\n\n> 识别、评估、应对项目风险。\n\n## 一、风险登记册\n| 编号 | 风险 | 等级 | 状态 |\n|---|---|---|---|\n' + '\n'.join(['| R-' + str(i+1) + ' | ' + x['title'][:30] + ' | ' + (x['level'] or '-') + ' | ' + x['status'] + ' |' for i, x in enumerate(med)]) + '\n\n## 二、主要风险与应对\n- 金舟接口未定稿、泛微排期未进场 — 锁定接口与进场时间。\n'

mds['commplan'] = '# ' + nm + '沟通管理计划\n\n版本：V1.0　日期：2026-09-30\n\n> 明确和谁沟通、沟通什么、多久一次。\n\n## 一、沟通矩阵\n| 内容 | 受众 | 频率 | 方式 |\n|---|---|---|---|\n| 周报 | 管理层 | 周 | 文档 |\n| 阶段汇报 | 客户方 | 阶段 | 会议 |\n| 风险同步 | 干系人 | 即时 | 消息 |\n\n## 二、会议机制\n- 周例会、里程碑评审会。\n'

mds['minutes'] = '# ' + nm + '会议纪要\n\n主题：方案设计收尾与 PRD 签署　时间：2026-09-26\n\n## 一、参会人员\n项目组、客户方、外部供应商代表。\n\n## 二、讨论与结论\n| 议题 | 结论 |\n|---|---|\n| 方案设计 78% | 两周内收尾 |\n| PRD 签署 | 待王万成确认 |\n\n## 三、行动项\n| 事项 | 负责人 | 期限 |\n|---|---|---|\n| PRD 签字 | 王万成 | 10-03 |\n| 接口文档 | 金舟 | 10-05 |\n'

mds['change'] = '# ' + nm + '变更申请单\n\n变更编号：CHG-001　日期：2026-09-30　申请人：项目组\n\n## 一、变更内容\n增加销售合同电子签接口，满足单方签署后比对归档。\n\n## 二、影响分析\n| 维度 | 影响 |\n|---|---|\n| 范围 | 扩展电子签接口 |\n| 进度 | 影响较小 |\n\n## 三、实施方案\n开发电子签接口、比对归档。\n\n## 四、审批\n- 审批人：管理层；结论：待批。\n'

mds['milestone'] = '# ' + nm + '里程碑报告\n\n报告日期：2026-09-30\n\n## 一、里程碑概览\n当前：方案设计（78%），总体 ' + str(rate) + '%。\n\n## 二、里程碑达成\n| 里程碑 | 计划 | 实际 | 状态 |\n|---|---|---|---|\n| 启动与准备 | 07-30 | 完成 | 达成 |\n| 需求调研 | 07-30 | 完成 | 达成 |\n| 方案设计 | 08-08 | 78% | 滞后 |\n| 开发上线 | 10-30 | 2% | 滞后 |\n\n## 三、关键问题\n- 方案设计逾期 53 天；外部接口未锁定。\n'

mds['acceptance'] = '# ' + nm + '验收报告\n\n验收日期：2026-09-30\n\n> 记录验收范围、标准、结果、遗留问题与结论。\n\n## 一、验收范围\n本阶段：需求调研、方案设计成果。\n\n## 二、验收标准\n按里程碑交付物逐项核验。\n\n## 三、验收过程与结果\n| 验收项 | 标准 | 结果 | 结论 |\n|---|---|---|---|\n| 需求调研 | 完成 | 完成 | 通过 |\n| 方案设计 | 78% | 78% | 有条件通过 |\n\n## 四、遗留问题\n方案设计未收尾；外部接口未锁定。\n\n## 五、验收结论\n有条件通过，待方案设计收尾与接口锁定后终验。\n'

mds['lessons'] = '# ' + nm + '项目复盘\n\n复盘日期：2026-09-30\n\n> 回顾全程，提炼可复制的经验与教训。\n\n## 一、项目回顾\n已完成需求调研、方案设计 78%。\n\n## 二、目标达成\n- 达成约 ' + str(rate) + '%，开发期明显滞后。\n\n## 三、做得好\n- 需求调研覆盖完整；方案设计清晰。\n\n## 四、待改进\n- 前期规划类任务逾期严重；外部接口未提前锁定。\n\n## 五、经验教训\n- 外部依赖（接口/排期）须早期明确并纳入关键路径。\n'

os.makedirs(OUT, exist_ok=True)
for kind, md in mds.items():
    path = gen(nm + '-' + kind, md)
    print(kind + ': ' + str(path))
    if path and path.startswith('C:'):
        shutil.copy(path, os.path.join(OUT, nm + '-' + kind + '.docx'))
print('DONE mgmt batch')
