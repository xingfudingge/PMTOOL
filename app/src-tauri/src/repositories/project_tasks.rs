/**
 * PMTool · Project Tasks 数据访问层
 * Phase 4 · T4.7
 *
 * 职责：纯 SQL 操作 project_tasks 表
 * 业务逻辑（父任务约束、循环检测、加权平均）在 services 层
 *
 * schema.sql 第 192 行定义：
 *   id, project_id, parent_id, task_name, owner,
 *   start_date, end_date, work_days, progress, status,
 *   remark, sort_order, created_at, updated_at
 *
 * 维护者原话字段补充：
 *   - weekly_note 字段（周报备注）→ remark 字段承担
 */

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectTask {
    pub id: i64,
    pub project_id: i64,
    pub parent_id: Option<i64>,
    pub task_name: String,
    pub owner: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub work_days: i64,
    pub natural_days: i64,
    pub progress: f64,
    pub status: String, // PENDING / IN_PROGRESS / COMPLETED / DELAYED
    pub remark: Option<String>, // weekly_note 字段（RFC 注释）
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_task(row: &Row) -> rusqlite::Result<ProjectTask> {
    Ok(ProjectTask {
        id: row.get(0)?,
        project_id: row.get(1)?,
        parent_id: row.get(2)?,
        task_name: row.get(3)?,
        owner: row.get(4)?,
        start_date: row.get(5)?,
        end_date: row.get(6)?,
        work_days: row.get(7)?,
        natural_days: row.get(8)?,
        progress: row.get(9)?,
        status: row.get(10)?,
        remark: row.get(11)?,
        sort_order: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

/// 列出项目的所有任务（含父任务 + 子任务，扁平结构）
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<ProjectTask>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, parent_id, task_name, owner, start_date, end_date, work_days, natural_days, progress, status, remark, sort_order, created_at, updated_at FROM project_tasks WHERE project_id = ?1 ORDER BY sort_order, id",
    )?;
    let rows = stmt.query_map([project_id], row_to_task)?;
    rows.collect()
}

/// 列出项目的叶子任务（无子任务，用于项目进度加权平均）
pub fn list_leaf_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<ProjectTask>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, parent_id, task_name, owner, start_date, end_date, work_days, natural_days, progress, status, remark, sort_order, created_at, updated_at FROM project_tasks WHERE project_id = ?1 AND id NOT IN (SELECT DISTINCT parent_id FROM project_tasks WHERE parent_id IS NOT NULL) ORDER BY sort_order, id",
    )?;
    let rows = stmt.query_map([project_id], row_to_task)?;
    rows.collect()
}

/// 获取单个任务
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<ProjectTask>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, parent_id, task_name, owner, start_date, end_date, work_days, natural_days, progress, status, remark, sort_order, created_at, updated_at FROM project_tasks WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_task)?;
    rows.next().transpose()
}

/// 创建任务
/// 注：DB schema 列顺序 = (project_id, parent_id, task_name, owner, start_date, end_date,
///      work_days, progress, status, remark, sort_order, created_at, updated_at, natural_days)
///      natural_days 是 migration 0005 加在末尾的 · INSERT 列序必须匹配表 schema
pub fn create(conn: &Connection, task: &ProjectTask) -> rusqlite::Result<i64> {
    let r = conn.execute(
        "INSERT INTO project_tasks (project_id, parent_id, task_name, owner, start_date, end_date, work_days, progress, status, remark, sort_order, natural_days) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            task.project_id,
            task.parent_id,
            task.task_name,
            task.owner,
            task.start_date,
            task.end_date,
            task.work_days,
            task.progress,
            task.status,
            task.remark,
            task.sort_order,
            task.natural_days,
        ],
    );
    r?;
    Ok(conn.last_insert_rowid())
}

/// 更新任务（同列序）
pub fn update(conn: &Connection, id: i64, task: &ProjectTask) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE project_tasks SET parent_id=?2, task_name=?3, owner=?4, start_date=?5, end_date=?6, work_days=?7, progress=?8, status=?9, remark=?10, sort_order=?11, natural_days=?12, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![
            id,
            task.parent_id,
            task.task_name,
            task.owner,
            task.start_date,
            task.end_date,
            task.work_days,
            task.progress,
            task.status,
            task.remark,
            task.sort_order,
            task.natural_days,
        ],
    )?;
    Ok(n > 0)
}

