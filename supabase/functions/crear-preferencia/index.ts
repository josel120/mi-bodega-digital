import { paymentRuntime } from "../_shared/runtime.mjs";

Deno.serve(paymentRuntime(Deno.env.toObject()).checkout);
