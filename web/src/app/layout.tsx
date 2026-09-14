import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavInferior from "@/components/NavInferior";

export const metadata: Metadata = {
  title: "Gastos — Elvis & Gabi",
  description: "Controle de gastos compartilhado",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08080c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">
        <div className="mx-auto w-full max-w-lg px-5 pb-32 pt-8">{children}</div>
        <NavInferior />
      </body>
    </html>
  );
}
