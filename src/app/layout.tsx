export const metadata = {
  title: "IR + Previdência (PGBL) — CLT",
  description: "Calculadora PGBL para CLT",
};

import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
