import { useCallback, useLayoutEffect, useRef } from 'react'

import { StatusRow } from '@/components/chat/status-row'
import { StatusSection } from '@/components/chat/status-section'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { type Translations, useI18n } from '@/i18n'
import { ArrowUp, iconSize, Pencil, Trash2 } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { QueuedPromptEntry } from '@/store/composer-queue'

interface QueuePanelProps {
  busy: boolean
  editingId: null | string
  entries: QueuedPromptEntry[]
  onDelete: (id: string) => void
  onEdit: (entry: QueuedPromptEntry) => void
  onSendNow: (id: string) => void
}

const entryPreview = (entry: QueuedPromptEntry, c: Translations['composer']) =>
  entry.text.trim() || (entry.attachments.length > 0 ? c.attachmentOnly : c.emptyTurn)

export function QueuePanel({ busy, editingId, entries, onDelete, onEdit, onSendNow }: QueuePanelProps) {
  const { t } = useI18n()
  const c = t.composer
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const previousEntryIdsRef = useRef(new Set(entries.map(entry => entry.id)))
  const pendingEntryIdRef = useRef<string | null>(null)

  const flushPendingScroll = useCallback((viewport: HTMLDivElement | null) => {
    if (!viewport || !pendingEntryIdRef.current) {
      return
    }

    viewport.scrollTop = viewport.scrollHeight
    pendingEntryIdRef.current = null
  }, [])

  const setViewportRef = useCallback(
    (viewport: HTMLDivElement | null) => {
      viewportRef.current = viewport
      flushPendingScroll(viewport)
    },
    [flushPendingScroll]
  )

  useLayoutEffect(() => {
    const previousEntryIds = previousEntryIdsRef.current
    const currentEntryIds = new Set(entries.map(entry => entry.id))
    const newestEntryId = entries.at(-1)?.id
    const pendingEntryId = pendingEntryIdRef.current

    if (newestEntryId && !previousEntryIds.has(newestEntryId)) {
      pendingEntryIdRef.current = newestEntryId
    } else if (pendingEntryId && !currentEntryIds.has(pendingEntryId)) {
      pendingEntryIdRef.current = null
    }

    previousEntryIdsRef.current = currentEntryIds
    flushPendingScroll(viewportRef.current)
  }, [entries, flushPendingScroll])

  if (entries.length === 0) {
    return null
  }

  return (
    <StatusSection
      icon={<Codicon className="text-muted-foreground/70" name="layers" size="0.8rem" />}
      label={c.queued(entries.length)}
    >
      <div
        aria-label={c.queued(entries.length)}
        className="max-h-40 overflow-y-auto overscroll-contain"
        ref={setViewportRef}
        role="region"
      >
        {entries.map(entry => {
          const isEditing = editingId === entry.id
          const attachmentsCount = entry.attachments.length

          return (
            <StatusRow
              className={cn(
                'border border-transparent',
                isEditing && 'border-[color-mix(in_srgb,var(--dt-composer-ring)_40%,transparent)] bg-accent/25'
              )}
              key={entry.id}
              trailing={
                <>
                  <Tip label={c.queueEdit}>
                    <Button
                      aria-label={c.queueEdit}
                      className="size-5 rounded-md"
                      disabled={Boolean(editingId) && !isEditing}
                      onClick={() => onEdit(entry)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Pencil className={iconSize.xs} />
                    </Button>
                  </Tip>
                  <Tip label={busy ? c.queueSendNext : c.queueSend}>
                    <Button
                      aria-label={busy ? c.queueSendNext : c.queueSend}
                      className="size-5 rounded-md"
                      disabled={isEditing}
                      onClick={() => onSendNow(entry.id)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowUp className={iconSize.xs} />
                    </Button>
                  </Tip>
                  <Tip label={c.queueDelete}>
                    <Button
                      aria-label={c.queueDelete}
                      className="size-5 rounded-md"
                      onClick={() => onDelete(entry.id)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className={iconSize.xs} />
                    </Button>
                  </Tip>
                </>
              }
              trailingVisible={isEditing}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.73rem] leading-4 text-foreground/92">{entryPreview(entry, c)}</p>
                {(attachmentsCount > 0 || isEditing) && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[0.64rem] text-muted-foreground/75">
                    {attachmentsCount > 0 && <span>{c.attachments(attachmentsCount)}</span>}
                    {isEditing && (
                      <span className="text-[color-mix(in_srgb,var(--dt-composer-ring)_78%,var(--muted-foreground))]">
                        {c.editingInComposer}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </StatusRow>
          )
        })}
      </div>
    </StatusSection>
  )
}
