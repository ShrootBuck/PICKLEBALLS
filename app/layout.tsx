import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  viewportFit: "cover",
  // Light-only theme. Single theme color, no PWA tricks.
  themeColor: "#23412e",
  colorScheme: "light",
  interactiveWidget: "resizes-visual",
};

export const metadata: Metadata = {
  title: { default: "Pickle Balls", template: "%s · Pickle Balls" },
  description:
    "Schoolwork promises. Photo receipts. Friends who call the bluff.",
  applicationName: "Pickle Balls",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="apple-touch-icon" href="/apple-icon" />
      </head>
      <body className="touch-manipulation antialiased">
        <TooltipProvider>
          <Toaster>{children}</Toaster>
        </TooltipProvider>
      </body>
    </html>
  );
}
