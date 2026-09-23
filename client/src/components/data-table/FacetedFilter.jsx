import { Check, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

/**
 * Multi-select filter button (shadcn-admin's faceted filter), driven by plain
 * state instead of a table instance.
 *   options: [{ value, label, count? }]   selected: string[]   onChange(string[])
 */
export function FacetedFilter({ title, options, selected, onChange }) {
  const set = new Set(selected)
  const toggle = (value) => {
    const next = new Set(set)
    next.has(value) ? next.delete(value) : next.add(value)
    onChange([...next])
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='h-8 border-dashed'>
          <PlusCircle className='size-4' />
          {title}
          {set.size > 0 && (
            <>
              <Separator orientation='vertical' className='mx-1 h-4' />
              <Badge variant='secondary' className='rounded-sm px-1 font-normal lg:hidden'>{set.size}</Badge>
              <div className='hidden gap-1 lg:flex'>
                {set.size > 2
                  ? <Badge variant='secondary' className='rounded-sm px-1 font-normal'>{set.size} selected</Badge>
                  : options.filter(o => set.has(o.value)).map(o => (
                    <Badge variant='secondary' key={o.value} className='rounded-sm px-1 font-normal'>{o.label}</Badge>
                  ))}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-56 p-0' align='start'>
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map(o => {
                const on = set.has(o.value)
                return (
                  <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                    <div className={cn('flex size-4 items-center justify-center rounded-sm border border-primary',
                      on ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible')}>
                      <Check className='size-3.5 text-background' />
                    </div>
                    <span className='truncate'>{o.label}</span>
                    {o.count != null && <span className='ms-auto font-mono text-xs text-muted-foreground'>{o.count}</span>}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {set.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className='justify-center text-center'>Clear filters</CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
