"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { marcarRecorridoVisto } from "@/actions/recorridos";
import { claseBoton } from "@/components/ui/boton";
import { recorridosDe, type PasoRecorrido } from "@/lib/ayuda/recorridos";

/** Evento para abrir el recorrido de la pantalla actual (lo dispara el botón del diálogo «i»). */
export const EVENTO_INICIAR = "recorrido:iniciar";
/** Evento que avisa que empezó un recorrido (la campana se cierra para no taparlo). */
export const EVENTO_ACTIVO = "recorrido:activo";

type Activo = { id: string; titulo: string; pasos: PasoRecorrido[] };
type Caja = { top: number; left: number; width: number; height: number };

const MARGEN = 8;
const ANCHO_TARJETA = 360;

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
const espera = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Elemento que se resalta en un paso. Un campo de formulario se resalta con su etiqueta. Con `abrir`, un
 * campo dentro de un formulario plegado (<details>) también cuenta: se despliega al mostrar el paso.
 */
function elementoDe(paso: PasoRecorrido, abrir = false): HTMLElement | null {
  if (!paso.ancla) return null;
  const candidatos = [...document.querySelectorAll<HTMLElement>(paso.ancla)];
  const objetivoDe = (el: HTMLElement) => (el.matches("input, select, textarea") ? (el.closest<HTMLElement>("[data-campo], label") ?? el) : el);
  // Primero uno que ya se ve; si no, uno dentro de un solo formulario plegado cuya parte de afuera se ve.
  const visibleYa = candidatos.map(objetivoDe).find(visible);
  if (visibleYa) return visibleYa;
  for (const el of candidatos) {
    const plegado = el.closest("details");
    if (!plegado || plegado.open || !plegado.parentElement || !visible(plegado.parentElement)) continue;
    if (!abrir) return objetivoDe(el); // existe: se mostrará al desplegarlo
    plegado.open = true;
    const objetivo = objetivoDe(el);
    if (visible(objetivo)) return objetivo;
    plegado.open = false;
  }
  return null;
}

/**
 * Recorrido guiado de la pantalla actual (lib/ayuda/recorridos.ts): se abre solo la primera vez, se
 * puede saltar (Esc) y se repite desde el botón «i» o el Manual. Resalta cada parte y explica qué hacer.
 */
