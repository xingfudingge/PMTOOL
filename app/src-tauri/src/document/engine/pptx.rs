/**
 * PMTool · Document Engine PPTX 引擎（2026-09-20，2026-09-24 重构）
 *
 * 成熟库 ppt-rs（纯 Rust，无 Office 依赖）：Markdown → .pptx。
 *
 * 2026-09-24 维护者实测：用文档引擎导出的 PPT「做得很烂」——
 *   - 表格被当整行文本塞进要点（28pt 大字号 + 不换行 → 溢出/裁切）
 *   - 标题/正文字号全走默认（44/28pt），内容一多就挤爆
 *   根因 = 我手写的 markdown_to_slides 规则太糙。改为直接用 ppt-rs 自带
 *   parse_markdown（pulldown-cmark 事件级解析：标题层级/列表/表格/代码块），
 *   再按内容量做自适应字号（标题长降档、要点/表格行多降档）防溢出。
 *
 * 为什么放 Rust：统一二进制生成能力（界面导出也用同一实现）。此前 PPT 是前端实现
 * （pptxgenjs），生成能力分散且不可复用。
 *
 * 中文：pptx 只存字体名（由 Office/WPS 用系统字体渲染）。
 * PDF 迁出到 pdf.rs；ppt-rs 的 pdf-native 后端（pdfrs）是桩函数，不调用。
 */

use ppt_rs::cli::markdown::parse_markdown;
use ppt_rs::create_pptx_with_content;

/// Markdown → .pptx 字节
///
/// 用 ppt-rs 的成熟解析器切页/建表，再按内容量调字号防溢出：
/// 标题太长降档（44→36→28），要点+表格行数一多正文降档（20→18→16）。
pub fn markdown_to_pptx(title: &str, markdown: &str) -> Result<Vec<u8>, String> {
    let mut slides = parse_markdown(markdown).map_err(|e| e.to_string())?;
    for s in &mut slides {
        // 标题过长（超页宽）→ 降档
        let tl = s.title.chars().count();
        s.title_size = Some(if tl > 16 { 28 } else if tl > 10 { 36 } else { 44 });
        // 要点 + 表格行数多 → 正文降档防溢出
        let rows = s.table.as_ref().map(|t| t.row_count()).unwrap_or(0);
        let total = s.bullets.len() + rows;
        s.content_size = Some(if total > 40 { 12 } else if total > 10 { 14 } else if total > 7 { 16 } else if total > 3 { 18 } else { 20 });
    }
    // 2026-09-30 后处理清洗 ppt-rs 的固定缺陷（用户实测「PPT 做得很烂」）：
    //   - `---` 换页时 ppt-rs 把下一页标题设为「上一页标题 (continued)」，多页叠加成
    //     「文档名 (continued) (continued) …」。剥掉所有 ` (continued)` 后缀，还原页真实标题。
    //   - 强调标记 `**`/`__` 被解析器当字面文本塞进 title/content/bullet，界面显示成星号。剥掉。
    for s in &mut slides {
        s.title = clean_pptx_text(&s.title);
        for c in &mut s.content {
            *c = clean_pptx_text(c);
        }
        for b in &mut s.bullets {
            b.text = clean_pptx_text(&b.text);
        }
    }
    create_pptx_with_content(title, slides).map_err(|e| e.to_string())
}

