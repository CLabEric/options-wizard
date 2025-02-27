'use client'

import ThemeProvider from './theme-provider'

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider forcedTheme="dark">{children}</ThemeProvider>
}