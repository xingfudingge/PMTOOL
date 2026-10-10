/**
 * PMTool · Document Engine DOCX 引擎（2026-09-18，2026-09-24 补表格）
 *
 * Markdown ⇄ .docx（纯 Rust · docx-rs + pulldown-cmark · 无 Office/LibreOffice 依赖）。
 *
 * 导出：pulldown-cmark 解析 Markdown AST → docx-rs 生成，
 *       标题用 Word 内置 Heading1-6 样式，列表用 ListBullet/ListNumber，引用用 Quote，
 *       代码块等宽保留换行，加粗/斜体映射 Run.bold()/italic()，
 *       表格（GFM | a | b |）转 Word 真表格 w:tbl。
 * 导入：docx（zip）解包 word/document.xml → 提取段落文本 → Markdown（内容不丢）。
 */

use docx_rs::{BreakType, Docx, Paragraph, Run, Table, TableCell, TableRow};
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use std::io::{Cursor, Read, Seek};
use std::path::Path;

// ============================================================
// Markdown → DOCX
// ============================================================

/// 表格归一化：把 AI 可能写出的“不标准表格”改写成 pulldown-cmark 能识别的 GFM 表格。
///
/// 触发场景（都属 AI 生成常见形态，此前会整表退化成正文碎片）：
///   - 有表头行但没有分隔行 `|---|---|`；
///   - 表头/数据行列数与分隔行列数不一致；
///   - 某些行缺列导致单元格错位。
///
/// 处理：把连续的 `|` 行聚成一个表格块，取第一行为表头，补一行分隔行，并把所有行补齐到相同列数。
/// 非表格行（不含 `|`）原样保留。返回重新规整后的 markdown。
fn normalize_md_tables(md: &str) -> String {
    let is_table_row = |line: &str| line.trim_start().starts_with('|');
    // 拆分 GFM 行 → 单元格 vec（去掉首尾竖线、每个单元 trim 空格）
    let split_cells = |line: &str| -> Vec<String> {
        line.trim()
            .trim_start_matches('|')
            .trim_end_matches('|')
            .split('|')
            .map(|c| c.trim().to_string())
            .collect()
    };
    let is_delim_cell = |c: &str| {
        let t = c.trim();
        t.is_empty() || (t.chars().all(|ch| ch == '-' || ch == ':'))
    };
    // 判断某行是不是 GFM 分隔行（所有单元格都是 --- 或 :---: 形式）
    let is_delim_row = |line: &str| {
        let cells = split_cells(line);
        !cells.is_empty() && cells.iter().all(|c| is_delim_cell(c))
    };
    let make_delim_row = |ncols: usize| {
        let mut s = String::from("|");
        for i in 0..ncols {
            if i > 0 { s.push('|'); }
            s.push_str(" --- ");
        }
        s.push('|');
        s
    };

    let lines: Vec<&str> = md.lines().collect();
    let mut out: Vec<String> = Vec::with_capacity(lines.len());
    let mut i = 0usize;
    while i < lines.len() {
        let line = lines[i];
        if !is_table_row(line) {
            out.push(line.to_string());
            i += 1;
            continue;
        }
        // 连续表格行聚合
        let mut block: Vec<&str> = Vec::new();
        let mut j = i;
        while j < lines.len() && is_table_row(lines[j]) {
            block.push(lines[j]);
            j += 1;
        }
        // 归属判断：只有「第1行是分隔行 + 所有行列数一致」才是一张规范 GFM 表格，原样保留；
        // 否则（缺分隔行 / 分隔行位置不对 / 列数不一致）都需要规整。
        let is_ready_table = block.len() >= 2
            && is_delim_row(block[1])
            && block.iter().all(|l| split_cells(l).len() == split_cells(block[1]).len());
        if is_ready_table {
            block.iter().for_each(|l| out.push(l.to_string()));
        } else {
            // 需规整：表头=第0行，跳过原有分隔行，其余行补齐到最大列数；最大列数含原分隔行列数
            let max_cols = block
                .iter()
                .filter(|l| !is_delim_row(l))
                .chain(block.iter().filter(|l| is_delim_row(l)).take(1))
                .map(|l| split_cells(l).len())
                .max()
                .unwrap_or(1)
                .max(1);
            let header = split_cells(block[0]);
            out.push(format!("| {} |", header.iter().cloned().collect::<Vec<_>>().join(" | ")));
            out.push(make_delim_row(max_cols));
            for l in block.iter().skip(1) {
                if is_delim_row(l) {
                    continue;
                }
                let mut cells = split_cells(l);
                while cells.len() < max_cols {
                    cells.push(String::new());
                }
                out.push(format!("| {} |", cells.join(" | ")));
            }
        }
        i = j;
    }
    merge_keyvalue_fragments(out).join("\n")
}

