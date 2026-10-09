'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      scriptProps={typeof window === 'undefined' ? undefined : { type: 'application/json' }}
    >
      {children}
    </NextThemesProvider>
  )
}
