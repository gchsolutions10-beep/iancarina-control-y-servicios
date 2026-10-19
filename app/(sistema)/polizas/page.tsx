import { redirect } from "next/navigation";

/** Las antiguas pestañas por área ahora están dentro de «Gestión de Pólizas». */
export default function Pestana() {
  redirect("/gestion-polizas");
}
