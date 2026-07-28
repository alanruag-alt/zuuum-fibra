import type { Metadata, Viewport } from 'next';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'ZUUUM FIBRA · Panel',
  description: 'Administración de ZUUUM FIBRA · ISP mixto FTTH y WISP',
  icons: {
    icon: '/icono-zuuum.png',
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2e2f44',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
