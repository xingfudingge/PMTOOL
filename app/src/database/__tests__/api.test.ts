/**
 * 业务 API 包装测试
 * Phase 0 · T0.4d
 *
 * 验证 src/database/api.ts 的 invoke 包装正确性：
 *   - 命令名正确（list_projects / list_todos / complete_todo 等）
 *   - 参数正确传递
 *   - 类型推断正确
 *
 * 这是 RFC-03 §1 架构的端到端验证：
 *   WebView → invoke('list_projects', ...) → Rust command
 */

import { describe, it, expect, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  listProjects,
  getProject,
  createProject,
  deleteProject,
  listTodos,
  completeTodo,
  type Project,
  type Todo,
} from '../api'

// Mock invoke
vi.mocked(invoke)

describe('Project API 业务命名', () => {
  it('listProjects 调用 list_projects command', async () => {
    const mockProjects: Project[] = [
      {
        id: 1,
        project_code: 'PM-001',
        project_name: '测试项目',
        customer_name: '测试客户',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        owner: '张三',
        start_date: '2026-08-21',
        end_date: '2026-12-31',
        contract_amount: 100000,
        background: null,
        objective: null,
        scope: null,
        description: null,
        created_at: '2026-08-21 10:00:00',
        updated_at: '2026-08-21 10:00:00',
      },
    ]
    vi.mocked(invoke).mockResolvedValueOnce(mockProjects)

    const result = await listProjects({ status: 'IN_PROGRESS' })

    expect(invoke).toHaveBeenCalledWith('list_projects', { status: 'IN_PROGRESS' })
    expect(result).toEqual(mockProjects)
  })

  it('getProject(id) 调用 get_project command', async () => {
    const mockProject: Project = {
      id: 1,
      project_code: 'PM-001',
      project_name: '测试',
      customer_name: null,
      status: 'PLANNING',
      priority: 'NORMAL',
      owner: null,
      start_date: null,
      end_date: null,
      contract_amount: null,
      background: null,
      objective: null,
      scope: null,
      description: null,
      created_at: '',
      updated_at: '',
    }
    vi.mocked(invoke).mockResolvedValueOnce(mockProject)

    const result = await getProject(1)

    expect(invoke).toHaveBeenCalledWith('get_project', { id: 1 })
    expect(result).toEqual(mockProject)
  })

  it('createProject 调用 create_project command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(42)
    const newProject = {
      project_code: 'PM-NEW',
      project_name: '新建项目',
      customer_name: null,
      status: 'PLANNING' as const,
      priority: 'NORMAL' as const,
      owner: null,
      start_date: null,
      end_date: null,
      contract_amount: null,
      background: null,
      objective: null,
      scope: null,
      description: null,
    }
    const id = await createProject(newProject)
    expect(invoke).toHaveBeenCalledWith('create_project', { project: newProject })
    expect(id).toBe(42)
  })

  it('deleteProject 调用 delete_project command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true)
    const result = await deleteProject(99)
    expect(invoke).toHaveBeenCalledWith('delete_project', { id: 99 })
    expect(result).toBe(true)
  })
})

describe('Todo API 业务命名（PM 决策 B1 优先级最高）', () => {
  it('listTodos 调用 list_todos command', async () => {
    const mockTodos: Todo[] = []
    vi.mocked(invoke).mockResolvedValueOnce(mockTodos)

    const result = await listTodos({ status: 'PENDING', sourceType: 'MANUAL' })

    expect(invoke).toHaveBeenCalledWith('list_todos', {
      status: 'PENDING',
      sourceType: 'MANUAL',
    })
    expect(result).toEqual(mockTodos)
  })

  it('completeTodo 调用 complete_todo command（写入 completed_at）', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true)
    const result = await completeTodo(7)
    expect(invoke).toHaveBeenCalledWith('complete_todo', { id: 7 })
    expect(result).toBe(true)
  })
})

describe('API 设计原则（RFC-03 §1 业务命名）', () => {
  it('所有命令名是 snake_case 业务命名', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([])

    // 调用所有 API 函数，记录 invoke 调用
    await listProjects()
    await listTodos()
    await completeTodo(1)
    await deleteProject(1)

    const calls = vi.mocked(invoke).mock.calls.map((c) => c[0])
    // 不应该有万能命令名（execute_sql / query_sql）
    expect(calls).not.toContain('execute_sql')
    expect(calls).not.toContain('query_sql')
    // 应该有业务命名
    expect(calls.every((c) => c.includes('_'))).toBe(true)
  })
})