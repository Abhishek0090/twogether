import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/app/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Twogether",
  description: "A private chat app for the two of you.",
  applicationName: "Twogether",
  appleWebApp: { capable: true, title: "Twogether", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
};

// Applies the saved theme before the first paint, so dark mode does not flash white.
const themeScript = `(function(){try{var t=localStorage.getItem('tg-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
