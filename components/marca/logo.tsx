import Image from "next/image";
import { cn } from "@/lib/cn";

type LogoProps = {
  /** "simbolo": isotipo + nombre del sistema (barras). "completo": logo oficial de Alimentos Mary. */
  variante?: "simbolo" | "completo";
  /** Alto en píxeles. */
  alto?: number;
  className?: string;
};

/** Identidad de Alimentos Mary (vector trazado del logo oficial, color #e72a18). */
export function Logo({ variante = "simbolo", alto = 34, className }: LogoProps) {
  if (variante === "completo") {
    return (
      <Image
        src="/marca/logo-alimentos-mary.svg"
        alt="Alimentos Mary"
        width={Math.round((alto * 160) / 109)}
        height={alto}
        priority
        className={className}
      />
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image src="/marca/simbolo-mary.svg" alt="" width={Math.round(alto * 1.08)} height={alto} priority className="shrink-0" />
      <span className="flex flex-col leading-none whitespace-nowrap">
        <span className="text-[15px] font-semibold tracking-tight text-tinta">Mary Iancarina</span>
        <span className="mt-1 text-xs text-tinta-tenue">Control de Seguros</span>
      </span>
    </span>
  );
}