/// 删除任务（级联删除子任务）
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM project_tasks WHERE id = ?1", [id])?;
    Ok(n > 0)
}

/// 删除任务及其所有子孙任务（DFS）
pub fn delete_with_children(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    // 收集所有子孙 id
    let mut ids: Vec<i64> = Vec::new();
    let mut stack = vec![id];
    while let Some(cid) = stack.pop() {
        ids.push(cid);
        let mut stmt = conn.prepare("SELECT id FROM project_tasks WHERE parent_id = ?1")?;
        let children: Vec<i64> = stmt
            .query_map([cid], |row| row.get(0))?
            .collect::<rusqlite::Result<Vec<i64>>>()?;
        stack.extend(children);
    }
    // 按 id 删除
    for cid in &ids {
        conn.execute("DELETE FROM project_tasks WHERE id = ?1", [*cid])?;
    }
    Ok(ids.len() > 0)
}

/// 检查父任务循环（RFC-02 §2：禁止循环）
pub fn would_create_cycle(conn: &Connection, task_id: i64, new_parent_id: i64) -> rusqlite::Result<bool> {
    eprintln!("[TRACE] would_create_cycle task_id={} new_parent_id={}", task_id, new_parent_id);
    if task_id == new_parent_id {
        eprintln!("[TRACE] would_create_cycle → self-ref return true");
        return Ok(true); // 自引用
    }
    // 沿 parent_id 链向上查找
    let mut current = Some(new_parent_id);
    while let Some(cid) = current {
        if cid == task_id {
            return Ok(true);
        }
        // 注：parent_id 是 NULLABLE · 必须用 Option<i64> 解 row.get(0)
        let next: Option<Option<i64>> = conn
            .query_row(
                "SELECT parent_id FROM project_tasks WHERE id = ?1",
                [cid],
                |row| row.get::<_, Option<i64>>(0),
            )
            .optional()?;
        match next {
            Some(Some(v)) => current = Some(v),
            Some(None) | None => return Ok(false), // 顶层任务或任务不存在 → 无循环
        }
    }
    Ok(false)
}
/// 批量导入任务（整体事务）
/// 2026-09-08 修复「导入32条只剩6条」：逐条 invoke 无事务，中途任一失败即中断但已写条目不回滚。
/// 改为单事务：父任务先落库拿到真实 id，子任务 parent_id 用真实 id 重映射，全部成功一次 COMMIT，
/// 任一失败整批 ROLLBACK —— 要么32条全成功，要么全失败，绝不残留部分。
/// 返回真实 id 列表（顺序与输入一致）。
pub fn import_bulk(
    conn: &mut Connection,
    project_id: i64,
    tasks: &[ProjectTask],
) -> rusqlite::Result<Vec<i64>> {
    let tx = conn.transaction()?;
    let mut real_ids: Vec<i64> = Vec::with_capacity(tasks.len());

    for task in tasks {
        // 输入 task.parent_id 指向「临时序号 id」（excel 序号），需经 real_ids 映射成真实 DB id。
        // 本仓库 create() 按输入写 parent_id；此处先解析：临时 id 是 1..n，按下标对应。
        let real_parent = match task.parent_id {
            Some(pid) if pid > 0 && (pid as usize) <= real_ids.len() => {
                real_ids.get((pid - 1) as usize).copied()
            }
            _ => None,
        };
        let mut mapped = task.clone();
        mapped.project_id = project_id;
        mapped.parent_id = real_parent;

        tx.execute(
            "INSERT INTO project_tasks (project_id, parent_id, task_name, owner, start_date, end_date, work_days, progress, status, remark, sort_order, natural_days) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                mapped.project_id,
                mapped.parent_id,
                mapped.task_name,
                mapped.owner,
                mapped.start_date,
                mapped.end_date,
                mapped.work_days,
                mapped.progress,
                mapped.status,
                mapped.remark,
                mapped.sort_order,
                mapped.natural_days,
            ],
        )?;
        real_ids.push(tx.last_insert_rowid());
    }

    tx.commit()?;
    Ok(real_ids)
}
