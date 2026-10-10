/**
 * PMTool · 服务层模块入口
 * Phase 4 · T4.9 新增 file_storage
 * Phase 10 · 新增设备指纹和试用期管理
 *
 * 职责：
 *   - file_storage: FileStorageProvider trait + LocalFileStorageProvider 实现
 *   - 未来 Phase: 业务规则 services（License、Email、SMS 等）
 */

pub mod auth;
pub mod device_fingerprint;
pub mod file_browser;
pub mod file_storage;
pub mod file_storage_local;
pub mod data_maintenance;
pub mod logging;
pub mod notification;  // 消息与通知中心（2026-09-18 · V1 精简闭环）
// 注：trial.rs 已迁移到 services/auth 模块（试用期改为安全存储存储，与 DB 隔离）
