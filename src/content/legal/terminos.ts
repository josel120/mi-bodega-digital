// BORRADOR — requiere validación de abogado peruano antes de cobrar.
//
// Términos y condiciones de Mi Bodega Digital. Preparado el 2026-10-06 por legal-counsel (Gaia Nexus).
// No es asesoría legal. Los textos entre corchetes son datos pendientes que decide el dueño.
//
// Hechos comprobados en el código (2026-10-06): prepago S/29 mensual o S/279 anual por Mercado Pago
// Checkout Pro, sin cargo recurrente; el alta crea subscription_status=trial con trial_ends_at; la app
// no bloquea caja ni fiados según el plan; MOSTRAR_PLANES=false y PAYMENTS_ENABLED apagado.
// Oferta aprobada por el dueño para este borrador: prueba de 14 días y precio fundador S/19/mes
// para las primeras 30 bodegas.
//
// Fuentes (consultadas 2026-10-06; elperuano.pe y gob.pe bloqueados por el proxy, verificar texto):
// - Ley 29571, Código de Protección y Defensa del Consumidor (CPDC), arts. 1, 2, 3, 5 y 50
//   (información de precios y condiciones, cláusulas abusivas).
// - Ley 32323 (modifica art. 58.1.e del CPDC, mensajes promocionales masivos):
//   https://busquedas.elperuano.pe/dispositivo/NL/2397811-2
// - Comprobantes: Reglamento de Comprobantes de Pago (SUNAT) https://www.sunat.gob.pe/legislacion/comprob/regla/capituloI.pdf
//
// [ABOGADO] revisar: si el bodeguero microempresario es «consumidor» (CPDC art. IV.1.2) y qué
// cláusulas serían abusivas; tope de responsabilidad; cláusula de jurisdicción (no puede excluir a
// Indecopi); duración y condiciones del precio fundador; suspensión por falta de pago.
// [CONTADOR] revisar: si el vendedor está afecto a IGV (el texto dice «incluye IGV, si corresponde»)
// y qué comprobante emite según su régimen.

export const TITULO = "Términos y condiciones";

export const ACTUALIZADO = "2026-10-06";

