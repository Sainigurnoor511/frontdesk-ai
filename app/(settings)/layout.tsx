import { ThemeProvider } from '@/components/layout/theme-provider'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}
