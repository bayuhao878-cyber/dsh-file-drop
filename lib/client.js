// dsh-file-drop — Client 半部分（静态浏览器 bundle）
//
// 本文件由 clientModules 直接 serve（/plugins/dsh-file-drop/client.js），
// 无需构建。格式为 window.__ModuleLoader__.load({ id, factory })，
// factory 是 CJS 风格，require() 解析 seed/静态模块表中的依赖
// （react、@deepseek-ai/dsh-client-ui-slots 等）。
//
// 职责：
//  - document 级（capture 阶段）监听 drop，整个会话框任意位置可拖入文件；
//  - 全部为图片 → 放行，交给产品原生 InputBar 作为附件处理；
//  - 含非图片 → 拦截原生处理，把文件转 base64 通过 fetch 发给宿主
//    webServer 路由 /dsh-file-drop/save 保存，路径插入输入框；
//  - 隐形 conversation.input.dock 组件（渲染 null）仅为获取
//    inputActions/useInput 标准 props，不产生任何可见 UI。
window.__ModuleLoader__.load({
  id: 'dsh-file-drop',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var React = require('react')

    var inject = ['slots']

    // 读取 File 为纯 base64
    function readAsBase64(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader()
        reader.onload = function () {
          var dataUrl = String(reader.result || '')
          var idx = dataUrl.indexOf(',')
          resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl)
        }
        reader.onerror = function () { reject(new Error('读取文件失败')) }
        reader.readAsDataURL(file)
      })
    }

    // 模块级桥：document 级 drop 监听器 <-> dock 隐形组件
    var bridge = null

    // 处理一组文件：非图片转路径插入输入框；失败记入控制台
    async function handleFiles(files) {
      var paths = []
      var errors = []
      for (var i = 0; i < files.length; i++) {
        var file = files[i]
        try {
          if (file.size > 37 * 1024 * 1024) {
            errors.push(file.name + ': 超过约 37MB 上限')
            continue
          }
          var b64 = await readAsBase64(file)
          var res = await fetch('/dsh-file-drop/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: file.name, base64: b64 })
          })
          var data
          try { data = await res.json() } catch (e) { data = null }
          if (data && data.ok) paths.push(data.path)
          else errors.push(file.name + ': ' + ((data && data.error) || ('HTTP ' + res.status)))
        } catch (err) {
          errors.push(file.name + ': ' + String(err && err.message || err))
        }
      }
      if (paths.length && bridge) {
        var cur = bridge.getDraft()
        bridge.setDraft(cur ? cur + '\n' + paths.join('\n') : paths.join('\n'))
      }
      if (errors.length) {
        console.error('[file-drop] 转换失败: ' + errors.join('；'))
      }
    }

    function apply(ctx) {
      var slots = ctx.slots

      // document 级 drop 拦截（capture 阶段，先于 InputBar 的 bubble 监听执行）
      ctx.effect(function () {
        var onDrop = function (event) {
          var dt = event.dataTransfer
          if (!dt) return
          var types = Array.prototype.slice.call(dt.types || [])
          if (types.indexOf('Files') === -1) return
          var files = Array.prototype.slice.call(dt.files || [])
          if (!files.length) return
          // 全部为图片 → 放行，交给原生 InputBar 作为附件处理
          var nonImages = files.filter(function (f) { return !String(f.type || '').startsWith('image/') })
          if (!nonImages.length) return
          // 含非图片 → 拦截：阻止原生当图片处理，转为文件路径
          event.preventDefault()
          event.stopPropagation()
          try { window.dispatchEvent(new DragEvent('dragend')) } catch (e) {}
          handleFiles(files)
        }
        document.addEventListener('drop', onDrop, true)
        return function () { document.removeEventListener('drop', onDrop, true) }
      }, 'dsh-file-drop: document drop')

      // 隐形 dock 组件：不渲染任何可见 UI，仅为获取 inputActions/useInput 建立 bridge
      slots.inject('conversation.input.dock', function () {
        return slots.register(
          { name: 'conversation.input.dock', id: 'file-drop', order: 5 },
          function (props) {
            var inputActions = props.inputActions
            var useInput = props.useInput
            var input = useInput(function (s) { return s })
            var draftRef = React.useRef('')
            draftRef.current = (input && input.draft) || ''

            React.useEffect(function () {
              bridge = {
                getDraft: function () { return draftRef.current },
                setDraft: function (text) { if (inputActions) inputActions.setDraft(text) }
              }
              return function () { bridge = null }
            }, [inputActions])

            return null
          }
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
