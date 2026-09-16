/**
 * PMTool V2.0 · 业务 API 命名层（WebView 端）
 * Phase 0 · T0.4e 架构
 *
 * 设计依据：RFC-03 §1 分层架构
 *   React Page → Feature Service → api.ts (本模块) → invoke('业务命名', ...)
 *     → Rust command → Rust service → Repository → SQLite
 *
 * 职责：
 *   - 暴露业务命名 API（如 listProjects / createTodo）
 *   - 调用 Tauri invoke 桥接到 Rust commands
 *   - 提供与 Rust 端字段同名的类型（snake_case · 与 Rust serde JSON 一致）
 *
 * 严格遵守 PM B1：禁止 WebView 直 SQL / 禁止通用 execute_sql 暴露
 *
 * Phase 0 范围：
 *   - Project CRUD + Todo CRUD（业务命名层）
 *   - 其他表（project_tasks / project_issues / attachments）由 services 层定义自有类型
 */

import { invoke } from '@tauri-apps/api/core'

// ============================================================
// Project 类型（与 src-tauri/src/repositories/projects.rs · Project 同名）
// ============================================================

export type ProjectStatus =
  | 'START'
  | 'PLANNING'
  | 'EXECUTING'
  | 'MONITORING'
  | 'CLOSING'

export type ProjectPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

/**
 * Project 数据模型（snake_case · Rust serde JSON 一致）
 * 字段来源：database/schema.sql · projects 表
 */
