import Link from "next/link";
import { CreditoGch } from "@/components/marca/credito-gch";
import { Logo } from "@/components/marca/logo";
import { cookies } from "next/headers";
import { SelectorTema } from "@/components/ui/selector-tema";
import { COOKIE_TEMA, leerTema } from "@/lib/tema";

export default async function LayoutPublico({ children }: LayoutProps<"/">) {
  const tema = leerTema((await cookies()).get(COOKIE_TEMA)?.value);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-borde bg-fondo/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40">
            <Logo />
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
            <Link
              href="/#ingresar"
              className="rounded-lg px-3 py-2 font-medium text-marca-700 transition-colors duration-150 hover:bg-marca-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40 dark:text-marca-400 dark:hover:bg-marca-950/40"
            >
              Ingresar
            </Link>
            <SelectorTema inicial={tema} />
          </nav>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>

      <footer className="border-t border-borde">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-tinta-tenue">© {new Date().getFullYear()} Mary Iancarina, C.A.</p>
          <CreditoGch />
        </div>
      </footer>
    </>
  );
}
