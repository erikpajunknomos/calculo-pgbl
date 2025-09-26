export const metadata = {
  title: "IR + Previdência (PGBL) — CLT",
  description: "Calculadora educativa PGBL com projeções",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
