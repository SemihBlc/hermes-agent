import { describe, expect, it } from 'vitest'

import { IMAGE_ONLY_CONTEXT_PROMPT } from './submit'

describe('image-only prompt default', () => {
  it('asks for context-aware analysis instead of a generic image inventory', () => {
    expect(IMAGE_ONLY_CONTEXT_PROMPT).not.toBe('What do you see in this image?')
    expect(IMAGE_ONLY_CONTEXT_PROMPT).toContain('current conversation')
    expect(IMAGE_ONLY_CONTEXT_PROMPT).toContain('implicit question')
    expect(IMAGE_ONLY_CONTEXT_PROMPT).toContain('concrete next step')
  })
})
