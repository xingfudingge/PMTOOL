/**
 * PMTool · Document Engine PDF 引擎（2026-09-23 重写）
 *
 * 选型踩坑（两次失败沉淀）：
 *   1. 第一版用 ppt-rs 的 pdfrs 后端 `to_pdf_bytes` —— 实测是桩函数：把结构体
 *      debug 文本（title/slides/generator）当正文写进页面，且只用 Base-14 西文
 *      字体、无视传入的中文字体 → 中文全乱码（2026-09-23 维护者实测打回）。
 *      教训：只断言 `%PDF` 文件头不够，必须验证内容（字体嵌入 + 文本真的渲染）。
 *   2. 候选 genpdf —— 读源码发现按空格切词，超页宽的“词”直接丢弃（源码注释
 *      “we will never be able to render it completely” 后 break）：无空格的长
 *      中文句会被静默扔掉，比乱码更糟 → 弃用。
 *
 * 最终：printpdf 0.11（HTML→PDF，azul text3 排版引擎）
 *   - UAX#14/CJK 断行规则（中文可逐字断行）、Knuth-Plass 断行、自动分页
 *   - Markdown → pulldown-cmark → HTML(+CSS) → PDF（与 docx 引擎同一解析器）
 *   - 中文字体显式喂字节（不赌系统字体扫描），解析失败自动降级系统字体回退
 *   - 防御：from_html 渲染失败不返回 Err，而是吞掉错误返回零页文档 → 必须查页数
 */

use printpdf::{Base64OrRaw, GeneratePdfOptions, PdfDocument, PdfSaveOptions, PdfWarnMsg};
use pulldown_cmark::{html as md_html, Options, Parser};
use std::collections::BTreeMap;
use std::path::PathBuf;

/// 喂给引擎的字体标识（CSS font-family 引用）
const CJK_FONT_KEY: &str = "PMToolCJK";

// ============================================================
// 字体
// ============================================================

/// 探测含中文字形的系统字体（TTF 优先；.ttc/.otf 解析兼容性无保证，失败有降级重试）
pub fn find_cjk_font() -> Option<PathBuf> {
    const CANDIDATES: &[&str] = &[
        // Windows（TTF）
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\Deng.ttf",
        r"C:\Windows\Fonts\simkai.ttf",
        r"C:\Windows\Fonts\simfang.ttf",
        // macOS（带中文字形的 TTF）
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        // Linux（常见文泉驿；引擎自带 fontconfig 回退兜底）
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    ];
    CANDIDATES
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
}

/// 读中文字体字节 → 引擎字体表；失败返回 None（由调用方决定降级）
fn try_font_map() -> Option<(BTreeMap<String, Base64OrRaw>, PathBuf)> {
    let path = find_cjk_font()?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let mut map = BTreeMap::new();
            map.insert(CJK_FONT_KEY.to_string(), Base64OrRaw::Raw(bytes));
            Some((map, path))
        }
        Err(e) => {
            eprintln!("[document/pdf] 读取中文字体失败 {}: {}", path.display(), e);
            None
        }
    }
}

// ============================================================
// Markdown → HTML
// ============================================================

fn escape_attr(s: &str) -> String {
    // NOTE: entity leading & is spelled as Rust escape \u{26} — the write pipeline
    // decodes literal "&" style entities back to raw chars (hit twice already).
    s.replace('&', "\u{26}amp;")
        .replace('<', "\u{26}lt;")
        .replace('>', "\u{26}gt;")
        .replace('"', "\u{26}quot;")
}

/// 按平台给 font-family 链。
/// azul 对链里**每个**查不到的族名都打一条 UNRESOLVED 警告（进日志是噪音），
/// 所以只写本平台必有的族名：Win10 必带雅黑/黑体/等线，macOS 必带苹方/宋体。
/// 系统字体全缺时还有 find_cjk_font 喂进来的内存字体兜底。
fn platform_font_family() -> &'static str {
    if cfg!(target_os = "windows") {
        "\"Microsoft YaHei\", \"SimHei\", \"DengXian\", sans-serif"
    } else if cfg!(target_os = "macos") {
        "\"PingFang SC\", \"Songti SC\", \"Arial Unicode MS\", sans-serif"
    } else {
        "\"WenQuanYi Micro Hei\", \"Noto Sans CJK SC\", sans-serif"
    }
}

