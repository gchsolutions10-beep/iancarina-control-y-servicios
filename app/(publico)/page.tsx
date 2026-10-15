import { Bell, FolderOpen, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { FormularioInicioSesion } from "@/components/auth/formulario-inicio-sesion";

const destacados = [
  { icono: FolderOpen, titulo: "Todo en un solo lugar", texto: "Personas, vehículos, propiedades, pólizas y siniestros, con sus documentos." },
  { icono: Bell, titulo: "Renovaciones a tiempo", texto: "Vigencias, primas por pagar y reembolsos pendientes a la vista." },
  { icono: ShieldCheck, titulo: "Acceso por empresa", texto: "Cada persona ve solo lo que corresponde a su empresa y rol." },
];

export default async function Portada({ searchParams }: PageProps<"/">) {
  const { siguiente } = await searchParams;

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-16">
      <section className="animate-entrada">
        <p className="inline-flex items-center gap-2 rounded-full border border-borde bg-superficie px-3 py-1 text-xs font-medium text-tinta-suave shadow-xs">
          <span className="size-1.5 rounded-full bg-marca-500" aria-hidden />
          Seguros · Activos · Siniestros
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance text-tinta sm:text-5xl">
          Control de <span className="text-marca-600 dark:text-marca-400">Seguros y Activos</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-pretty text-tinta-suave">
          Pólizas, renovaciones, siniestros, pagos y cobros de cada empresa del Grupo Mary, con historial y acceso controlado.
        </p>

        <ul className="mt-10 grid gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {destacados.map(({ icono: Icono, titulo, texto }) => (
            <li key={titulo} className="flex gap-3 sm:flex-col lg:flex-row xl:flex-col">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-borde bg-superficie text-marca-600 shadow-xs">
                <Icono className="size-[18px]" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-medium text-tinta">{titulo}</span>
                <span className="mt-0.5 block text-sm text-tinta-suave">{texto}</span>
              </span>
            </li>
          ))}
        </ul>

      </section>

      <section
        id="ingresar"
        aria-labelledby="titulo-ingresar"
        className="order-first w-full scroll-mt-24 rounded-2xl border border-borde bg-superficie p-6 shadow-sm animate-entrada sm:p-8 lg:order-none lg:max-w-md lg:justify-self-end"
      >
        <Logo variante="completo" alto={92} className="mb-6" />
        <h2 id="titulo-ingresar" className="text-xl font-semibold tracking-tight text-tinta">
          Iniciar sesión
        </h2>
        <p className="mt-1 mb-6 text-sm text-tinta-suave">Ingresa con el usuario y la clave que te asignaron.</p>
        <FormularioInicioSesion siguiente={typeof siguiente === "string" ? siguiente : undefined} />
      </section>
    </main>
  );
}
