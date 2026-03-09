import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heart Codec – Stéganographie Cardiaque",
  description: "Cachez un secret dans le rythme cardiaque visible d'une vidéo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body className="bg-[#0f1117] text-gray-200 min-h-screen">
        {children}
      </body>
    </html>
  );
}