/// 把「每字段一个 1 列表格」的碎片合并成一张 2 列键值表。
///
/// 2026-10-08 维护者实测：AI 常把项目基本信息写成多个独立的 1 列小表（每个字段一个），
/// 形如 `| 项目名称 |` / `| --- |` / `| 晨曦智能印章项目 |`，中间被空行隔开。
/// 这是**输入 markdown 本身**的异常结构（引擎并未拆开正常表），但引擎可在此把它修复：
/// 把相邻的「标签/值」1 列小表合并成一张 `| 项 | 内容 |` 键值表。
fn merge_keyvalue_fragments(lines: Vec<String>) -> Vec<String> {
    let cells_of = |l: &str| -> Vec<String> {
        let t = l.trim();
        if !t.starts_with('|') { return vec![]; }
        t.trim_start_matches('|').trim_end_matches('|').split('|').map(|c| c.trim().to_string()).collect()
    };
    let is_delim = |l: &str| {
        let c = cells_of(l);
        !c.is_empty() && c.iter().all(|x| { let t = x.trim(); t.is_empty() || t.chars().all(|ch| ch == '-' || ch == ':') })
    };
    // 判断某行是不是「1 列表格的表头行」（恰好一个单元格且非分隔行）
    let is_onecol_header = |l: &str| {
        let c = cells_of(l);
        c.len() == 1 && !is_delim(l)
    };

    let mut out: Vec<String> = Vec::with_capacity(lines.len());
    let mut i = 0usize;
    while i < lines.len() {
        let line = &lines[i];
        // 候选：从「1 列表头」+ 紧跟「分隔行」+ 数据行 开始
        if !(is_onecol_header(line) && i + 2 < lines.len() && is_delim(&lines[i + 1])) {
            out.push(line.clone());
            i += 1;
            continue;
        }
        // 收集连续的键值块（每个块 = 表头行 + 分隔行 + 表值行，允许块间有一个空行）
        let mut rows: Vec<(String, String)> = Vec::new();
        let mut cur = i;
        loop {
            if cur + 2 >= lines.len() { break; }
            let hc = cells_of(&lines[cur]);
            let hdr_ok = hc.len() == 1 && !is_delim(&lines[cur]);
            let delim_ok = is_delim(&lines[cur + 1]);
            let vc = cells_of(&lines[cur + 2]);
            let val_ok = vc.len() == 1 && !is_delim(&lines[cur + 2]) && !lines[cur + 2].trim().is_empty();
            if !(hdr_ok && delim_ok && val_ok) { break; }
            rows.push((hc[0].clone(), vc[0].clone()));
            cur += 3;
            // 跳过块间可选的单个空行
            if cur < lines.len() && lines[cur].trim().is_empty() {
                cur += 1;
            }
        }
        // 至少 2 个键值块才合并成一张 2 列表；single 块保留原样
        if rows.len() >= 2 {
            out.push("| 项 | 内容 |".to_string());
            out.push("| --- | --- |".to_string());
            for (k, v) in rows {
                out.push(format!("| {} | {} |", k, v));
            }
            i = cur;
        } else {
            out.push(line.clone());
            i += 1;
        }
    }
    out
}

