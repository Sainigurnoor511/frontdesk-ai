import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted bg-[image:radial-gradient(var(--dot)_1px,transparent_1.2px)] bg-[size:6px_6px]", className)}
      {...props}
    />
  )
}

export { Skeleton }
