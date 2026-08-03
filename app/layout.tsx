import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter, Geist, Geist_Mono, Roboto_Condensed } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const robotoCondensed = Roboto_Condensed({
  variable: "--font-roboto-condensed",
  subsets: ["latin"],
});

const bitcountPropSingle = localFont({
  src: "./fonts/bitcount-prop-single-latin.woff2",
  weight: "100 900",
  variable: "--font-bitcount",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Frontdesk.ai",
  description: "Open-source AI receptionist platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistSans.variable} ${geistMono.variable} ${robotoCondensed.variable} ${bitcountPropSingle.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
