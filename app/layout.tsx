import type { Metadata } from "next";
import { Inter, Geist, Geist_Mono, Roboto_Condensed } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/seo/site";
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

/**
 * `metadataBase` is what lets Next resolve relative canonical and OG URLs into
 * absolute ones — without it, `alternates.canonical` and `openGraph.images`
 * emit relative paths that crawlers ignore.
 *
 * The title `template` means a page exporting `title: 'Clients'` renders as
 * "Clients · Frontdesk.ai", so routes stop sharing one tab title. `default`
 * covers routes that export no title of their own.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME} — AI receptionist for your business`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — AI receptionist for your business`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — AI receptionist for your business`,
    description: SITE_DESCRIPTION,
  },
  // Most of this app is an authenticated dashboard. Individual public routes
  // opt back into indexing; see `app/smb/[slug]/page.tsx`.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistSans.variable} ${geistMono.variable} ${robotoCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
