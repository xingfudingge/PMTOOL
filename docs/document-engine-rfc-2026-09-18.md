# PMTool Document Engine V1 实施方案（RFC）

- 版本：1.0 · 2026-09-18
- 依据：《PMTool Document Engine 开发设计稿 V1.0》+ 现状代码盘点
- 目标读者：维护者（产品决策）· 实现者（Rust/React）
- 定位：**实施方案（RFC）**，用于评审后动手，本稿不写代码。

---

## 0. 结论先行

设计稿的分层重心（§32/§33/§41 —— 业务模块 → Document Service → Document Engine → Format Engine，统一文档能力、禁止各自为政）**方向正确、值得采纳**。

但设计稿有两处前提与本项目现状不符，**必须先修正再落地**：

1. **「AI 中台」前提已经失效。**
   `database/migrations/0017_drop_ai.sql`（2026-09-11）明确写入：*“PMTool 不再需要 AI”*，并已删除 `ai_messages / ai_sessions / ai_models` 等 AI 表，前端 AI 工作台/设置 AI 配置/报告 AI 占位页也已删除。
   因此设计稿 §21/§22/§42 的“AI 生成周报 / AI 生成 PPT”**不在 V1 范围**。Document Engine 作为**独立文档基础设施**，服务现有模块（知识中心 / 报告中心 / 模板中心 / 文件），既不依赖也不反向依赖 AI 中台。若未来重启 AI，AI 只作为 Document Service 的**调用方**，不承担格式实现。

2. **「服务器 / 多端并发」模型与当前桌面形态不符。**
   PMTOOL 是 **Tauri 单用户桌面应用**：无 HTTP 服务端、无多客户端，`invoke()` 直连 Rust，`AppState.db` 为单连接 `Mutex<Connection>`。
   设计稿 §29 的“客户端 version=5 / 服务器 version=6 → 拒绝覆盖”是 **Web 多端乐观锁**，桌面不存在。桌面唯一的“并发”是“后台生成任务 vs 用户当前编辑同一文档”（本机内）。用 **版本号 + 生成默认建新版** 即可防覆盖，不必照搬 server 锁。

**V1 落地最小闭环**：`统一 Document Model + Document Service + 版本表 + Markdown↔RichText 适配 + Markdown/DOCX 导出`，**先打通「报告中心 Markdown → DOCX 导出」这个最实在的缺口**。

---

## 1. 现状盘点（引用真实代码）

| 模块 | 现状 | 缺口 |
|---|---|---|
| 知识中心 | `components/DocumentEditor/index.tsx` + `useBlockNoteSetup.ts`（BlockNote 0.54）已可用，`blocksToMarkdownString` 已具备 Markdown 转换 | `knowledge_notes.content` 直接存 `BLOCKNOTE_JSON`（`repositories/knowledge_notes.rs`），**绑定 BlockNote 数据结构** |
| 报告中心 | `reports` 表：`content = 完整 Markdown`（`repositories/reports.rs`），`commands/reports.rs` 仅 CRUD | **无任何 DOCX 导出**——这是最实的空白 |
| 模板中心 | `TemplatesPage` + `FileTree`，仅绑定全局模板目录（`template_directory`） | 无格式解析 / 结构分析 |
| 文件 | `FilePreview` 预览栈已全覆盖（`DocxPreview/PptxPreview/XlsxPreview/PdfPreview`，依赖 `docx-preview/pptxjs/pdfjs-dist/xlsx`）；`file_storage.rs` + `file_storage_local.rs`（`PMToolData/{owner}/{id}/files/`，含 `safe_relative` 路径防护、`unique_filename` UUID、SHA-256） | 无“统一文档层”，各模块直接操文件 |
| AI 中台 | 已于 `0017_drop_ai.sql` 删除 | —（本轮不建） |

**结论**：V1 不重造预览栈（已齐全），重点在**统一模型层**与**生成/导出链路**。

---

## 2. 目标与范围（V1）

**目标**：所有文档相关能力（创建 / 编辑 / 读取 / 转换 / 导出 / 存储）统一经 Document Service → Document Engine；业务模块不再直接依赖 `python-docx`、`xlsx`、`pptxjs` 等具体格式库。

