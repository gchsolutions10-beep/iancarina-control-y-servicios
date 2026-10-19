import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Building,
  Car,
  FileSpreadsheet,
  FileText,
  HandCoins,
  LayoutDashboard,
  RefreshCcw,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { PermisoEmpresa } from "@/lib/auth/permisos";

export type Modulo = {
  id: string;
  nombre: string;
  descripcion: string;
  icono: LucideIcon;
  permiso: PermisoEmpresa;
  /** Tabla o vista principal (docs/MODELO-DATOS.md). */
  origen: string;
  /** Ruta del módulo cuando esté construido; sin ruta = "Próximamente". */
  ruta?: string;
};

export type Seccion = { nombre: string; modulos: Modulo[] };

export type Area = {
  /** También es la ruta de su pestaña: /gestion-polizas… */
  id: string;
  nombre: string;
  /** Nombre corto para la pestaña del menú. */
  pestana: string;
  /** Rutas que pertenecen al área (la pestaña se marca activa en ellas). */
  prefijos: string[];
  secciones: Seccion[];
};

/**
 * Menú del sistema (docs/PLAN.md). Cada módulo se habilita agregando `ruta` cuando está construido.
 * Los datos que muestra cada módulo se limitan siempre a las empresas del usuario.
 */
export const AREAS: Area[] = [
  {
    id: "gestion-polizas",
    nombre: "Gestión de Pólizas",
    pestana: "Gestión de Pólizas",
    prefijos: ["/gestion-polizas", "/personas", "/activos", "/polizas", "/siniestros", "/finanzas", "/reportes"],
    secciones: [
      {
        nombre: "Personas y empresas",
        modulos: [
          { id: "personas", nombre: "Fichas de personas", descripcion: "Asegurados, beneficiarios, propietarios y organizaciones, con su historial", icono: Users, permiso: "seguros.ver", origen: "cys.personas", ruta: "/personas/fichas" },
        ],
      },
      {
        nombre: "Vehículos y propiedades",
        modulos: [
          { id: "vehiculos", nombre: "Vehículos", descripcion: "Flota propia y de terceros: ficha, propietario, fotos y documentos", icono: Car, permiso: "seguros.ver", origen: "cys.vehiculos", ruta: "/activos/vehiculos" },
          { id: "propiedades", nombre: "Propiedades", descripcion: "Casas, edificios e instalaciones asegurables", icono: Building, permiso: "seguros.ver", origen: "cys.propiedades", ruta: "/activos/propiedades" },
        ],
      },
      {
        nombre: "Pólizas y renovaciones",
        modulos: [
          { id: "polizas", nombre: "Pólizas", descripcion: "Vigencias, certificados, asegurados, coberturas y beneficiarios", icono: FileText, permiso: "seguros.ver", origen: "cys.polizas", ruta: "/polizas/lista" },
          { id: "renovaciones", nombre: "Renovación anual", descripcion: "Nueva vigencia con comparación contra el año anterior", icono: RefreshCcw, permiso: "seguros.ver", origen: "cys.poliza_periodos", ruta: "/polizas/renovaciones" },
        ],
      },
      {
        nombre: "Siniestros",
        modulos: [
          { id: "siniestros", nombre: "Siniestros", descripcion: "Expedientes de personas, vehículos y propiedades con sus etapas", icono: AlertTriangle, permiso: "seguros.ver", origen: "cys.siniestros", ruta: "/siniestros/lista" },
          { id: "transporte", nombre: "Transporte contratado", descripcion: "Pérdidas de mercancía con transportistas externos", icono: Truck, permiso: "seguros.ver", origen: "cys.siniestro_transporte", ruta: "/siniestros/lista?sujeto=transporte" },
        ],
      },
      {
        nombre: "Finanzas",
        modulos: [
          { id: "primas-por-pagar", nombre: "Primas por pagar", descripcion: "Obligaciones con las aseguradoras, pagos parciales y devoluciones por bajas", icono: Wallet, permiso: "seguros.ver", origen: "cys.vw_saldos_obligaciones", ruta: "/finanzas/primas" },
          { id: "cuentas-por-cobrar", nombre: "Cuentas por cobrar", descripcion: "Reembolsos de siniestros y devoluciones de prima: reconocidos, pendientes y cobrados", icono: HandCoins, permiso: "seguros.ver", origen: "cys.vw_saldos_obligaciones", ruta: "/finanzas/primas?ver=cobrar" },
        ],
      },
      {
        nombre: "Indicadores y reportes",
        modulos: [
          { id: "tablero", nombre: "Tablero gerencial", descripcion: "Primas, sumas aseguradas, vencimientos, siniestros y saldos", icono: LayoutDashboard, permiso: "seguros.ver", origen: "cys.poliza_periodos, cys.vw_saldos_obligaciones, cys.siniestros", ruta: "/reportes/tablero" },
          { id: "reportes", nombre: "Reportes", descripcion: "Filtros combinados, Excel y PDF", icono: FileSpreadsheet, permiso: "seguros.ver", origen: "cys.poliza_periodos, cys.inclusiones, cys.vw_saldos_obligaciones, cys.siniestros", ruta: "/reportes/lista" },
          { id: "detalle-ceco", nombre: "Detalle por CECO", descripcion: "Primas a pagar por organización y centro de costo", icono: BarChart3, permiso: "seguros.ver", origen: "cys.inclusion_coberturas, cys.endoso_lineas", ruta: "/reportes/ceco" },
        ],
      },
    ],
  },
  // Próximamente: área «Presupuestos» con su propio permiso, para analistas que solo trabajan ahí.
];