/// 将 Markdown 转为 .docx 字节（真样式，含表格）
pub fn markdown_to_docx(md: &str) -> Result<Vec<u8>, String> {
    let mut docx = Docx::new();
    // 2026-09-24：开 ENABLE_TABLES —— AI 生成的长报告常含 Markdown 表格，
    // 此前 Options::empty() 不认识表格，| a | b | 与 |---| 分隔行全被当正文裸放。
    //
    // 2026-10-08 重要修订：pulldown-cmark 只在「表头行 + 紧跟的分隔行 |---|---|---|」存在时
    // 才把 Markdown 识别成表格。AI 生成的表格常常**省略分隔行**或**各行列数不一致**，
    // 此时整个表格会被无声退化成普通段落，正文出现 `|     |` / `| --- |` 碎片（维护者实测打回）。
    // 因此在解析前先做一次**表格归一化**：为缺失分隔行的表格补上分隔行、把各行补齐到一致列数。
    let md = normalize_md_tables(md);
    let parser = Parser::new_ext(md.as_str(), Options::ENABLE_TABLES);

    /// 内联段：文本 + 样式标记
    #[derive(Clone)]
    struct Inline {
        text: String,
        bold: bool,
        italic: bool,
        /// 该段前需要段内换行（Markdown 软换行/硬换行 → Word TextWrapping）
        line_break_before: bool,
    }

    // ---- 普通段落状态 ----
    let mut cur: Vec<Inline> = Vec::new();
    let mut style_stack: Vec<&'static str> = Vec::new(); // "bold"/"italic"
    let mut pending_style: Option<String> = None;
    let mut in_code_block = false;
    let mut code_block_buf = String::new();
    let mut pending_list_ordered: Option<bool> = None;

    // ---- 表格状态机 ----
    let mut in_table = false;
    let mut in_table_head = false;
    let mut rows: Vec<Vec<Vec<Inline>>> = Vec::new(); // 每行 → 每格 → 内联段
    let mut row_cells: Vec<Vec<Inline>> = Vec::new();
    let mut cell: Vec<Inline> = Vec::new();

    /// Inline 序列 → Word 段落（普通段与表格单元共用）
    fn inline_to_paragraph(inlines: &[Inline]) -> Paragraph {
        let mut para = Paragraph::new();
        for seg in inlines {
            let mut run = Run::new();
            if seg.bold {
                run = run.bold();
            }
            if seg.italic {
                run = run.italic();
            }
            // 软/硬换行 → 段内换行
            if seg.line_break_before {
                run = run.add_break(BreakType::TextWrapping);
            }
            if !seg.text.is_empty() {
                run = run.add_text(seg.text.clone());
            }
            para = para.add_run(run);
        }
        para
    }

    fn flush_paragraph(docx: Docx, cur: &mut Vec<Inline>, pending_style: &mut Option<String>) -> Docx {
        if cur.is_empty() && pending_style.is_none() {
            return docx;
        }
        let mut para = inline_to_paragraph(cur);
        if let Some(st) = pending_style.take() {
            para = para.style(&st);
        }
        let docx = docx.add_paragraph(para);
        // 关键：段落落盘后必须清空 cur。否则下一段 flush 会把之前所有内容再次写入，
        // 导致每一段都是上一段的超集（标题反复出现、正文逐段累积重复）——2026-09-30 维护者实测打回。
        cur.clear();
        docx
    }

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Table(_) => {
                    in_table = true;
                    rows.clear();
                }
                Tag::TableHead => in_table_head = true,
                Tag::TableRow => row_cells.clear(),
                Tag::TableCell => cell.clear(),
                Tag::Heading { level, .. } => {
                    let lvl: u8 = level as u8;
                    pending_style = Some(format!("Heading{}", lvl.clamp(1, 6)));
                }
                Tag::Paragraph => {
                    pending_style = None;
                }
                Tag::List(ord) => {
                    pending_list_ordered = Some(ord.is_some());
                }
                Tag::Item => {
                    let st = match pending_list_ordered {
                        Some(true) => "ListNumber",
                        _ => "ListBullet",
                    };
                    pending_style = Some(st.to_string());
                }
                Tag::CodeBlock(_) => {
                    in_code_block = true;
                    code_block_buf.clear();
                    pending_style = Some("NoSpacing".to_string());
                }
                Tag::BlockQuote(_) => {
                    pending_style = Some("Quote".to_string());
                }
                Tag::Emphasis => style_stack.push("italic"),
                Tag::Strong => style_stack.push("bold"),
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Table => {
                    // 表格结束：把最后一行并入，构造 Word 表格
                    if !row_cells.is_empty() {
                        rows.push(std::mem::take(&mut row_cells));
                    }
                    let ncols = rows.iter().map(|r| r.len()).max().unwrap_or(1).max(1);
                    let trows = rows
                        .drain(..)
                        .map(|r| {
                            TableRow::new(
                                r.into_iter()
                                    .map(|c| TableCell::new().add_paragraph(inline_to_paragraph(&c)))
                                    .collect(),
                            )
                        })
                        .collect();
                    let tbl = Table::new(trows).set_grid(vec![9600 / ncols; ncols]);
                    docx = docx.add_table(tbl);
                    in_table = false;
                    in_table_head = false;
                }
                TagEnd::TableCell => row_cells.push(std::mem::take(&mut cell)),
                TagEnd::TableRow => rows.push(std::mem::take(&mut row_cells)),
                // 关键（2026-10-08）：pulldown-cmark 的表头单元格**不包在 TableRow 里**，
                // 而是直接发在 TableHead 内；若只在 TableRow 结束时 push，表头行丢失，
                // 后续首个 body TableRow 的 clear() 会把表头单元格清空。
                TagEnd::TableHead => {
                    if !row_cells.is_empty() {
                        rows.push(std::mem::take(&mut row_cells));
                    }
                    in_table_head = false;
                },
                TagEnd::Heading(_) | TagEnd::Paragraph | TagEnd::Item | TagEnd::BlockQuote => {
                    docx = flush_paragraph(docx, &mut cur, &mut pending_style);
                }
                TagEnd::CodeBlock => {
                    in_code_block = false;
                    for line in code_block_buf.trim_end().lines() {
                        let para = Paragraph::new()
                            .style("NoSpacing")
                            .add_run(Run::new().add_text(line).size(20));
                        docx = docx.add_paragraph(para);
                    }
                    code_block_buf.clear();
                }
                TagEnd::List(_) => {
                    pending_list_ordered = None;
                }
                TagEnd::Emphasis | TagEnd::Strong => {
                    style_stack.pop();
                }
                _ => {}
            },
            Event::Text(text) => {
                if in_code_block {
                    code_block_buf.push_str(&text);
                    continue;
                }
                if in_table {
                    // 表头行加粗
                    cell.push(Inline {
                        text: text.to_string(),
                        bold: in_table_head || style_stack.contains(&"bold"),
                        italic: style_stack.contains(&"italic"),
                        line_break_before: false,
                    });
                } else {
                    cur.push(Inline {
                        text: text.to_string(),
                        bold: style_stack.contains(&"bold"),
                        italic: style_stack.contains(&"italic"),
                        line_break_before: false,
                    });
                }
            }
            Event::Code(text) => {
                cur.push(Inline {
                    text: format!("`{}`", text),
                    bold: style_stack.contains(&"bold"),
                    italic: style_stack.contains(&"italic"),
                    line_break_before: false,
                });
            }
            // 软换行（单换行）→ Word 段内换行。
            // 用户写的日报/纪要多为「一行一条」的 Markdown，若按空格处理会全挤成一段（2026-09-19 修复）。
            Event::SoftBreak => {
                cur.push(Inline {
                    text: String::new(),
                    bold: false,
                    italic: false,
                    line_break_before: true,
                });
            }
            Event::HardBreak => {
                cur.push(Inline {
                    text: String::new(),
                    bold: false,
                    italic: false,
                    line_break_before: true,
                });
            }
            Event::Rule => {
                docx = flush_paragraph(docx, &mut cur, &mut pending_style);
                docx = docx.add_paragraph(Paragraph::new().add_run(Run::new().add_text("――――――")));
            }
            _ => {}
        }
    }
    docx = flush_paragraph(docx, &mut cur, &mut pending_style);
    pack_docx(docx)
}

