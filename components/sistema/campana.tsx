"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, FileText, HandCoins, Wallet } from "lucide-react";
import { claseBoton } from "@/components/ui/boton";
import type { Aviso } from "@/lib/avisos/reglas";
import { cn } from "@/lib/cn";

const ICONOS = { poliza: FileText, prima: Wallet, cobro: HandCoins, siniestro: AlertTriangle } as const;
const CADA_MS = 5 * 60 * 1000;
const CLAVE_SESION = "avisos-mostrados";

/**
 * Campana de avisos en la barra: se actualiza cada 5 minutos y al cambiar de pantalla. Si el usuario
 * recibe alertas (Usuarios → «Recibe alertas») y hay algo vencido, se abre sola una vez por sesión.
 */
export function Campana({ abrirSola }: { abrirSola: boolean }) {
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const ruta = usePathname();

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/avisos", { cache: "no-store" });
      if (!r.ok) return;
      const { avisos: lista } = (await r.json()) as { avisos: Aviso[] };
      setAvisos(lista);
      if (abrirSola && lista.some((a) => a.gravedad === "vencido")) {
        let mostrados = false;
        try {
          mostrados = sessionStorage.getItem(CLAVE_SESION) === "1";
          sessionStorage.setItem(CLAVE_SESION, "1");
        } catch {
          mostrados = true;
        }
        if (!mostrados) setAbierta(true);
      }
    } catch {
      // Sin red: se reintenta en el próximo ciclo.
    }
  }, [abrirSola]);

  useEffect(() => {
    // Primera carga y cada cambio de pantalla (ej.: después de pagar una prima).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar, ruta]);

  useEffect(() => {
    const t = setInterval(() => void cargar(), CADA_MS);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierta]);

  const total = avisos?.length ?? 0;
  const vencidos = avisos?.filter((a) => a.gravedad === "vencido").length ?? 0;

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className={cn(claseBoton("fantasma", "md"), "relative")}
        aria-expanded={abierta}
        aria-haspopup="dialog"
        aria-label={total ? `Avisos: ${total} (${vencidos} vencidos)` : "Avisos: ninguno"}
      >
        <Bell className="size-4" aria-hidden />
        {total > 0 && (
          <span
            aria-hidden
            className={cn(
              "absolute -top-0.5 -right-0.5 min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-semibold tabular-nums",
              vencidos > 0 ? "bg-error text-white" : "bg-aviso text-tinta",
            )}
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {abierta && (
        <div role="dialog" aria-label="Avisos" className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-borde bg-superficie shadow-lg">
          <div className="flex items-baseline justify-between border-b border-borde px-4 py-3">
            <p className="font-semibold text-tinta">Avisos</p>
            <p className="text-xs text-tinta-tenue tabular-nums">{avisos === null ? "Cargando…" : `${total} pendientes · ${vencidos} vencidos`}</p>
          </div>
          {avisos !== null && total === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-tinta-suave">Todo al día: no hay vencimientos ni expedientes detenidos.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-borde overflow-y-auto">
              {(avisos ?? []).map((a) => {
                const Icono = ICONOS[a.tipo];
                return (
                  <li key={a.id}>
                    <Link href={a.enlace} onClick={() => setAbierta(false)} className="flex gap-3 px-4 py-3 hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none">
                      <Icono className={cn("mt-0.5 size-4 shrink-0", a.gravedad === "vencido" ? "text-error" : "text-aviso")} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-tinta">{a.titulo}</span>
                        <span className="block text-xs text-tinta-suave">{a.detalle}</span>
                        <span className="sr-only">{a.gravedad === "vencido" ? "Vencido" : "Próximo"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
