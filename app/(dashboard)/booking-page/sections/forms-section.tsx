'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, ContactRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { BookingSection, SettingsCard } from '../section-layout'
import type { BookingPageConfig, CustomField } from '@/lib/data/booking-page-config'
import { updateForms } from '../actions'
import { usePreviewDraft } from '../preview-draft-context'

function newField(): CustomField {
  return { id: crypto.randomUUID(), label: '', type: 'text', required: false }
}

export function FormsSection({ config }: { config: BookingPageConfig }) {
  const { reportDraft } = usePreviewDraft()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState<CustomField[]>(config.customFields)

  const dirty = JSON.stringify(fields) !== JSON.stringify(config.customFields)

  function setFieldsDraft(next: CustomField[]) {
    setFields(next)
    reportDraft({ config: { customFields: next } })
  }

  function updateField(id: string, patch: Partial<CustomField>) {
    setFieldsDraft(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeField(id: string) {
    setFieldsDraft(fields.filter((f) => f.id !== id))
  }

  function handleSave() {
    setSaving(true)
    startTransition(async () => {
      const result = await updateForms({ customFields: fields })
      setSaving(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Form fields saved.')
    })
  }

  function handleCancel() {
    setFields(config.customFields)
  }

  return (
    <BookingSection>
      <SettingsCard
        title="Forms"
        description="Extra fields shown on the contact step, beyond name, email, and phone."
      >
          {fields.length === 0 && (
            <Empty className="border-0 py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ContactRound />
                </EmptyMedia>
                <EmptyTitle>No custom fields yet</EmptyTitle>
                <EmptyDescription>
                  Add fields to collect extra information on the contact step.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {fields.map((field) => (
            <div key={field.id} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={field.label}
                  onChange={(e) => updateField(field.id, { label: e.target.value })}
                  placeholder="Field label"
                  className="flex-1"
                />
                <Select
                  value={field.type}
                  onValueChange={(value) => updateField(field.id, { type: value as CustomField['type'] })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="dropdown">Dropdown</SelectItem>
                    <SelectItem value="checkbox">Checkbox</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeField(field.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {field.type === 'dropdown' && (
                <Input
                  value={(field.options ?? []).join(', ')}
                  onChange={(e) =>
                    updateField(field.id, {
                      options: e.target.value
                        .split(',')
                        .map((o) => o.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Options, comma separated"
                />
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Required</p>
                <Switch
                  checked={field.required}
                  onCheckedChange={(checked) => updateField(field.id, { required: checked })}
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            onClick={() => setFieldsDraft([...fields, newField()])}
          >
            <Plus className="size-4" />
            Add field
          </Button>
      </SettingsCard>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </BookingSection>
  )
}
