import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StatusSection } from './status-section'

describe('StatusSection', () => {
  afterEach(cleanup)

  it('starts expanded by default and still allows manual collapse', () => {
    render(
      <StatusSection label="Queue">
        <span>Queued prompt</span>
      </StatusSection>
    )

    expect(screen.getByText('Queued prompt')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))

    expect(screen.queryByText('Queued prompt')).toBeNull()
  })

  it('honors an explicit collapsed default', () => {
    render(
      <StatusSection defaultCollapsed label="Optional details">
        <span>Hidden detail</span>
      </StatusSection>
    )

    expect(screen.queryByText('Hidden detail')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Optional details' }))

    expect(screen.getByText('Hidden detail')).toBeTruthy()
  })
})
