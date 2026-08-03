'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback?: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
        }
      ) => string
      remove: (widgetId: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export function Turnstile({
  siteKey,
  theme = 'light',
  onToken,
  onExpire,
}: {
  siteKey: string
  theme?: 'light' | 'dark' | 'auto'
  onToken: (token: string) => void
  onExpire?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    const script =
      existingScript ??
      (() => {
        const element = document.createElement('script')
        element.src = SCRIPT_SRC
        element.async = true
        element.defer = true
        document.head.appendChild(element)
        return element
      })()

    const render = () => {
      if (!window.turnstile) return
      const widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: onToken,
        'expired-callback': onExpire,
        theme,
      })
      widgetIdRef.current = widgetId
    }

    if (window.turnstile) {
      render()
    } else {
      script.addEventListener('load', render)
    }

    return () => {
      script.removeEventListener('load', render)
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [siteKey, theme, onToken, onExpire])

  return <div ref={containerRef} />
}
