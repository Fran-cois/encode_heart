import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Heart Codec – Your heart can hold all your secrets",
  description:
    "Hide secret messages inside a video using cardiac steganography. Open-source experimental tool.",
  metadataBase: new URL("https://heart.famat.me"),
  openGraph: {
    title: "Heart Codec",
    description:
      "Hide secret messages inside a video by modulating the apparent heart rate detected through rPPG.",
    url: "https://heart.famat.me",
    siteName: "Heart Codec",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Heart Codec",
    description:
      "Hide secret messages inside a video using cardiac steganography.",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen`}>
        {children}
        <Script id="matomo" strategy="afterInteractive">
          {`
            var _paq = window._paq = window._paq || [];
            _paq.push(['trackPageView']);
            _paq.push(['enableLinkTracking']);
            (function() {
              var u="//matomo.famat.me/";
              _paq.push(['setTrackerUrl', u+'matomo.php']);
              _paq.push(['setSiteId', '5']);
              var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
              g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
            })();
          `}
        </Script>
      </body>
    </html>
  );
}
