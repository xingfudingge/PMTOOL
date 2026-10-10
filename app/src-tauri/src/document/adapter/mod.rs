/**
 * PMTool · Document Engine 适配器入口（2026-09-18）
 *
 * 目标：具体编辑器/格式的“UI 层”不进入 Document Model（RFC §38 原则）。
 *   richtext：内部 RichBlock ⇄ Markdown（V1）· BlockNote ⇄ RichBlock（M4）
 */

pub mod richtext;

pub use richtext::{markdown_to_richtext, richtext_to_markdown};
