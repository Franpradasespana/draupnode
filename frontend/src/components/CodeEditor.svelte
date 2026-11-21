<script lang="ts">
  // Editor de código (CodeMirror 6, MIT): YAML, plantillas Jinja2 (.j2),
  // shell y texto. Ctrl+S llama a onsave.
  import { onMount, onDestroy } from 'svelte'
  import { EditorView, basicSetup } from 'codemirror'
  import { keymap } from '@codemirror/view'
  import { EditorState, Compartment } from '@codemirror/state'
  import { StreamLanguage } from '@codemirror/language'
  import { yaml } from '@codemirror/lang-yaml'
  import { jinja2 } from '@codemirror/legacy-modes/mode/jinja2'
  import { shell } from '@codemirror/legacy-modes/mode/shell'
  import { indentWithTab } from '@codemirror/commands'

  let { value, file, onchange, onsave }: { value: string; file: string; onchange: (v: string) => void; onsave: () => void } = $props()

  let el: HTMLDivElement
  let view: EditorView | undefined
  const lang = new Compartment()

  function langFor(f: string) {
    if (/\.ya?ml$/.test(f)) return yaml()
    if (/\.j2$/.test(f)) return StreamLanguage.define(jinja2)
    if (/\.(sh|bash)$/.test(f)) return StreamLanguage.define(shell)
    return []
  }

  const theme = EditorView.theme({
    '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--panel)', color: 'var(--text)' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
    '.cm-gutters': { backgroundColor: 'var(--panel-2)', color: 'var(--muted)', border: 'none', borderRight: '1px solid var(--border-soft)' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)' },
    '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent) !important' },
  })

  onMount(() => {
    view = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab, { key: 'Mod-s', preventDefault: true, run: () => { onsave(); return true } }]),
          lang.of(langFor(file)),
          theme,
          EditorState.tabSize.of(2),
          EditorView.updateListener.of((u) => { if (u.docChanged) onchange(u.state.doc.toString()) }),
        ],
      }),
    })
  })
  onDestroy(() => view?.destroy())

  // Otro fichero (o recargado): sustituir el contenido.
  $effect(() => {
    const v = value, f = file
    if (!view) return
    view.dispatch({ effects: lang.reconfigure(langFor(f)) })
    if (view.state.doc.toString() !== v) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
  })
</script>

<div class="ce" bind:this={el}></div>

<style>
  .ce { height: 100%; min-height: 300px; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
  .ce :global(.cm-editor) { height: 100%; }
</style>
