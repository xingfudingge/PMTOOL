/**
 * PMTool · Document Engine 格式引擎入口
 *
 * docx.rs：Markdown → .docx（docx-rs）+ .docx → Markdown（导入解析）
 * pptx.rs：Markdown → .pptx（ppt-rs）
 * pdf.rs： Markdown → .pdf（printpdf HTML→PDF，azul text3 CJK 断行 + 字体嵌入）
 *
 * 说明：二进制格式生成**全部在 Rust 侧**，前端不再自产任何二进制格式，
 *       保证导出/导入功能与界面共用同一实现、效果一致。
 * 仍推迟：XLSX 原生生成（预览沿用现有前端栈）。
 */

pub mod docx;
pub mod pdf;
pub mod pptx;
