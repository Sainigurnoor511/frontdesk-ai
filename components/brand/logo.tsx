import { cn } from '@/lib/utils'
import { LOCKUP_GAP, LOCKUP_MARK_SCALE, MARK, WORDMARK, type LogoShape } from './logo-data'

type LogoProps = Omit<React.ComponentProps<'svg'>, 'children' | 'viewBox'> & {
  title?: string
}

const TYPE_STEP_MS = 70

function letterIndexes(shape: LogoShape): number[] {
  const columns = [...new Set(shape.points.filter((_, i) => i % 2 === 0))].sort((a, b) => a - b)
  const letterOfColumn = new Map<number, number>()
  let letter = 0
  columns.forEach((column, i) => {
    if (i > 0 && column - columns[i - 1] > shape.radius * 2) letter += 1
    letterOfColumn.set(column, letter)
  })
  const indexes: number[] = []
  for (let i = 0; i < shape.points.length; i += 2) {
    indexes.push(letterOfColumn.get(shape.points[i]) ?? 0)
  }
  return indexes
}

const WORDMARK_LETTERS = letterIndexes(WORDMARK)
const WORDMARK_LETTER_COUNT = Math.max(...WORDMARK_LETTERS) + 1

function dots(shape: LogoShape, key: string, x = 0, y = 0, scale = 1, letters?: number[]) {
  const circles = []
  for (let i = 0; i < shape.points.length; i += 2) {
    circles.push(
      <circle
        key={`${key}-${i}`}
        cx={x + shape.points[i] * scale}
        cy={y + shape.points[i + 1] * scale}
        r={shape.radius * scale}
        className={letters ? 'logo-letter' : undefined}
        style={letters ? { animationDelay: `${letters[i / 2] * TYPE_STEP_MS}ms` } : undefined}
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

function Logo({ typeOnHover = false, className, ...props }: LogoProps & { typeOnHover?: boolean }) {
  return (
    <LogoSvg
      data-slot="logo"
      box={[wordmarkX + WORDMARK.width, markHeight]}
      className={cn(typeOnHover && 'logo-type overflow-visible', className)}
      {...props}
    >
      {dots(MARK, 'mark', 0, 0, LOCKUP_MARK_SCALE)}
      {dots(WORDMARK, 'wordmark', wordmarkX, wordmarkY, 1, typeOnHover ? WORDMARK_LETTERS : undefined)}
      {typeOnHover && (
        <rect
          className="logo-cursor"
          x={wordmarkX + WORDMARK.width + WORDMARK.radius * 3}
          y={wordmarkY + WORDMARK.radius * 2}
          width={WORDMARK.radius * 2}
          height={WORDMARK.height - WORDMARK.radius * 2}
          style={{ animationDelay: `${WORDMARK_LETTER_COUNT * TYPE_STEP_MS}ms` }}
        />
      )}
    </LogoSvg>
  )
}

export { Logo, LogoMark, LogoWordmark, LOGO_ASPECT }
