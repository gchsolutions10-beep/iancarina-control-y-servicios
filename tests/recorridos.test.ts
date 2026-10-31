import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { RECORRIDOS, recorridoDe, slugRecorrido } from "../lib/ayuda/recorridos";
import { AREAS } from "../lib/modulos";

/** Todo el código de pantallas y componentes, para comprobar que las anclas existen. */
function fuentes(dir: string): string {
  return readdirSync(dir).map((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? fuentes(p) : /\.tsx?$/.test(f) ? readFileSync(p, "utf8") : "";
  }).join("\n");
}
const codigo = fuentes("app") + fuentes("components");
const titulosSeccion = [...codigo.matchAll(/titulo=(?:"([^"]+)"|\{`([^`$]+))/g)].map((m) => slugRecorrido(m[1] ?? m[2]));

test("el slug de una sección quita acentos y signos", () => {
  assert.equal(slugRecorrido("Tarifas del período"), "tarifas-del-periodo");
  assert.equal(slugRecorrido("Límites (riesgos diversos)"), "limites-riesgos-diversos");
});

test("cada módulo del menú tiene su recorrido", () => {
  const sin = AREAS.flatMap((a) => a.secciones.flatMap((s) => s.modulos))
    .filter((m) => m.ruta && !recorridoDe(m.ruta.split("?")[0]))
    .map((m) => m.id);
  assert.deepEqual(sin, []);
});

test("las pantallas clave tienen su recorrido y no se confunden", () => {
  assert.equal(recorridoDe("/inicio")?.id, "bienvenida");
  assert.equal(recorridoDe("/polizas/periodos/12")?.id, "periodo");
  assert.equal(recorridoDe("/siniestros/7")?.id, "siniestro");
  assert.equal(recorridoDe("/reportes/obligaciones")?.id, "reporte");
  assert.equal(recorridoDe("/reportes/tablero")?.id, "tablero");
  assert.equal(recorridoDe("/personas/fichas")?.id, "personas");
  assert.equal(recorridoDe("/cuenta/clave"), null);
});

test("ids únicos y pasos completos", () => {
  const ids = RECORRIDOS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of RECORRIDOS) {
    assert.ok(r.pasos.length > 0, r.id);
    for (const p of r.pasos) assert.ok(p.titulo && p.texto.length > 20, `${r.id}: ${p.titulo}`);
  }
});

test("cada ancla apunta a algo que existe en las pantallas", () => {
  for (const r of RECORRIDOS) {
    for (const p of r.pasos) {
      if (!p.ancla) continue;
      const exacta = p.ancla.match(/^\[data-recorrido="([^"]+)"\]$/)?.[1];
      const seccion = p.ancla.match(/^\[data-recorrido\^="seccion-([^"]+)"\]$/)?.[1];
      if (exacta?.startsWith("menu-")) continue; // se generan del nombre de cada pestaña
      if (exacta) assert.ok(codigo.includes(`data-recorrido="${exacta}"`), `${r.id}: falta data-recorrido="${exacta}"`);
      else if (seccion) assert.ok(titulosSeccion.some((t) => t.startsWith(seccion)), `${r.id}: no hay sección «${seccion}»`);
      else assert.fail(`${r.id}: ancla con formato desconocido ${p.ancla}`);
    }
  }
});
