# dsh-file-drop

**DSH (DeepSeek Harness) 会话框文件拖放插件**

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

---

## 工作原理

```
┌─────────────────────┐        ┌──────────────────────────────┐
│     浏览器客户端      │        │          DSH 宿主端           │
│                     │  RPC   │                              │
│ 拖入文件 ──► FileReader │ ──────► │ harness.handle('save-file') │
│ 转 base64           │        │ 写 .b64 文本 ─► PowerShell   │
│                     │        │ 解码为二进制写盘              │
│ 返回绝对路径          │ ◄────── │ 返回 { ok, path }            │
│ 插入输入框 ──► 发送    │        │                              │
└─────────────────────┘        └──────────────────────────────┘
```

**技术要点**

- 客户端在 `document` 上以 **capture 阶段**监听 `drop`，先于产品原生 InputBar（bubble 阶段）执行：
  - 全部为图片 → 放行，交给原生逻辑作为附件；
  - 含非图片 → `preventDefault()` + `stopPropagation()` 拦截，阻止原生把文件当图片处理。
- 宿主端 `fs` 服务只支持 UTF-8 文本写入（明确拒绝二进制），因此先把 base64 以文本形式写入 `.b64` 暂存文件，再通过 `subprocess` 调用 PowerShell `[Convert]::FromBase64String` 解码为二进制文件，落盘后删除暂存文件。
- 隐形 `conversation.input.dock` 组件（渲染 `null`）仅用于获取产品标准的 `inputActions.setDraft` 接口，把路径写入输入框，不产生任何可见 UI。
- 单文件上限约 37MB。

---

## 安装与使用

本插件面向 DSH 的动态插件（Dynamic Cordis Plugin）机制。目前 DSH 通过会话内工具（`cordis_define` / `cordis_run`）加载插件源码，暂无 CLI 一键安装命令，请按以下步骤加载：

### 方法一：直接粘贴源码（推荐）

1. 在 DSH 会话中调用 `cordis_define`，`kind` 选 `new`，`idPrefix` 填 `drop`；
2. 将本仓库 [`host.js`](host.js) 的内容粘贴到 `code.host` 字段；
3. 将本仓库 [`client.js`](client.js) 的内容粘贴到 `code.client` 字段；
4. 调用 `cordis_run` 激活，并在界面中批准授权。

### 方法二：通过 DSH 内置插件机制

将本仓库克隆到本地，把 `host.js` 与 `client.js` 作为动态插件包的代码部分引用（具体接入方式取决于你的 DSH 部署对动态插件的管理界面）。

### 使用步骤

1. 插件激活后，**无需任何操作**，直接拖一个文件到会话框任意位置；
2. 图片 → 自动作为附件出现在输入区，可正常发送；
3. Word/PPT/PDF/Excel 等 → 文件保存到 `%USERPROFILE%\.dsh-uploads\`（即 `C:\Users\Windows11\.dsh-uploads\`），路径自动插入输入框；
4. 按回车发送，AI 即可读取该路径下的文件内容并处理。

> 文件保存目录由宿主端 `sandboxPolicy.workspaceRoot` 决定（通常是用户主目录），可在 `host.js` 中修改 `uploadDir` 变量调整。

---

## 文件结构

```
dsh-file-drop/
├── host.js        # 宿主端源码（code.host 字段内容）
├── client.js      # 客户端源码（code.client 字段内容）
├── README.md      # 本说明
└── LICENSE        # MIT 许可证
```

---

## 常见问题

**Q: 拖入文件后输入框没有出现路径？**
A: 检查浏览器控制台是否有 `[file-drop] 转换失败` 的报错；确认插件处于运行状态（`cordis_inspect_self` 查看）。

**Q: 为什么用 PowerShell 写文件？**
A: DSH 的 `fs` 服务只支持 UTF-8 文本写入，为了保持 Word/PPT/PDF 等二进制文件字节完整，通过 PowerShell 的 `[Convert]::FromBase64String` 解码落盘。

**Q: 大文件支持吗？**
A: 单文件上限约 37MB（对应 50MB base64），超过会被拒绝。

**Q: 会覆盖我桌面或工作区文件吗？**
A: 不会。文件只写入独立的 `.dsh-uploads` 目录，文件名带随机前缀，不会覆盖任何现有文件。

---

## License

[MIT](LICENSE)
