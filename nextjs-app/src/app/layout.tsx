import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
      </body>
    </html>
  );
}
