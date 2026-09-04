
/**
 * 剪贴板写入命令
 *
 * Tauri WebView 中 navigator.clipboard 可能因权限/上下文被拒，
 * 这里通过 Rust 直接写入系统剪贴板，保证「复制设备唯一值」可靠。
 */

#[tauri::command]
pub fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("初始化剪贴板失败：{}", e))?;
    clipboard
        .set_text(text)
        .map_err(|e| format!("写入剪贴板失败：{}", e))?;
    Ok(())
}
