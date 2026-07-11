import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

beforeAll(() => {
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  }
})

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (state: unknown) => unknown) =>
    selector({
      message: { id: 'message-1', status: { type: 'complete' } },
      thread: { isRunning: false }
    })
}))

vi.mock('@/lib/use-enter-animation', () => ({
  useEnterAnimation: () => null
}))

import { ToolGroupSlot } from './fallback'

function renderGroup(children: ReactNode) {
  return render(
    <ToolGroupSlot endIndex={3} startIndex={0}>
      {children}
    </ToolGroupSlot>
  )
}

describe('ToolGroupSlot', () => {
  it('keeps long tool runs in the normal conversation flow', () => {
    const { container } = renderGroup([
      <div key="one">one</div>,
      <div key="two">two</div>,
      <div key="three">three</div>,
      <div key="four">four</div>
    ])

    const group = container.querySelector('[data-tool-group]')
    const inner = group?.firstElementChild

    expect(group).not.toBeNull()
    expect(inner).not.toBeNull()
    expect(inner?.classList.contains('overflow-y-auto')).toBe(false)
    expect(inner?.classList.contains('tool-group-scroll')).toBe(false)
  })

  it('keeps every tool body in the conversation vertical flow', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/assistant-ui/tool/fallback.tsx'), 'utf8')

    expect(source).not.toContain('overflow-y-auto')
    expect(source).not.toContain('overflow-auto')
    expect(source).not.toMatch(/\bmax-h-/)
  })
})
