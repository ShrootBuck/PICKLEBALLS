import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppRefreshProvider } from "@/components/layout/app-refresh-provider";
import { RegisterSw } from "@/components/pwa/register-sw";
import { AppearanceProvider } from "@/components/settings/appearance-provider";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parsePrimaryColor } from "@/lib/appearance";
import { getPrisma } from "@/lib/prisma";
import { getPageSession } from "@/lib/request";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "./fonts/InterVariable.woff2", weight: "100 900", style: "normal" },
    {
      path: "./fonts/InterVariable-Italic.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const commitMono = localFont({
  src: [
    {
      path: "./fonts/CommitMono-VF.woff2",
      weight: "200 700",
      style: "normal",
    },
    {
      path: "./fonts/CommitMono-VF.woff2",
      weight: "200 700",
      style: "italic",
    },
  ],
  variable: "--font-commit-mono",
  preload: false,
  display: "swap",
  fallback: ["monospace"],
  adjustFontFallback: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  viewportFit: "cover",
  themeColor: "#111113",
  colorScheme: "dark",
  interactiveWidget: "resizes-visual",
};

export const metadata: Metadata = {
  title: { default: "Pickle Balls", template: "%s · Pickle Balls" },
  description:
    "Schoolwork promises. Photo receipts. Friends who call the bluff.",
  applicationName: "Pickle Balls",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Pickle Balls",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  icons: {
    icon: [
      { url: "/icon", type: "image/png", sizes: "512x512" },
      { url: "/icon", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
    shortcut: "/icon",
  },
  openGraph: {
    title: "Pickle Balls",
    description:
      "Schoolwork promises. Photo receipts. Friends who call the bluff.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Pickle Balls",
    description:
      "Schoolwork promises. Photo receipts. Friends who call the bluff.",
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://pickle-balls.com",
  ),
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPageSession();
  const user = session
    ? await getPrisma().user.findUnique({
        where: { id: session.user.id },
        select: { primaryColor: true },
      })
    : null;
  const primaryColor = parsePrimaryColor(user?.primaryColor);
  return (
    <html
      lang="en"
      data-primary-color={primaryColor}
      className={`dark ${inter.variable} ${commitMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="apple-touch-icon" href="/apple-icon" />
      </head>
      <body className="flex h-dvh min-h-0 flex-col overflow-hidden touch-manipulation antialiased">
        <RegisterSw />
        <AppRefreshProvider
          userId={session?.user.id ?? null}
          version={crypto.randomUUID()}
        >
          <AppearanceProvider
            key={session?.user.id ?? "guest"}
            initialColor={primaryColor}
          >
            <TooltipProvider>
              <Toaster>
                <div
                  data-slot="app-frame"
                  className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto"
                >
                  {children}
                </div>
              </Toaster>
            </TooltipProvider>
          </AppearanceProvider>
        </AppRefreshProvider>
      </body>
    </html>
  );
}
