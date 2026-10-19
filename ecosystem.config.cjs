/**
 * PM2 (servidor de la empresa): mantiene el sistema encendido y lo arranca con el servidor.
 *   pm2 start ecosystem.config.cjs   ·   pm2 restart seguros   ·   pm2 logs seguros
 * Puerto: cambie «-p 3000» si ese puerto ya está ocupado.
 */
module.exports = {
  apps: [
    {
      name: "seguros",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      interpreter: "node",
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1G",
    },
  ],
};
