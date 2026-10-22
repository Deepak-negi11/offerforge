import { Fragment, type ReactNode } from 'react'

/** Inline `code` and **bold**. Builds elements directly, so text is never parsed as HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em] text-fg">
          {part.slice(1, -1)}
        </code>
      )
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      )
    return <Fragment key={i}>{part}</Fragment>
  })
}

const BULLET = /^\s*[-*] /
const NUMBER = /^\s*\d+[.)] /

type Run = { kind: 'p' | 'ul' | 'ol'; lines: string[] }

/** Splits a block into paragraphs and list runs, so "Intro:\n- a\n- b" renders as a line and a list. */
function runs(lines: string[]): Run[] {
  const out: Run[] = []
  for (const l of lines) {
    const kind = BULLET.test(l) ? 'ul' : NUMBER.test(l) ? 'ol' : 'p'
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.lines.push(l)
    else if (last && kind === 'p' && last.kind !== 'p' && /^\s{2,}\S/.test(l)) last.lines[last.lines.length - 1] += ' ' + l.trim()
    else out.push({ kind, lines: [l] })
  }
  return out
}

/** The markdown subset used in statements and write-ups: paragraphs, bullet and numbered lists, code blocks,
 * inline code and bold. */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  // Fenced code blocks first, so blank lines inside them don't split blocks.
  const parts = text.trim().split(/```[a-zA-Z]*\n?([\s\S]*?)```/g)
  const nodes: ReactNode[] = []
  parts.forEach((part, pi) => {
    if (pi % 2 === 1) {
      nodes.push(
        <pre key={`c${pi}`} className="overflow-x-auto rounded-lg border border-line bg-surface-2/60 px-3 py-2 font-mono text-[13px] leading-relaxed text-fg">
          {part.replace(/\n$/, '')}
        </pre>,
      )
      return
    }
    part
      .trim()
      .split(/\n\s*\n/)
      .filter((b) => b.trim())
      .forEach((block, bi) => {
        const lines = block.split('\n')
        if (lines.every((l) => /^ {4}/.test(l))) {
          nodes.push(
            <pre key={`i${pi}-${bi}`} className="overflow-x-auto rounded-lg border border-line bg-surface-2/60 px-3 py-2 font-mono text-[13px] leading-relaxed text-fg">
              {lines.map((l) => l.slice(4)).join('\n')}
            </pre>,
          )
          return
        }
        runs(lines).forEach((r, ri) => {
          const key = `${pi}-${bi}-${ri}`
          if (r.kind === 'ul')
            nodes.push(
              <ul key={key} className="list-disc space-y-1.5 pl-5 marker:text-subtle">
                {r.lines.map((l, j) => (
                  <li key={j}>{inline(l.replace(BULLET, ''))}</li>
                ))}
              </ul>,
            )
          else if (r.kind === 'ol')
            nodes.push(
              <ol key={key} className="list-decimal space-y-1.5 pl-5 marker:text-subtle">
                {r.lines.map((l, j) => (
                  <li key={j}>{inline(l.replace(NUMBER, ''))}</li>
                ))}
              </ol>,
            )
          else
            nodes.push(
              <p key={key}>
                {r.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {inline(l)}
                  </Fragment>
                ))}
              </p>,
            )
        })
      })
  })
  return <div className={'space-y-3 ' + className}>{nodes}</div>
}
