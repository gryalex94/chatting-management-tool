import { useEffect, useState } from 'react'
import { DISMISS_REASONS } from '@/utils/taskMeta'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

// Picking a reason dismisses IMMEDIATELY — one click, same as Complete.
// Dismissing used to cost four actions while completing cost one, so the cheap
// action won and false positives were being marked "done". That is actively
// harmful: a completed task that recurs reopens as a REGRESSION and gets bumped
// UP a tier, so wrongly completing a false positive makes it louder every time,
// while dismissing it makes it stop. The reasons are also the only signal we
// have for correcting the AI, so they have to be effortless to give.
// 'other' still needs a note, so it keeps the confirm button.
// Keys 1–6 pick a reason (when the note box isn't focused). `task` is null for
// a bulk dismiss of `count` tasks.
export default function DismissModal({ task, count, onClose, onConfirm }) {
  const [code, setCode] = useState(null)
  const [note, setNote] = useState('')
  const needNote = code === 'other'
  const canConfirm = code && (!needNote || note.trim())
  const pick = (key) => {
    setCode(key)
    if (key !== 'other') onConfirm(key, note.trim())   // one click, done
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return
      const r = DISMISS_REASONS[Number(e.key) - 1]
      if (r) { e.preventDefault(); pick(r.key) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const where = task ? [task.creator_name, task.chatter_name].filter(Boolean).join(' · ') : ''
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{task ? 'Why dismiss this?' : `Why dismiss these ${count} tasks?`}</DialogTitle>
          <DialogDescription>
            Pick a reason (or press 1–{DISMISS_REASONS.length}). It dismisses straight away.{where ? ` ${where}` : ''}
          </DialogDescription>
        </DialogHeader>
        {task && <p className='rounded-md bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground'>{task.detail || task.title}</p>}
        <div className='flex flex-wrap gap-2'>
          {DISMISS_REASONS.map((r, i) => (
            <Button key={r.key} variant={code === r.key ? 'default' : 'outline'} size='sm' onClick={() => pick(r.key)}>
              <span className='font-mono text-xs opacity-60'>{i + 1}</span>{r.label}
            </Button>
          ))}
        </div>
        <Textarea id='dismiss-note' value={note} onChange={e => setNote(e.target.value)} autoFocus={needNote}
          placeholder={needNote ? 'Required: explain why…' : 'Adding detail? Type it here first, then pick a reason above.'} />
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancel</Button>
          {needNote && <Button disabled={!canConfirm} onClick={() => onConfirm(code, note.trim())}>Dismiss task</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
