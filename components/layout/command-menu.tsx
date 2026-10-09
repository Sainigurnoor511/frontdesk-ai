'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Search } from 'lucide-react'
import {
  CommandDialog,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Kbd } from '@/components/ui/kbd'
import { navSections } from './app-sidebar'

export function CommandMenu({ businessName }: { businessName?: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  function go(url: string) {
    setOpen(false)
    router.push(url)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-56 items-center gap-2 rounded-md border bg-background px-2 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Jump to...</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Jump to"
        description="Search pages and go there."
      >
        <Command>
          <CommandInput placeholder="Search pages..." />
          <CommandList>
            <CommandEmpty>No page matches that search.</CommandEmpty>
            {navSections.map((section, index) => (
              <CommandGroup key={index} heading={section.label ?? 'General'}>
                {section.isSetup && (
                  <CommandItem value={`business ${businessName ?? ''}`} onSelect={() => go('/business')}>
                    <Building2 />
                    {businessName ?? 'Business'}
                  </CommandItem>
                )}
                {section.items.map((item) => (
                  <CommandItem key={item.url} value={item.title} onSelect={() => go(item.url)}>
                    <item.icon />
                    {item.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
