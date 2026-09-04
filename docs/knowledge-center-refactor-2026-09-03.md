# PMTOOL 知识中心重构 - 开发进度报告

**日期**: 2026-09-03  
**设计文档**: PMTOOL 知识中心重构设计 2026-09-03

## 一、核心设计原则

### 1.1 编辑器统一
- 统一使用 **BlockNote** 作为知识正文编辑器
- 支持：富文本编辑、标题、段落、有序/无序列表、待办、引用、代码块、表格、图片、文件、Block 拖拽、快捷命令、常规快捷键、自动保存

### 1.2 删除规则（全局系统级规则）
- **所有删除操作必须二次确认**
- 二次确认弹窗明确告知用户：
  > "删除后数据将被永久删除，无法恢复。删除后目录、所有子目录、以及目录内的所有笔记都将被永久删除，无法恢复。"
- **真删除**: 数据库记录 + 知识内容 (BlockNote) + 附件 + 文件关联全部删除
- 不保留回收站、软删除、删除记录（审计日志除外）

## 二、已完成开发

### 2.1 数据库层

| 文件 | 状态 | 说明 |
|------|------|------|
| `database/migrations/0009_knowledge_spaces_and_bindings.sql` | ✅ 完成 | 新表结构定义 |
| `app/src-tauri/src/repositories/knowledge_spaces.rs` | ✅ 完成 | 知识空间数据访问层 |
| `app/src-tauri/src/repositories/project_knowledge_bindings.rs` | ✅ 完成 | 项目知识绑定数据访问层 |
| `app/src-tauri/src/repositories/knowledge_notes.rs` | ✅ 完成 | 知识笔记数据访问层 (重构) |
| `app/src-tauri/src/repositories/knowledge_folders.rs` | ✅ 完成 | 知识目录数据访问层 (重构) |

### 2.2 后端 Tauri Commands

| 文件 | 状态 | 说明 |
|------|------|------|
| `app/src-tauri/src/commands/knowledge_spaces.rs` | ✅ 完成 | 知识空间 Commands |
| `app/src-tauri/src/commands/project_knowledge_bindings.rs` | ✅ 完成 | 项目知识绑定 Commands |
| `app/src-tauri/src/commands/knowledge.rs` | ✅ 完成 | 知识笔记 Commands (重构) |
| `app/src-tauri/src/commands/knowledge_folders.rs` | ✅ 完成 | 知识目录 Commands (重构) |
| `app/src-tauri/src/commands/mod.rs` | ✅ 完成 | 模块导出 |
| `app/src-tauri/src/repositories/mod.rs` | ✅ 完成 | Repository 模块导出 |
| `app/src-tauri/src/lib.rs` | ✅ 完成 | Tauri 应用注册 |

### 2.3 前端服务层

| 文件 | 状态 | 说明 |
|------|------|------|
| `app/src/services/knowledgeSpaces.ts` | ✅ 完成 | 知识空间服务 |
| `app/src/services/knowledge.ts` | ✅ 完成 | 知识笔记/目录服务 (重构) |

### 2.4 前端组件

| 文件 | 状态 | 说明 |
|------|------|------|
| `app/src/components/KnowledgeSpaceView/DeleteConfirmDialog.tsx` | ✅ 完成 | 删除确认对话框 |
| `app/src/components/KnowledgeSpaceView/PersonalKnowledgeCenter.tsx` | ✅ 完成 | 个人知识中心 (二次确认集成) |

## 三、数据库变更

### 3.1 新增表

```sql
-- 知识空间表
CREATE TABLE knowledge_spaces (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    space_type  TEXT NOT NULL,                -- PERSONAL / PROJECT
    project_id  INTEGER,                      -- 仅当 space_type=PROJECT 时有效
    name        TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(space_type, project_id)
);

-- 项目知识绑定表
CREATE TABLE project_knowledge_bindings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL,
    knowledge_space_id INTEGER NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (knowledge_space_id) REFERENCES knowledge_spaces(id) ON DELETE CASCADE,
    UNIQUE(project_id, knowledge_space_id)
);
```

### 3.2 修改表

#### knowledge_notes
```sql
-- 旧字段：project_id (区分个人/项目)
-- 新字段：space_id (指向 knowledge_spaces.id)
-- 冗余字段：space (PERSONAL/PROJECT) 用于快速查询
ALTER TABLE knowledge_notes 
ADD COLUMN space_id INTEGER NOT NULL,
ADD COLUMN space TEXT NOT NULL DEFAULT 'PERSONAL';

-- 删除旧字段
ALTER TABLE knowledge_notes DROP COLUMN project_id;
```

#### knowledge_folders
```sql
-- 新增 system_type 字段
ALTER TABLE knowledge_folders 
ADD COLUMN system_type TEXT DEFAULT 'USER';
-- 取值：USER / SYSTEM_AI / PROJECT_ROOT
```

## 四、API 变更

### 4.1 知识笔记 API

