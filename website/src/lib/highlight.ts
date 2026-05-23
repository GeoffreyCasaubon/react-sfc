import Prism from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-bash'

export type HighlightLang = 'tsx' | 'typescript' | 'css' | 'bash'

export function highlightLine(line: string, lang: HighlightLang): string {
  if (!line) return ' '
  const grammar = Prism.languages[lang]
  if (!grammar) return line
  return Prism.highlight(line, grammar, lang)
}
