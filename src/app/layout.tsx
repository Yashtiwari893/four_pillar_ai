import "./globals.css";
import type { Metadata } from "next";

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
        className="font-sans antialiased bg-[#f8fafc] text-[#0f172a] min-h-screen relative overflow-x-hidden"
      >
        <div className="fixed inset-0 bg-grid z-[-1] opacity-5 pointer-events-none" />
        {children}
      </body>
    </html>
  );
}
