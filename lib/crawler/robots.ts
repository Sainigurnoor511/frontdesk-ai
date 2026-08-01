export function isAllowedByRobots(url: string, robotsTxt: string): boolean {
  const path = new URL(url).pathname
  const lines = robotsTxt.split('\n').map((l) => l.trim())

  let applies = false
  const disallowedPaths: string[] = []

  for (const line of lines) {
    if (/^user-agent:\s*\*/i.test(line)) {
      applies = true
      continue
    }
    if (/^user-agent:/i.test(line)) {
      applies = false
      continue
    }
    if (applies && /^disallow:/i.test(line)) {
      const value = line.split(':').slice(1).join(':').trim()
      if (value) disallowedPaths.push(value)
    }
  }

  return !disallowedPaths.some((disallowed) => path.startsWith(disallowed))
}
