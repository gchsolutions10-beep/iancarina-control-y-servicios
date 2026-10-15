import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin cacheComponents: los datos de planta se leen siempre en vivo.
  // Ver .claude/skills/stack-nextjs (regla 6).
  // Archivos que se suben desde los formularios (el máximo real lo fija el ajuste
  // archivos.tamano_maximo_mb; en Vercel, la plataforma corta en 4,5 MB).
  experimental: {
    serverActions: { bodySizeLimit: "101mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
