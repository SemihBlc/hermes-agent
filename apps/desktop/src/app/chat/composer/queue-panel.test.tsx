import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QueuedPromptEntry } from '@/store/composer-queue'

import { QueuePanel } from './queue-panel'

const entry = (id: string): QueuedPromptEntry => ({
  id,
  text: `Queued message ${id}`,
  attachments: [],
  queuedAt: Number(id)
})

const callbacks = {
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onSendNow: vi.fn()
}

describe('QueuePanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('scrolls only its own viewport to the newest appended entry', async () => {
    const before = [entry('1'), entry('2'), entry('3')]

    const { rerender } = render(
      <div data-testid="outer-scroll-container">
        <QueuePanel busy editingId={null} entries={before} {...callbacks} />
      </div>
    )

    fireEvent.click(screen.getByRole('button', { name: '3 Queued' }))

    const queueViewport = screen.getByRole('region', { name: '3 Queued' })
    const outer = screen.getByTestId('outer-scroll-container')
    Object.defineProperty(queueViewport, 'scrollHeight', { configurable: true, value: 640 })
    queueViewport.scrollTop = 12
    outer.scrollTop = 37

    rerender(
      <div data-testid="outer-scroll-container">
        <QueuePanel busy editingId={null} entries={[...before, entry('4')]} {...callbacks} />
      </div>
    )

    await waitFor(() => expect(queueViewport.scrollTop).toBe(640))
    expect(outer.scrollTop).toBe(37)
  })
})
