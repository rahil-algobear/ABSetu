import type { Metadata, Viewport } from "next";
import "../styles/globals.css";
import Providers from "../components/Providers";
import MainLayout from "../components/layout";
import { generatePageTitle } from "../utils/metadata";

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  title: generatePageTitle(),
  description: "ABSetu - NGO outreach tracking",
  icons: {
    icon: [
      { url: '/favicons/favicon.ico', sizes: 'any' },
      { url: '/favicons/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicons/favicon.svg', type: 'image/svg+xml' }
    ],
    apple: '/favicons/apple-touch-icon.png',
    other: [
      {
        rel: 'web-app-manifest',
        url: '/favicons/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        rel: 'web-app-manifest',
        url: '/favicons/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  },
  manifest: '/favicons/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: generatePageTitle()
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicons/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicons/favicon-96x96.png" sizes="96x96" type="image/png" />
        <link rel="icon" href="/favicons/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/favicons/apple-touch-icon.png" />
        <link rel="manifest" href="/favicons/manifest.json" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className="font-sans">
        <Providers>
          <MainLayout>{children}</MainLayout>
        </Providers>
      </body>
    </html>
  );
} 