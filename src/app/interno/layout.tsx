import type { Metadata } from "next";
import "./consumo.css";

/* Fuera del armazón de CONTROL a propósito: así no pasa por el medidor de «Uso» de Administración ni por el menú. */
export const metadata: Metadata = { title: "CD38", robots: { index: false, follow: false, nocache: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="ci">{children}</div>;
}