export function Recorridos({ vistos }: { vistos: string[] }) {
  const ruta = usePathname();
  // También al cambiar la consulta: «Nueva póliza» pasa de elegir la empresa al formulario en la misma ruta.
  const consulta = useSearchParams().toString();
  const [vistosLocal, setVistosLocal] = useState(() => new Set(vistos));
  const [activo, setActivo] = useState<Activo | null>(null);
  const [indice, setIndice] = useState(0);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [angosta, setAngosta] = useState(false);
  const tarjeta = useRef<HTMLDivElement>(null);
  /** Cambia en cada pantalla: un recorrido que todavía espera a la página se cancela al salir. */
  const turno = useRef(0);
  /** Al salir de la pantalla, un recorrido que todavía espera a la página ya no se abre. */
  const cancelarEspera = useCallback(() => {
    turno.current++;
  }, []);
  /** Formularios plegados que abrió el recorrido (se vuelven a plegar al terminar). */
  const abiertos = useRef<HTMLDetailsElement[]>([]);

  const iniciar = useCallback(
    async (forzar: boolean) => {
      const candidatos = recorridosDe(ruta);
      if (candidatos.length === 0) return;
      const mio = ++turno.current;
      // Espera a que la pantalla termine de cargar (en la nube puede tardar): hasta que aparezcan todas
      // las partes, o hasta que su número deje de crecer durante 1,5 s (máximo 8 s).
      const anclados = candidatos.flatMap((c) => [...c.pasos.filter((p) => p.ancla), ...(c.requiere ? [{ ancla: c.requiere, titulo: "", texto: "" }] : [])]);
      let previo = -1;
      let quieto = 0;
      for (let t = 0; t < 8000 && anclados.length > 0; t += 250) {
        const hay = anclados.filter((p) => elementoDe(p)).length;
        if (hay === anclados.length) break;
        if (hay === previo && hay > 0) {
          quieto += 250;
          if (quieto >= 1500) break;
        } else {
          quieto = 0;
          previo = hay;
        }
        await espera(250);
        if (turno.current !== mio) return;
      }
      if (turno.current !== mio) return;
      const r = candidatos.find((c) => !c.requiere || document.querySelector(c.requiere));
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
    const t = setTimeout(() => void iniciar(forzar), 400);
    return () => {
      clearTimeout(t);
      cancelarEspera();
    };
    // Solo al cambiar de pantalla; `iniciar` cambia también al marcar uno como visto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta, consulta]);

  useEffect(() => {
    const abrir = () => void iniciar(true);
    window.addEventListener(EVENTO_INICIAR, abrir);
    return () => window.removeEventListener(EVENTO_INICIAR, abrir);
  }, [iniciar]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-recorrido-activo", activo !== null);
  }, [activo]);

  const terminar = useCallback(() => {
    if (!activo) return;
    for (const d of abiertos.current) d.open = false;
    abiertos.current = [];
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
    const cerrados = [...document.querySelectorAll("details")].filter((d) => !d.open);
    const el = elementoDe(paso, true);
    const recienAbiertos = cerrados.filter((d) => d.open);
    abiertos.current.push(...recienAbiertos);
    // El desplazamiento va en el cuadro siguiente: un formulario recién desplegado ya tiene su tamaño final.
    const desplazar = requestAnimationFrame(() => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Saltos largos (de abajo de la página al título) se hacen sin animación: la tarjeta no «vuela».
      const lejos = Math.abs(r.top - window.innerHeight / 2) > window.innerHeight * 1.5;
      // Junto a un formulario recién desplegado el desplazamiento suave no siempre arranca: va directo.
      const directo = lejos || recienAbiertos.length > 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const comportamiento = directo ? "auto" : "smooth";
      // Lo alto (una lista larga) se muestra desde su comienzo, debajo de la barra fija del menú.
      if (r.height > window.innerHeight * 0.6) window.scrollTo({ top: r.top + window.scrollY - 140, behavior: comportamiento });
      // Centrado con la ventana (scrollIntoView no desplaza cuando un contenedor intermedio tiene overflow).
      else window.scrollTo({ top: r.top + window.scrollY - (window.innerHeight - r.height) / 2, behavior: comportamiento });
    });
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
    // Mientras la página se acomoda (un formulario que se despliega, un desplazamiento suave) se vuelve
    // a medir unas veces más, para que la tarjeta quede junto a su elemento.
    const repetir = setInterval(medir, 120);
    const fin = setTimeout(() => clearInterval(repetir), 1500);
    return () => {
      cancelAnimationFrame(desplazar);
      clearInterval(repetir);
      clearTimeout(fin);
      cancelAnimationFrame(cuadro);
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [paso]);

  useEffect(() => {
    // Sin desplazar: enfocar con desplazamiento cortaría el desplazamiento suave hacia el elemento.
    if (activo) tarjeta.current?.focus({ preventScroll: true });
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
  // Si el elemento todavía está fuera de la vista (se está desplazando), la tarjeta espera en una esquina.
  const fuera = caja !== null && (caja.top > vh - 40 || caja.top + caja.height < 40);
  if (fuera) {
    posicion = { bottom: 16, right: 16, width: `min(${ANCHO_TARJETA}px, calc(100vw - 32px))` };
  } else if (angosta || !caja) {
    // Centrada sin `transform` (la animación de entrada usa transform y lo pisaría).
    posicion = caja || angosta ? { left: 16, right: 16, bottom: 16 } : { left: 16, right: 16, top: "calc(50% - 130px)", marginInline: "auto", maxWidth: ANCHO_TARJETA + 80 };
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
