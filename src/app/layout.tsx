import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, Inter, Noto_Sans_JP, Noto_Serif_JP, Shippori_Mincho } from "next/font/google";
import "./globals.css";

// Inter: SaaS-standard for /admin (Linear / Stripe / Vercel / GitHub).
// Latin only — Japanese falls back to Noto Sans JP via the admin font stack.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

// Cinzel: primary Latin display (logo, numerals, eyebrow). Per TOP design spec.
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-cinzel",
  display: "swap",
});

// Noto Serif JP: JA display (H1, tagline, price, button label). Per TOP design spec.
const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-serif",
  display: "swap",
  preload: false,
});

// Noto Sans JP: JA body. Preloaded so first render of About / Experience
// body copy uses the designed font instead of system Hiragino fallback.
const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-noto-sans",
  display: "swap",
  preload: true,
});

// Legacy fonts — kept for components outside Hero that still reference
// --font-cormorant / --font-shippori (About, Experience, Menu, etc.).
// Once the full design spec cascades to all sections, these can be retired.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "500"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});
const shipporiMincho = Shippori_Mincho({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-shippori",
  display: "optional",
  preload: false,
});

const siteUrl = "https://reserve.daimasu.com.ph";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "DAIMASU — Master Owly's 8-Course Kaiseki Theatre | マスターの食卓",
  description:
    "Master Owly's eight-course kaiseki theatre. Ninety minutes, eight scenes, eight counter seats. Projection mapping dining in Manila, Philippines. | 8メートルの檜カウンターに八つの情景が浮かび上がる、マスター・アウリの懐石劇場。九十分・八皿・八席の没入型ダイニング。",
  openGraph: {
    title: "DAIMASU — Master Owly's Table",
    description:
      "Ninety minutes. Eight kaiseki courses. One monocled owl with a golden feather pen. An immersive projection-mapped dining theatre unfolding across an eight-meter hinoki counter in Manila.",
    type: "website",
    url: siteUrl,
    siteName: "DAIMASU",
    locale: "en_US",
    alternateLocale: "ja_JP",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "DAIMASU — Master Owly's 8-course kaiseki theatre",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DAIMASU — Master Owly's Table",
    description:
      "Ninety minutes. Eight kaiseki courses. Master Owly's projection-mapped dining theatre — Manila, Philippines.",
    images: ["/og-image.jpg"],
  },
  alternates: {
    canonical: siteUrl,
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "DAIMASU",
    statusBarStyle: "black-translucent",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "@id": `${siteUrl}/#restaurant`,
  name: "DAIMASU",
  alternateName: ["マスターの食卓", "Master Owly's Table", "大枡"],
  description:
    "An immersive projection-mapping kaiseki theatre. Master Owly guides guests through eight courses across an eight-meter hinoki counter — cherry gardens, temple kitchens, indigo depths, firelight, and more — in ninety minutes.",
  url: siteUrl,
  image: [`${siteUrl}/og-image.jpg`, `${siteUrl}/images/gallery-1.jpg`],
  logo: `${siteUrl}/logo.png`,
  servesCuisine: ["Japanese", "Kaiseki", "Omakase"],
  priceRange: "₱8,000",
  acceptsReservations: "True",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Ground Floor Allegro Center, Chino Roces Ave",
    addressLocality: "Makati",
    addressRegion: "Metro Manila",
    postalCode: "1232",
    addressCountry: "PH",
  },
  // Codex audit fix 2026-04-29: opening hours added so search engines can
  // surface the two seatings (17:30 and 20:00, 90 min each).
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "17:30",
      closes: "21:30",
    },
  ],
  isPartOf: {
    "@type": "Restaurant",
    "@id": "https://daimasu.com.ph/#restaurant",
    url: "https://daimasu.com.ph",
    name: "Daimasu Japanese Restaurant",
  },
  sameAs: [
    "https://www.facebook.com/DaimasuMakati",
    "https://www.instagram.com/daimasu_makati/",
  ],
  award: "Tatler Dining Philippines 2024",
  event: {
    "@type": "FoodEvent",
    name: "Master Owly's Table — 8-Course Projection Mapping Kaiseki",
    description:
      "A ninety-minute, eight-course projection mapping kaiseki experience. Each course opens with a Master Owly vignette, then settles into ambient imagery while the dish is served across an eight-meter hinoki counter.",
    duration: "PT1H30M",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: "DAIMASU Counter",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Makati",
        addressRegion: "Metro Manila",
        addressCountry: "PH",
      },
    },
    offers: {
      "@type": "Offer",
      price: "8000",
      priceCurrency: "PHP",
      availability: "https://schema.org/InStock",
      url: siteUrl,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${notoSerifJP.variable} ${notoSansJP.variable} ${inter.variable} ${cormorant.variable} ${shipporiMincho.variable}`}>
      <head>
        <meta name="theme-color" content="#0a0a0a" />
        {/*
          The site ships its own JA/EN toggle, so Chrome's auto-translate
          prompt overlay (triggered when html lang="en" doesn't match the
          rendered JA content for JA-locale browsers) is unwanted UX noise
          that overlaps the header CTA. notranslate hides the prompt without
          disabling manual translation from the browser menu. The actual
          html lang is rotated client-side via document.documentElement.lang
          in src/lib/language.tsx once the user's stored preference loads.
        */}
        <meta name="google" content="notranslate" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-serif antialiased">
        {children}
      </body>
    </html>
  );
}
