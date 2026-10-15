---
name: ui-estandares
description: Estándares de interfaz de GCH Solutions (código impecable, pulido visual estilo Emil Kowalski, buen gusto, accesibilidad). Úsala SIEMPRE antes de crear o modificar componentes, páginas, formularios, tablas o estilos con React + Tailwind.
---

# Estándares de UI — GCH Solutions

Actúa como Lead UI Engineer: interfaces sobrias, precisas, accesibles y sin errores
visuales. Esta skill une tres guías (código impecable, microinteracciones estilo Emil
Kowalski y "buen gusto"). Si una regla de un proyecto (`CLAUDE.md`) contradice esta
skill, gana el proyecto.

## 1. Tokens primero, nunca colores sueltos

- Los colores viven como tokens en `app/globals.css` (`@theme` de Tailwind v4) y se
  usan por **rol**, no por valor: `bg-superficie`, `text-tinta`, `text-tinta-suave`,
  `border-borde`, `bg-marca-600`. Nunca `#e12b30` ni `bg-red-600` dentro de un componente.
- El color de marca se usa con **parsimonia**: acción primaria, foco, un acento por vista.
  El resto es neutro (escala `stone`/`neutral`).
- Modo oscuro: los tokens se redefinen en `@media (prefers-color-scheme: dark)`. Los
  componentes no llevan `dark:` salvo excepciones justificadas.
- Contraste WCAG AA mínimo (4.5:1 texto, 3:1 elementos gráficos). Verifícalo, no lo supongas.

## 2. Jerarquía, espacio y tipografía

- Jerarquía por **tono** antes que por tamaño: `text-tinta` (principal) vs `text-tinta-suave`
  (secundario) vs `text-tinta-tenue` (metadatos).
- Espaciado en múltiplos de 4 px (`gap-2`, `gap-4`, `p-6`). Nada de valores arbitrarios
  salvo alineación óptica justificada.
- Números en tablas y KPIs con `tabular-nums` y alineados a la derecha.
- Texto largo nunca rompe el layout: `truncate`, `line-clamp-*`, `break-words`, `min-w-0`.

## 3. Superficies y elevación

- Bordes finos de baja opacidad (`border border-borde`) + **una** sombra suave (`shadow-xs`
  o `shadow-sm`). Prohibido `shadow-2xl` y degradados decorativos sin propósito.
- Radios coherentes: controles `rounded-lg`, tarjetas `rounded-xl`, modales `rounded-2xl`.
- Jerarquía Z clara: fondo de página < tarjeta < popover/menú < modal < toast.

## 4. Estados: los cinco, siempre

Toda vista con datos cubre explícitamente:
1. **Inicial** (antes de pedir datos o con filtros vacíos)
2. **Cargando** — skeleton con la **misma geometría** del contenido final (CLS = 0)
3. **Con datos**
4. **Vacío** — mensaje humano + acción sugerida
5. **Error** — mensaje claro, sin jerga técnica, con "Reintentar"

## 5. Microinteracciones (física, no adorno)

- Duración 150–200 ms para hover/press, ≤ 300 ms para entradas. Curva
  `cubic-bezier(0.2, 0, 0, 1)` (token `ease-suave`). Nunca `linear`.
- Anima solo `transform` y `opacity`. Nunca `width`, `height`, `top`, `margin`.
- Entradas: `opacity 0→1` + `translateY(4px)→0` o `scale(0.98)→1`. Nada aparece de golpe.
- Botones: `hover:` cambia tono, `active:scale-[0.98]`, `disabled:opacity-50
  disabled:cursor-not-allowed`. Respeta `prefers-reduced-motion` (`motion-reduce:`).

## 6. Accesibilidad y semántica

- Etiquetas semánticas: `header`, `nav`, `main`, `section`, `footer`, `button`, `a`.
  Nunca un `div` clicable.
- Todo control es operable con teclado y muestra `focus-visible:ring-2 ring-marca-600/40
  ring-offset-2`.
- Cada `input` tiene `label` asociado; los errores se anuncian con `aria-describedby` y
  `aria-invalid`; mensajes de estado con `aria-live="polite"`.
- ARIA solo cuando lo nativo no alcanza.

## 7. Código con buen gusto

- TypeScript estricto: **cero `any`**. Datos externos (formularios, BD, APIs, vistas SQL)
  se validan con **Zod** antes de usarse.
- Retornos tempranos, estructuras planas, nombres del dominio (`kgProducidos`, no `data2`).
- Componentes pequeños (≈150 líneas máx.). Divide por responsabilidad, no por capricho.
- Server Components por defecto; `"use client"` solo donde hay interacción.
- Íconos: `lucide-react`, tamaño 16–20 px, `aria-hidden` si son decorativos.

## 8. Formularios

- Campos grandes y táctiles (`h-11` mínimo): se usan en tablets (y en planta, con guantes).
- Validación en cliente (feedback inmediato) **y** en servidor (fuente de verdad), con
  el mismo esquema Zod.
- El botón de envío muestra estado pendiente (`useActionState` / `useFormStatus`) y
  evita doble envío.
- Fechas y números en formato `es-VE`.
- `<select>` controlados: enviar con `enviarSinReiniciar()` (React 19 reinicia el form).
- Estados (vigente, por vencer, vencido…) con insignia de ícono **y** texto, nunca solo color.

## Checklist antes de entregar

- [ ] ¿Usé solo tokens de color?
- [ ] ¿Los 5 estados están cubiertos?
- [ ] ¿Funciona en 320 px y en 1920 px sin scroll horizontal?
- [ ] ¿Se puede usar completo con teclado?
- [ ] ¿`npm run typecheck` y `npm run lint` pasan?
