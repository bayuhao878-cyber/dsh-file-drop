// dsh-file-drop — Host 半部分
// 用法：将本文件内容粘贴到 cordis_define 的 code.host 字段（纯 JavaScript 函数体）。
//
// 职责：接收客户端传来的 base64，解码写盘，返回绝对路径。
// 说明：DSH 的 fs 服务只支持 UTF-8 文本写入（明确拒绝二进制），
//       所以先把 base64 以文本形式写入 .b64 暂存文件，
//       再用 subprocess 调用 PowerShell 解码为二进制。
return {
  apply(ctx) {
    const dispose = harness.handle('save-file', async (args) => {
      const fs = ctx.get('fs')
      const subprocess = ctx.get('subprocess')
      const sandboxPolicy = ctx.get('sandboxPolicy')
      if (!fs || !subprocess || !sandboxPolicy) {
        return { ok: false, error: '宿主端缺少 fs/subprocess/sandboxPolicy 服务' }
      }
      try {
        const name = String((args && args.name) || 'file')
        const base64 = String((args && args.base64) || '')
        if (!base64) return { ok: false, error: '文件内容为空' }
        if (base64.length > 50 * 1024 * 1024) return { ok: false, error: '文件过大（约 37MB 上限）' }

        const root = String(sandboxPolicy.workspaceRoot || '').replace(/[\\/]+$/, '')
        if (!root) return { ok: false, error: '无法确定工作区根目录' }
        const uploadDir = root + '\\.dsh-uploads'
        const safe = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120).trim() || 'file'
        const stamp = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
        const finalName = stamp + '-' + safe
        const b64Path = uploadDir + '\\' + finalName + '.b64'
        const finalPath = uploadDir + '\\' + finalName

        // 写 base64 文本（writeText 会自动创建父目录）
        const b64Target = await fs.resolve(b64Path)
        await fs.writeText(b64Target, base64)

        // PowerShell 解码：单引号内路径转义为两个单引号
        const q = (p) => String(p).replace(/'/g, "''")
        const ps = "$ErrorActionPreference='Stop';" +
          "New-Item -ItemType Directory -Force -Path '" + q(uploadDir) + "' | Out-Null;" +
          "$b=[IO.File]::ReadAllText('" + q(b64Path) + "').Trim();" +
          "[IO.File]::WriteAllBytes('" + q(finalPath) + "',[Convert]::FromBase64String($b));" +
          "Remove-Item -Force '" + q(b64Path) + "'"

        const handle = subprocess.spawn({
          argv: ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
          cwd: root,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
          graceMs: 30000
        })
        const outcome = await handle.done
        if (outcome.exitCode !== 0) {
          let errText = ''
          try { errText = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : '' } catch (e) {}
          return { ok: false, error: '解码失败: ' + (errText || ('exit ' + outcome.exitCode)) }
        }
        return { ok: true, path: finalPath, name: finalName, size: Math.floor(base64.length * 3 / 4) }
      } catch (error) {
        return { ok: false, error: String(error && error.message || error) }
      }
    })
    ctx.effect(() => dispose)
  }
}
