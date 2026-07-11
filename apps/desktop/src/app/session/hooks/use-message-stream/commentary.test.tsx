import { QueryClient } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientSessionState } from '@/app/types'
import { createClientSessionState } from '@/lib/chat-runtime'
import type { RpcEvent } from '@/types/hermes'

import { useMessageStream } from './index'

const SID = 'session-commentary'

let handleEvent: ((event: RpcEvent) => void) | null = null
let states: Map<string, ClientSessionState>

function Harness() {
  const activeSessionIdRef = useRef<string | null>(SID)
  const sessionStateByRuntimeIdRef = useRef(states)
  const queryClientRef = useRef(new QueryClient())

  const stream = useMessageStream({
    activeSessionIdRef,
    hydrateFromStoredSession: vi.fn(async () => undefined),
    queryClient: queryClientRef.current,
    refreshHermesConfig: vi.fn(async () => undefined),
    refreshSessions: vi.fn(async () => undefined),
    sessionStateByRuntimeIdRef,
    updateSessionState: (sessionId, updater) => {
      const current = sessionStateByRuntimeIdRef.current.get(sessionId) ?? createClientSessionState()
      const next = updater(current)
      sessionStateByRuntimeIdRef.current.set(sessionId, next)

      return next
    }
  })

  useEffect(() => {
    handleEvent = stream.handleGatewayEvent
  }, [stream.handleGatewayEvent])

  return null
}

async function mountStream() {
  render(<Harness />)
  await waitFor(() => expect(handleEvent).not.toBeNull())
}

function emit(type: string, payload: Record<string, unknown> = {}) {
  handleEvent!({ payload, session_id: SID, type })
}

describe('useMessageStream commentary chronology', () => {
  beforeEach(() => {
    handleEvent = null
    states = new Map()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('keeps each commentary message between the work segments that surround it', async () => {
    await mountStream()
    vi.spyOn(Date, 'now').mockReturnValue(1_234_567_890)

    act(() => {
      emit('message.start')
      emit('reasoning.delta', { text: 'Thinking vor Text eins.' })
      emit('tool.start', { name: 'read_file', tool_id: 'tool-1' })
      emit('tool.complete', { name: 'read_file', result: 'ok', tool_id: 'tool-1' })
      emit('message.commentary', { text: 'Text eins.' })
      emit('reasoning.delta', { text: 'Thinking nach Text eins.' })
      emit('tool.start', { name: 'search_files', tool_id: 'tool-2' })
      emit('tool.complete', { name: 'search_files', result: 'ok', tool_id: 'tool-2' })
      emit('message.commentary', { text: 'Text zwei.' })
      emit('tool.start', { name: 'terminal', tool_id: 'tool-3' })
    })

    await waitFor(() => {
      const messages = states.get(SID)?.messages ?? []

      expect(messages.map(message => message.parts.map(part => part.type))).toEqual([
        ['reasoning', 'tool-call'],
        ['text'],
        ['reasoning', 'tool-call'],
        ['text'],
        ['tool-call']
      ])
      expect(messages).toHaveLength(5)
      expect(new Set(messages.map(message => message.id))).toHaveLength(5)
      expect(messages[1]?.parts).toEqual([{ type: 'text', text: 'Text eins.' }])
      expect(messages[3]?.parts).toEqual([{ type: 'text', text: 'Text zwei.' }])
    })
  })

  it('places new Thinking and tools below commentary that starts a turn', async () => {
    await mountStream()

    act(() => {
      emit('message.start')
      emit('message.commentary', { text: 'Ich prüfe das jetzt.' })
      emit('reasoning.delta', { text: 'Konkretes Thinking.' })
      emit('tool.start', { name: 'read_file', tool_id: 'tool-1' })
    })

    await waitFor(() => {
      const messages = states.get(SID)?.messages ?? []

      expect(messages).toHaveLength(2)
      expect(messages[0]?.parts).toEqual([{ type: 'text', text: 'Ich prüfe das jetzt.' }])
      expect(messages[1]?.parts.map(part => part.type)).toEqual(['reasoning', 'tool-call'])
    })
  })

  it('keeps commentary and later work in the active branch while the turn remains pending', async () => {
    states.set(SID, {
      ...createClientSessionState(),
      pendingBranchGroup: 'branch-1'
    })
    await mountStream()

    act(() => {
      emit('message.start')
      emit('message.commentary', { text: 'Ich prüfe diesen Branch.' })
      emit('reasoning.delta', { text: 'Branch-Thinking.' })
      emit('tool.start', { name: 'read_file', tool_id: 'tool-branch' })
    })

    await waitFor(() => {
      const state = states.get(SID)
      const messages = state?.messages ?? []

      expect(state?.busy).toBe(true)
      expect(state?.awaitingResponse).toBe(false)
      expect(messages).toHaveLength(2)
      expect(messages.map(message => message.branchGroupId)).toEqual(['branch-1', 'branch-1'])
    })
  })

  it('preserves commentary and finalizes the later work segment with the final answer', async () => {
    await mountStream()

    act(() => {
      emit('message.start')
      emit('message.commentary', { text: 'Ich öffne die Datei.' })
      emit('tool.start', { name: 'computer_use', tool_id: 'tool-1' })
      emit('tool.complete', { name: 'computer_use', result: 'ok', tool_id: 'tool-1' })
      emit('message.complete', { text: 'Die Datei ist geöffnet.' })
    })

    await waitFor(() => {
      const messages = states.get(SID)?.messages ?? []

      expect(messages).toHaveLength(2)
      expect(messages[0]?.parts).toEqual([{ type: 'text', text: 'Ich öffne die Datei.' }])
      expect(messages[1]).toMatchObject({
        pending: false,
        parts: [expect.objectContaining({ type: 'tool-call' }), { type: 'text', text: 'Die Datei ist geöffnet.' }]
      })
    })
  })
})