**V1 支持矩阵**（只做设计稿 §24「查看/生成 ≠ 编辑」+ §16 最低矩阵）：

| 类型 | V1 能力 |
|---|---|
| text | 可编辑（沿用 `TxtEditor`） |
| markdown | 可编辑 / 预览（沿用 `MarkdownEditor`） |
| richtext | 可编辑（BlockNote 经 adapter） |
| docx | **生成**（markdown/richtext → docx）+ **预览**（沿用 `DocxPreview`）+ 只读导入解析 |
| xlsx / pptx / pdf | 预览（沿用现有），**原生生成推迟到有消费方时** |

**明确不做（V1 / 推迟）**：PPTX/PDF 原生生成引擎、docx/pptx/xlsx 在线编辑、`document_job` 落库任务队列、云端多端并发锁、AI 生成。

---

## 3. 依赖方向规则（写进规范，源自 §41）

```
业务模块 ──┐
AI(未来) ──┤
模板中心 ──┤
           ▼
   Document Service
           ▼
   Document Engine
           ▼
   Format Engine (docx / …)
```

- 业务模块 / AI 只能调 `Document Service`，不得自实现格式转换 / Office 生成 / Markdown 转换。
- Document Engine **不得反向依赖** AI 中台或任何业务模块。
- 即使未来引入 AI，也只作为调用方，不承担格式实现。

---

## 4. 模块结构（Rust 后端）

```
app/src-tauri/src/
├── document/                     # 新增模块（services 平级）
│   ├── mod.rs                    # 模块入口 + 错误类型
│   ├── model.rs                  # PmDocument 统一模型（见 §6）
│   ├── service.rs                # DocumentService：create/get/update/list/export/import/convert
│   ├── storage.rs                # 文件落盘（复用 file_storage / PMToolData 安全路径）
│   ├── version.rs                # 版本管理（current_version + 生成默认建新版）
│   ├── adapter/
│   │   ├── richtext.rs           # BlockNote JSON ⇄ PmDocument RichText
│   │   └── markdown.rs           # Markdown ⇄ PmDocument
│   └── engine/
│       ├── docx.rs               # PmDocument → .docx（生成）
│       └── markdown.rs           # Markdown → docx（markdown AST 组装）
└── commands/document.rs          # Tauri 命令注册（见 §7）
```

`repositories/document.rs` + `repositories/document_versions.rs` 负责 DB 访问；`document/service.rs` 编排（命令层只做参数校验，业务在 service，沿用现有分层）。

**crate 选择**：`docx-rs`（纯 Rust，无 Office 依赖，生成+解析）+ `pulldown-cmark`（Markdown AST）。**不引入** python-docx / LibreOffice CLI / Microsoft Office 运行依赖。

---

## 5. 数据模型（DB）

新 migration **`0019_document_engine.sql`**（下一序号，沿用 drizzle 多文件格式 + `--> statement-breakpoint`）。`database/schema.sql` 同步维护（权威 schema；`drizzle-kit` 生成 `app/src/database/schema.ts`；测试夹具读 schema.sql）。

```sql
-- 文档元数据（一条 = 一个逻辑文档）
CREATE TABLE IF NOT EXISTS documents (
    id               INTEGER PRIMARY KEY,
    doc_id           TEXT NOT NULL UNIQUE,          -- 'doc_xxxx'（业务弱引用用）
    type             TEXT NOT NULL,                 -- TEXT/MARKDOWN/RICHTEXT/DOCX
    title            TEXT NOT NULL,
    space_type       TEXT,                          -- 关联业务域：KNOWLEDGE/REPORT/PROJECT_FILE/TEMPLATE（可空 = 独立文档）
    ref_id           INTEGER,                       -- 对应业务实体 id
    current_version  INTEGER NOT NULL DEFAULT 1,
    storage_path     TEXT,                          -- 相对 PMToolData/doc/{doc_id}/ 的导出/产物路径
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_doc_space ON documents(space_type, ref_id);

-- 文档版本（一个文档多版本，生成默认建新版，不覆盖）
CREATE TABLE IF NOT EXISTS document_versions (
    id           INTEGER PRIMARY KEY,
    document_id  INTEGER NOT NULL,
    version      INTEGER NOT NULL,
    content      TEXT,                              -- 序列化内容（见 §6 DocContent）
    content_type TEXT NOT NULL,                     -- TEXT/MARKDOWN/BLOCKNOTE_JSON/PROTO
    content_md   TEXT,                              -- Markdown 快照（搜索用）
    created_by   TEXT NOT NULL DEFAULT 'USER',      -- USER/AI/AUTO
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    UNIQUE(document_id, version)
);

-- document_jobs：V1 不建。生成类长任务走后台线程 + tauri event 进度，不落库。
```