export interface Project {
  id: number
  project_code: string
  project_name: string
  customer_name: string | null
  status: ProjectStatus
  priority: ProjectPriority
  owner: string | null
  start_date: string | null
  end_date: string | null
  contract_amount: number | null
  background: string | null
  objective: string | null
  scope: string | null
  description: string | null
  /** 维护者 2026-08-31：项目绑定的本地目录路径（FilesTab 浏览器） */
  local_directory_path?: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Todo 类型（与 src-tauri/src/repositories/todos.rs · Todo 同名）
// ============================================================

export type TodoStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'

export type TodoPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

/**
 * Todo 来源类型（PM A1 决策 · 2026-08-21）
 * 严格 MANUAL / WEEKLY · PLAN/RISK/AI/PROJECT_TASK 已废除
 * 维护者 2026-08-28: 新增 RECURRING(周期性任务)
 */
export type TodoSourceType = 'MANUAL' | 'WEEKLY' | 'RECURRING'

/**
 * Todo 数据模型（snake_case · Rust serde JSON 一致）
 * 字段来源：database/schema.sql · todos 表
 */
export interface Todo {
  id: number
  title: string
  content: string | null
  priority: TodoPriority
  status: TodoStatus
  start_date: string | null
  due_date: string | null
  /** RFC-02 §4: UTC ISO 8601 · 归档到本地日期 */
  completed_at: string | null
  /** PM A1: 仅 MANUAL / WEEKLY */
  source_type: TodoSourceType
  source_id: number | null
  /** 维护者 2026-08-25：关联项目 · 日报按项目分组用 */
  project_id: number | null
  /** 维护者 2026-08-25：@ 提名项目 ID 列表（JSON 字符串 · 例 "[1,2]"） */
  mentions: string | null
  remind_time: string | null
  created_at: string
  updated_at: string
}

/** 维护者 2026-08-25：报告（常规 + AI）
 * 字段对齐 reports 表实际 schema（0001_init.sql）
 *  - type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'PROJECT_DAILY' | 'PROJECT_WEEKLY' | 'PROJECT_MONTHLY' | ...
 *  - project_id: NULL = 个人报告，有值 = 项目报告（scope 由 project_id 推断）
 *  - generate_type: 'MANUAL' | 'AUTO' | 'AI'
 *  - status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
 */
export type ReportType = 'daily' | 'weekly' | 'monthly'
export type ReportGenerateType = 'MANUAL' | 'AUTO' | 'AI'
export type ReportStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export interface Report {
  id: number
  /** schema 列名 type · JSON 字段名 reportType（serde rename） */
  reportType: ReportType
  /** project_id 决定 scope（NULL = personal · value = project） */
  projectId: number | null
  title: string
  /** 完整 Markdown */
  content: string | null
  templateId: number | null
  generateType: ReportGenerateType
  status: ReportStatus
  /** 周期键 · daily='YYYY-MM-DD' · weekly='YYYY-Www' · monthly='YYYY-MM' */
  period: string | null
  createdAt: string
  updatedAt: string
}

// ============================================================
// Project CRUD（透传 Rust command）
// ============================================================

/**
 * 列出项目（按状态过滤）
 * WebView 调用: invoke('list_projects', { status: 'IN_PROGRESS' })
 */
export async function listProjects(filter?: { status?: ProjectStatus | null }): Promise<Project[]> {
  return invoke<Project[]>('list_projects', {
    status: filter?.status ?? null,
  })
}

/** 获取单个项目 */
export async function getProject(id: number): Promise<Project | null> {
  return invoke<Project | null>('get_project', { id })
}

/**
 * 创建项目（snake_case payload · 与 Rust Project 一致）
 * @returns 新建项目 ID
 */
export async function createProject(input: {
  project_code: string
  project_name: string
  customer_name?: string | null
  status?: ProjectStatus
  priority?: ProjectPriority
  owner?: string | null
  start_date?: string | null
  end_date?: string | null
  contract_amount?: number | null
  background?: string | null
  objective?: string | null
  scope?: string | null
  description?: string | null
}): Promise<number> {
  const project = {
    project_code: input.project_code,
    project_name: input.project_name,
    customer_name: input.customer_name ?? null,
    status: input.status ?? 'START',
    priority: input.priority ?? 'NORMAL',
    owner: input.owner ?? null,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    contract_amount: input.contract_amount ?? null,
    background: input.background ?? null,
    objective: input.objective ?? null,
    scope: input.scope ?? null,
    description: input.description ?? null,
  }
  return invoke<number>('create_project', { project })
}

/** 更新项目（传完整 project 结构，由 services 层合并未传字段）*/
export async function updateProject(
  id: number,
  project: {
    project_code: string
    project_name: string
    customer_name: string | null
    status: ProjectStatus
    priority: ProjectPriority
    owner: string | null
    start_date: string | null
    end_date: string | null
    contract_amount: number | null
    background: string | null
    objective: string | null
    scope: string | null
    description: string | null
  },
): Promise<boolean> {
  return invoke<boolean>('update_project', { id, project })
}

/** 删除项目 */
export async function deleteProject(id: number): Promise<boolean> {
  return invoke<boolean>('delete_project', { id })
}

// ============================================================
// Todo CRUD（透传 Rust command）
// ============================================================

/**
 * 列出待办（按 status + sourceType 过滤）
 * WebView 调用: invoke('list_todos', { status: 'PENDING', sourceType: 'MANUAL' })
 */
export async function listTodos(filter?: {
  status?: TodoStatus | null
  sourceType?: TodoSourceType | null
}): Promise<Todo[]> {
  return invoke<Todo[]>('list_todos', {
    status: filter?.status ?? null,
    sourceType: filter?.sourceType ?? null,
  })
}

/**
 * 标记完成（RFC-02 §4: Rust 端写入 completed_at = UTC ISO 8601）
 */
export async function completeTodo(id: number): Promise<boolean> {
  return invoke<boolean>('complete_todo', { id })
}

/**
 * 创建待办（snake_case payload · 与 Rust Todo 一致）
 * @returns 新建待办 ID
 *
 * 设计依据：Phase A P0 首页工作台 · 2026-08-24
 *   - 用于"快速记录"功能（title=记录内容，priority='LOW'，due_date=null）
 *   - 也用于普通待办（priority=NORMAL/HIGH/URGENT，due_date 可设置）
 */
export async function createTodo(input: {
  title: string
  content?: string | null
  priority?: TodoPriority
  status?: TodoStatus
  start_date?: string | null
  due_date?: string | null
  source_type?: TodoSourceType
  source_id?: number | null
  remind_time?: string | null
}): Promise<number> {
  const todo = {
    id: 0,
    title: input.title,
    content: input.content ?? null,
    priority: input.priority ?? 'NORMAL',
    status: input.status ?? 'PENDING',
    start_date: input.start_date ?? null,
    due_date: input.due_date ?? null,
    completed_at: null,
    source_type: input.source_type ?? 'MANUAL',
    source_id: input.source_id ?? null,
    remind_time: input.remind_time ?? null,
    created_at: '',
    updated_at: '',
  }
  return invoke<number>('create_todo', { todo })
}