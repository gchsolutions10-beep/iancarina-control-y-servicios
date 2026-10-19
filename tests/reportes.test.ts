import assert from "node:assert/strict";
import { test } from "node:test";
import { enVentana, ordenarAvisos, type Aviso } from "../lib/avisos/reglas";
import { centimos, deCentimos, filasExcel, leerValores, totalesPorMoneda, tramoVencimiento, ultimosMeses, type Filtro, type Resultado } from "../lib/reportes/tipos";

const filtros: Filtro[] = [
  { clave: "q", etiqueta: "Buscar", tipo: "texto" },
  { clave: "desde", etiqueta: "Desde", tipo: "fecha" },
  { clave: "estado", etiqueta: "Estado", tipo: "lista", opciones: [{ valor: "vigente", etiqueta: "Vigente" }] },
];

test("filtros desde la URL: solo claves conocidas, fechas válidas y opciones existentes", () => {
  assert.deepEqual(leerValores(filtros, { q: " flota ", desde: "2026-13", estado: "otro", x: "1" }), { q: "flota" });
  assert.deepEqual(leerValores(filtros, { desde: "2026-01-01", estado: "vigente" }), { desde: "2026-01-01", estado: "vigente" });
});

test("totales por moneda exactos y sin mezclar monedas", () => {
  const r: Resultado = {
    columnas: [{ titulo: "Póliza", tipo: "texto" }, { titulo: "Prima", tipo: "importe" }, { titulo: "Moneda", tipo: "texto" }],
    filas: [["A", "0.10", "USD"], ["B", "0.20", "USD"], ["C", "1000.55", "VES"], ["D", null, "USD"]],
    moneda: 2,
  };
  assert.deepEqual(totalesPorMoneda(r), [
    { moneda: "USD", totales: [null, "0.30", null] },
    { moneda: "VES", totales: [null, "1000.55", null] },
  ]);
  assert.equal(centimos("-12.5"), BigInt(-1250));
  assert.equal(deCentimos(BigInt(-1250)), "-12.50");
  assert.deepEqual(filasExcel(r)[0], ["A", 0.1, "USD"]);
});

test("antigüedad de saldos y ventana de avisos", () => {
  assert.equal(tramoVencimiento(0), "Al día");
  assert.equal(tramoVencimiento(45), "31–60 días");
  assert.equal(tramoVencimiento(200), "Más de 90 días");
  assert.ok(enVentana("2026-10-30", "2026-10-19", 15));
  assert.ok(!enVentana("2026-12-30", "2026-10-19", 15));
  assert.ok(enVentana("2026-10-05", "2026-10-19", 15));
  assert.ok(!enVentana("2025-01-01", "2026-10-19", 15), "no se acumulan avisos viejos");
  const a = (id: string, gravedad: Aviso["gravedad"], fecha: string): Aviso => ({ id, tipo: "poliza", gravedad, fecha, titulo: "", detalle: "", enlace: "", empresa: "a" });
  assert.deepEqual(ordenarAvisos([a("1", "proximo", "2026-10-20"), a("2", "vencido", "2026-10-10"), a("3", "proximo", "2026-10-19")]).map((x) => x.id), ["2", "3", "1"]);
});

test("ultimosMeses cruza el cambio de año", () => {
  assert.deepEqual(ultimosMeses("2026-02-15", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.equal(ultimosMeses("2026-10-19", 12)[0], "2025-11");
  assert.equal(ultimosMeses("2026-10-19", 12).length, 12);
});