| 旧 API | 新 API | 说明 |
|--------|--------|------|
| `listKnowledgeNotes(space)` | `listKnowledgeNotesBySpaceType(space)` | 按空间类型查询 |
| - | `listKnowledgeNotes(spaceId)` | 按空间 ID 查询 (新) |
| `searchKnowledgeNotes(space, query)` | `searchKnowledgeNotesBySpaceType(space, query)` | 按空间类型搜索 |
| - | `searchKnowledgeNotesBySpace(spaceId, query)` | 按空间 ID 搜索 (新) |

### 4.2 新增 API

```typescript
// 知识空间
listPersonalKnowledgeSpaces()
listProjectKnowledgeSpaces(projectId)
getKnowledgeSpace(id)
createKnowledgeSpace(input)
deleteKnowledgeSpace(id)

// 项目知识绑定
listProjectBindings(projectId)
listSpaceBindings(spaceId)
createBinding(input)
deleteBinding(projectId, spaceId)
deleteAllProjectBindings(projectId)
```

## 五、待开发任务

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 执行数据库迁移 | P0 | 运行 `0009_knowledge_spaces_and_bindings.sql` |
| PersonalKnowledgeCenter AI 目录渲染 | P0 | 修复 AI 目录在树中的显示 |
| ProjectKnowledgeCenter 二次确认 | P0 | 集成 DeleteConfirmDialog |
| 项目中心绑定功能 | P1 | "添加项目知识中心"入口 + 绑定/解绑逻辑 |
| 前端测试验证 | P1 | 所有 CRUD 操作测试 |

## 六、使用示例

### 6.1 创建知识空间

```typescript
import { createKnowledgeSpace } from '@/services/knowledgeSpaces'

// 创建个人知识空间 (通常只有一个，项目自动生成)
const personalSpace = await createKnowledgeSpace({
  spaceType: 'PERSONAL',
  projectId: null,
  name: '个人知识中心'
})

// 创建项目知识空间
const projectSpace = await createKnowledgeSpace({
  spaceType: 'PROJECT',
  projectId: 123,
  name: '项目名称'
})
```

### 6.2 绑定项目到知识空间

```typescript
import { createBinding } from '@/services/knowledgeSpaces'

// 项目中心添加项目知识中心
const binding = await createBinding({
  projectId: 123,
  knowledgeSpaceId: 456
})
```

### 6.3 解绑项目

```typescript
import { deleteBinding } from '@/services/knowledgeSpaces'

// 项目中心解绑项目
await deleteBinding(projectId, spaceId)
// 注意：只删除绑定关系，知识空间和数据保留
```

### 6.4 二次确认删除

```typescript
import { DeleteConfirmDialog } from './DeleteConfirmDialog'

function MyComponent() {
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    type: 'note' | 'folder',
    id: 0
  })

  const handleDelete = (id: number) => {
    setConfirmDialog({ open: true, type: 'note', id })
  }

  const handleConfirm = async () => {
    await deleteKnowledgeNote(confirmDialog.id)
    setConfirmDialog({ open: false, type: 'note', id: 0 })
  }

  return (
    <>
      <button onClick={() => handleDelete(noteId)}>删除</button>
      <DeleteConfirmDialog
        open={confirmDialog.open}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmDialog({ open: false, type: 'note', id: 0 })}
        title="确认删除笔记"
        description="删除后笔记内容 (包括 BlockNote 编辑内容) 将被永久删除，无法恢复。"
      />
    </>
  )
}
```

## 七、架构变更说明

### 7.1 旧架构

```
项目 (projects)
  └── project_id (FK) → knowledge_notes
  └── project_id (FK) → knowledge_folders
```

问题：
- 个人知识和项目知识混在同一张表
- 通过 `project_id NULL` 区分个人知识
- 项目删除会级联删除知识数据

### 7.2 新架构

```
知识空间 (knowledge_spaces)
  ├── PERSONAL (project_id = NULL) → 个人知识中心
  └── PROJECT (project_id = 123) → 项目 A 知识中心

项目 (projects)
  └── 通过 binding → 项目知识空间 (不直接关联知识数据)

知识笔记 (knowledge_notes)
  └── space_id (FK → knowledge_spaces)

知识目录 (knowledge_folders)
  └── space + project_id (指向 knowledge_spaces)
```

优势：
- 个人知识和项目知识完全分离
- 项目中心只是访问入口，不持有知识数据
- 解绑项目不会删除知识数据
- 删除知识空间需要显式操作

## 八、注意事项

### 8.1 数据迁移
1. 必须先备份现有数据
2. 运行迁移脚本前确保应用停止
3. 迁移后验证数据完整性

### 8.2 向后兼容
- 保留旧 API (`listKnowledgeNotesBySpaceType`) 供旧代码使用
- 新代码优先使用 `space_id` 查询

### 8.3 AI 生成目录
- AI 目录是真实数据库记录，不是虚拟节点
- `system_type = 'SYSTEM_AI'`
- 不允许删除、不允许重命名
- 每个空间自动创建一个

## 九、下一步计划

1. **立即执行**: 运行数据库迁移脚本
2. **同步测试**: 验证后端 API 响应
3. **前端集成**: 完成 ProjectKnowledgeCenter 二次确认
4. **项目中心**: 实现绑定/解绑功能
5. **测试验收**: 完整的端到端测试

---

**备注**: 所有删除操作已集成二次确认对话框，符合设计文档要求。
