import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PantallaUsuario } from "@/components/usuarios/pantalla-usuario";

export const metadata: Metadata = { title: "Usuario" };

export default async function DetalleUsuario({ params, searchParams }: PageProps<"/admin/usuarios/[id]">) {
  const { id } = await params;
  const { creado } = await searchParams;
  const idUsuario = Number(id);
  if (!Number.isInteger(idUsuario) || idUsuario <= 0) notFound();
  return <PantallaUsuario id={idUsuario} recienCreado={creado === "1"} />;
}