产物文件落 `PMToolData/doc/{doc_id}/{source,export,preview}/`，复用 `file_storage.safe_relative` / `unique_filename` / `infer_mime_type`（`services/file_storage.rs`）。**API/命令改动必须重启 tauri dev 生效**（FACT 记忆），迁移在 `db::init` 启动时执行。

---

## 6. Document Model（统一内部结构）

**目标**：业务模块面向 `PmDocument`，不面向 BlockNote JSON 或格式库。未来换编辑器 / 换格式库，上层不重构。

```rust
enum DocType { Text, Markdown, RichText, Docx }        // V1 四类；pptx/xlsx/pdf 后续

struct PmDocument {
    doc_id: String,        // 'doc_xxx'
    doc_type: DocType,
    version: u32,          // 当前版本号
    title: String,
    content: DocContent,
    created_at: String,
    updated_at: String,
}

enum DocContent {
    Text(String),                      // 纯文本
    Markdown(String),                  // Markdown 源
    RichText(Vec<RichBlock>),          // 内部稳定结构（非 BlockNote 直存）
    DocxFile(String),                  // 引 storage_path 的 .docx 产物
}

// RichBlock：字段级稳定元素，BlockNote 经 adapter 映射（blockTypes / styles / inline marks）
enum RichBlock { Heading{level,text}, Para{text}, List{ordered, items}, Code{lang,text}, Quote{text}, Table{header,rows}, Link{text,href}, Image{src,alt} }
```

**共享 RichText 文档型**：知识中心 `content` 仍兼容存量 `BLOCKNOTE_JSON`（M4 用 adapter 向后兼容迁移），但**新写入统一走 `PmDocument RichText`**，逐步解耦。

---

## 7. DocumentService 命令面

`commands/document.rs`，`invoke` 前端封装在 `app/src/services/document.ts`。命名 camelCase：

| 命令 | 说明 |
|---|---|
| `document.create({type,title,spaceType,refId,content})` | 新建文档 → 返回 `{docId}` |
| `document.get({docId})` | 取 `PmDocument` |
| `document.update({docId, baseVersion, content, createNewVersion})` | 保存；`baseVersion != current` 返回 `conflict`；`createNewVersion=true` 时**默认建新版**（防生成覆盖用户编辑） |
| `document.list({spaceType,refId})` | 列元信息 |
| `document.export({docId, format})` | 落盘 `.docx`/`.md` 产物 → `{path,fileName}`（可 `reveal`） |
| `document.import({filePath, type})` | docx 只读解析 → richtext/markdown |
| `document.convert({docId, to})` | richtext↔markdown 转换 |
| `document.versionList({docId})` | 版本列表 |

**异步生成**：`document.generate` 在后台线程执行 docx 生成，通过 `tauri event` 推送进度（`正在生成… / 完成 / 失败`），**不阻塞 UI**（对应设计稿 §32 的核心诉求）。V1 只支持 markdown→docx 与 richtext→docx。

---

## 8. 前端结构

```
app/src/
├── components/DocumentEditor/        # 已有：BlockNote 编辑器（保留）
├── components/DocumentEngine/        # 新增
│   ├── RichTextAdapter.ts            # BlockNote ⇄ PmDocument RichText（复用 useBlockNoteSetup / blocksToMarkdownString）
│   ├── MarkdownAdapter.ts
│   ├── DocumentExport.tsx            # 导出按钮 → invoke document.export + reveal
│   └── DocumentPreview.tsx           # 按 DocType 分发到 FilePreview 子组件（复用现有预览栈）
└── services/document.ts              # invoke 封装
```

