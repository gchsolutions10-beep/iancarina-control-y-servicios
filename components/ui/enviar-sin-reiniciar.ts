import { startTransition, type FormEvent } from "react";

/**
 * React 19 reinicia el <form> después de una acción y los <select> controlados
 * vuelven a su primera opción. Enviar desde onSubmit evita ese reinicio y
 * conserva lo que el usuario ve en pantalla.
 */
export function enviarSinReiniciar(accion: (datos: FormData) => void) {
  return (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    // Incluye el botón que envió (name/value), p. ej. «Aprobar» o «Rechazar».
    const boton = (evento.nativeEvent as SubmitEvent).submitter;
    const datos = new FormData(evento.currentTarget, boton instanceof HTMLButtonElement && boton.name ? boton : null);
    startTransition(() => accion(datos));
  };
}
