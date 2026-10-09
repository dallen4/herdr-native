// Typed access to the Vite-injected env. Values are baked at build time
// from the VITE_* vars (see .env.example).
export const DEFAULT_BRIDGE_URL = import.meta.env
  .VITE_DEFAULT_BRIDGE_URL;
