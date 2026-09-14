import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fixa a raiz do projeto: evita que o Next infira um workspace acima
  // desta pasta quando existe outro package-lock.json no caminho.
  outputFileTracingRoot: raiz,
};

export default nextConfig;
