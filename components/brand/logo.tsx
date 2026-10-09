import { cn } from '@/lib/utils'
import { LOCKUP_GAP, LOCKUP_MARK_SCALE, MARK, WORDMARK, type LogoShape } from './logo-data'

type LogoProps = Omit<React.ComponentProps<'svg'>, 'children' | 'viewBox'> & {
  title?: string
}

function dots(shape: LogoShape, key: string, x = 0, y = 0, scale = 1) {
  const circles = []
  for (let i = 0; i < shape.points.length; i += 2) {
    circles.push(
      <circle
        key={`${key}-${i}`}
        cx={x + shape.points[i] * scale}
        cy={y + shape.points[i + 1] * scale}
        r={shape.radius * scale}
      />
    )
  }
  return circles
}

function LogoSvg({
  box,
  title = 'Frontdesk.ai',
  className,
  children,
  ...props
}: LogoProps & { box: [number, number]; children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${box[0]} ${box[1]}`}
      fill="currentColor"
      role="img"
      aria-label={title || 'Frontdesk.ai'}
      className={cn('shrink-0', className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

function LogoMark(props: LogoProps) {
  return (
    <LogoSvg data-slot="logo-mark" box={[MARK.width, MARK.height]} {...props}>
      {dots(MARK, 'mark')}
    </LogoSvg>
  )
}

function LogoWordmark(props: LogoProps) {
  return (
    <LogoSvg data-slot="logo-wordmark" box={[WORDMARK.width, WORDMARK.height]} {...props}>
      {dots(WORDMARK, 'wordmark')}
    </LogoSvg>
  )
}

const markWidth = MARK.width * LOCKUP_MARK_SCALE
const markHeight = MARK.height * LOCKUP_MARK_SCALE
const wordmarkX = markWidth + LOCKUP_GAP
const wordmarkY = (markHeight - WORDMARK.height) / 2

const LOGO_ASPECT = (wordmarkX + WORDMARK.width) / markHeight

function Logo(props: LogoProps) {
  return (
    <LogoSvg data-slot="logo" box={[wordmarkX + WORDMARK.width, markHeight]} {...props}>
      {dots(MARK, 'mark', 0, 0, LOCKUP_MARK_SCALE)}
      {dots(WORDMARK, 'wordmark', wordmarkX, wordmarkY)}
    </LogoSvg>
  )
}

export { Logo, LogoMark, LogoWordmark, LOGO_ASPECT }
