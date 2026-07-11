import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $hapticsMuted } from '@/store/haptics'

import { registerHapticTrigger, triggerHaptic } from './haptics'

class FakeAudioParam {
  calls: Array<{ method: string; time: number; value: number }> = []

  exponentialRampToValueAtTime(value: number, time: number) {
    this.calls.push({ method: 'exponentialRampToValueAtTime', time, value })
  }

  setValueAtTime(value: number, time: number) {
    this.calls.push({ method: 'setValueAtTime', time, value })
  }
}

class FakeGainNode {
  connectedTo: unknown = null
  disconnected = false
  gain = new FakeAudioParam()

  connect(target: unknown) {
    this.connectedTo = target
  }

  disconnect() {
    this.disconnected = true
  }
}

class FakeOscillatorNode {
  connectedTo: unknown = null
  disconnected = false
  frequency = new FakeAudioParam()
  onended: (() => void) | null = null
  startedAt: number | null = null
  stoppedAt: number | null = null
  type = 'sine'

  connect(target: unknown) {
    this.connectedTo = target
  }

  disconnect() {
    this.disconnected = true
  }

  start(time: number) {
    this.startedAt = time
  }

  stop(time: number) {
    this.stoppedAt = time
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []

  currentTime = 10
  destination = { kind: 'system-output' }
  gains: FakeGainNode[] = []
  oscillators: FakeOscillatorNode[] = []
  state: AudioContextState = 'running'

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  close() {
    return Promise.resolve()
  }

  createGain() {
    const gain = new FakeGainNode()
    this.gains.push(gain)

    return gain
  }

  createOscillator() {
    const oscillator = new FakeOscillatorNode()
    this.oscillators.push(oscillator)

    return oscillator
  }

  resume() {
    return Promise.resolve()
  }
}

describe('submit sound', () => {
  const fallbackTrigger = vi.fn(async () => undefined)

  beforeEach(() => {
    FakeAudioContext.instances = []
    fallbackTrigger.mockClear()
    $hapticsMuted.set(false)
    registerHapticTrigger(fallbackTrigger)
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  afterEach(() => {
    registerHapticTrigger(null)
    $hapticsMuted.set(false)
    vi.unstubAllGlobals()
  })

  it('uses a dedicated system-output audio cue instead of the quiet web-haptics debug click', async () => {
    triggerHaptic('submit')
    await Promise.resolve()

    expect(fallbackTrigger).not.toHaveBeenCalled()
    expect(FakeAudioContext.instances).toHaveLength(1)

    const context = FakeAudioContext.instances[0]
    const gain = context.gains[0]
    const oscillator = context.oscillators[0]

    expect(gain.connectedTo).toBe(context.destination)
    expect(oscillator.connectedTo).toBe(gain)
    expect(oscillator.startedAt).toBe(context.currentTime)
    expect(oscillator.stoppedAt).toBeGreaterThan(context.currentTime)
    expect(gain.gain.calls.some(call => call.method === 'exponentialRampToValueAtTime' && call.value > 0.4)).toBe(
      true
    )
  })

  it('keeps the submit cue silent when haptics are muted', async () => {
    $hapticsMuted.set(true)

    triggerHaptic('submit')
    await Promise.resolve()

    expect(FakeAudioContext.instances).toHaveLength(0)
    expect(fallbackTrigger).not.toHaveBeenCalled()
  })

  it('leaves non-submit feedback on the existing web-haptics path', () => {
    triggerHaptic('selection')

    expect(fallbackTrigger).toHaveBeenCalledTimes(1)
    expect(FakeAudioContext.instances).toHaveLength(0)
  })
})
