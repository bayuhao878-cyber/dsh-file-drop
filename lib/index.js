// dsh-file-drop — Host 半部分（静态插件）
//
// 静态宿主插件：作为 DSH 宿主组合的一部分加载，全局单实例、ID 固定、
// 重启自动加载、无需批准。
//
// 职责：注册 webServer 路由 POST /dsh-file-drop/save，
//       接收客户端（浏览器 bundle）通过 fetch 传来的 base64，
//       解码写入磁盘，返回绝对路径。
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

export const name = 'dsh-file-drop'

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    ctx.logger?.warn?.('dsh-file-drop: webServer 服务不可用，跳过路由注册')
    return
  }
  const sandboxPolicy = ctx.get('sandboxPolicy')
  const workspaceRoot = sandboxPolicy?.workspaceRoot
    ? String(sandboxPolicy.workspaceRoot).replace(/[\\/]+$/, '')
    : undefined

  const uploadDir = workspaceRoot ? join(workspaceRoot, '.dsh-uploads') : join('.dsh-uploads')

  // 读取请求体（Node http IncomingMessage → Buffer）
  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

  const sendJson = (res, status, payload) => {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    })
    res.end(body)
  }

  const route = {
    kind: 'exact',
    path: '/dsh-file-drop/save',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      try {
        const raw = await readBody(req)
        let args
        try {
          args = JSON.parse(raw.toString('utf8'))
        } catch {
          sendJson(res, 400, { ok: false, error: 'invalid JSON body' })
          return
        }
        const name = String((args && args.name) || 'file')
        const base64 = String((args && args.base64) || '')
        if (!base64) {
          sendJson(res, 400, { ok: false, error: '文件内容为空' })
          return
        }
        if (base64.length > 50 * 1024 * 1024) {
          sendJson(res, 413, { ok: false, error: '文件过大（约 37MB 上限）' })
          return
        }

        await mkdir(uploadDir, { recursive: true })
        const safe = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120).trim() || 'file'
        const stamp = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
        const finalName = stamp + '-' + safe
        const finalPath = join(uploadDir, finalName)

        const buf = Buffer.from(base64, 'base64')
        await writeFile(finalPath, buf)
        sendJson(res, 200, {
          ok: true,
          path: finalPath,
          name: finalName,
          size: buf.length
        })
      } catch (error) {
        const message = error && error.message ? error.message : String(error)
        sendJson(res, 500, { ok: false, error: message })
      }
    }
  }

  const dispose = webServer.register(route)
  ctx.effect(() => dispose, 'dsh-file-drop: save route')
  ctx.logger?.info?.('dsh-file-drop: route /dsh-file-drop/save registered')
}
