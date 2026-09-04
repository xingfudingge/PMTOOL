/**
 * PMTool V2.0 · 项目交付文档模板服务
 * Phase A 产品结构纠偏（2026-08-24 · 维护者拍板）
 *
 * 设计依据（维护者 P3 7 类文档）：
 *   1. 需求确认单
 *   2. 需求规格说明书
 *   3. 项目计划
 *   4. 启动会 PPT
 *   5. 培训资料
 *   6. 验收单
 *   7. 转客服运维单
 *
 * 整改核心：让模板中心真正能用
 *   - 7 套完整 Markdown 模板（含占位符 {{field}}）
 *   - 每个模板有表单字段（用于填写）
 *   - 点击模板 → 填写表单 → 生成文档 → 预览 + 复制
 *
 * 严格不新增表 / 不新增 Rust command · 复用 16 张表 + 已有 API
 */

import type { LucideIcon } from 'lucide-react'
import {
  ClipboardCheck,
  ListTodo,
  GraduationCap,
  ClipboardSignature,
  HandHelping,
  FileText,
  Presentation,
} from 'lucide-react'

// ============================================================
// 类型定义
// ============================================================

export type DocumentCategory =
  | 'requirement' // 需求确认单
  | 'specification' // 需求规格说明书
  | 'plan' // 项目计划
  | 'kickoff' // 启动会 PPT
  | 'training' // 培训资料
  | 'acceptance' // 验收单
  | 'handover' // 转客服运维单

export interface TemplateField {
  key: string
  label: string
  placeholder?: string
  multiline?: boolean
  defaultValue?: string
}

export interface ProjectDocumentTemplate {
  id: string
  title: string
  description: string
  Icon: LucideIcon
  category: DocumentCategory
  fields: TemplateField[]
  /** Markdown 模板（含 {{field}} 占位符 · 渲染时替换）*/
  template: string
}

// ============================================================
// 7 套真实模板（按维护者 P3 拍板）
// ============================================================

const REQUIREMENT_TEMPLATE = `# {{project_name}} · 需求确认单

## 一、项目信息
- **客户名称**：{{customer_name}}
- **填写日期**：{{date}}
- **负责人**：{{owner}}

## 二、业务需求
{{requirement}}

## 三、验收标准
{{acceptance}}

## 四、边界与限制
{{boundary}}

## 五、假设与依赖
{{assumption}}

---

> 本文档由 PMTool 自动生成 · 需客户签字确认后方为正式基线
`

const SPECIFICATION_TEMPLATE = `# {{project_name}} · 需求规格说明书

## 一、文档信息
- **项目名称**：{{project_name}}
- **客户名称**：{{customer_name}}
- **版本**：{{version}}
- **编写日期**：{{date}}
- **编写人**：{{owner}}
- **审阅人**：{{reviewer}}

## 二、项目背景
{{background}}

## 三、业务目标
{{objectives}}

## 四、功能需求
{{functional_requirements}}

## 五、非功能需求
{{non_functional}}

## 六、接口与数据
- **外部接口**：{{external_interfaces}}
- **数据规模**：{{data_scale}}
- **数据迁移**：{{data_migration}}

## 七、约束与假设
{{constraints}}

## 八、验收标准
{{acceptance}}

## 九、风险与依赖
{{risks}}

---

> 本文档由 PMTool 自动生成 · 需求规格说明书 · 客户/技术评审基线
`

const PLAN_TEMPLATE = `# {{project_name}} · 项目计划

## 一、项目概况
- **客户**：{{customer_name}}
- **起止时间**：{{start_date}} 至 {{end_date}}
- **团队**：{{team}}

## 二、实施阶段
{{phases}}

## 三、关键里程碑
{{milestones}}

## 四、风险与应对
{{risks}}

---

> 本文档由 PMTool 自动生成 · 项目执行基线
`

