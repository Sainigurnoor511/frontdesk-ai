'use client'

import { useState } from 'react'
import { Check, Copy, Download, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Shows a freshly issued set of recovery codes, the one time they exist in plaintext. Nothing can
 * fetch them again, so the dialog says so and offers copy and download before it is closed.
 */
export function RecoveryCodesDialog({
  codes,
  onClose,
}: {
  codes: string[] | null
  onClose: () => void
}) {
  const text = codes?.join('\n') ?? ''
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy. Select the codes and copy them, or download them instead.')
    }
  }

  function handleDownload() {
    const blob = new Blob(
      [`Frontdesk.ai recovery codes\nEach code works once.\n\n${text}\n`],
      { type: 'text/plain' }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'frontdesk-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog
      open={codes !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save your recovery codes</DialogTitle>
          <DialogDescription>
            If you lose your authenticator app, sign in with your password and enter one of these
            codes. Each code works once, and using one turns off two-factor authentication.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <ul
            aria-label="Recovery codes"
            className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md border bg-muted/40 px-4 py-3 font-mono text-sm"
          >
            {codes?.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <p className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            These codes will not be shown again. Store them somewhere safe, away from your phone.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCopy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button type="button" variant="outline" onClick={handleDownload}>
            <Download aria-hidden />
            Download
          </Button>
          <Button type="button" onClick={onClose}>
            I have saved them
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
