/**
 * PMTool · 授权体系模块（Device Identity + Secure Storage + License Validator + 运行时授权状态）
 *
 * 设计依据：授权体系与数据库隔离改造（2026-09-16）
 *   授权属于设备，不属于数据库。
 *   Device Identity 属于当前运行设备，不属于数据库。
 *   License 属于当前设备的安全存储，不属于业务数据。
 *   数据库备份只备份业务数据。启动时重新计算 Device Identity 并与本机 License 独立完成验证。
 */

pub mod authorization;
pub mod device_identity;
pub mod license_validator;
pub mod migration;
pub mod secure_storage;