**复用而非重造**：`FilePreview`（docx/pptx/xlsx/pdf 预览）、`file_storage`（安全落盘）、`DocumentEditor`（BlockNote 编辑）、`blocksToMarkdownString`（Markdown 转换）全部沿用。

---

## 9. 里程碑（每阶段可独立验证）

- **M1 · 数据 + 模型**：`0019_document_engine.sql` + `model.rs` + `repositories/document*.rs`。验证：`cargo test` 新增迁移/仓储测试，`app/src/database/schema.ts` 与测试夹具 `EXPECTED_TABLES` 同步补 `documents / document_versions`。
- **M2 · Markdown → DOCX 导出（第一个闭环）**：`engine/markdown.rs` + `engine/docx.rs` + `document.export`。前端报告中心加“导出 Word”按钮 → 落盘 → `reveal`。
- **M3 · 版本 + 全接口**：version 管理、`get/update/list/versionList`、conflict 判定（防生成覆盖用户编辑）。
- **M4 · RichText 适配 + 转换**：BlockNote ⇄ PmDocument；`DocumentEditor` 改走 adapter；`richtext↔markdown` convert。
- **M5 · docx 只读导入**：解析 docx → markdown/richtext，接 `FilePreview`。

**M2 即交付用户可见价值**；M4-M5 解耦 BlockNote 结构为后续铺路。**推迟**：模板结构分析、PPTX/PDF 原生生成、AI 生成。

---

## 10. 验证方式

- Rust：`cargo test`（新增：markdown→docx 字节断言、version conflict 判定、adapter 往返）；`cargo check` 需先 `vite build`（`generate_context!` 依赖 `dist`）。
- 前端：`pnpm build`（tsc && vite build）+ `vitest run`。
- 真实验证：报告中心选一份 Markdown 报告 → 导出 docx → 用 `docx-preview` / Office 打开，确认标题/段落/表格/列表/代码块一致。

---

## 11. Rust 依赖新增

`app/src-tauri/Cargo.toml` 增：`docx-rs`、`pulldown-cmark`。走 Cargo 更新锁文件。**前端不新增依赖**（docx 生成在 Rust 侧；`docx-preview`/`pdfjs-dist`/`xlsx` 等已有库用于预览，保留）。不引入 Office / LibreOffice / python 依赖。

---

## 12. 关键风险与对策

| 风险 | 对策 |
|---|---|
| PPTX/PDF 原生生成无 Office 下成本高 | V1 明确不做，标注推迟；PDF 沿用 `pdfjs-dist` 只看不生成 |
| BlockNote 结构耦合 | M4 抽 `PmDocument RichText`，DocumentEditor 改走 adapter；存量 `BLOCKNOTE_JSON` 兼容读取 |
| migration 与 schema.sql 双处同步 | 沿用现有约定：schema.sql 权威，drizzle 生成 schema.ts，测试夹具读 schema.sql |
| 业务模块仍绕开 Document 层 | §3 依赖规则写入开发规范；评审以“是否经 Document Service”为红线 |

---

## 13. 与设计稿差异汇总（采纳 / 修正 / 推迟）

| 设计稿说法 | 本 RFC |
|---|---|
| §3-4 统一 Document Type / Document Model | ✅ 采纳（PmDocument） |
| §32/§33/§41 分层与依赖方向 | ✅ 采纳（§3 写规范） |
| §24 查看/生成 ≠ 编辑 | ✅ 采纳（V1 范围依据） |
| §§21/22/42 AI 中台生成 Word/PPT | ⚠️ **修正**：AI 已于 2026-09-11 删除，场景移出 V1 |
| §29 客户端/服务器乐观锁 | ⚠️ **修正**：桌面无 server，改“版本号 + 生成建新版” |
| §16 全格式互转矩阵 | 🔻 **推迟**：V1 只做 markdown/richtext→docx |
| §30/§31 document_job 任务队列 | 🔻 **推迟**：后台线程 + event 进度，不落库 |
| §16 pptx/xlsx/pdf 生成 | 🔻 **推迟**：预览复用现有栈，生成待有消费方 |