export const SECCIONES: { titulo: string; parrafos: string[] }[] = [
  {
    titulo: "Quiénes somos",
    parrafos: [
      "Mi Bodega Digital es un servicio de [RAZÓN SOCIAL], con RUC [RUC] y domicilio en [DOMICILIO]. Puedes escribirnos a josegomez120@gmail.com.",
      "Al crear tu cuenta aceptas estos términos y nuestro Aviso de privacidad. Léelos con calma; si algo no te queda claro, pregúntanos antes de pagar.",
    ],
  },
  {
    titulo: "Qué es el servicio",
    parrafos: [
      "Mi Bodega Digital es un cuaderno de ventas, gastos y fiados en tu celular. Te deja anotar la caja del día, llevar quién te debe y mandar el recordatorio de cobro por WhatsApp.",
      "Funciona en el navegador y se puede instalar como app. Sigue funcionando sin señal y sube lo anotado cuando vuelve el internet.",
      "Es una herramienta de apuntes. No es un sistema de facturación electrónica ni de contabilidad, no emite boletas a tus clientes y no reemplaza a tu contador.",
    ],
  },
  {
    titulo: "Tu cuenta",
    parrafos: [
      "Para usarla necesitas un correo propio y una clave. Debes ser mayor de 18 años y darnos datos reales.",
      "Cuida tu clave: lo que se haga con tu cuenta se entiende hecho por ti. Si crees que alguien entró a tu cuenta, cambia la clave y avísanos.",
      "Una cuenta es para una bodega.",
    ],
  },
  {
    titulo: "Prueba gratis de 14 días",
    parrafos: [
      "Al crear tu cuenta tienes 14 días de prueba gratis. No te pedimos tarjeta.",
      "Cuando termina la prueba no se te cobra nada. Si quieres seguir con un plan pagado, tú eliges el plan y pagas.",
      "Lo que anotaste durante la prueba no se borra cuando la prueba termina.",
    ],
  },
  {
    titulo: "Planes y precios",
    parrafos: [
      "Plan mensual: S/ 29 por un mes de servicio.",
      "Plan anual: S/ 279 por doce meses de servicio (equivale a S/ 23,25 al mes).",
      "Precio fundador: S/ 19 al mes, solo para las primeras 30 bodegas que paguen. Dura [DURACIÓN DEL PRECIO FUNDADOR] y se mantiene si renuevas [CONDICIÓN PARA MANTENER EL PRECIO FUNDADOR]. Cuando se llenan los 30 cupos, lo diremos en la página de planes.",
      "Todos los precios están en soles e incluyen todos los impuestos (IGV, si corresponde). No hay cobros escondidos ni costo de inscripción. La comisión de Mercado Pago la asumimos nosotros.",
      "Qué incluye cada plan: [QUÉ INCLUYE EL PLAN PAGADO Y QUÉ SIGUE GRATIS].",
      "Si cambiamos los precios, el nuevo precio solo se aplica a los pagos que hagas después del cambio. Lo que ya pagaste se respeta.",
    ],
  },
  {
    titulo: "Pago por adelantado, sin cobro automático",
    parrafos: [
      "Los planes se pagan por adelantado con Mercado Pago, con los medios que Mercado Pago te muestre en ese momento.",
      "No guardamos tu tarjeta y no te cobramos solos. Cuando tu plan está por vencer te avisamos en la app, y tú decides si renuevas.",
      "Si renuevas antes de que venza, el tiempo nuevo se suma al que te quedaba; no pierdes días.",
      "El plan se activa cuando Mercado Pago nos confirma el pago, normalmente en unos minutos. Si ya pagaste y no se activa, no vuelvas a pagar: toca «Revisar mi plan» o escríbenos.",
    ],
  },
  {
    titulo: "Cuando tu plan vence",
    parrafos: [
      "Si no renuevas, el plan simplemente termina. No se te cobra nada y no quedas debiendo.",
      "Tus anotaciones no se borran por eso: las guardamos [PLAZO DE CONSERVACIÓN TRAS VENCER] y las vuelves a ver si renuevas. [QUÉ PUEDE HACER LA CUENTA CON EL PLAN VENCIDO].",
    ],
  },
  {
    titulo: "Comprobantes de pago",
    parrafos: [
      "Por cada pago te damos un comprobante electrónico: boleta de venta o, si nos das tu RUC antes de pagar, factura. Te lo enviamos al correo de tu cuenta.",
      "Si se hace una devolución, emitimos la nota de crédito que corresponde.",
    ],
  },
  {
    titulo: "Devoluciones",
    parrafos: [
      "Las devoluciones se rigen por nuestra Política de devoluciones, que forma parte de estos términos. En corto: si no te sirvió, pides tu dinero en los primeros 7 días desde tu pago; un cobro duplicado o por error siempre se devuelve.",
    ],
  },
  {
    titulo: "Disponibilidad y uso sin señal",
    parrafos: [
      "Hacemos lo posible para que la app funcione todos los días, pero no podemos prometer que nunca falle. Puede haber cortes por mantenimiento o por problemas de nuestros proveedores (Supabase, GitHub, Mercado Pago) o de tu internet.",
      "Sin señal puedes seguir anotando. Lo anotado queda en tu celular y sube cuando vuelve el internet; arriba verás cuántas anotaciones faltan subir.",
      "Lo que no llegó a subir solo está en tu celular. Si borras los datos del navegador, cierras sesión o pierdes el celular antes de que suba, eso se puede perder. Antes de cambiar de celular, revisa que diga «0 sin subir».",
      "Si una anotación no se puede subir (por ejemplo, un abono que ya se cobró desde otro celular), la app te avisa con el monto y el nombre para que lo revises tú. No la descarta en silencio.",
    ],
  },
  {
    titulo: "Lo que anotas es tuyo",
    parrafos: [
      "Tus ventas, gastos y fiados son tuyos. Nosotros solo los guardamos para darte el servicio, como explica el Aviso de privacidad.",
      "Tú respondes por lo que anotas. Los datos de tus clientes del fiado los anotas tú y debes usarlos solo para llevar tu cuenta y cobrar. No uses la app para mandar publicidad ni mensajes masivos.",
      "Revisa tus números. La app suma lo que anotas; si un monto se anotó mal, el resultado saldrá mal.",
    ],
  },
  {
    titulo: "Uso correcto",
    parrafos: [
      "No está permitido: usar la app para algo ilegal, intentar entrar a cuentas de otras personas, atacar o sobrecargar el servicio, o copiar la app para venderla.",
      "La app, su nombre y su diseño son de [RAZÓN SOCIAL]. Te damos permiso para usarla mientras tengas tu cuenta; no te vendemos el programa.",
    ],
  },
  {
    titulo: "Hasta dónde respondemos",
    parrafos: [
      "Respondemos por dar el servicio con cuidado y como lo ofrecemos. Si falla por nuestra culpa, lo arreglamos y, si no se puede usar, te devolvemos la parte que pagaste por el tiempo sin servicio.",
      "No respondemos por lo que no depende de nosotros: falta de señal o de luz, celulares perdidos o dañados, datos que no llegaron a subir, claves compartidas, ni por decisiones de tu negocio tomadas con números mal anotados.",
      "Fuera de los casos de dolo o culpa grave, que la ley no permite limitar, lo máximo que respondemos es lo que pagaste en los últimos 12 meses.",
      "Nada de esto quita los derechos que te da el Código de Protección y Defensa del Consumidor.",
    ],
  },
  {
    titulo: "Terminar el servicio",
    parrafos: [
      "Puedes dejar de usar la app cuando quieras. Para que borremos tus datos, usa «Borrar mi cuenta» en el menú.",
      "Podemos suspender o cerrar una cuenta que incumpla estos términos (por ejemplo, si se usa para algo ilegal o para atacar el servicio). Salvo casos graves o urgentes, primero te avisaremos por correo y te daremos un plazo para corregirlo. Si cerramos tu cuenta sin culpa tuya, te devolvemos la parte del plan que no usaste.",
      "Si algún día dejamos de ofrecer Mi Bodega Digital, te avisaremos con al menos [DÍAS DE AVISO DE CIERRE] días y te devolveremos la parte no usada de tu plan.",
    ],
  },
  {
    titulo: "Avisos y cambios",
    parrafos: [
      "Te escribimos al correo de tu cuenta o dentro de la app. Solo te enviamos avisos de tu cuenta y de tu plan; publicidad, solo si nos das permiso aparte.",
      "Si cambiamos estos términos, te avisaremos en la app antes de que empiecen a regir. Los cambios no se aplican a un plan que ya pagaste, salvo que te favorezcan.",
    ],
  },
  {
    titulo: "Reclamos, ley y jueces",
    parrafos: [
      "Si algo no te gustó, escríbenos a josegomez120@gmail.com o usa nuestro Libro de Reclamaciones virtual en la app. Respondemos los reclamos en un máximo de 15 días hábiles.",
      "Estos términos se rigen por las leyes del Perú. Puedes acudir a Indecopi o a los jueces competentes del Perú.",
    ],
  },
];