fn pack_docx(docx: Docx) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(Vec::<u8>::new());
    docx.build().pack(&mut cursor).map_err(|e| e.to_string())?;
    cursor.rewind().map_err(|e| e.to_string())?;
    Ok(cursor.into_inner())
}

// ============================================================
// DOCX → Markdown（只读导入 · 内容不丢）
// ============================================================

/// 读取 .docx 文件，提取正文段落文本为 Markdown
pub fn docx_to_markdown(file_path: &str) -> Result<String, String> {
    let path = Path::new(file_path);
    let file = std::fs::File::open(path).map_err(|e| format!("打开 docx 失败：{}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("解压 docx 失败：{}", e))?;
    let mut doc = archive
        .by_name("word/document.xml")
        .map_err(|e| format!("docx 缺少 document.xml：{}", e))?;
    let mut xml = String::new();
    doc.read_to_string(&mut xml).map_err(|e| format!("读取 document.xml 失败：{}", e))?;
    parse_document_xml(&xml)
}

/// 解析 word/document.xml：<w:p> 段落 → 文本行；<w:tab> → \t
fn parse_document_xml(xml: &str) -> Result<String, String> {
    let mut reader = quick_xml::Reader::from_str(xml);
    let mut buf = Vec::new();
    let mut out = String::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(ref e)) => match e.local_name().as_ref() {
                b"p" => out.push('\n'),
                b"tab" => out.push('\t'),
                _ => {}
            },
            Ok(quick_xml::events::Event::End(ref e)) => {
                if e.local_name().as_ref() == b"p" {
                    out.push('\n');
                }
            }
            Ok(quick_xml::events::Event::Text(ref t)) => {
                let txt = t.unescape().map(|s| s.to_string()).unwrap_or_default();
                out.push_str(&txt);
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => return Err(format!("解析 document.xml 失败：{}", e)),
            _ => {}
        }
        buf.clear();
    }
    let mut lines: Vec<&str> = out.lines().collect();
    while let Some(last) = lines.last() {
        if last.trim().is_empty() {
            lines.pop();
        } else {
            break;
        }
    }
    Ok(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 解包 docx，取出 word/document.xml 文本（用于断言真实产物）
    fn read_docx_xml(bytes: &[u8]) -> String {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes.to_vec())).expect("docx 应是合法 zip");
        let mut doc = archive
            .by_name("word/document.xml")
            .expect("应含 word/document.xml");
        let mut xml = String::new();
        doc.read_to_string(&mut xml).expect("读取 document.xml");
        xml
    }

    /// 段内换行计数（docx-rs 序列化为 `<w:br w:type="textWrapping" />`）
    fn count_line_breaks(xml: &str) -> usize {
        xml.matches("<w:br").count()
    }

    /// 段落计数（`<w:p ...>` 或 `<w:p>`；注意排除 `<w:pPr>`）
    fn count_paragraphs(xml: &str) -> usize {
        xml.matches("<w:p ").count() + xml.matches("<w:p>").count()
    }

    /// 提取每个段落拼接后的纯文本（用于断言段落是否各自独立）
    fn extract_paragraph_texts(xml: &str) -> Vec<String> {
        let mut paras: Vec<String> = Vec::new();
        for p in xml.split("<w:p ") {
            let mut text = String::new();
            for m in p.match_indices("<w:t") {
                let rest = &p[m.0..];
                if let Some(start) = rest.find('>') {
                    if let Some(end) = rest[start + 1..].find("</w:t") {
                        // 注意 HTML 实体：&amp; &lt; &gt; &quot; 简单还原
                        let raw = &rest[start + 1..start + 1 + end];
                        text.push_str(&raw.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\""));
                    }
                }
            }
            if !text.trim().is_empty() {
                paras.push(text);
            }
        }
        paras
    }

    #[test]
    fn produces_zip_docx_bytes() {
        let bytes = markdown_to_docx("# 周报\n\n1、完成需求\n2、完成测试\n").unwrap();
        assert!(bytes.starts_with(b"PK\x03\x04"));
        assert!(bytes.len() > 1000);
    }

    /// 回归（2026-09-24 维护者实测「Word 全是 md 语法」）：Markdown 表格必须渲染成真表格，
    /// 不能把 `|---|---|` 和 `| a | b |` 当正文裸放。
    #[test]
    fn renders_md_table_as_docx_table() {
        let md = "# 项目概况\n\n| 项目名称 | 晨曦智能印章项目 |\n| --- | --- |\n| 项目编号 | HT-001 |\n| 当前状态 | 实施中 |\n";
        let xml = read_docx_xml(&markdown_to_docx(md).unwrap());
        assert!(
            xml.contains("<w:tbl") || xml.contains("<w:tblPr") || xml.contains("<w:tblGrid"),
            "Markdown 表格应渲染为 Word 真表格 (w:tbl)，实际无。xml={}",
            &xml[..xml.len().min(300)]
        );
        assert!(
            !xml.contains("|---") && !xml.contains("| ---"),
            "不得出现裸表格分隔符 |---|。xml={}",
            &xml[..xml.len().min(300)]
        );
        // 表格单元文本应在（w:tc 内）
        assert!(xml.contains("HT-001"), "表格单元内容丢失");
    }

    /// 回归（2026-10-08 维护者实测打回）：AI 写表格常省略分隔行 `|---|---|`，
    /// 此时 pulldown-cmark 不认作表格、整表退化成正文 `|    |` 碎片。归一化后应仍渲染为真表格。
    #[test]
    fn renders_table_without_delim_row() {
        let md = "# 项目概况\n\n| 项目名称 | 晨曦智能印章项目 |\n| 项目编号 | HT-001 |\n| 当前状态 | 实施中 |\n";
        let xml = read_docx_xml(&markdown_to_docx(md).unwrap());
        assert!(xml.contains("<w:tbl") || xml.contains("<w:tblGrid"), "无分隔行的表也应在归一化后渲染为 w:tbl。xml={}", &xml[..xml.len().min(300)]);
        assert!(xml.contains("晨曦智能印章项目") && xml.contains("HT-001"), "表格细胞内容应保留");
        assert!(!xml.contains("|---"), "不得残留裸表格分隔符");
    }

    /// 回归（2026-10-08）：各行列数不一致的表（AI 常见）应补齐为一致列数，仍渲染为多列表格。
    #[test]
    fn renders_table_with_mismatched_column_counts() {
        let md = "# 阶段\n\n| 阶段 | 状态 | 偏差 |\n| --- | --- |\n| 需求调研 | 完成 | 按期 |\n| 方案设计 | 进行中 | 滞后期 |\n";
        // 表头/数据3列，分隔行2列 不一致：归一化后应统一为3列并成为合法表
        let normalized = normalize_md_tables(md);
        assert!(normalized.contains("| --- | --- | --- |"), "应补出3列分隔行，实际：{}\n{}", normalized, normalized);
        let xml = read_docx_xml(&markdown_to_docx(md).unwrap());
        assert!(xml.contains("<w:tbl") || xml.contains("<w:tblGrid"), "列数不一致的表规整后应渲染为 w:tbl。xml={}", &xml[..xml.len().min(300)]);
        assert!(xml.contains("方案设计") && xml.contains("滞后期"), "数据单元内容应保留");
    }

    /// 回归（2026-10-08 维护者实测打回）：AI 把基本信息写成多个独立 1 列表格（每个字段一个），
    /// 应被合并成一张 2 列键值表，而不是在正文里散落成多张小表。
    #[test]
    fn merges_per_field_onecol_tables() {
        let md = "# 项目基本信息\n\n| 项目名称 |\n| --- |\n| 晨曦智能印章项目 |\n\n| 项目编号 |\n| --- |\n| HT-001 |\n\n| 客户单位 |\n| --- |\n| 待确认 |\n";
        let normalized = normalize_md_tables(md);
        // 应合并为一张 2 列键值表
        assert!(normalized.contains("| 项 | 内容 |"), "应生成 键值表头，实际：{}\n{}", normalized, normalized);
        assert!(normalized.contains("| 项目名称 | 晨曦智能印章项目 |"), "应把字段合并为行，实际：{}\n{}", normalized, normalized);
        let xml = read_docx_xml(&markdown_to_docx(md).unwrap());
        // 合并后：1 张表，2 行 + 3 行数据
        assert_eq!(xml.matches("<w:tblPr>").count(), 1, "多个 1 列表格应合并成 1 张表");
        assert!(xml.contains("项目名称") && xml.contains("晨曦智能印章项目"), "字段与值应保留");
    }

    // ---- 第四轮：merge_keyvalue_fragments 安全性回归（§一 1~7）----

    /// 1) 连续字段名/值的单列表格应正确合并（字段与值都保留，不只表数量减少）。
    #[test]
    fn merge_kv_consecutive_fields_preserves_all() {
        let md = "| 项目名称 |\n| --- |\n| 晨曦智能印章项目 |\n\n| 项目编号 |\n| --- |\n| HT-001 |\n";
        let n = normalize_md_tables(md);
        assert!(n.contains("| 项 | 内容 |"), "应合并成键值表头：{}\n{}", n, n);
        assert!(n.contains("项目名称") && n.contains("晨曦智能印章项目"), "字段1 与值1 应保留");
        assert!(n.contains("项目编号") && n.contains("HT-001"), "字段2 与值2 应保留");
    }

    /// 2) 正常多列表格不应被修改。
    #[test]
    fn merge_kv_does_not_touch_normal_multicol() {
        let md = "| 阶段 | 状态 | 偏差 |\n| --- | --- | --- |\n| 需求调研 | 完成 | 按期 |\n";
        let n = normalize_md_tables(md);
        assert!(n.contains("| 阶段 | 状态 | 偏差 |"), "正常 3 列表头应原样保留：{}\n{}", n, n);
        assert!(!n.contains("| 项 | 内容 |"), "不应把正常多列表现当作键值碎片");
    }

    /// 3) 两个表格之间存在标题时，不跨标题合并。
    #[test]
    fn merge_kv_does_not_cross_heading() {
        let md = "| 项目名称 |\n| --- |\n| 晨曦智能印章项目 |\n\n## 二、进度\n\n| 项目编号 |\n| --- |\n| HT-001 |\n";
        let n = normalize_md_tables(md);
        assert!(n.contains("## 二、进度"), "标题应保留：{}\n{}", n, n);
        assert!(!n.contains("| 项 | 内容 |"), "隔着标题不得合并：{}\n{}", n, n);
        assert!(n.matches("| --- |").count() >= 2, "两单列表仍各自保留");
    }

    /// 4) 两个表格之间存在正文段落时，不跨段落合并。
    #[test]
    fn merge_kv_does_not_cross_paragraph() {
        let md = "| 项目名称 |\n| --- |\n| 晨曦智能印章项目 |\n\n这里有一段正文说明。\n\n| 项目编号 |\n| --- |\n| HT-001 |\n";
        let n = normalize_md_tables(md);
        assert!(n.contains("这里有一段正文说明。"), "正文段落应保留：{}\n{}", n, n);
        assert!(!n.contains("| 项 | 内容 |"), "隔着正文段落不得合并：{}\n{}", n, n);
    }

    /// 5) 空值 / 缺失值 / 奇数个字段 / 异常行结构不丢数据、不错位。
    #[test]
    fn merge_kv_handles_empty_missing_odd() {
        // 含空值（值行只有一个管道）与奇数个块
        let md = "| 项目名称 |\n| --- |\n| 晨曦智能印章项目 |\n\n| 项目周期 |\n| --- |\n| 待确认 |\n";
        let n = normalize_md_tables(md);
        // 至少两个键值块 -> 合并；值仍在（即使部分为“待确认”也保留）
        assert!(n.contains("项目名称") && n.contains("晨曦智能印章项目"), "含空值/缺失值仍应保留字段与值");
        assert!(n.contains("项目周期") && n.contains("待确认"), "缺失值字段也应保留");
    }

    /// 6) 只有明确符合「表头+分隔行+表值行」的键值碎片才合并；其它 1 列结构（如清单）不合并。
    #[test]
    fn merge_kv_only_merges_clear_kv_pattern() {
        // 单列但不是键值（如一个 1 列表格有多行数据 -> 下层是清单，不是键值）
        let md = "| 步骤 |\n| --- |\n| 第一步 |\n| 第二步 |\n";
        let n = normalize_md_tables(md);
        // 这里的块只有 1 行表头 + 2 行数据，不被当作键值碎片合并（键值块须 1 头 1 值）
        assert!(!n.contains("| 项 | 内容 |"), "多数据行的单列表不应当成键值碎片合并：{}\n{}", n, n);
    }

    /// 7) 合并前后所有字段和值都保留，不能仅以表格数量减少作为成功标准。
    #[test]
    fn merge_kv_preserves_all_text_content() {
        let md = "| 项目名称 |\n| --- |\n| 晨曦智能印章项目 |\n\n| 项目编号 |\n| --- |\n| HT-001 |\n\n| 当前状态 |\n| --- |\n| 实施中 |\n";
        let n = normalize_md_tables(md);
        for s in ["项目名称", "晨曦智能印章项目", "项目编号", "HT-001", "当前状态", "实施中"] {
            assert!(n.contains(s), "字段/值 {} 应在合并后保留：{}\n{}", s, n, n);
        }
        // 且合并成一张键值表
        assert!(n.contains("| 项 | 内容 |"), "应合并为键值表：{}\n{}", n, n);
    }

    /// 2026-09-19 回归：Markdown 软换行必须变成 Word 段内换行，不能塌成一段。
    #[test]
    fn soft_breaks_become_line_breaks_not_spaces() {
        let md = "260914晨曦项目现场工作情况：\n1、继续开发合同起草接口\n2、测试已开发功能\n下个工作日计划：\n1、合同起草接口文档整理\n";
        let xml = read_docx_xml(&markdown_to_docx(md).unwrap());

        let br_count = count_line_breaks(&xml);
        assert!(
            br_count >= 4,
            "应有至少 4 个段内换行（<w:br/>），实际 {}. xml={}",
            br_count,
            xml
        );

        assert!(
            !xml.contains("工作情况： 1、继续"),
            "软换行被错误地变成空格，内容塌成一段。xml={}",
            xml
        );

        for line in [
            "260914晨曦项目现场工作情况：",
            "1、继续开发合同起草接口",
            "2、测试已开发功能",
            "下个工作日计划：",
            "1、合同起草接口文档整理",
        ] {
            assert!(xml.contains(line), "缺少行内容：{}", line);
        }
    }

    /// 空行分隔的段落仍应是独立 <w:p>（不被误合并）
    #[test]
    fn blank_line_separates_paragraphs() {
        let xml = read_docx_xml(&markdown_to_docx("第一段\n\n第二段\n").unwrap());
        assert!(
            count_paragraphs(&xml) >= 2,
            "应有至少 2 个段落。xml={}",
            xml
        );
    }

    /// 回归（2026-09-30 维护者实测打回）：每一段必须是**独立内容**，不能是前文累加的超集。
    /// 此前 flush_paragraph 落盘后不清空 cur，导致第 N 段 = 前 N 段内容之和，
    /// 标题反复出现、正文逐段重复。
    #[test]
    fn each_paragraph_is_isolated_not_cumulative() {
        let md = "# 晨曦项目实施情况报告\n\n汇报日期：2026-09-30\n\n## 一、报告摘要\n项目当前处于开发上线阶段。\n\n## 二、项目总体评价\n- 项目状态：关注\n";
        let xml = read_docx_xml(&markdown_to_docx(md).unwrap());
        let paras = extract_paragraph_texts(&xml);
        // 段落应逐段递增出现新内容，而非整段重复前文
        assert!(paras[0].contains("晨曦项目实施情况报告"), "段0应有标题");
        assert!(!paras[0].contains("汇报日期"), "段0不得含后文");
        assert!(paras[1].contains("汇报日期"), "段1应有汇报日期");
        assert!(!paras[1].contains("报告摘要"), "段1不得含后文标题");
        assert!(paras[2].contains("报告摘要"), "段2应含摘要标题");
        assert!(!paras[2].contains("项目总体评价"), "段2不得含后文标题");
        // 关键：任意一段都不应重复出现前文开头（标题只出现一次）
        let title_count = paras.iter().filter(|p| p.contains("晨曦项目实施情况报告")).count();
        assert!(title_count <= 1, "标题应在整个文档只出现一次，实际 {}", title_count);
    }

    #[test]
    fn parses_docx_xml_text() {
        let xml = r#"<w:document><w:body><w:p><w:r><w:t>第一段</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p></w:body></w:document>"#;
        let md = parse_document_xml(xml).unwrap();
        assert!(md.contains("第一段"));
        assert!(md.contains("第二段"));
    }

    /// 手动样张：含表格的报告 → docx
    #[test]
    #[ignore]
    fn dump_sample_docx() {
        let md = "# 晨曦智能印章项目·实施情况汇报\n\n## 一、项目概况\n\n| 项目名称 | 晨曦智能印章项目 |\n| --- | --- |\n| 项目编号 | HT-001 |\n| 当前状态 | 实施中（EXECUTING） |\n| 优先级 | 普通（NORMAL） |\n\n## 二、总体实施进展\n\n任务总数：70\n已完成任务：24（完成率 34%）\n逾期任务：2\n\n## 三、阶段里程碑\n\n| 阶段 | 状态 | 进度 |\n| --- | --- | --- |\n| 项目启动与准备 | 已完成 | 100% |\n| 方案设计 | 进行中 | 78% |\n| 开发上线 | 进行中 | 2% |\n";
        let bytes = markdown_to_docx(md).unwrap();
        let out = std::env::temp_dir().join("晨曦项目汇报-样张.docx");
        std::fs::write(&out, &bytes).unwrap();
        println!("DOCX 样张：{}（{} 字节）", out.display(), bytes.len());
    }


    /// 模板样张：按内置模板结构填充数据的干净汇报（用户对照基准）
    #[test]
    #[ignore]
    fn dump_template_docx() {
        let md = "# 晨曦智能印章项目实施情况汇报\n\n汇报日期：2026-09-29\n\n## 一、项目概况\n\n- 项目编号：HT-001\n- 当前状态：执行中（EXECUTING）\n- 客户单位：暂未登记\n- 项目负责人：暂未登记\n- 计划起止：2026-07-13 ~ 2026-12-31\n\n## 二、总体实施进展\n\n任务总数：70 项；已完成 24 项（完成率 34.3%）。\n\n按任务状态统计：\n\n| 状态 | 数量 | 占比 |\n| --- | --- | --- |\n| 已完成 | 24 | 34.3% |\n| 进行中 | 6 | 8.6% |\n| 待办 | 50 | 57.1% |\n| 逾期 | 0 | 0% |\n\n## 三、阶段里程碑执行情况\n\n| 阶段 | 状态 | 进度 | 时间 |\n| --- | --- | --- | --- |\n| 项目启动与准备 | 已完成 | 100% | 2026-07-13 ~ 2026-07-30 |\n| 需求调研 | 已完成 | 100% | 2026-07-13 ~ 2026-07-30 |\n| 方案设计 | 进行中 | 78% | 2026-07-20 ~ 2026-08-08 |\n| 开发上线 | 进行中 | 2% | 2026-08-07 ~ 2026-10-30 |\n\n## 四、风险情况\n\n- 方案设计超期：存在交付顺延风险，需关注排期并协调资源。\n\n## 五、问题与待办\n\n- 无未解决问题\n\n## 六、下一步计划\n\n- 推动开发上线里程碑按计划执行\n- 跟进方案设计收尾与评审\n";
        let bytes = markdown_to_docx(md).unwrap();
        let out = std::env::temp_dir().join("晨曦项目汇报-模板样张.docx");
        std::fs::write(&out, &bytes).unwrap();
        println!("模板样张：{}（{} 字节）", out.display(), bytes.len());
    }

}
