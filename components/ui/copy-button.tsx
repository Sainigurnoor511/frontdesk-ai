'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, type buttonVariants } from '@/components/ui/button'
import type { VariantProps } from 'class-variance-authority'

type CopyButtonProps = {
  value: string
  className?: string
  size?: VariantProps<typeof buttonVariants>['size']
}

export function CopyButton({ value, className, size = 'icon' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}
