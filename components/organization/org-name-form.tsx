'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  organizationNameSchema,
  type OrganizationNameInput,
} from '@/lib/validations/organization'
import { updateOrganizationName } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export function OrgNameForm({
  orgId,
  initialName,
  canEdit,
}: {
  orgId: string
  initialName: string
  canEdit: boolean
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationNameInput>({
    resolver: zodResolver(organizationNameSchema),
    defaultValues: { name: initialName },
  })

  async function onSubmit(input: OrganizationNameInput) {
    const result = await updateOrganizationName(orgId, input)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Organization name updated.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Organization name</Label>
        <Input id="name" disabled={!canEdit} {...register('name')} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      {canEdit && (
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      )}
    </form>
  )
}
