import type { Metadata } from 'next'
import './globals.css'
import { Nav } from './components/nav'

export const metadata: Metadata = {
  title: 'jrose11 Gen 1 Stat Tracker',
  description: 'Community stat tracker for jrose11\'s Gen 1 solo run series',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  )
}
