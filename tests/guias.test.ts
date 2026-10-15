import assert from "node:assert/strict";
import { test } from "node:test";
import { GUIAS } from "../lib/ayuda/guias";
import { AREAS } from "../lib/modulos";

test("todo módulo publicado tiene su guía de uso (botón «i» y manual)", () => {
  const sinGuia = AREAS.flatMap((a) => a.secciones.flatMap((s) => s.modulos))
    .filter((m) => m.ruta && !GUIAS[m.id])
    .map((m) => m.id);
  assert.deepEqual(sinGuia, []);
});

test("cada guía tiene pasos y está completa", () => {
  for (const g of Object.values(GUIAS)) {
    assert.ok(g.titulo && g.quien && g.para, g.id);
    assert.ok(g.pasos.length >= 2, `${g.id}: al menos dos pasos`);
  }
});
