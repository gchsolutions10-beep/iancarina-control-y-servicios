import Link from "next/link";
import { claseBoton } from "@/components/ui/boton";

export default function NoEncontrado() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-marca-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-tinta">Página no encontrada</h1>
      <p className="mt-1 text-sm text-tinta-suave">La dirección no existe o la sección no está disponible.</p>
      <Link href="/" className={claseBoton("secundario", "md", "mt-6")}>
        Ir a la portada
      </Link>
    </main>
  );
}
