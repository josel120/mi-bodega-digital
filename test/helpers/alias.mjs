// Permite importar desde las pruebas el código de src/ tal como lo escribe Next:
// con el alias "@/..." y sin extensión en los imports relativos.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

registerHooks({
  resolve(specifier, context, nextResolve) {
    let ruta = null;
    if (specifier.startsWith("@/")) {
      ruta = SRC + specifier.slice(2);
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.endsWith(".ts")
    ) {
      ruta = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (ruta && !existsSync(ruta) && existsSync(`${ruta}.ts`)) {
      return nextResolve(pathToFileURL(`${ruta}.ts`).href, context);
    }
    if (ruta && specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(ruta).href, context);
    }
    return nextResolve(specifier, context);
  },
});
