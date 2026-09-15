/**
 * PMTool · 服务层模块入口
 * Phase 4 · T4.9 新增 file_storage
 * Phase 10 · 新增设备指纹和试用期管理
 *
 * 职责：
 *   - file_storage: FileStorageProvider trait + LocalFileStorageProvider 实现
 *   - 未来 Phase: 业务规则 services（License、Email、SMS 等）
 */

pub mod device_fingerprint;
pub mod file_browser;
pub mod file_storage;
pub mod file_storage_local;
pub mod data_maintenance;
pub mod license;
pub mod logging;
pub mod trial;
