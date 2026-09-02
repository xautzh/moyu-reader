import { markdown } from '@codemirror/lang-markdown'
import CodeMirror, {
  EditorView,
  type ReactCodeMirrorRef,
  type ViewUpdate
} from '@uiw/react-codemirror'
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { applyMarkdownEdit, type MarkdownEditCommand } from '../lib/editor'

export interface SourceEditorHandle {
  applyCommand: (command: MarkdownEditCommand) => void
  insertText: (text: string) => void
  focus: () => void
}

interface SourceEditorProps {
  value: string
  dark: boolean
  typewriterMode: boolean
  onChange: (value: string) => void
}

export const SourceEditor = forwardRef<SourceEditorHandle, SourceEditorProps>(function SourceEditor(
  { value, dark, typewriterMode, onChange },
  forwardedRef
) {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const extensions = useMemo(() => [markdown(), EditorView.lineWrapping], [])

  useImperativeHandle(
    forwardedRef,
    () => ({
      applyCommand(command) {
        const view = editorRef.current?.view
        if (!view) {
          return
        }
        const selection = view.state.selection.main
        const result = applyMarkdownEdit(
          view.state.doc.toString(),
          selection.from,
          selection.to,
          command
        )
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: result.value },
          selection: { anchor: result.selectionStart, head: result.selectionEnd }
        })
        view.focus()
      },
      insertText(text) {
        const view = editorRef.current?.view
        if (!view) {
          return
        }
        const selection = view.state.selection.main
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text },
          selection: { anchor: selection.from + text.length }
        })
        view.focus()
      },
      focus() {
        editorRef.current?.view?.focus()
      }
    }),
    []
  )

  function handleUpdate(update: ViewUpdate): void {
    if (!typewriterMode || (!update.docChanged && !update.selectionSet)) {
      return
    }
    update.view.dispatch({
      effects: EditorView.scrollIntoView(update.state.selection.main.head, { y: 'center' })
    })
  }

  return (
    <section className="source-editor" aria-label="Markdown 源码编辑器">
      <CodeMirror
        ref={editorRef}
        value={value}
        height="100%"
        theme={dark ? 'dark' : 'light'}
        extensions={extensions}
        placeholder="输入 Markdown 源码…"
        basicSetup={{
          autocompletion: false,
          bracketMatching: true,
          closeBrackets: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          history: true,
          lineNumbers: true,
          searchKeymap: true
        }}
        onChange={onChange}
        onUpdate={handleUpdate}
      />
    </section>
  )
})
