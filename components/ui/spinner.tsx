import { DotLoader } from "@/components/ui/matrix"

function Spinner(props: React.ComponentProps<"span">) {
  return <DotLoader data-slot="spinner" {...props} />
}

export { Spinner }
