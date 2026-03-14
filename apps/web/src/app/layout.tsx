import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BullBearDetector',
  description: 'Real-time crypto market regime detection',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
