/**
 * PMTool · 服务层模块入口
 * Phase 4 · T4.9 新增 file_storage
 *
 * 职责：
 *   - file_storage: FileStorageProvider trait + LocalFileStorageProvider 实现
 *   - secure_storage: OS 安全存储抽象（通知渠道凭证等敏感串）
 *   - notification: 消息与通知中心
 */

pub mod file_browser;
pub mod file_storage;
pub mod file_storage_local;
pub mod data_maintenance;
pub mod logging;
pub mod notification;  // 消息与通知中心（2026-09-18 · V1 精简闭环）
pub mod secure_storage;
