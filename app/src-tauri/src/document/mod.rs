/**
 * PMTool · Document Engine 模块入口（2026-09-18）
 *
 * 分层（docs/document-engine-rfc-2026-09-18.md §4）：
 *   model：统一文档模型（PmDocument / DocContent / RichBlock）
 *   storage：二进制产物落盘（PMToolData/doc/{doc_id}/）
 *   version：版本管理与冲突判定（桌面单机 · 防生成覆盖用户编辑）
 *   service：DocumentService 编排（create/get/update/list/export）
 *   adapter：BlockNote/固定格式 ⇄ PmDocument 互转（解耦特定编辑器数据结构）
 *   engine：格式引擎（Markdown → DOCX）
 *
 * 依赖方向：业务模块 → service → engine/adapter → model/storage。
 */

pub mod model;
pub mod storage;
pub mod version;
pub mod service;
pub mod adapter;
pub mod engine;

pub use model::{DocContent, DocType, PmDocument, PmDocumentMeta, PmDocumentVersionMeta, RichBlock, SpaceType};
