"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { marcarRecorridoVisto } from "@/actions/recorridos";
import { claseBoton } from "@/components/ui/boton";
import { recorridoDe, type PasoRecorrido } from "@/lib/ayuda/recorridos";

/** Evento para abrir el recorrido de la pantalla actual (lo dispara el botón del diálogo «i»). */
export const EVENTO_INICIAR = "recorrido:iniciar";
/** Evento que avisa que empezó un recorrido (la campana se cierra para no taparlo). */
export const EVENTO_ACTIVO = "recorrido:activo";

type Activo = { id: string; titulo: string; pasos: PasoRecorrido[] };
type Caja = { top: number; left: number; width: number; height: number };

const MARGEN = 8;
const ANCHO_TARJETA = 360;

/** Elemento visible de un paso (los ocultos o que el usuario no tiene no cuentan). */
function elementoDe(paso: PasoRecorrido): HTMLElement | null {
  if (!paso.ancla) return null;
  const el = document.querySelector<HTMLElement>(paso.ancla);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

/**
 * Recorrido guiado de la pantalla actual (lib/ayuda/recorridos.ts): se abre solo la primera vez, se
 * puede saltar (Esc) y se repite desde el botón «i» o el Manual. Resalta cada parte y explica qué hacer.
 */
export function Recorridos({ vistos }: { vistos: string[] }) {
  const ruta = usePathname();
  const [vistosLocal, setVistosLocal] = useState(() => new Set(vistos));
  const [activo, setActivo] = useState<Activo | null>(null);
  const [indice, setIndice] = useState(0);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [angosta, setAngosta] = useState(false);
  const tarjeta = useRef<HTMLDivElement>(null);

  const iniciar = useCallback(
    (forzar: boolean) => {
      const r = recorridoDe(ruta);
      if (!r || (!forzar && vistosLocal.has(r.id))) return;
      // Solo los pasos que el usuario ve en esta pantalla (sin ancla = paso centrado).
      const pasos = r.pasos.filter((p) => !p.ancla || elementoDe(p));
      if (pasos.length === 0) return;
      setActivo({ id: r.id, titulo: r.titulo, pasos });
      setIndice(0);
      window.dispatchEvent(new Event(EVENTO_ACTIVO));
    },
    [ruta, vistosLocal],
  );

  // Primera vez en la pantalla (o ?recorrido=1): se abre solo, cuando la página terminó de pintarse.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("imprimir") === "1") return;
    const forzar = params.get("recorrido") === "1";
    const t = setTimeout(() => iniciar(forzar), 700);
    return () => clearTimeout(t);
    // Solo al cambiar de pantalla; `iniciar` cambia también al marcar uno como visto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta]);

  useEffect(() => {
    const abrir = () => iniciar(true);
    window.addEventListener(EVENTO_INICIAR, abrir);
    return () => window.removeEventListener(EVENTO_INICIAR, abrir);
  }, [iniciar]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-recorrido-activo", activo !== null);
  }, [activo]);

  const terminar = useCallback(() => {
    if (!activo) return;
    setVistosLocal((v) => new Set(v).add(activo.id));
    setActivo(null);
    setCaja(null);
    void marcarRecorridoVisto(activo.id).catch(() => undefined);
  }, [activo]);

  const paso = activo?.pasos[indice] ?? null;
  const ultimo = activo ? indice === activo.pasos.length - 1 : false;

  // Medir el elemento resaltado (y volver a medir al desplazar o cambiar el tamaño de la ventana).
  useLayoutEffect(() => {
    if (!paso) return;
    const el = elementoDe(paso);
    if (el) {
      const comportamiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      const r = el.getBoundingClientRect();
      // Lo alto (una lista larga) se muestra desde su comienzo, debajo de la barra fija del menú.
      if (r.height > window.innerHeight * 0.6) window.scrollTo({ top: r.top + window.scrollY - 140, behavior: comportamiento });
      else el.scrollIntoView({ block: "center", behavior: comportamiento });
    }
    let cuadro = 0;
    const medir = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => {
        setAngosta(window.innerWidth < 640);
        const actual = elementoDe(paso);
        if (!actual) return setCaja(null);
        const r = actual.getBoundingClientRect();
        setCaja({ top: r.top - MARGEN, left: r.left - MARGEN, width: r.width + MARGEN * 2, height: r.height + MARGEN * 2 });
      });
    };
    medir();
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [paso]);

  useEffect(() => {
    if (activo) tarjeta.current?.focus();
  }, [activo, indice]);

  useEffect(() => {
    if (!activo) return;
    const teclas = (e: KeyboardEvent) => {
      if (e.key === "Escape") terminar();
      else if (e.key === "ArrowRight") setIndice((i) => Math.min(i + 1, activo.pasos.length - 1));
      else if (e.key === "ArrowLeft") setIndice((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", teclas);
    return () => window.removeEventListener("keydown", teclas);
  }, [activo, terminar]);

  if (!activo || !paso) return null;

  // Tarjeta: debajo del elemento si cabe, si no arriba; en pantallas angostas, abajo de la pantalla.
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  let posicion: React.CSSProperties;
  if (angosta || !caja) {
    posicion = caja || angosta ? { left: 16, right: 16, bottom: 16 } : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: `min(${ANCHO_TARJETA + 80}px, calc(100vw - 32px))` };
  } else {
    const left = Math.min(Math.max(16, caja.left), vw - ANCHO_TARJETA - 16);
    const abajo = caja.top + caja.height + 12;
    const ALTO = 240; // alto aproximado de la tarjeta
    if (abajo + ALTO < vh) posicion = { top: abajo, left, width: ANCHO_TARJETA };
    else if (caja.top - 12 - ALTO > 0) posicion = { bottom: vh - caja.top + 12, left, width: ANCHO_TARJETA };
    // El elemento ocupa casi toda la pantalla: la tarjeta va abajo a la derecha, encima de él.
    else posicion = { bottom: 16, right: 16, width: ANCHO_TARJETA };
  }

  return (
    <div className="fixed inset-0 z-50 print:hidden" aria-hidden={false}>
      {caja ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl ring-2 ring-marca-500 transition-all duration-200 ease-suave motion-reduce:transition-none"
          style={{ top: caja.top, left: caja.left, width: caja.width, height: caja.height, boxShadow: "0 0 0 9999px rgb(20 16 14 / 0.55)" }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgb(20_16_14/0.55)]" />
      )}
      <div
        ref={tarjeta}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recorrido-titulo"
        aria-describedby="recorrido-texto"
        tabIndex={-1}
        style={posicion}
        className="fixed rounded-2xl border border-borde bg-superficie p-5 text-tinta shadow-xl outline-none animate-entrada"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium tracking-wide text-tinta-tenue uppercase">
            {activo.titulo} · {indice + 1} de {activo.pasos.length}
          </p>
          <button type="button" onClick={terminar} aria-label="Saltar el recorrido" className="-m-1 rounded-md p-1 text-tinta-tenue hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <h2 id="recorrido-titulo" className="mt-1 text-base font-semibold text-tinta">
          {paso.titulo}
        </h2>
        <p id="recorrido-texto" className="mt-1.5 text-sm text-pretty text-tinta-suave">
          {paso.texto}
        </p>
        <div className="mt-4 flex items-center gap-1" aria-hidden>
          {activo.pasos.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-200 ${i === indice ? "w-5 bg-marca-600" : "w-1.5 bg-borde-fuerte"}`} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={terminar} className="text-sm text-tinta-suave hover:text-tinta hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40">
            Saltar
          </button>
          <div className="flex gap-2">
            {indice > 0 && (
              <button type="button" onClick={() => setIndice(indice - 1)} className={claseBoton("secundario", "md")}>
                <ArrowLeft className="size-4" aria-hidden /> Anterior
              </button>
            )}
            <button type="button" onClick={() => (ultimo ? terminar() : setIndice(indice + 1))} className={claseBoton("primario", "md")}>
              {ultimo ? "Terminar" : "Siguiente"}
              {!ultimo && <ArrowRight className="size-4" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
