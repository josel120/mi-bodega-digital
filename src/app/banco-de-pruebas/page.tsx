"use client";
// PAGINA TEMPORAL DE VALIDACION - BORRAR
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import * as db from "@/lib/offline/db";
import * as cola from "@/lib/offline/cola";
import * as almacen from "@/lib/offline/almacen";
import * as vista from "@/lib/offline/vista";
import { nuevoId } from "@/lib/offline/id";

export default function BancoDePruebas() {
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__bodega = {
      supabase: createClient(), db, cola, almacen, vista, nuevoId,
    };
  }, []);
  return <p>banco de pruebas</p>;
}
