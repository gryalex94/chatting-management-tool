import { useState } from 'react'
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
export default function DismissModal({ task, onClose, onConfirm }) {
  const [code, setCode] = useState(null)
  const [note, setNote] = useState('')
  const needNote = code === 'other'
  const canConfirm = code && (!needNote || note.trim())
  const pick = (key) => {
    setCode(key)
    if (key !== 'other') onConfirm(key, note.trim())   // one click, done
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Why dismiss this?</DialogTitle>
          <DialogDescription>
            Pick a reason. It dismisses straight away.
            {task.creator_name || task.chatter_name
              ? ` ${[task.creator_name, task.chatter_name].filter(Boolean).join(' · ')}` : ''}
          </DialogDescription>
        </DialogHeader>
        <p className='rounded-md bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground'>{task.detail}</p>
        <div className='flex flex-wrap gap-2'>
          {DISMISS_REASONS.map(r => (
            <Button key={r.key} variant={code === r.key ? 'default' : 'outline'} size='sm' onClick={() => pick(r.key)}>
              {r.label}
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
