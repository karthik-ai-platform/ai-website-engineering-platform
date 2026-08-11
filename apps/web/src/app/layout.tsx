import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'AI Website Engineering Platform',
    template: '%s - AI Website Engineering Platform',
  },
  description: 'Governed, cost-aware website engineering from intent to verified delivery.',
}

interface RootLayoutProps {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
