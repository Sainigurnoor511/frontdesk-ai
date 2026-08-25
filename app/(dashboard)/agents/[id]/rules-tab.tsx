'use client'

import { useState, useTransition } from 'react'
import { ListChecks, Plus, Pencil, Trash, Users, ShieldCheck, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import type { AgentRule } from '@/lib/data/agent-rules'
import { createAgentRule, updateAgentRule, toggleAgentRule, deleteAgentRule } from './actions'

type RuleFormState = { id?: string; trigger: string; action: string }

const emptyForm: RuleFormState = { trigger: '', action: '' }

export function RulesTab({
  agentId,
  rules: initialRules,
  onGoToGeneral,
  onGoToCallSettings,
}: {
  agentId: string
  rules: AgentRule[]
  onGoToGeneral: () => void
  onGoToCallSettings: () => void
}) {
  const [rules, setRules] = useState(initialRules)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<RuleFormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AgentRule | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEditMode = Boolean(form.id)

  function openAddDialog() {
    setForm(emptyForm)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(rule: AgentRule) {
    setForm({ id: rule.id, trigger: rule.trigger, action: rule.action })
    setFormError(null)
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    startTransition(async () => {
      if (form.id) {
        const result = await updateAgentRule(agentId, {
          id: form.id,
          trigger: form.trigger,
          action: form.action,
        })
        if ('error' in result) {
          setFormError(result.error)
          return
        }
        setRules((prev) =>
          prev.map((r) => (r.id === form.id ? { ...r, trigger: form.trigger, action: form.action } : r))
        )
      } else {
        const result = await createAgentRule(agentId, {
          trigger: form.trigger,
          action: form.action,
        })
        if ('error' in result) {
          setFormError(result.error)
          return
        }
        setRules((prev) => [...prev, result.rule])
      }

      setDialogOpen(false)
      setForm(emptyForm)
    })
  }

  function handleToggle(rule: AgentRule, isEnabled: boolean) {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: isEnabled } : r)))
    startTransition(async () => {
      const result = await toggleAgentRule(agentId, { id: rule.id, isEnabled })
      if ('error' in result) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: !isEnabled } : r))
        )
      }
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget

    startTransition(async () => {
      await deleteAgentRule(agentId, { id: target.id })
      setRules((prev) => prev.filter((r) => r.id !== target.id))
      setDeleteTarget(null)
    })
  }

  if (rules.length === 0) {
    return (
      <>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecks />
            </EmptyMedia>
            <EmptyTitle>No rules yet</EmptyTitle>
            <EmptyDescription>
              Rules tell your receptionist how to behave - what to do in specific situations and
              when to hand a call to a person.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
              <Card size="sm">
                <CardContent className="space-y-1">
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Guide behavior</p>
                  <p className="text-xs text-muted-foreground">
                    Guide how it handles specific situations
                  </p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="space-y-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Handoff to a human</p>
                  <p className="text-xs text-muted-foreground">Set when to transfer to a human</p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="space-y-1">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Consistent</p>
                  <p className="text-xs text-muted-foreground">Applied consistently on every call</p>
                </CardContent>
              </Card>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openAddDialog}>
                <Plus />
                Add a rule
              </Button>
              <Button variant="outline" onClick={onGoToCallSettings}>
                Call routing
              </Button>
            </div>
          </EmptyContent>
        </Empty>
        <RuleDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          form={form}
          setForm={setForm}
          isEditMode={isEditMode}
          formError={formError}
          isPending={isPending}
          onSubmit={handleSubmit}
        />
      </>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <SectionText
          title="Rules"
          description="Specific situations and how the receptionist should handle them."
        />
        <Button size="sm" onClick={openAddDialog}>
          <Plus />
          Add rule
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm">
                    <span className="font-medium">When {rule.trigger}</span>
                    {', '}
                    <span className="text-muted-foreground">{rule.action}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={rule.is_enabled}
                    onCheckedChange={(checked) => handleToggle(rule, checked)}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit rule"
                    onClick={() => openEditDialog(rule)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete rule"
                    onClick={() => setDeleteTarget(rule)}
                  >
                    <Trash />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Need the receptionist to answer calls a certain way overall? Use{' '}
        <button type="button" onClick={onGoToGeneral} className="underline underline-offset-4">
          instructions
        </button>{' '}
        instead. Rules are for specific, recurring situations.
      </p>

      <RuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        isEditMode={isEditMode}
        formError={formError}
        isPending={isPending}
        onSubmit={handleSubmit}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="gap-1.5">
              <X />
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/80"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SectionText({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function RuleDialog({
  open,
  onOpenChange,
  form,
  setForm,
  isEditMode,
  formError,
  isPending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: RuleFormState
  setForm: (form: RuleFormState) => void
  isEditMode: boolean
  formError: string | null
  isPending: boolean
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit rule' : 'Add a rule'}</DialogTitle>
            <DialogDescription>
              Describe the situation and how the receptionist should handle it.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="rule-trigger" className="text-sm font-medium">
                  When
                </label>
                <Textarea
                  id="rule-trigger"
                  value={form.trigger}
                  onChange={(e) => setForm({ ...form, trigger: e.target.value })}
                  placeholder="a caller asks about pricing"
                  required
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="rule-action" className="text-sm font-medium">
                  The receptionist should
                </label>
                <Textarea
                  id="rule-action"
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value })}
                  placeholder="say pricing details are on the website and offer to transfer to staff"
                  required
                  rows={2}
                />
              </div>

              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => onOpenChange(false)}
            >
              <X />
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5" disabled={isPending}>
              {isEditMode ? <Check /> : <Plus />}
              {isEditMode ? 'Save changes' : 'Add rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