const TRAINING_TEMPLATE = `# {{project_name}} · 培训资料

## 一、培训对象
{{audience}}

## 二、系统功能概述
{{overview}}

## 三、核心操作步骤
{{steps}}

## 四、常见问题
{{questions}}

## 五、应急联系
{{contacts}}

---

> 本文档由 PMTool 自动生成 · 用于客户内部培训使用
`

const ACCEPTANCE_TEMPLATE = `# {{project_name}} · 验收单

## 一、验收基本信息
- **客户**：{{customer_name}}
- **验收日期**：{{date}}
- **验收人员**：{{owner}}

## 二、验收项清单
{{items}}

## 三、验收结论
{{conclusion}}

## 四、客户签字
| 角色 | 姓名 | 签字 | 日期 |
| --- | --- | --- | --- |
| 客户代表 | {{customer_sign}} | | |
| 项目经理 | {{owner}} | | |

## 五、遗留问题
{{issues}}

---

> 本文档由 PMTool 自动生成 · 验收完成后归档
`

const HANDOVER_TEMPLATE = `# {{project_name}} · 转客服运维单

## 一、系统说明
{{overview}}

## 二、常见问题与处理
{{faq}}

## 三、日常维护要点
{{maintenance}}

## 四、应急联系
{{contacts}}

## 五、运维 SLA
{{sla}}

---

> 本文档由 PMTool 自动生成 · 转客服运维阶段使用
`

const KICKOFF_TEMPLATE = `# {{project_name}} · 启动会 PPT

> 配套 Markdown 大纲 · 可直接导入 Keynote / PPT / 飞书 PPT 排版

### Slide 1 · 项目封面
- 项目名称：{{project_name}}
- 客户名称：{{customer_name}}
- 启动日期：{{kickoff_date}}
- 项目负责人：{{owner}}

### Slide 2 · 项目背景
{{background}}

### Slide 3 · 项目目标
{{objectives}}

### Slide 4 · 范围与边界
- **包含范围**：{{scope_in}}
- **不包含范围**：{{scope_out}}

### Slide 5 · 团队与角色
{{team}}

### Slide 6 · 关键里程碑
{{milestones}}

### Slide 7 · 风险初判
{{risks}}

### Slide 8 · 沟通机制
- 周会：每周一次
- 邮件：日常沟通
- 即时通讯：紧急事项
- 关键决策：邮件 + 即时通讯双确认

### Slide 9 · Q & A

### Slide 10 · 项目启动 · 干系人合影
- 我方：{{owner}} 等
- 客户方：{{customer_name}} 干系人

---

> 本文档由 PMTool 自动生成 · 启动会 PPT 大纲 · 项目启动会议前完成
`

// ============================================================
// 模板清单
// ============================================================

