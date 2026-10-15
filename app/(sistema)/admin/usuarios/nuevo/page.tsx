import type { Metadata } from "next";
import { PantallaUsuario } from "@/components/usuarios/pantalla-usuario";

export const metadata: Metadata = { title: "Nuevo usuario" };

export default function NuevoUsuario() {
  return <PantallaUsuario id={null} />;
}
