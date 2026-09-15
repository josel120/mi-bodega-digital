import type { NextConfig } from "next";
import { BASE_PATH } from "./src/lib/base-path";

const basePath = BASE_PATH;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Next no prefija solo las rutas de metadata (manifest, iconos) ni las del
  // service worker: las armamos a mano con este valor.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
