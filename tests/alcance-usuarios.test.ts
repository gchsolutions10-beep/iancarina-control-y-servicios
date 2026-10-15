import assert from "node:assert/strict";
import { test } from "node:test";
import { empresasCon, tieneAcceso, vigente, type Acceso, type PermisoEmpresa } from "../lib/auth/permisos";
import { aplicarCambios, puedeGestionar, rolesAsignables, type Asignaciones, type Gestor } from "../lib/usuarios/alcance";

const TODAS = ["mary", "filial"];
const ANALISTA: PermisoEmpresa[] = ["empresa.acceso", "seguros.ver", "seguros.registrar"];
const CONSULTA: PermisoEmpresa[] = ["empresa.acceso", "seguros.ver"];

const admin: Gestor = { id: 1, acceso: { globales: ["admin.sistema"], empresas: {}, todas: TODAS }, roles: {} };
const analistaMary: Acceso = { globales: [], empresas: { mary: ANALISTA }, todas: TODAS };
const consultaMary: Acceso = { globales: [], empresas: { mary: CONSULTA }, todas: TODAS };
const confianza: Gestor = { id: 4, acceso: { globales: [], empresas: { mary: [...ANALISTA, "usuarios.gestionar"] }, todas: TODAS }, roles: { mary: "analista" } };

const vacio: Asignaciones = { globales: [], empresas: [], excepciones: [], bloqueado: false };
const enFilial: Asignaciones = { ...vacio, empresas: [{ empresa: "filial", rol: "analista", vigenteHasta: null }] };

test("el administrador tiene todo en las empresas activas, pero no el rol de desarrollador", () => {
  assert.ok(tieneAcceso(admin.acceso, "movimientos.anular", "filial"));
  assert.ok(!tieneAcceso(admin.acceso, "seguros.ver", "empresa-inexistente"));
  assert.ok(!tieneAcceso(admin.acceso, "sistema.desarrollador"));
  assert.deepEqual(empresasCon(admin.acceso, "seguros.ver"), TODAS);
});

test("analista ingresa y consulta solo ve, cada uno solo en su empresa", () => {
  assert.ok(tieneAcceso(analistaMary, "seguros.registrar", "mary"));
  assert.ok(!tieneAcceso(analistaMary, "seguros.ver", "filial"), "las empresas se manejan por separado");
  assert.ok(tieneAcceso(consultaMary, "seguros.ver", "mary"));
  assert.ok(!tieneAcceso(consultaMary, "seguros.registrar", "mary"));
  assert.ok(!tieneAcceso(analistaMary, "personas.datos_sensibles", "mary"), "datos personales: solo con permiso excepcional");
});

test("una asignación con fecha deja de valer al terminar ese día", () => {
  assert.ok(vigente("2026-10-15", "2026-10-15"));
  assert.ok(!vigente("2026-10-14", "2026-10-15"));
  assert.ok(vigente(null, "2026-10-15"));
});

test("un gestor de confianza solo administra usuarios de su empresa", () => {
  assert.ok(puedeGestionar(confianza, vacio), "usuario sin empresas: lo puede tomar");
  assert.ok(!puedeGestionar(confianza, enFilial));
  assert.deepEqual(rolesAsignables(confianza, "filial"), []);
  assert.deepEqual(rolesAsignables(confianza, "mary"), ["analista", "consulta"]);
});

test("al guardar, las asignaciones en empresas ajenas se conservan", () => {
  const anterior: Asignaciones = { ...vacio, empresas: [{ empresa: "filial", rol: "consulta", vigenteHasta: null }, { empresa: "mary", rol: "consulta", vigenteHasta: null }] };
  const propuesta: Asignaciones = { ...vacio, empresas: [{ empresa: "mary", rol: "analista", vigenteHasta: null }] };
  const r = aplicarCambios(confianza, 9, anterior, propuesta);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(
      r.asignaciones.empresas.map((a) => `${a.empresa}:${a.rol}`).sort(),
      ["filial:consulta", "mary:analista"],
    );
  }
});

test("solo el administrador asigna el rol de administrador y nadie se lo quita a sí mismo", () => {
  const r = aplicarCambios(confianza, null, null, { ...vacio, globales: ["administrador"] });
  assert.ok(r.ok && r.asignaciones.globales.length === 0);
  const yo = aplicarCambios(admin, 1, { ...vacio, globales: ["administrador"] }, vacio);
  assert.ok(!yo.ok);
});
