import { copiaReclamoRuntime } from "../_shared/copia-reclamo.mjs";

Deno.serve(copiaReclamoRuntime(Deno.env.toObject()).copiaReclamo);