export const DOCUMENT_TEMPLATES: ProjectDocumentTemplate[] = [
  {
    id: 'requirement',
    title: '需求确认单',
    description: '业务需求 · 验收标准 · 边界 · 假设 · 客户基线',
    Icon: ClipboardCheck,
    category: 'requirement',
    fields: [
      { key: 'project_name', label: '项目名称', placeholder: '例如：XX 智能合同系统' },
      { key: 'customer_name', label: '客户名称', placeholder: '例如：测试科技' },
      { key: 'date', label: '填写日期', placeholder: 'YYYY-MM-DD' },
      { key: 'owner', label: '负责人', placeholder: '实施经理姓名' },
      {
        key: 'requirement',
        label: '业务需求',
        placeholder: '分点列出业务诉求与目标',
        multiline: true,
        defaultValue: '1. \n2. \n3. ',
      },
      {
        key: 'acceptance',
        label: '验收标准',
        placeholder: '可量化验收标准',
        multiline: true,
        defaultValue: '- \n- \n- ',
      },
      {
        key: 'boundary',
        label: '边界与限制',
        placeholder: '本期不做的内容 / 已知限制',
        multiline: true,
      },
      {
        key: 'assumption',
        label: '假设与依赖',
        placeholder: '前置条件 / 第三方依赖',
        multiline: true,
      },
    ],
    template: REQUIREMENT_TEMPLATE,
  },
  {
    id: 'specification',
    title: '需求规格说明书',
    description: '业务目标 · 功能/非功能需求 · 接口数据 · 约束 · 验收标准',
    Icon: FileText,
    category: 'specification',
    fields: [
      { key: 'project_name', label: '项目名称', placeholder: '例如：XX 智能合同系统' },
      { key: 'customer_name', label: '客户名称', placeholder: '例如：测试科技' },
      { key: 'version', label: '版本号', placeholder: 'V1.0', defaultValue: 'V1.0' },
      { key: 'date', label: '编写日期', placeholder: 'YYYY-MM-DD' },
      { key: 'owner', label: '编写人', placeholder: '实施经理姓名' },
      { key: 'reviewer', label: '审阅人', placeholder: '技术负责人 / 客户代表' },
      {
        key: 'background',
        label: '项目背景',
        placeholder: '为什么要做这个项目 · 业务痛点',
        multiline: true,
      },
      {
        key: 'objectives',
        label: '业务目标',
        placeholder: '可量化的业务目标',
        multiline: true,
        defaultValue: '- \n- \n',
      },
      {
        key: 'functional_requirements',
        label: '功能需求',
        placeholder: '模块 + 功能点 + 优先级',
        multiline: true,
        defaultValue: '## 模块 1\n- 功能：\n- 优先级：\n\n## 模块 2\n- 功能：\n',
      },
      {
        key: 'non_functional',
        label: '非功能需求',
        placeholder: '性能 / 安全 / 可用性 / 扩展性',
        multiline: true,
        defaultValue: '- 性能：\n- 安全：\n- 可用性：\n',
      },
      {
        key: 'external_interfaces',
        label: '外部接口',
        placeholder: '对接的外部系统 / 接口方式 / 频率',
        multiline: true,
        defaultValue: '- 系统名：\n  - 接口：\n  - 频率：\n',
      },
      { key: 'data_scale', label: '数据规模', placeholder: '例如：日均 10 万条 · 主表 200 万' },
      {
        key: 'data_migration',
        label: '数据迁移',
        placeholder: '迁移来源 · 工具 · 时间窗',
        multiline: true,
        defaultValue: '来源系统：\n迁移工具：\n时间窗：\n',
      },
      {
        key: 'constraints',
        label: '约束与假设',
        placeholder: '技术约束 · 业务约束 · 假设条件',
        multiline: true,
      },
      {
        key: 'acceptance',
        label: '验收标准',
        placeholder: '可量化验收标准',
        multiline: true,
        defaultValue: '- \n- \n',
      },
      {
        key: 'risks',
        label: '风险与依赖',
        placeholder: '已知风险 + 应对 + 第三方依赖',
        multiline: true,
        defaultValue: '- 风险：\n  - 应对：\n- 依赖：\n',
      },
    ],
    template: SPECIFICATION_TEMPLATE,
  },
  {
    id: 'plan',
    title: '项目计划',
    description: '阶段划分 · 团队 · 里程碑 · 风险应对',
    Icon: ListTodo,
    category: 'plan',
    fields: [
      { key: 'project_name', label: '项目名称' },
      { key: 'customer_name', label: '客户名称' },
      { key: 'start_date', label: '开始日期', placeholder: 'YYYY-MM-DD' },
      { key: 'end_date', label: '结束日期', placeholder: 'YYYY-MM-DD' },
      { key: 'team', label: '团队', placeholder: '角色 · 姓名（如：实施-刘海东）' },
      {
        key: 'phases',
        label: '实施阶段',
        placeholder: '阶段名称 · 起止时间 · 交付物',
        multiline: true,
        defaultValue: '## 阶段 1：xxx（YYYY-MM-DD 至 YYYY-MM-DD）\n- 交付物：\n- 负责人：\n\n## 阶段 2：xxx\n- 交付物：\n',
      },
      {
        key: 'milestones',
        label: '关键里程碑',
        placeholder: '重要节点 + 日期',
        multiline: true,
        defaultValue: '- [ ] 启动会（YYYY-MM-DD）\n- [ ] 需求确认（YYYY-MM-DD）\n- [ ] 上线试运行（YYYY-MM-DD）\n- [ ] 验收（YYYY-MM-DD）\n',
      },
      {
        key: 'risks',
        label: '风险与应对',
        placeholder: '已知风险 + 应对方案',
        multiline: true,
        defaultValue: '- 风险：\n  - 应对：\n',
      },
    ],
    template: PLAN_TEMPLATE,
  },
  {
    id: 'training',
    title: '培训资料',
    description: '培训对象 · 系统功能 · 常见问题 · 应急联系',
    Icon: GraduationCap,
    category: 'training',
    fields: [
      { key: 'project_name', label: '项目名称' },
      {
        key: 'audience',
        label: '培训对象',
        placeholder: '岗位 + 人数',
        defaultValue: '系统使用人员 · N 人',
      },
      {
        key: 'overview',
        label: '系统功能概述',
        placeholder: '核心模块 + 价值',
        multiline: true,
      },
      {
        key: 'steps',
        label: '核心操作步骤',
        placeholder: '分步骤描述（截图可后续插入）',
        multiline: true,
        defaultValue: '1. 登录系统...\n2. 进入功能...\n3. \n',
      },
      {
        key: 'questions',
        label: '常见问题',
        placeholder: 'Q&A 形式',
        multiline: true,
        defaultValue: 'Q：xxx\nA：xxx\n',
      },
      {
        key: 'contacts',
        label: '应急联系',
        placeholder: '紧急情况联系人 + 方式',
        multiline: true,
        defaultValue: '实施经理 · 张三 · 138-xxxx-xxxx',
      },
    ],
    template: TRAINING_TEMPLATE,
  },
  {
    id: 'acceptance',
    title: '验收单',
    description: '验收项 · 验收结论 · 客户签字 · 遗留问题',
    Icon: ClipboardSignature,
    category: 'acceptance',
    fields: [
      { key: 'project_name', label: '项目名称' },
      { key: 'customer_name', label: '客户名称' },
      { key: 'date', label: '验收日期' },
      { key: 'owner', label: '项目经理' },
      {
        key: 'items',
        label: '验收项清单',
        placeholder: '每项：功能点 + 验收方法 + 结论（合格/不合格）',
        multiline: true,
        defaultValue: '| # | 验收项 | 验收方法 | 结论 |\n| --- | --- | --- | --- |\n| 1 | xxx | xxx | 合格 |\n',
      },
      {
        key: 'conclusion',
        label: '验收结论',
        placeholder: '总体结论 + 遗留项',
        multiline: true,
        defaultValue: '总体验收合格，待遗留项关闭后正式结项。',
      },
      { key: 'customer_sign', label: '客户代表姓名', placeholder: '签字人' },
      {
        key: 'issues',
        label: '遗留问题',
        placeholder: '未关闭问题清单',
        multiline: true,
        defaultValue: '- [ ] 问题 1（关闭日期 TBD）\n- [ ] 问题 2\n',
      },
    ],
    template: ACCEPTANCE_TEMPLATE,
  },
  {
    id: 'handover',
    title: '转客服运维单',
    description: '系统说明 · 常见问题 · 维护要点 · 应急联系 · SLA',
    Icon: HandHelping,
    category: 'handover',
    fields: [
      { key: 'project_name', label: '项目名称' },
      {
        key: 'overview',
        label: '系统说明',
        placeholder: '系统架构 + 关键路径',
        multiline: true,
      },
      {
        key: 'faq',
        label: '常见问题与处理',
        placeholder: 'Q&A + 处理步骤',
        multiline: true,
        defaultValue: 'Q：xxx\nA：xxx\n',
      },
      {
        key: 'maintenance',
        label: '日常维护要点',
        placeholder: '定期检查项 + 操作建议',
        multiline: true,
        defaultValue: '- 每日：\n- 每周：\n- 每月：\n',
      },
      {
        key: 'contacts',
        label: '应急联系',
        placeholder: '紧急联系人 · 方式',
        multiline: true,
        defaultValue: '技术支持 · 138-xxxx-xxxx\n',
      },
      {
        key: 'sla',
        label: '运维 SLA',
        placeholder: '响应时间 · 故障等级 · 处理时长',
        multiline: true,
        defaultValue: '- P0 故障：30 分钟响应 / 4 小时恢复\n- P1 故障：2 小时响应 / 8 小时恢复\n- P2 问题：1 个工作日响应\n',
      },
    ],
    template: HANDOVER_TEMPLATE,
  },
  {
    id: 'kickoff',
    title: '启动会 PPT',
    description: '10 页 PPT 大纲 · 封面 / 背景 / 目标 / 范围 / 团队 / 里程碑 / 风险 / 沟通',
    Icon: Presentation,
    category: 'kickoff',
    fields: [
      { key: 'project_name', label: '项目名称' },
      { key: 'customer_name', label: '客户名称' },
      { key: 'kickoff_date', label: '启动日期', placeholder: 'YYYY-MM-DD' },
      { key: 'owner', label: '负责人' },
      {
        key: 'background',
        label: '项目背景',
        placeholder: '为什么启动 · 业务痛点',
        multiline: true,
        defaultValue: '- 业务痛点：\n- 触发时机：\n',
      },
      {
        key: 'stakeholders',
        label: '核心干系人',
        placeholder: '客户方/我方 · 角色 · 姓名',
        multiline: true,
        defaultValue: '客户方：\n- 业务负责人：\n- 技术负责人：\n我方：\n- 项目经理：\n- 技术负责人：\n',
      },
      {
        key: 'objectives',
        label: '项目目标',
        placeholder: '业务目标 + 技术目标',
        multiline: true,
        defaultValue: '业务目标：\n- \n技术目标：\n- ',
      },
      {
        key: 'scope_in',
        label: '包含范围',
        placeholder: '本次项目包含的模块/功能',
        multiline: true,
      },
      {
        key: 'scope_out',
        label: '不包含范围',
        placeholder: '本次项目不做的内容 · 边界',
        multiline: true,
      },
      {
        key: 'team',
        label: '团队与角色',
        placeholder: '角色 · 姓名 · 职责',
        multiline: true,
        defaultValue: '- 项目经理：\n- 技术负责人：\n- 开发：\n- 测试：\n',
      },
      {
        key: 'milestones',
        label: '关键里程碑',
        placeholder: '节点 + 日期',
        multiline: true,
        defaultValue: '- [ ] 启动（YYYY-MM-DD）\n- [ ] 需求确认（YYYY-MM-DD）\n- [ ] 上线试运行（YYYY-MM-DD）\n- [ ] 验收（YYYY-MM-DD）\n',
      },
      {
        key: 'risks',
        label: '风险初判',
        placeholder: '已知风险 + 应对',
        multiline: true,
        defaultValue: '- 风险：\n  - 应对：\n',
      },
    ],
    template: KICKOFF_TEMPLATE,
  },
]

// ============================================================
// 渲染函数
// ============================================================

/**
 * 用字段值替换模板占位符
 *   {{key}} → values[key] || ''
 *   未填写的占位符保留原样（用红色标记 · 由 UI 层处理）
 */
export function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = values[key]?.trim()
    return value ? value : match
  })
}

/**
 * 计算模板占位符的统计
 */
export interface TemplateStats {
  total: number
  filled: number
  empty: number
}

export function getTemplateStats(
  template: ProjectDocumentTemplate,
  values: Record<string, string>,
): TemplateStats {
  const matches = template.template.match(/\{\{(\w+)\}\}/g) ?? []
  const uniqueKeys = new Set(matches.map((m) => m.replace(/[{}]/g, '')))
  let filled = 0
  for (const key of uniqueKeys) {
    if (values[key]?.trim()) filled++
  }
  return {
    total: uniqueKeys.size,
    filled,
    empty: uniqueKeys.size - filled,
  }
}