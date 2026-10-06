import { accountRuntime } from "../_shared/cuenta.mjs";

Deno.serve(accountRuntime(Deno.env.toObject()).deleteAccount);
