import { cn } from "@/lib/cn";

type TarjetaProps = {
  titulo: string;
  descripcion?: string;
  className?: string;
  children: React.ReactNode;
};

export function Tarjeta({ titulo, descripcion, className, children }: TarjetaProps) {
  return (
    <section className={cn("rounded-xl border border-borde bg-superficie p-5 shadow-xs", className)}>
      <header className="mb-4">
        <h2 className="font-medium text-tinta">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-sm text-tinta-suave">{descripcion}</p>}
      </header>
      {children}
    </section>
  );
}
