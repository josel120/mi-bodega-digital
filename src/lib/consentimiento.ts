// Constancia del consentimiento legal al registrarse (Ley 29733). Guardamos
// cuándo y qué versión de los Términos y el Aviso de privacidad aceptó la
// bodeguera, para poder demostrarlo después si hiciera falta.
//
// Las versiones se importan desde el propio contenido legal (ACTUALIZADO en
// cada archivo de src/content/legal/): así, si Legal actualiza una fecha, el
// registro nuevo queda con la versión correcta sin tocar este archivo.

import { ACTUALIZADO as VERSION_PRIVACIDAD } from "@/content/legal/privacidad";
import { ACTUALIZADO as VERSION_TERMINOS } from "@/content/legal/terminos";

export interface Consentimiento {
  legal_accepted_at: string;
  privacy_version: string;
  terms_version: string;
}

/**
 * Construye lo que se guarda en `options.data` del signUp. Recibe la fecha
 * (`ahoraIso`) como parámetro en vez de leerla con `new Date()` aquí, para
 * que la función sea pura y se pueda probar sin depender del reloj.
 */
export function construirConsentimiento(ahoraIso: string): Consentimiento {
  return {
    legal_accepted_at: ahoraIso,
    privacy_version: VERSION_PRIVACIDAD,
    terms_version: VERSION_TERMINOS,
  };
}

/**
 * ¿Marcó la casilla de "Leí y acepto..."? Sin esto no se debe llamar a
 * supabase.auth.signUp: es la función que decide si el registro puede
 * continuar o hay que mostrar el error junto a la casilla.
 */
export function aceptoLegalValido(acepto: boolean): boolean {
  return acepto === true;
}
