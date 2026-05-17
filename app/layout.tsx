export const metadata = {
  title: "PKKAIP",
  description: "Persatuan Kebun Komuniti Anak Istimewa Puchong",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
