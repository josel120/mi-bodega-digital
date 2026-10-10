// BORRADOR — requiere validación de abogado peruano antes de cobrar.
//
// Política de devoluciones y cancelación de Mi Bodega Digital. Texto de la decisión DEC-20261006-MBD-REFUND-RETENTION
// (legal-counsel, Gaia Nexus, 2026-10-06; docs/legal/2026-10-06-mi-bodega-devoluciones-y-retencion.md).
// No es asesoría legal. Los textos entre corchetes son datos pendientes que decide el dueño.
//
// Regla elegida (clara y favorable al consumidor; la aprueba el dueño):
// - Cualquier pago: devolución total si se pide dentro de 7 días calendario desde ese pago.
// - Anual, después de 7 días: devolución proporcional por meses completos no empezados
//   (S/ 279 ÷ 12 = S/ 23,25 por mes). No se descuenta la comisión de Mercado Pago.
// - Mensual y fundador, después de 7 días: sin devolución del mes en curso; se cancela dejándolo vencer.
// - Duplicado, monto distinto al publicado o falla nuestra: devolución (proporcional si es falla), sin plazo.
// - No hay forma segura de sumar días sin un pago (la vigencia se deriva de pedidos pagados): no se ofrece.
// - Solo el dueño ejecuta la devolución en Mercado Pago y emite la nota de crédito.
// Hechos del código: una devolución o contracargo revoca ese pedido y recalcula la vigencia
// (supabase/02-membresias-prepago.sql). Ojo, hallazgo S6 de seguridad: con pedidos apilados la
// revocación puede dejar vigente un periodo de más; corregir antes de cobrar.
// PENDIENTE de producto: el botón «Pedir devolución» no existe aún; hoy el canal es el correo.
//
// [ABOGADO] revisar: si el CPDC (Ley 29571) o normas de comercio electrónico exigen un derecho de
// desistimiento distinto para servicios digitales; compatibilidad con el art. 50 (cláusulas abusivas).
// [CONTADOR] revisar: nota de crédito y su plazo de emisión (Reglamento de Comprobantes de Pago,
// https://www.sunat.gob.pe/legislacion/comprob/regla/capituloI.pdf, consultado 2026-10-06).

export const TITULO = "Política de devoluciones y cancelación";

export const ACTUALIZADO = "2026-10-06";

export const SECCIONES: { titulo: string; parrafos: string[] }[] = [
  {
    titulo: "En corto",
    parrafos: [
      "No te cobramos solos. Pagas un mes o un año y, si no renuevas, el plan termina en su fecha. No tienes que avisar a nadie.",
      "¿Pagaste y no te sirvió? Pide tu plata dentro de los 7 días desde que pagaste y te la devolvemos completa. No tienes que explicar por qué.",
      "Si te cobramos dos veces, te cobramos de más o la app no funcionó por culpa nuestra, te devolvemos siempre, sin importar la fecha.",
    ],
  },
  {
    titulo: "Cancelar tu plan",
    parrafos: [
      "Los planes se pagan por adelantado y no se renuevan solos. Si no quieres seguir, no tienes que hacer nada: el plan termina en su fecha y no se te cobra más.",
      "Dejar de pagar no borra lo que anotaste. Si además quieres que borremos tus datos, usa «Borrar mi cuenta» en el menú de la app.",
    ],
  },
  {
    titulo: "Devolución en los primeros 7 días",
    parrafos: [
      "Puedes pedir la devolución completa de cualquier pago dentro de los 7 días calendario desde que lo hiciste. No tienes que explicar por qué.",
      "Vale para el plan mensual, el anual y el precio fundador.",
    ],
  },
  {
    titulo: "Plan anual después de los 7 días",
    parrafos: [
      "Si pagaste el plan anual y ya pasaron los 7 días, te devolvemos los meses que todavía no empezaron, a S/ 23,25 cada uno (S/ 279 entre 12).",
      "El mes que ya empezó cuenta como usado. Ejemplo: si pides la devolución el día 40, ya empezaron 2 meses y te devolvemos 10 meses: S/ 232,50.",
      "No te descontamos la comisión de Mercado Pago ni ningún otro gasto.",
    ],
  },
  {
    titulo: "Plan mensual y precio fundador después de los 7 días",
    parrafos: [
      "Pasados los 7 días, el mes sigue hasta su fecha y no se devuelve. Como no hay cobro automático, basta con dejarlo vencer y no pagas más.",
      "La excepción es una falla nuestra: si por un problema del servicio no pudiste usar la app, te devolvemos la parte proporcional de los días sin servicio.",
    ],
  },
  {
    titulo: "Cobros duplicados o por error",
    parrafos: [
      "Si pagaste dos veces lo mismo, o te cobramos un monto distinto al publicado, te devolvemos la diferencia completa, sin importar la fecha.",
      "Si pagaste y tu plan no se activó, no vuelvas a pagar: toca «Revisar mi plan» o escríbenos y lo resolvemos.",
    ],
  },
  {
    titulo: "Cómo pedir tu devolución",
    parrafos: [
      "Escríbenos a josegomez120@gmail.com desde el correo de tu cuenta, con el asunto «Devolución» y el número de operación de Mercado Pago si lo tienes.",
      "Te respondemos en 2 días hábiles.",
      "La plata vuelve por Mercado Pago al mismo medio con el que pagaste. Tu banco puede demorar unos días en mostrarla.",
      "Si no estás conforme, usa nuestro Libro de Reclamaciones en la app o acude a Indecopi.",
    ],
  },
  {
    titulo: "Qué pasa después de la devolución",
    parrafos: [
      "El tiempo de plan que corresponde al pago devuelto se cancela. Si tenías otro pago vigente, ese se respeta.",
      "Emitimos la nota de crédito electrónica que anula o corrige tu boleta o factura, y te la enviamos al correo.",
      "Tus anotaciones no se borran: siguen en tu cuenta como explica el Aviso de privacidad.",
    ],
  },
  {
    titulo: "Contracargos",
    parrafos: [
      "Si desconoces un pago ante tu banco o Mercado Pago (contracargo), el plan de ese pago se cancela mientras se revisa. Antes de hacerlo, escríbenos: casi siempre se resuelve más rápido con una devolución.",
    ],
  },
];