/// Markdown → 完整 HTML（语义标签 + 排版 CSS，字号沿用原打印版式）
fn markdown_to_html(title: &str, markdown: &str) -> String {
    let font_family = platform_font_family();
    let mut body = String::new();
    // 2026-09-24：开 ENABLE_TABLES —— 与 docx 引擎同样问题，AI 报告里的 Markdown 表格
    // 在 PDF 里也需渲染成真表格，否则 | a | b | 与 |---| 会当正文裸放。
    let parser = Parser::new_ext(markdown, Options::ENABLE_TABLES);
    md_html::push_html(&mut body, parser);

    format!(
        r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>{title}</title>
<style>
body {{ font-family: {font_family}; font-size: 12pt; line-height: 1.7; color: #000000; }}
h1 {{ font-size: 20pt; margin-top: 0pt; margin-bottom: 12pt; }}
h2 {{ font-size: 16pt; margin-top: 14pt; margin-bottom: 8pt; }}
h3 {{ font-size: 14pt; margin-top: 12pt; margin-bottom: 6pt; }}
h4 {{ font-size: 13pt; margin-top: 10pt; margin-bottom: 6pt; }}
h5, h6 {{ font-size: 12pt; margin-top: 10pt; margin-bottom: 6pt; }}
p {{ margin-top: 6pt; margin-bottom: 6pt; }}
/* 段内单换行必须显示为真换行：md 源多为单换行分行（2026-09-24 维护者实测
   「缩在一起」根因——HTML 软折行语义把多行连成一坨）。pre-wrap 保留换行且超长仍折行 */
p, li, blockquote, h1, h2, h3, h4, h5, h6 {{ white-space: pre-wrap; }}
ul, ol {{ margin-top: 6pt; margin-bottom: 6pt; padding-left: 24pt; }}
li {{ margin-top: 2pt; margin-bottom: 2pt; }}
blockquote {{ margin-top: 6pt; margin-bottom: 6pt; padding-left: 10pt; color: #444444; }}
pre {{ margin-top: 6pt; margin-bottom: 6pt; padding: 8pt; background-color: #f5f5f5; }}
code {{ font-size: 11pt; }}
a {{ color: #0563c1; }}
hr {{ margin-top: 10pt; margin-bottom: 10pt; }}
</style>
</head>
<body>
{body}
</body>
</html>"#,
        title = escape_attr(title),
        font_family = font_family,
        body = body
    )
}

// ============================================================
// 渲染
// ============================================================

fn gen_options() -> GeneratePdfOptions {
    GeneratePdfOptions {
        font_embedding: Some(true),
        page_width: Some(210.0),
        page_height: Some(297.0),
        margin_top: Some(18.0),
        margin_right: Some(18.0),
        margin_bottom: Some(18.0),
        margin_left: Some(18.0),
        ..Default::default()
    }
}

fn fmt_warns(ws: &[PdfWarnMsg]) -> Vec<String> {
    ws.iter()
        .map(|w| format!("[{:?}] {}", w.severity, w.msg))
        .collect()
}

/// HTML → PdfDocument（返回 None + 原因；warnings 内是引擎的逐条告警）
fn render(
    html: &str,
    fonts: BTreeMap<String, Base64OrRaw>,
    opts: &GeneratePdfOptions,
) -> (Option<PdfDocument>, Vec<String>) {
    let images: BTreeMap<String, Base64OrRaw> = BTreeMap::new();
    let mut warnings: Vec<PdfWarnMsg> = Vec::new();
    match PdfDocument::from_html(html, &images, &fonts, opts, &mut warnings) {
        Ok(doc) => (Some(doc), fmt_warns(&warnings)),
        Err(e) => (None, vec![e]),
    }
}

/// Markdown → PDF 字节
///
/// 失败会明确返回 Err（含引擎告警），绝不静默产出空/乱码 PDF。
pub fn markdown_to_pdf(title: &str, markdown: &str) -> Result<Vec<u8>, String> {
    let html = markdown_to_html(title, markdown);
    let opts = gen_options();

    // 第一次：显式喂中文字体（确定性，不赌 fontconfig 系统扫描）
    let (fonts, font_path) = match try_font_map() {
        Some((m, p)) => (m, Some(p)),
        None => (BTreeMap::new(), None),
    };
    let (mut doc, mut warns) = render(&html, fonts, &opts);

    // 防御：from_html 渲染失败不返回 Err，而是吞掉错误返回零页文档
    if doc.as_ref().map_or(true, |d| d.pages.is_empty()) {
        if let Some(p) = &font_path {
            // 常见原因：字体解析失败（.ttc/.otf 兼容性）→ 降级为引擎系统字体回退
            eprintln!(
                "[document/pdf] 带字体渲染未产出页面，降级用系统字体回退重试（字体 {}）",
                p.display()
            );
            let (doc2, warns2) = render(&html, BTreeMap::new(), &opts);
            warns.extend(warns2);
            if let Some(d) = doc2 {
                if !d.pages.is_empty() {
                    doc = Some(d);
                }
            }
        }
    }

    let doc = doc
        .filter(|d| !d.pages.is_empty())
        .ok_or_else(|| {
            let detail = if warns.is_empty() {
                "引擎未提供更多信息".to_string()
            } else {
                warns.join("；")
            };
            format!("PDF 渲染失败（未产出页面）：{}", detail)
        })?;

    let mut save_warns: Vec<PdfWarnMsg> = Vec::new();
    let bytes = doc.save(&PdfSaveOptions::default(), &mut save_warns);
    warns.extend(fmt_warns(&save_warns));
    if !warns.is_empty() {
        eprintln!("[document/pdf] 警告 {} 条：{}", warns.len(), warns.join(" | "));
    }

    if !bytes.starts_with(b"%PDF") || bytes.len() < 100 {
        return Err(format!("PDF 序列化异常（{} 字节）", bytes.len()));
    }
    Ok(bytes)
}

// ============================================================
// 测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "# 260922日报\n1、完成合同基础功能测试\n2、配合超低温公司现场排障\n";

    #[test]
    fn pdf_is_valid_and_embeds_font() {
        let bytes = markdown_to_pdf("260922日报", SAMPLE).expect("应能生成 PDF");
        assert!(bytes.starts_with(b"%PDF"), "必须是合法 PDF 头");
        assert!(bytes.len() > 1000, "体积异常：{} 字节", bytes.len());
        let raw = String::from_utf8_lossy(&bytes);
        assert!(!raw.contains("generator: ppt-rs"), "不得再现 pdfrs debug 残留");
        assert!(
            raw.contains("/FontFile") || raw.contains("/FontDescriptor"),
            "必须嵌入字体（只引用 Base-14 西文字体=中文必然乱码）"
        );
    }

    #[test]
    fn renders_chinese_title_debug() {
        let html = markdown_to_html("260922日报", SAMPLE);
        let fonts = try_font_map().map(|(m, _)| m).unwrap_or_default();
        let mut warns: Vec<PdfWarnMsg> = Vec::new();
        let (doc, dbg) = PdfDocument::from_html_debug(
            &html,
            &BTreeMap::new(),
            &fonts,
            &gen_options(),
            &mut warns,
        )
        .expect("debug 渲染应成功");
        assert!(!doc.pages.is_empty(), "至少一页");

        let all = format!(
            "{}\n{}",
            dbg.pdf_ops_debug.join("\n"),
            dbg.display_list_debug.join("\n")
        );
        // 引擎逐字绘制（每字一个 ShowText + cid 单字），所以断言必须按单字查：
        // cid: Some("日") / cid: Some("报")
        assert!(all.contains(r#"Some("日")"#), "标题「日」字必须渲染");
        assert!(all.contains(r#"Some("报")"#), "标题「报」字必须渲染");
        assert!(all.contains("SetFont"), "必须有字体绘制操作");
    }

    #[test]
    fn long_cjk_paragraph_is_laid_out() {
        // 270 个连续汉字、无空格 —— 上一代方案（genpdf）会整句丢弃的场景
        let line = "实施现场问题跟踪与闭环处理".repeat(30);
        let md = format!("# 超长段落\n{}\n", line);
        let html = markdown_to_html("超长段落", &md);
        let fonts = try_font_map().map(|(m, _)| m).unwrap_or_default();
        let mut warns: Vec<PdfWarnMsg> = Vec::new();
        let (doc, dbg) = PdfDocument::from_html_debug(
            &html,
            &BTreeMap::new(),
            &fonts,
            &gen_options(),
            &mut warns,
        )
        .expect("debug 渲染应成功");
        assert!(!doc.pages.is_empty(), "超长段落不得渲染成零页");

        let all = format!(
            "{}\n{}",
            dbg.pdf_ops_debug.join("\n"),
            dbg.display_list_debug.join("\n")
        );
        // 270 个汉字必须逐字全部绘制（每字一个 ShowText）——一个都不能少
        let shown = all.matches("ShowText").count();
        assert!(
            shown >= 270,
            "长句 270 字应逐字渲染进 PDF（防 genpdf 式静默丢弃），实际 ShowText {} 次",
            shown
        );
        // 必须发生换行：正文行 y 坐标（SetTextMatrix 第 6 个分量）应出现多个值
        let mut ys = std::collections::HashSet::new();
        for line in all.lines() {
            if let Some(inner) = line.split("Raw([").nth(1) {
                if let Some(end) = inner.split("])").next() {
                    let nums: Vec<&str> = end.split(',').map(str::trim).collect();
                    if nums.len() == 6 {
                        ys.insert(nums[5].to_string());
                    }
                }
            }
        }
        assert!(
            ys.len() >= 3,
            "270 字长句应折成多行（至少 3 个不同行 y），实际 {}",
            ys.len()
        );
    }

    /// 回归（2026-09-24 维护者实测「缩在一起」）：md 源里单换行分行的多行文本
    /// 必须渲染为多行 —— HTML 软折行语义会把它们连成一坨，与富文本所见不一致。
    #[test]
    fn softbreaks_render_as_real_lines() {
        let md = "1、配合测试\n2、录入模板\n3、项目周例会\n";
        let html = markdown_to_html("probe", md);
        let fonts = try_font_map().map(|(m, _)| m).unwrap_or_default();
        let mut warns: Vec<PdfWarnMsg> = Vec::new();
        let (doc, dbg) = PdfDocument::from_html_debug(
            &html,
            &BTreeMap::new(),
            &fonts,
            &gen_options(),
            &mut warns,
        )
        .expect("debug 渲染");
        assert!(!doc.pages.is_empty());
        let ops = dbg.pdf_ops_debug.first().map(String::as_str).unwrap_or("");
        let mut ys = std::collections::HashSet::new();
        for line in ops.lines() {
            if line.contains("SetTextMatrix") {
                if let Some(inner) = line.split("Raw([").nth(1) {
                    if let Some(end) = inner.split("])").next() {
                        let n: Vec<f64> = end
                            .split(',')
                            .filter_map(|s| s.trim().parse().ok())
                            .collect();
                        if n.len() == 6 {
                            ys.insert((n[5] * 100.0).round() as i64);
                        }
                    }
                }
            }
        }
        assert!(
            ys.len() >= 3,
            "单换行的 3 行文本应渲染为至少 3 行（pre-wrap），实际 {} 行",
            ys.len()
        );
    }

    #[test]
    fn empty_markdown_still_renders() {
        let bytes = markdown_to_pdf("空文档", "").expect("空文档也要能导出");
        assert!(bytes.starts_with(b"%PDF"));
    }

    #[test]
    fn finds_a_cjk_font_on_this_machine() {
        match find_cjk_font() {
            Some(p) => println!("中文字体: {}", p.display()),
            None => println!("未探测到字体文件（走引擎系统字体回退）"),
        }
    }

    /// 布局探针：打印每行文字的 (x, y, 字号)，诊断「缩在一起/居中」类排版问题
    /// 跑法：cargo test --lib debug_layout_probe -- --ignored --nocapture
    #[test]
    #[ignore]
    fn debug_layout_probe() {
        let md = "# 260923晨曦项目现场工作情况：\n\
                  1、配合超低温公司进行合同基础功能测试\n\
                  2、测试环境录入合同模板（为生产环境准备）\n\n\
                  # 下个工作日计划：\n\
                  1、配合信息公司进行合同基础功能测试\n\
                  2、项目周例会\n";
        let html = markdown_to_html("probe", md);
        let fonts = try_font_map().map(|(m, _)| m).unwrap_or_default();
        let mut warns: Vec<PdfWarnMsg> = Vec::new();
        let (_doc, dbg) = PdfDocument::from_html_debug(
            &html,
            &BTreeMap::new(),
            &fonts,
            &gen_options(),
            &mut warns,
        )
        .expect("debug 渲染");
        let ops = dbg.pdf_ops_debug.first().map(String::as_str).unwrap_or("");
        let mut cur_size = 0.0f64;
        for line in ops.lines() {
            if let Some(rest) = line.split("size: Pt(").nth(1) {
                cur_size = rest.trim_end_matches(')').parse().unwrap_or(0.0);
            }
            if line.contains("SetTextMatrix") {
                if let Some(inner) = line.split("Raw([").nth(1) {
                    if let Some(end) = inner.split("])").next() {
                        let n: Vec<f64> = end
                            .split(',')
                            .filter_map(|s| s.trim().parse().ok())
                            .collect();
                        if n.len() == 6 {
                            println!("x={:7.2}  y={:7.2}  size={:.1}pt", n[4], n[5], cur_size);
                        }
                    }
                }
            }
        }
    }

    /// 嫌疑结构探测：哪些 md 结构会把布局搞崩（居中/挤/零行/告警）
    /// 跑法：cargo test --lib probe_suspect_structures -- --ignored --nocapture
    #[test]
    #[ignore]
    fn probe_suspect_structures() {
        let cases: Vec<(&str, String)> = vec![
            ("软换行(同段落多行)", "1、配合测试\n2、录入模板\n3、项目周例会\n".into()),
            ("字面<br>", "第一行<br>第二行<br/>第三行\n".into()),
            ("图片", "日报\n\n![](C:/Users/example/Downloads/剪贴板图片.png)\n\n正文\n".into()),
            ("分割线", "# 日报\n\n正文一\n\n---\n\n正文二\n".into()),
            ("有序+嵌套列表", "1. 完成测试\n   1. 子项甲\n   2. 子项乙\n2. 周例会\n".into()),
            ("粗体行内", "**重要**：配合超低温公司测试 & 录入模板\n".into()),
        ];
        for (name, md) in cases {
            let html = markdown_to_html("probe", &md);
            let fonts = try_font_map().map(|(m, _)| m).unwrap_or_default();
            let mut warns: Vec<PdfWarnMsg> = Vec::new();
            let res = PdfDocument::from_html_debug(
                &html,
                &BTreeMap::new(),
                &fonts,
                &gen_options(),
                &mut warns,
            );
            match res {
                Ok((doc, dbg)) => {
                    let ops = dbg.pdf_ops_debug.first().map(String::as_str).unwrap_or("");
                    let mut ys = std::collections::HashSet::new(); // y ×100 存整数（f64 无 Hash）
                    let mut min_x = f64::MAX;
                    let mut max_x = f64::MIN;
                    for line in ops.lines() {
                        if line.contains("SetTextMatrix") {
                            if let Some(inner) = line.split("Raw([").nth(1) {
                                if let Some(end) = inner.split("])").next() {
                                    let n: Vec<f64> = end
                                        .split(',')
                                        .filter_map(|s| s.trim().parse().ok())
                                        .collect();
                                    if n.len() == 6 {
                                        ys.insert((n[5] * 100.0).round() as i64);
                                        min_x = min_x.min(n[4]);
                                        max_x = max_x.max(n[4]);
                                    }
                                }
                            }
                        }
                    }
                    println!(
                        "[{}] pages={} lines={} x=[{:.1},{:.1}] warns={}",
                        name,
                        doc.pages.len(),
                        ys.len(),
                        min_x,
                        max_x,
                        warns.len()
                    );
                    for w in warns.iter().take(3) {
                        println!("    warn: [{}] {}", w.page, w.msg);
                    }
                }
                Err(e) => println!("[{}] RENDER ERR: {}", name, e),
            }
        }
    }

    /// 手动冒烟：把样例日报导出成 PDF 供肉眼验收
    /// 跑法：cargo test --lib dump_sample_pdf -- --ignored --nocapture
    #[test]
    #[ignore]
    fn dump_sample_pdf() {
        // 单换行多行结构 = 维护者日报的真实形态（曾「缩在一起」的场景）
        let md = "# 260923晨曦项目现场工作情况：\n\
                  1、配合超低温公司进行合同基础功能测试\n\
                  2、测试环境录入合同模板（为生产环境准备）\n\
                  3、项目周例会\n\n\
                  # 下个工作日计划：\n\
                  1、配合信息公司进行合同基础功能测试\n\
                  2、录入合同模板\n\n\
                  ## 附：超长段落断行验证\n\
                  实施现场问题跟踪与闭环处理，覆盖合同、订单、发货、验收全流程，确保各环节问题在下一个工作日前完成闭环并同步给相关负责人。\n";
        let bytes = markdown_to_pdf("260923日报", md).expect("生成");
        let out = std::env::temp_dir().join("260923日报-printpdf样张v2.pdf");
        std::fs::write(&out, &bytes).expect("写文件");
        println!("样张已输出：{}（{} 字节）", out.display(), bytes.len());
    }
}
