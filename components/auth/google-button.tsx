'use client'

import { Button } from '@/components/ui/button'
import { signInWithGoogle } from '@/app/(auth)/actions'
import { useTransition } from 'react'
import { toast } from 'sonner'

export function GoogleButton() {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await signInWithGoogle()
      if (result?.error) {
        toast.error(result.error)
      }
    })
  }

  return (
    <Button variant="outline" className="w-full" onClick={handleClick} disabled={isPending}>
      Continue with Google
    </Button>
  )
}
