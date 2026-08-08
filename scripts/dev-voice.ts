import { spawn } from 'node:child_process'
import { config } from 'dotenv'

config({ path: '.env.local' })

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error(
    'Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET in .env.local'
  )
  process.exit(1)
}

const nodeOptions = (() => {
  const existing = process.env.NODE_OPTIONS ?? ''
  return existing.includes('tsx') ? existing : `${existing} --import tsx`.trim()
})()

const child = spawn(
  'lk',
  [
    'agent',
    'dev',
    'workers/voice-agent.ts',
    '--url',
    LIVEKIT_URL,
    '--api-key',
    LIVEKIT_API_KEY,
    '--api-secret',
    LIVEKIT_API_SECRET,
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  }
)

child.on('error', (err) => {
  if ('code' in err && err.code === 'ENOENT') {
    console.error(
      'LiveKit CLI (lk) not found. Install it: winget install LiveKit.LiveKitCLI'
    )
  } else {
    console.error('Failed to start voice agent:', err)
  }
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
