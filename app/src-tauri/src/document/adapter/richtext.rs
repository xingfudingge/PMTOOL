/**
 * PMTool · Document Engine RichText 适配器（2026-09-18）
 *
 * 内部 RichBlock（model.rs）⇄ Markdown。
 * 说明：M4 再补 BlockNote ⇄ RichBlock 双向适配；当前先提供 RichBlock → Markdown（导出用）。
 */

use crate::document::model::RichBlock;

/// RichBlock 列表 → Markdown 字符串
pub fn richtext_to_markdown(blocks: &[RichBlock]) -> String {
    let mut out = String::new();
    for block in blocks {
        match block {
            RichBlock::Heading { level, text } => {
                let level = (*level).clamp(1, 6) as usize;
                out.push_str(&"#".repeat(level));
                out.push(' ');
                out.push_str(text);
            }
            RichBlock::Para { text } => out.push_str(text),
            RichBlock::List { ordered, items } => {
                for (i, item) in items.iter().enumerate() {
                    if *ordered {
                        out.push_str(&format!("{}. {}", i + 1, item));
                    } else {
                        out.push_str("- ");
                        out.push_str(item);
                    }
                    out.push('\n');
                }
            }
            RichBlock::Code { lang, text } => {
                out.push_str("```");
                if let Some(l) = lang {
                    out.push_str(l);
                }
                out.push('\n');
                out.push_str(text);
                out.push('\n');
                out.push_str("```");
            }
            RichBlock::Quote { text } => {
                for line in text.lines() {
                    out.push_str("> ");
                    out.push_str(line);
                    out.push('\n');
                }
            }
            RichBlock::Table { header, rows } => {
                out.push('|');
                for h in header {
                    out.push(' ');
                    out.push_str(h);
                    out.push_str(" |");
                }
                out.push_str("\n| ");
                for _ in header {
                    out.push_str("--- | ");
                }
                out.push('\n');
                for row in rows {
                    out.push('|');
                    for cell in row {
                        out.push(' ');
                        out.push_str(cell);
                        out.push_str(" |");
                    }
                    out.push('\n');
                }
            }
            RichBlock::Link { text, href } => {
                out.push('[');
                out.push_str(text);
                out.push_str("](");
                out.push_str(href);
                out.push(')');
            }
            RichBlock::Image { src, alt } => {
                out.push_str("![");
                out.push_str(alt.as_deref().unwrap_or(""));
                out.push_str("](");
                out.push_str(src);
                out.push(')');
            }
        }
        out.push_str("\n\n");
    }
    normalize(&out)
}

