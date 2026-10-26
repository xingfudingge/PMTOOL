# ⛔ 旧 License Generator 已停用（DEPRECATED）

> 2026-10-26 · 授权模型切换到「授权平台（LicensePlatform）签发」

## 结论

- **本目录旧生成器已停用**：不要再发版、不要再用它签任何授权码。
- 已删除对应的 GitHub 发布流水线：`license-macos.yml`、`license-windows.yml`。
- 历史授权台账已导入授权平台；旧 `PMT1` 码全部作废，按 `README.md` 的「授权与打包」章节重新签发。

## 为什么停用

旧生成器的签名私钥来自**编译期 secret 注入**（`build.rs` 把环境变量内容写进
`OUT_DIR`，再被 `include_bytes!` 编进安装包）。这带来两个不可接受的问题：

1. 私钥随发布产物分发，生成器一旦被逆向，全产品线授权失守；
2. 私钥只存在于 GitHub Secret（写后不可读），本地无副本，历史码无法续签。

新模型下：

- 私钥只存在**授权平台所在本机**（加密 SQLite，主口令保护），永不进 CI、永不进安装包；
- 仓库只提交**公钥清单** `app/src-tauri/keys/product_keys.json`（kid + public hex）；
- GitHub 打包**零 secret**，编译期读取公钥即可。

## 保留本目录的理由

仅作历史代码/审计参考，不再构建发布。若确认无人依赖，可另开卡整体删除。

## 运维待办

- 仓库管理员需在 GitHub 仓库 Settings → Secrets 中手动删除旧生成器的私钥 Secret
  （API 只写不可读，工具无权代删）。
