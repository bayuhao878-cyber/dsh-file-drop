# dsh-file-drop

**DSH (DeepSeek Harness) 会话框文件拖放插件（静态版）**

将文件直接拖入 DSH Web 聊天会话框即可使用：
- **图片**（png / jpg / gif / webp 等）→ 直接作为图片附件发送；
- **其他格式**（Word / PPT / PDF / Excel / 文本等）→ 自动保存到本地磁盘，并把文件绝对路径插入聊天输入框，发送后 AI 即可直接读取并处理该文件。

解决了聊天输入框无法直接上传文档格式（docx / pptx / xlsx / pdf 等）的问题。

---

## 功能特性

| 特性 | 说明 |
| --- | --- |
| 🖱️ 全会话框拖放 | 在浏览器 `document` 级监听拖放，整个会话框任意位置均可拖入 |
| 🖼️ 图片直发 | 图片格式完全放行给产品原生附件机制，直接作为附件发送 |
| 📄 其他格式转路径 | Word/PPT/PDF/Excel 等非图片格式自动保存并转换为文件路径 |
| ✍️ 路径自动插入 | 转换后的路径自动写入聊天输入框，无需手动复制粘贴 |
| 🎭 无可见 UI | 界面保持干净，没有任何提示条、按钮或遮挡 |
| 📦 多文件支持 | 一次可拖入多个文件，逐一会转换 |
| ♻️ 全局单实例 | 静态宿主插件：ID 固定、无序号、无需批准、重启自动加载 |

---

## 工作原理

```
┌─────────────────────┐        ┌──────────────────────────────┐
│     浏览器客户端      │        │          DSH 宿主端           │
│                     │  fetch │                              │
│ 拖入文件 ──► FileReader │ ──────► │ webServer 路由              │
│ 转 base64           │  POST  │ /dsh-file-drop/save         │
│                     │        │ 解码 base64 写入磁盘          │
│ 返回绝对路径          │ ◄────── │ 返回 { ok, path }            │
│ 插入输入框 ──► 发送    │        │                              │
└─────────────────────┘        └──────────────────────────────┘
```

**技术要点**

- **静态插件（非动态插件）**：以 npm 包形式安装到 `profiles/node_modules`，在宿主组合 `cordis.patch.yml` 挂载一行。因此：
  - **全局只有一个实例**，不会为每个会话各建一个；
  - **ID 固定为 `dsh-file-drop`**，无 `drop-N` 序号；
  - **无需批准**（静态插件是组合的一部分，不走动态插件授权流程）；
  - **重启自动加载**，不依赖任何引导逻辑。
- **host 半部分**（`lib/index.js`）：注册 webServer 路由 `POST /dsh-file-drop/save`，用 Node 原生 `fs` 解码 base64 写盘（不再需要 PowerShell）。
- **client 半部分**（`lib/client.js`）：手写 `window.__ModuleLoader__.load({ id, factory })` 格式 bundle，由 clientModules 直接 serve（无需构建工具）。在 `document` 上以 **capture 阶段**监听 `drop`，先于产品原生 InputBar（bubble 阶段）执行：
  - 全部为图片 → 放行，交给原生逻辑作为附件；
  - 含非图片 → `preventDefault()` + `stopPropagation()` 拦截，用 `fetch` 调宿主路由保存，路径插入输入框。
- 隐形 `conversation.input.dock` 组件（渲染 `null`）仅用于获取产品标准的 `inputActions.setDraft` 接口，把路径写入输入框，不产生任何可见 UI。
- 单文件上限约 37MB。

---

## 安装与使用

### 安装（一次性）

1. 将 `dsh-file-drop` 包复制到 DSH profile 的 node_modules 下：
   ```
   %USERPROFILE%\.dsh\profiles\node_modules\dsh-file-drop\
   ```
   （包含 `package.json`、`lib/index.js`、`lib/client.js`）
2. 编辑 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`，加入：
   ```yaml
   - insert:
       - id: dsh-file-drop
         name: 'dsh-file-drop'
   ```
3. 重启 DSH（`dsh --profile web`）。

> 包声明了 `dsh.client`（platform: web），clientModules 启动时会自动扫描并 serve `/plugins/dsh-file-drop/client.js`，无需额外配置。

### 使用

1. 插件激活后，**无需任何操作**，直接拖一个文件到会话框任意位置；
2. 图片 → 自动作为附件出现在输入区，可正常发送；
3. Word/PPT/PDF/Excel 等 → 文件保存到 `%USERPROFILE%\.dsh-uploads\`，路径自动插入输入框；
4. 按回车发送，AI 即可读取该路径下的文件内容并处理。

> 文件保存目录由 host 半部分按 `sandboxPolicy.workspaceRoot` 决定（通常是用户主目录），可在 `lib/index.js` 中修改。

---

## 文件结构

```
dsh-file-drop/
├── package.json      # 包声明（main + exports["./client"] + dsh.client）
├── lib/
│   ├── index.js      # host 半部分：webServer 路由，base64 写盘
│   └── client.js     # client bundle：拖放监听 + 隐形 dock + fetch 上传
└── README.md         # 本说明
```

---

## 常见问题

**Q: 拖入文件后输入框没有出现路径？**
A: 检查浏览器控制台是否有 `[file-drop] 转换失败` 的报错；确认 host 路由注册成功（重启后 DSH 日志应有 `route /dsh-file-drop/save registered`）。

**Q: 为什么不用动态插件了？**
A: 动态插件是会话级、进程内存的，重启即失，且 ID 强制带序号（drop-N）。静态插件全局单实例、ID 固定、无需批准、重启自动加载，是"重启后自动开启"的彻底方案。

**Q: 大文件支持吗？**
A: 单文件上限约 37MB（对应 50MB base64），超过会被拒绝（HTTP 413）。

**Q: 会覆盖我桌面或工作区文件吗？**
A: 不会。文件只写入独立的 `.dsh-uploads` 目录，文件名带随机前缀，不会覆盖任何现有文件。

---

## License

[MIT](LICENSE)
