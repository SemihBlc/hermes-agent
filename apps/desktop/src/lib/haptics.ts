import type { HapticInput, TriggerOptions } from 'web-haptics'

import { $hapticsMuted } from '@/store/haptics'

export type HapticIntent =
  | 'cancel'
  | 'close'
  | 'crisp'
  | 'error'
  | 'open'
  | 'selection'
  | 'streamDone'
  | 'streamStart'
  | 'submit'
  | 'success'
  | 'tap'
  | 'warning'

interface HapticConfig {
  options?: TriggerOptions
  pattern: HapticInput
}

const airyTap = [{ duration: 16, intensity: 0.52 }]

const crispTap = [{ duration: 10, intensity: 0.92 }]

const friendlySuccess = [
  { duration: 28, intensity: 0.5 },
  { delay: 42, duration: 30, intensity: 0.68 },
  { delay: 48, duration: 38, intensity: 0.86 }
]

const softArrive = [
  { duration: 18, intensity: 0.42 },
  { delay: 36, duration: 22, intensity: 0.66 }
]

const softLeave = [
  { duration: 22, intensity: 0.58 },
  { delay: 32, duration: 16, intensity: 0.34 }
]

const HAPTIC_INTENTS: Record<HapticIntent, HapticConfig> = {
  cancel: {
    pattern: [
      { duration: 34, intensity: 0.72 },
      { delay: 54, duration: 26, intensity: 0.38 }
    ]
  },
  close: { pattern: softLeave },
  crisp: { pattern: crispTap },
  error: {
    pattern: [
      { duration: 34, intensity: 0.82 },
      { delay: 42, duration: 34, intensity: 0.72 },
      { delay: 58, duration: 44, intensity: 0.86 }
    ]
  },
  open: { pattern: softArrive },
  selection: { pattern: airyTap },
  streamDone: { pattern: friendlySuccess },
  streamStart: { pattern: [{ duration: 10, intensity: 0.32 }] },
  submit: {
    pattern: [
      { duration: 24, intensity: 0.58 },
      { delay: 48, duration: 36, intensity: 0.82 }
    ]
  },
  success: { pattern: friendlySuccess },
  tap: {
    pattern: [
      { duration: 14, intensity: 0.58 },
      { delay: 30, duration: 12, intensity: 0.42 }
    ]
  },
  warning: {
    pattern: [
      { duration: 34, intensity: 0.64 },
      { delay: 84, duration: 42, intensity: 0.5 }
    ]
  }
}

export type HapticTrigger = (input?: HapticInput, options?: TriggerOptions) => Promise<void> | undefined

let registeredTrigger: HapticTrigger | null = null
let submitAudioContext: AudioContext | null = null
let lastSelectionAt = 0

async function playSubmitSound() {
  if (typeof AudioContext === 'undefined') {
    return
  }

  try {
    submitAudioContext ??= new AudioContext()

    if (submitAudioContext.state === 'suspended') {
      await submitAudioContext.resume()
    }

    const context = submitAudioContext
    const now = context.currentTime
    const gain = context.createGain()
    const oscillator = context.createOscillator()

    // A short, audible send cue. The cue has no app-level volume setting:
    // AudioContext.destination is governed by the Mac's current media output
    // volume and mute state, so changes in macOS apply immediately.
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(760, now)
    oscillator.frequency.exponentialRampToValueAtTime(1040, now + 0.075)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.62, now + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085)
    oscillator.connect(gain)
    gain.connect(context.destination)

    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }

    oscillator.start(now)
    oscillator.stop(now + 0.09)
  } catch {
    // Missing/unavailable audio output must never block message submission.
  }
}

// Global rolling rate-limit. A runaway upstream loop (auth-expiry error-toast
// storms, reconnect flaps) can request dozens of haptics a second, which the
// trackpad actuator renders as a frantic "clickity" buzz. Cap firings to
// RATE_LIMIT per RATE_WINDOW so no source can machine-gun the actuator;
// intentional UI haptics are human-paced and never approach the ceiling.
const RATE_WINDOW = 1000
const RATE_LIMIT = 5
let recentFires: number[] = []

export function registerHapticTrigger(trigger: HapticTrigger | null) {
  registeredTrigger = trigger

  if (!trigger && submitAudioContext) {
    void submitAudioContext.close().catch(() => undefined)
    submitAudioContext = null
  }
}

export function triggerHaptic(intent: HapticIntent = 'selection') {
  if ($hapticsMuted.get() || !registeredTrigger) {
    return
  }

  const now = performance.now()

  if (intent === 'selection') {
    if (now - lastSelectionAt < 50) {
      return
    }

    lastSelectionAt = now
  }

  recentFires = recentFires.filter(t => now - t < RATE_WINDOW)

  if (recentFires.length >= RATE_LIMIT) {
    return
  }

  recentFires.push(now)

  if (intent === 'submit') {
    void playSubmitSound()

    return
  }

  const config = HAPTIC_INTENTS[intent]

  void registeredTrigger(config.pattern, config.options)?.catch(() => undefined)
}