/// 剥掉 ppt-rs 残留的「标题延续后缀 + Markdown 强调标记」
fn clean_pptx_text(s: &str) -> String {
    let mut t = s.to_string();
    // 反复剥 ` (continued)`（可能叠加多次）
    while let Some(stripped) = t.strip_suffix(" (continued)") {
        t = stripped.to_string();
    }
    // 强调语法残留：`**` / `__` / `*` / `_` 只做语法字符移除（取出文本本身）
    t = t.replace("**", "").replace("__", "").replace("*", "").replace("_", "");
    t.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Read};

    /// 解 zip 取第一个 slide XML（验证表格/文本真的写进 pptx）
    fn first_slide_xml(bytes: &[u8]) -> String {
        let mut arc = zip::ZipArchive::new(Cursor::new(bytes)).expect("pptx 应是 zip");
        for i in 0..arc.len() {
            let mut f = arc.by_index(i).expect("读取 zip 项");
            let name = f.name().to_string();
            if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
                let mut s = String::new();
                f.read_to_string(&mut s).expect("读 slide xml");
                return s;
            }
        }
        String::new()
    }

    fn extract_all_slide_xml(bytes: &[u8]) -> String {
        let mut arc = zip::ZipArchive::new(Cursor::new(bytes)).expect("pptx 应是 zip");
        let mut all = String::new();
        for i in 0..arc.len() {
            let mut f = arc.by_index(i).expect("读取 zip 项");
            let name = f.name().to_string();
            if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
                let mut s = String::new();
                f.read_to_string(&mut s).expect("读 slide xml");
                all.push_str(&s);
                all.push('\n');
            }
        }
        all
    }

    #[test]
    fn produces_zip_pptx() {
        let bytes = markdown_to_pptx("周报", "# 本周\n1、完成需求\n2、完成测试\n").unwrap();
        assert!(bytes.starts_with(b"PK\x03\x04"), "pptx 应是 zip");
        assert!(bytes.len() > 1000);
    }

    /// 回归（2026-09-24 维护者实测「PPT 做得很烂」）：Markdown 表格必须渲染成真表格，
    /// 不能当整行文本塞进要点（此前 28pt 不换行导致溢出/裁切）。
    #[test]
    fn renders_table_as_real_table() {
        let md = "# 任务进度\n\n| 状态 | 数量 | 占比 |\n|---|---|---|\n| 已完成 | 24 | 8.6% |\n| 进行中 | 40 | 57.1% |\n";
        let bytes = markdown_to_pptx("报告", md).unwrap();
        let xml = first_slide_xml(&bytes);
        assert!(
            xml.contains("<a:tbl") || xml.contains("gridCol"),
            "Markdown 表格应渲染为 OOXML 表格 (a:tbl/gridCol)，实际 slide: {}",
            &xml[..xml.len().min(200)]
        );
    }

    #[test]
    fn empty_markdown_errors_cleanly() {
        // parse_markdown 对空内容返回明确错误（not panic）——生产路径不崩即可
        let err = markdown_to_pptx("空", "");
        assert!(err.is_err(), "空内容应明确报错而不是崩溃");
    }

    /// 回归（2026-09-30 用户实测「PPT 做得很烂」）：ppt-rs 用 `---` 换页时把下一页标题设为
    /// 「上一页标题 (continued)」且多页叠加，并把 `**` 强调当字面文本。后处理必须剥掉。
    #[test]
    fn pptx_title_no_continued_and_no_markdown_markers() {
        let md = "# 晨曦项目汇报\n\n---\n\n## 一、报告摘要\n**项目当前处于开发上线阶段。**\n\n---\n\n## 二、项目总体评价\n- 项目状态：**关注**\n";
        let bytes = markdown_to_pptx("晨曦项目汇报", md).unwrap();
        let xml = extract_all_slide_xml(&bytes);
        assert!(
            !xml.contains(" (continued)"),
            "标题不得残留 (continued)：{}",
            &xml[..xml.len().min(200)]
        );
        assert!(
            !xml.contains("**") && !xml.contains("__"),
            "文本不得残留字面 Markdown 强调标记：{}",
            &xml[..xml.len().min(200)]
        );
        assert!(
            xml.contains("项目当前处于开发上线阶段") && xml.contains("项目状态"),
            "正文内容必须保留"
        );
    }

    /// 手动样张：含表格的报告 → pptx
    #[test]
    #[ignore]
    fn dump_sample_pptx() {
        let md = "# 晨曦智能印章项目·实施情况汇报\n\n## 一、项目概况\n\n| 项目名称 | 晨曦智能印章项目 |\n| --- | --- |\n| 项目编号 | HT-001 |\n| 当前状态 | 实施中（EXECUTING） |\n\n## 二、总体实施进展\n\n任务总数：70\n已完成任务：24（完成率 34%）\n\n## 三、阶段里程碑\n\n| 阶段 | 状态 | 进度 |\n| --- | --- | --- |\n| 项目启动与准备 | 已完成 | 100% |\n| 方案设计 | 进行中 | 78% |\n";
        let bytes = markdown_to_pptx("晨曦项目汇报", md).unwrap();
        let out = std::env::temp_dir().join("晨曦项目汇报-样张.pptx");
        std::fs::write(&out, &bytes).unwrap();
        println!("PPTX 样张：{}（{} 字节）", out.display(), bytes.len());
    }

}
