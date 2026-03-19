import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'jrose11 Gen 1 Stat Tracker',
  description: 'Community stat tracker for jrose11\'s Gen 1 solo run series',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
