// dsh-file-drop — Client 半部分
// 用法：将本文件内容粘贴到 cordis_define 的 code.client 字段（纯 JavaScript 函数体）。
//
// 职责：
//  - 在 document 级（capture 阶段）监听 drop，整个会话框任意位置均可拖入文件；
//  - 全部为图片 → 放行，交给产品原生 InputBar 作为附件处理；
//  - 含非图片 → 拦截原生处理，将文件转为 base64 发给宿主保存，把路径插入输入框；
//  - 隐形 dock 组件（渲染 null）仅为获取 inputActions/useInput，不产生任何可见 UI。
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    // 模块级桥：document 级 drop 监听器 <-> dock 隐形组件（持有 inputActions/useInput）
    let bridge = null

    // 读取 File 为纯 base64（浏览器全局 FileReader 可用）
    function readAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = String(reader.result || '')
          const idx = dataUrl.indexOf(',')
          resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl)
        }
        reader.onerror = () => reject(new Error('读取文件失败'))
        reader.readAsDataURL(file)
      })
    }

    // 处理一组文件：非图片转路径插入输入框；失败记入控制台
    async function handleFiles(files) {
      const paths = []
      const errors = []
      for (const file of files) {
        try {
          if (file.size > 37 * 1024 * 1024) {
            errors.push(file.name + ': 超过约 37MB 上限')
            continue
          }
          const b64 = await readAsBase64(file)
          const res = await host.call('save-file', { name: file.name, base64: b64 })
          if (res && res.ok) paths.push(res.path)
          else errors.push(file.name + ': ' + ((res && res.error) || '上传失败'))
        } catch (err) {
          errors.push(file.name + ': ' + String(err && err.message || err))
        }
      }
      if (paths.length && bridge) {
        const cur = bridge.getDraft()
        bridge.setDraft(cur ? cur + '\n' + paths.join('\n') : paths.join('\n'))
      }
      if (errors.length) {
        console.error('[file-drop] 转换失败: ' + errors.join('；'))
      }
    }

    // document 级 drop 拦截（capture 阶段，先于 InputBar 的 bubble 监听执行）
    ctx.effect(() => {
      const onDrop = (event) => {
        const dt = event.dataTransfer
        if (!dt) return
        const types = Array.from(dt.types || [])
        if (!types.includes('Files')) return
        const files = Array.from(dt.files || [])
        if (!files.length) return
        // 全部为图片 → 放行，交给原生 InputBar 作为附件处理
        const nonImages = files.filter((f) => !String(f.type || '').startsWith('image/'))
        if (!nonImages.length) return
        // 含非图片 → 拦截：阻止原生当图片处理，转为文件路径
        event.preventDefault()
        event.stopPropagation()
        try { window.dispatchEvent(new DragEvent('dragend')) } catch (e) {}
        handleFiles(files)
      }
      document.addEventListener('drop', onDrop, true)
      return () => document.removeEventListener('drop', onDrop, true)
    })

    // 隐形 dock 组件：不渲染任何可见 UI，仅为获取 inputActions/useInput 建立 bridge
    slots.inject('conversation.input.dock', () => slots.register(
      { name: 'conversation.input.dock', id: 'file-drop', order: 5 },
      (props) => {
        const inputActions = props.inputActions
        const useInput = props.useInput
        const input = useInput((s) => s)
        const draftRef = React.useRef('')
        draftRef.current = (input && input.draft) || ''

        React.useEffect(() => {
          bridge = {
            getDraft: () => draftRef.current,
            setDraft: (text) => { if (inputActions) inputActions.setDraft(text) }
          }
          return () => { bridge = null }
        }, [inputActions])

        return null
      }
    ))
  }
}
