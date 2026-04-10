import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import type { Metadata } from "next";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "11za RAG AI | Production RAG Workspace",
  description: "Production-grade RAG automation for chat and WhatsApp workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} font-sans antialiased bg-[#f8fafc] text-[#0f172a] min-h-screen relative overflow-x-hidden`}
      >
        <div className="fixed inset-0 bg-grid z-[-1] opacity-5 pointer-events-none" />
        {children}
      </body>
    </html>
  );
}
