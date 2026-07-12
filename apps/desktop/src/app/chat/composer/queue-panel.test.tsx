import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const panel = (entries: QueuedPromptEntry[]) => (
  <div data-testid="outer-scroll-container">
    <QueuePanel busy editingId={null} entries={entries} {...callbacks} />
  </div>
)

describe('QueuePanel autoscroll', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('scrolls only the queue viewport when an entry is appended while open', async () => {
    const before = [entry('1'), entry('2'), entry('3')]
    const { rerender } = render(panel(before))

    const queueViewport = screen.getByRole('region', { name: '3 Queued' })
    const outer = screen.getByTestId('outer-scroll-container')
    Object.defineProperty(queueViewport, 'scrollHeight', { configurable: true, value: 640 })
    queueViewport.scrollTop = 12
    outer.scrollTop = 37

    rerender(panel([...before, entry('4')]))

    await waitFor(() => expect(queueViewport.scrollTop).toBe(640))
    expect(outer.scrollTop).toBe(37)
  })

  it('scrolls once when the queue mounts after an append while collapsed', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(720)

    const before = [entry('1'), entry('2'), entry('3')]
    const { rerender } = render(panel(before))
    const outer = screen.getByTestId('outer-scroll-container')
    outer.scrollTop = 41

    fireEvent.click(screen.getByRole('button', { name: '3 Queued' }))

    rerender(panel([...before, entry('4')]))

    expect(screen.queryByRole('region', { name: '4 Queued' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '4 Queued' }))

    const queueViewport = screen.getByRole('region', { name: '4 Queued' })
    await waitFor(() => expect(queueViewport.scrollTop).toBe(720))
    expect(outer.scrollTop).toBe(41)

    fireEvent.click(screen.getByRole('button', { name: '4 Queued' }))
    fireEvent.click(screen.getByRole('button', { name: '4 Queued' }))

    expect(screen.getByRole('region', { name: '4 Queued' }).scrollTop).toBe(0)
  })

  it('preserves the queue scroll position when the last entry is removed', () => {
    const before = [entry('1'), entry('2'), entry('3'), entry('4')]
    const { rerender } = render(panel(before))

    const queueViewport = screen.getByRole('region', { name: '4 Queued' })
    const outer = screen.getByTestId('outer-scroll-container')
    Object.defineProperty(queueViewport, 'scrollHeight', { configurable: true, value: 900 })
    queueViewport.scrollTop = 211
    outer.scrollTop = 43

    rerender(panel(before.slice(0, -1)))

    expect(queueViewport.scrollTop).toBe(211)
    expect(outer.scrollTop).toBe(43)
  })

  it('does not scroll the queue viewport when it remounts without an append', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(720)

    render(panel([entry('1'), entry('2'), entry('3')]))

    const outer = screen.getByTestId('outer-scroll-container')

    fireEvent.click(screen.getByRole('button', { name: '3 Queued' }))
    outer.scrollTop = 47
    fireEvent.click(screen.getByRole('button', { name: '3 Queued' }))

    const queueViewport = screen.getByRole('region', { name: '3 Queued' })
    expect(queueViewport.scrollTop).toBe(0)
    expect(outer.scrollTop).toBe(47)
  })

  it('keeps a collapsed append pending when another entry is removed before opening', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(720)

    const one = entry('1')
    const two = entry('2')
    const three = entry('3')
    const four = entry('4')
    const { rerender } = render(panel([one, two, three]))

    fireEvent.click(screen.getByRole('button', { name: '3 Queued' }))
    rerender(panel([one, two, three, four]))
    rerender(panel([one, two, four]))
    fireEvent.click(screen.getByRole('button', { name: '3 Queued' }))

    expect(screen.getByRole('region', { name: '3 Queued' }).scrollTop).toBe(720)
  })

  it('detects a tail append when another removal keeps the queue length stable', () => {
    const one = entry('1')
    const two = entry('2')
    const three = entry('3')
    const { rerender } = render(panel([one, two, three]))

    const queueViewport = screen.getByRole('region', { name: '3 Queued' })
    Object.defineProperty(queueViewport, 'scrollHeight', { configurable: true, value: 880 })
    queueViewport.scrollTop = 19

    rerender(panel([two, three, entry('4')]))

    expect(queueViewport.scrollTop).toBe(880)
  })

  it('does not treat a prepend as an append', () => {
    const before = [entry('1'), entry('2'), entry('3')]
    const { rerender } = render(panel(before))

    const queueViewport = screen.getByRole('region', { name: '3 Queued' })
    Object.defineProperty(queueViewport, 'scrollHeight', { configurable: true, value: 900 })
    queueViewport.scrollTop = 211

    rerender(panel([entry('0'), ...before]))

    expect(queueViewport.scrollTop).toBe(211)
  })
})
