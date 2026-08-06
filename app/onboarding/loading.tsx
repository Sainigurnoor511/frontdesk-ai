import { Skeleton } from '@/components/ui/skeleton'
import { SkeletonFormCard } from '@/components/layout/dashboard-skeletons'

export default function OnboardingLoading() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6 py-8">
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-48" />
        <Skeleton className="mx-auto h-4 w-64" />
      </div>
      <SkeletonFormCard />
    </div>
  )
}
