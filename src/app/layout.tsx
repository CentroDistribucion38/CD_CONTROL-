import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CONTROL",
  description: "Plataforma modular de gestión operativa",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
