import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const standaloneDir = join(root, '.next/standalone')
const staticSrc = join(root, '.next/static')
const staticDest = join(standaloneDir, '.next/static')
const publicSrc = join(root, 'public')
const publicDest = join(standaloneDir, 'public')

if (!existsSync(standaloneDir)) {
  console.error('[prepare-standalone] Missing .next/standalone. Run `pnpm build` first.')
  process.exit(1)
}

mkdirSync(join(standaloneDir, '.next'), { recursive: true })
cpSync(staticSrc, staticDest, { recursive: true })
cpSync(publicSrc, publicDest, { recursive: true })

console.log('[prepare-standalone] Copied public/ and .next/static into standalone output.')
