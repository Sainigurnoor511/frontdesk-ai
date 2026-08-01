'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { callRoutingSchema, type CallRoutingInput } from '@/lib/validations/agent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export function CallRoutingStep({
  initialData,
  onNext,
  onBack,
}: {
  initialData?: Partial<CallRoutingInput>
  onNext: (data: CallRoutingInput) => void
  onBack: () => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CallRoutingInput>({
    resolver: zodResolver(callRoutingSchema),
    defaultValues: {
      answeringMode: initialData?.answeringMode ?? 'staff_first',
      staffPhoneNumber: initialData?.staffPhoneNumber ?? '',
      maxRingSeconds: initialData?.maxRingSeconds ?? 20,
      holdMusic: initialData?.holdMusic,
    },
  })

  const answeringMode = watch('answeringMode')

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Calls on your terms</h1>
        <p className="text-muted-foreground">Route calls to staff first or let your agent handle them.</p>
      </div>
      <div className="space-y-2">
        <Label>Who answers first</Label>
        <RadioGroup
          value={answeringMode}
          onValueChange={(v) => setValue('answeringMode', v as CallRoutingInput['answeringMode'])}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="staff_first" id="staff_first" />
            <Label htmlFor="staff_first">Staff first</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="agent_first" id="agent_first" />
            <Label htmlFor="agent_first">Agent first</Label>
          </div>
        </RadioGroup>
      </div>
      <div className="space-y-2">
        <Label htmlFor="staffPhoneNumber">Staff phone number</Label>
        <Input id="staffPhoneNumber" placeholder="+1 555 123 4567" {...register('staffPhoneNumber')} />
        {errors.staffPhoneNumber && (
          <p className="text-sm text-destructive">{errors.staffPhoneNumber.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="maxRingSeconds">Maximum ring time (seconds)</Label>
        <Input
          id="maxRingSeconds"
          type="number"
          {...register('maxRingSeconds', { valueAsNumber: true })}
        />
        {errors.maxRingSeconds && (
          <p className="text-sm text-destructive">{errors.maxRingSeconds.message}</p>
        )}
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" type="button" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Finish'}
        </Button>
      </div>
    </form>
  )
}