/// Markdown 字符串 → RichBlock 列表（朴素行解析 · V1）
/// 识别：标题、无序/有序列表（相邻行合并成一项）、引用、代码围栏、表格、其余段落。
pub fn markdown_to_richtext(md: &str) -> Vec<RichBlock> {
    let mut blocks: Vec<RichBlock> = Vec::new();
    let mut lines = md.lines().peekable();

    while let Some(line) = lines.next() {
        let trimmed = line.trim_end();
        let t = trimmed.trim_start();

        if t.is_empty() {
            continue;
        }
        // 代码围栏
        if t.starts_with("```") {
            let lang = t.trim_start_matches('`').trim().to_string();
            let mut code = String::new();
            let mut closed = false;
            while let Some(l) = lines.next() {
                if l.trim_start().starts_with("```") {
                    closed = true;
                    break;
                }
                code.push_str(l);
                code.push('\n');
            }
            let _ = closed;
            blocks.push(RichBlock::Code {
                lang: if lang.is_empty() { None } else { Some(lang) },
                text: code.trim_end().to_string(),
            });
            continue;
        }
        // 标题
        if let Some(h) = heading_of(t) {
            blocks.push(RichBlock::Heading { level: h.0, text: h.1 });
            continue;
        }
        // 无序列表（相邻 - 行合并）
        if t.starts_with("- ") || t.starts_with("* ") {
            let mut items = vec![t.trim_start_matches(['-', '*']).trim().to_string()];
            while let Some(n) = lines.peek() {
                let nt = n.trim_start();
                if nt.starts_with("- ") || nt.starts_with("* ") {
                    items.push(nt.trim_start_matches(['-', '*']).trim().to_string());
                    lines.next();
                } else {
                    break;
                }
            }
            blocks.push(RichBlock::List { ordered: false, items });
            continue;
        }
        // 有序列表（相邻 "1. x" 行合并）
        if let Some(prefix) = ordered_item_prefix(t) {
            let mut items = vec![t[prefix + 2..].trim().to_string()];
            while let Some(n) = lines.peek() {
                if let Some(p) = ordered_item_prefix(n.trim_start()) {
                    items.push(n.trim_start()[p + 2..].trim().to_string());
                    lines.next();
                } else {
                    break;
                }
            }
            blocks.push(RichBlock::List { ordered: true, items });
            continue;
        }
        // 引用
        if t.starts_with('>') {
            let mut quote = String::new();
            quote.push_str(t.trim_start_matches('>').trim());
            while let Some(n) = lines.peek() {
                let nt = n.trim_start();
                if nt.starts_with('>') {
                    quote.push('\n');
                    quote.push_str(nt.trim_start_matches('>').trim());
                    lines.next();
                } else {
                    break;
                }
            }
            blocks.push(RichBlock::Quote { text: quote });
            continue;
        }
        // 表格
        if t.starts_with('|') && t.contains('|') {
            let mut rows: Vec<Vec<String>> = Vec::new();
            // 当前行是表头
            let header = split_table_row(t);
            // 下一行若是分隔行（| --- |）则跳过
            if let Some(n) = lines.peek() {
                if is_separator_row(n) {
                    lines.next();
                }
            }
            let mut done = false;
            while !done {
                if let Some(n) = lines.peek() {
                    let nt = n.trim_start();
                    if nt.starts_with('|') {
                        rows.push(split_table_row(nt));
                        lines.next();
                    } else {
                        done = true;
                    }
                } else {
                    done = true;
                }
            }
            blocks.push(RichBlock::Table { header, rows });
            continue;
        }
        // 段落
        blocks.push(RichBlock::Para { text: t.to_string() });
    }
    blocks
}

fn heading_of(t: &str) -> Option<(u8, String)> {
    let hashes = t.chars().take_while(|c| *c == '#').count();
    if hashes >= 1 && hashes <= 6 && t.chars().nth(hashes) == Some(' ') {
        Some((hashes as u8, t[hashes + 1..].trim().to_string()))
    } else {
        None
    }
}

fn ordered_item_prefix(t: &str) -> Option<usize> {
    let bytes = t.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i > 0 && i + 1 < bytes.len() && bytes[i] == b'.' && bytes[i + 1] == b' ' {
        Some(i)
    } else {
        None
    }
}

fn split_table_row(line: &str) -> Vec<String> {
    line.trim_start_matches('|')
        .trim_end_matches('|')
        .split('|')
        .map(|c| c.trim().to_string())
        .collect()
}

fn is_separator_row(line: &str) -> bool {
    let t = line.trim_start();
    if !t.starts_with('|') {
        return false;
    }
    t.split('|').all(|cell| {
        let c = cell.trim();
        c.is_empty() || c.chars().all(|ch| ch == '-' || ch == ':' || ch == ' ')
    })
}

/// 清理多余空行（避免出现连续 3 个以上换行）
fn normalize(s: &str) -> String {
    let mut lines: Vec<&str> = s.lines().collect();
    // 去尾部空行
    while let Some(last) = lines.last() {
        if last.trim().is_empty() {
            lines.pop();
        } else {
            break;
        }
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heading_and_para() {
        let blocks = vec![
            RichBlock::Heading { level: 1, text: "标题".into() },
            RichBlock::Para { text: "正文".into() },
        ];
        let md = richtext_to_markdown(&blocks);
        assert!(md.starts_with("# 标题\n\n正文"));
    }

    #[test]
    fn ordered_and_unordered_list() {
        let blocks = vec![
            RichBlock::List { ordered: true, items: vec!["a".into(), "b".into()] },
            RichBlock::List { ordered: false, items: vec!["x".into()] },
        ];
        let md = richtext_to_markdown(&blocks);
        assert!(md.contains("1. a\n2. b"));
        assert!(md.contains("- x"));
    }
}