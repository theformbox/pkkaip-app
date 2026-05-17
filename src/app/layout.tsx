import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PKKAIP — Persatuan Kebun Komuniti Anak Istimewa Puchong",
  description: "Community garden café POS and plant QR database for PKKAIP, Puchong.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ms">
      <body>{children}</body>
    </html>
  );
}
