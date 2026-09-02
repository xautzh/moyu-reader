import { Crepe } from '@milkdown/crepe'
import { imageInlineComponent, inlineImageConfig } from '@milkdown/kit/component/image-inline'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import { uploadConfig } from '@milkdown/kit/plugin/upload'
import { insertImageCommand } from '@milkdown/kit/preset/commonmark'
import { replaceAll } from '@milkdown/kit/utils'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

interface RichMarkdownEditorProps {
  value: string
  assetBaseUrl: string
  documentPath: string
  typewriterMode: boolean
  onChange: (value: string) => void
  onNotify: (message: string) => void
}

export interface RichMarkdownEditorHandle {
  insertImage: (source: string, caption?: string) => void
  focus: () => void
}

export const RichMarkdownEditor = forwardRef<RichMarkdownEditorHandle, RichMarkdownEditorProps>(
  function RichMarkdownEditor(
    { value, assetBaseUrl, documentPath, typewriterMode, onChange, onNotify },
    forwardedRef
  ): React.JSX.Element {
    const rootRef = useRef<HTMLDivElement>(null)
    const crepeRef = useRef<Crepe | null>(null)
    const onChangeRef = useRef(onChange)
    const onNotifyRef = useRef(onNotify)
    const assetBaseUrlRef = useRef(assetBaseUrl)
    const documentPathRef = useRef(documentPath)
    const typewriterModeRef = useRef(typewriterMode)
    const lastUserIntentAtRef = useRef(0)
    const initialValueRef = useRef(value)
    const suppressChangeRef = useRef(false)
    const [ready, setReady] = useState(false)

    onChangeRef.current = onChange
    onNotifyRef.current = onNotify
    assetBaseUrlRef.current = assetBaseUrl
    documentPathRef.current = documentPath
    typewriterModeRef.current = typewriterMode

    useImperativeHandle(
      forwardedRef,
      () => ({
        insertImage(source, caption = '') {
          lastUserIntentAtRef.current = Date.now()
          crepeRef.current?.editor.action((ctx) => {
            const commands = ctx.get(commandsCtx)
            commands.call(insertImageCommand.key, { src: source, alt: caption })
            ctx.get(editorViewCtx).focus()
          })
        },
        focus() {
          crepeRef.current?.editor.action((ctx) => ctx.get(editorViewCtx).focus())
        }
      }),
      []
    )

    useEffect(() => {
      const root = rootRef.current
      if (!root) {
        return
      }

      let disposed = false
      const markUserIntent = (): void => {
        lastUserIntentAtRef.current = Date.now()
      }
      root.addEventListener('beforeinput', markUserIntent, true)
      root.addEventListener('keydown', markUserIntent, true)
      root.addEventListener('paste', markUserIntent, true)
      root.addEventListener('drop', markUserIntent, true)
      root.addEventListener('pointerdown', markUserIntent, true)

      const uploadImage = async (file: File): Promise<string> => {
        const currentPath = documentPathRef.current
        if (!currentPath) {
          onNotifyRef.current('请先保存文档，再插入本地图片')
          throw new Error('Document must be saved before uploading images.')
        }
        try {
          const asset = await window.moyu.saveImageData(
            currentPath,
            file.name,
            await file.arrayBuffer()
          )
          lastUserIntentAtRef.current = Date.now()
          return asset.relativePath
        } catch (error) {
          const message = error instanceof Error ? error.message : '图片保存失败'
          onNotifyRef.current(message)
          throw error
        }
      }

      const crepe = new Crepe({
        root,
        defaultValue: initialValueRef.current,
        features: {
          [Crepe.Feature.TopBar]: true,
          [Crepe.Feature.ImageBlock]: false,
          [Crepe.Feature.AI]: false
        },
        featureConfigs: {
          [Crepe.Feature.Placeholder]: {
            text: '开始写作，输入 / 可插入内容块…',
            mode: 'block'
          },
          [Crepe.Feature.TopBar]: {
            headingOptions: [
              { label: '正文', level: null },
              { label: '标题 1', level: 1 },
              { label: '标题 2', level: 2 },
              { label: '标题 3', level: 3 },
              { label: '标题 4', level: 4 },
              { label: '标题 5', level: 5 },
              { label: '标题 6', level: 6 }
            ]
          }
        }
      })

      crepe.editor.config((ctx) => {
        ctx.update(inlineImageConfig.key, (previous) => ({
          ...previous,
          uploadButton: '选择图片',
          confirmButton: '确认',
          uploadPlaceholderText: '粘贴图片地址',
          onUpload: uploadImage,
          proxyDomURL: (source) => {
            if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)) {
              return source
            }
            const baseUrl = assetBaseUrlRef.current
            if (!baseUrl) {
              return source
            }
            try {
              return new URL(source.replace(/\\/g, '/'), baseUrl).href
            } catch {
              return source
            }
          }
        }))
        ctx.update(uploadConfig.key, (previous) => ({
          ...previous,
          enableHtmlFileUploader: true,
          uploader: async (files, schema) => {
            const imageType = schema.nodes.image
            if (!imageType) {
              return []
            }
            const images = Array.from(files).filter((file) => file.type.startsWith('image/'))
            return Promise.all(
              images.map(async (file) =>
                imageType.create({ src: await uploadImage(file), alt: file.name, title: '' })
              )
            )
          }
        }))
      })
      crepe.editor.use(imageInlineComponent)

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (suppressChangeRef.current || Date.now() - lastUserIntentAtRef.current > 2500) {
            return
          }
          onChangeRef.current(markdown)
        })
        listener.selectionUpdated((ctx, selection) => {
          if (!typewriterModeRef.current) {
            return
          }
          window.requestAnimationFrame(() => {
            const view = ctx.get(editorViewCtx)
            const scrollContainer = root.closest<HTMLElement>('.editor-scroll')
            if (!scrollContainer) {
              return
            }
            const cursor = view.coordsAtPos(selection.head)
            const container = scrollContainer.getBoundingClientRect()
            const offset = cursor.top - (container.top + container.height / 2)
            if (Math.abs(offset) > 24) {
              scrollContainer.scrollBy({ top: offset, behavior: 'auto' })
            }
          })
        })
      })

      crepeRef.current = crepe
      const creation = crepe.create()
      void creation
        .then(() => {
          if (!disposed) {
            setReady(true)
          }
        })
        .catch((error) => {
          if (!disposed) {
            onNotifyRef.current(
              error instanceof Error ? `编辑器初始化失败：${error.message}` : '编辑器初始化失败'
            )
          }
        })

      return () => {
        disposed = true
        crepeRef.current = null
        root.removeEventListener('beforeinput', markUserIntent, true)
        root.removeEventListener('keydown', markUserIntent, true)
        root.removeEventListener('paste', markUserIntent, true)
        root.removeEventListener('drop', markUserIntent, true)
        root.removeEventListener('pointerdown', markUserIntent, true)
        void creation.then(() => crepe.destroy()).catch(() => undefined)
      }
    }, [])

    useEffect(() => {
      const crepe = crepeRef.current
      if (!ready || !crepe) {
        return
      }
      if (crepe.getMarkdown() === value) {
        return
      }
      suppressChangeRef.current = true
      try {
        crepe.editor.action(replaceAll(value))
      } finally {
        suppressChangeRef.current = false
      }
    }, [ready, value])

    return (
      <div className="rich-editor" data-ready={ready ? 'true' : 'false'}>
        {!ready && <div className="editor-loading">正在准备编辑器…</div>}
        <div ref={rootRef} />
      </div>
    )
  }
)
