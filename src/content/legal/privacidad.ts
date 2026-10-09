// BORRADOR — requiere validación de abogado peruano antes de cobrar.
//
// Aviso de privacidad de Mi Bodega Digital (Ley 29733 y su reglamento, DS 016-2024-JUS).
// Preparado el 2026-10-06 por legal-counsel (Gaia Nexus) a partir del código del repositorio.
// No es asesoría legal. Los textos entre corchetes son datos pendientes que decide el dueño.
//
// Hechos comprobados en el código (2026-10-06):
// - Supabase guarda: bodega (business_name, yape_number, estado y fechas del plan), ventas y gastos
//   (monto, descripción, medio de pago, fecha), fiados (customer_name, phone_number, balance) y
//   pedidos de membresía (plan, monto, estado, preference_id, payment_id, fechas). No guarda tarjetas.
// - En el celular: sesión en una cookie propia de Supabase Auth (@supabase/ssr), datos de la bodega en
//   localStorage y caja/fiados/cola sin señal en IndexedDB. Se borran al tocar «Cerrar sesión».
// - No hay analítica, publicidad ni IA en el código. next/font se sirve desde el propio sitio.
// - PENDIENTE de Desarrollo antes de publicar: el botón «Borrar mi cuenta» todavía no existe y
//   membership_orders tiene ON DELETE RESTRICT; este texto lo describe como debe quedar.
//
// Fuentes (consultadas 2026-10-06; gob.pe y elperuano.pe bloqueados por el proxy: se usaron
// extractos oficiales del buscador, verificar texto completo):
// - Ley 29733, Ley de Protección de Datos Personales (03-07-2011).
// - DS 016-2024-JUS, nuevo reglamento (publicado 30-11-2024, vigente desde 30-03-2025):
//   https://www.gob.pe/institucion/anpd/normas-legales/6554453-16-2024-jus
// - Inscripción de bancos de datos (ANPD): https://www.gob.pe/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales
//
// [ABOGADO] revisar: rol de encargado sobre datos de los clientes del fiado y cláusula de encargo;
// base legal de cada finalidad; plazos de respuesta ARCO y portabilidad del DS 016-2024-JUS;
// si corresponde designar oficial de datos personales; plazo de conservación tributaria;
// forma de comunicar el flujo transfronterizo a la ANPD.

export const TITULO = "Aviso de privacidad";

export const ACTUALIZADO = "2026-10-06";

export const SECCIONES: { titulo: string; parrafos: string[] }[] = [
  {
    titulo: "En corto",
    parrafos: [
      "Guardamos lo que tú anotas en tu cuaderno digital: tus ventas, tus gastos y tus fiados. Lo usamos solo para que la app funcione y para cobrarte el plan si decides pagar.",
      "No vendemos tus datos ni los de tus clientes. No ponemos publicidad. No guardamos números de tarjeta.",
      "Puedes pedirnos ver, corregir o borrar tus datos cuando quieras, y puedes borrar tu cuenta desde la app.",
    ],
  },
  {
    titulo: "Quién es responsable",
    parrafos: [
      "El responsable de tus datos es [RAZÓN SOCIAL], con RUC [RUC] y domicilio en [DOMICILIO]. Para cualquier tema de privacidad escríbenos a josegomez120@gmail.com.",
      "Tus datos están en el banco de datos «Usuarios de Mi Bodega Digital», inscrito ante la Autoridad Nacional de Protección de Datos Personales (ANPD) con el código [CÓDIGO DE INSCRIPCIÓN ANPD].",
    ],
  },
  {
    titulo: "Qué datos guardamos de ti",
    parrafos: [
      "De tu cuenta: tu correo y tu clave (la clave se guarda cifrada; nosotros no podemos leerla).",
      "De tu bodega: el nombre de tu negocio y, si lo pones, tu número de Yape para que salga en los mensajes de cobro.",
      "De tu caja: cada venta y gasto que anotas, con su monto, su descripción, la forma de pago (efectivo, Yape, Plin, tarjeta u otro) y la fecha.",
      "De tu plan: si estás en prueba o con plan pagado, hasta cuándo, y los datos de cada pago (plan, monto, estado y el número de operación de Mercado Pago). Los datos de tu tarjeta o de tu cuenta los recibe Mercado Pago, no nosotros.",
      "Datos técnicos: como cualquier página web, nuestros proveedores registran la dirección IP y el tipo de navegador al conectarte, para que el servicio funcione y sea seguro.",
    ],
  },
  {
    titulo: "Los datos de tus clientes del fiado",
    parrafos: [
      "Cuando anotas un fiado guardas el nombre, el celular y lo que te debe un cliente tuyo. Esos datos son de tus clientes y tú decides para qué los usas: tú eres la responsable de ellos.",
      "Nosotros solo los guardamos por encargo tuyo, para mostrártelos y armar el mensaje de cobro. No los usamos para nada más, no les escribimos y no se los damos a nadie.",
      "Te pedimos tres cosas: anota solo lo necesario para cobrar (nombre, celular y monto); cuéntale a tu cliente que lo apuntas en tu cuaderno digital; y si te pide que lo borres o corrijas, hazlo desde la app.",
      "Si un cliente tuyo nos escribe a nosotros, le pasaremos su pedido a tu bodega y te ayudaremos a atenderlo.",
    ],
  },
  {
    titulo: "Para qué usamos tus datos",
    parrafos: [
      "Para darte el servicio: guardar tu caja y tus fiados, sincronizarlos entre tus celulares y dejarte entrar a tu cuenta.",
      "Para cobrarte el plan y emitir tu boleta o factura, si decides pagar.",
      "Para avisarte cosas de tu cuenta: recuperar tu clave, confirmar un pago o recordarte que tu plan vence. Estos avisos son parte del servicio.",
      "Para atender tus reclamos, consultas y pedidos sobre tus datos.",
      "Si usas el Libro de Reclamaciones, guardamos lo que escribes en la hoja (nombre, documento, contacto y detalle) solo para responderte y por el tiempo que exige la norma de Indecopi.",
      "No te enviaremos publicidad sin tu permiso aparte. Si algún día te pedimos ese permiso, podrás decir que no y seguirás usando la app igual.",
    ],
  },
  {
    titulo: "Por qué podemos usarlos",
    parrafos: [
      "Usamos tus datos porque son necesarios para cumplir el contrato del servicio que aceptas al registrarte, y para cumplir obligaciones de ley, como las tributarias.",
      "Al crear tu cuenta te pedimos que leas este aviso y lo aceptes. Para cualquier otro uso que no esté aquí te pediremos tu consentimiento antes.",
    ],
  },
  {
    titulo: "Con quién compartimos datos y en qué países están",
    parrafos: [
      "Usamos estos proveedores, que tratan los datos solo para darnos su servicio:",
      "Supabase: guarda la base de datos y maneja el ingreso a tu cuenta. Sus servidores están en Estados Unidos.",
      "Mercado Pago: procesa los pagos de tu plan. Tus datos de pago los recibe directamente Mercado Pago, según sus propias reglas de privacidad. Puede tratarlos en Perú y en otros países.",
      "GitHub (GitHub Pages): publica la página de la app. Registra datos técnicos de conexión, como la IP. Sus servidores están en Estados Unidos.",
      "[PROVEEDOR DE CORREO]: envía los correos de la cuenta (por ejemplo, recuperar tu clave). [PAÍS DEL PROVEEDOR DE CORREO].",
      "Como algunos de estos servidores están fuera del Perú, hay una transferencia internacional de datos. Elegimos proveedores con medidas de seguridad reconocidas y les damos solo lo necesario.",
      "Solo entregaremos datos a una autoridad cuando la ley lo exija.",
    ],
  },
  {
    titulo: "Lo que se guarda en tu celular",
    parrafos: [
      "Para que la app funcione sin señal, tu celular guarda una copia de tu caja, tus fiados (con nombre, celular y saldo de tus clientes) y las anotaciones que faltan subir.",
      "También guarda tu sesión en una cookie de la propia app, para que no tengas que poner tu clave cada vez. No usamos cookies de publicidad ni de seguimiento, ni herramientas de estadística.",
      "Esa copia se borra cuando tocas «Cerrar sesión». Si prestas tu celular o lo usa otra persona, cierra sesión antes, y ponle bloqueo de pantalla a tu teléfono.",
    ],
  },
  {
    titulo: "Cuánto tiempo guardamos los datos",
    parrafos: [
      "Mientras tengas tu cuenta, guardamos lo que anotas para que no lo pierdas. Que tu plan venza no borra tus datos: los guardamos [PLAZO DE CONSERVACIÓN TRAS VENCER] para que puedas volver.",
      "Si borras tu cuenta, borramos tu bodega, tus ventas, tus gastos y los datos de tus clientes del fiado en un plazo máximo de [PLAZO DE BORRADO] días.",
      "Los datos de tus pagos y comprobantes los conservamos, sin tus anotaciones, solo por el tiempo que exigen las normas tributarias y contables. Después se eliminan.",
      "Las copias de respaldo de nuestros proveedores se renuevan solas y los datos borrados desaparecen de ellas con el tiempo.",
    ],
  },
  {
    titulo: "Tus derechos y cómo usarlos",
    parrafos: [
      "Tienes derecho a saber qué datos tenemos de ti (acceso), a corregirlos (rectificación), a que los borremos (cancelación) y a pedir que dejemos de usarlos para algo (oposición). También puedes pedir una copia de tus datos en un formato que puedas llevarte (portabilidad).",
      "Para pedirlo, escríbenos a josegomez120@gmail.com desde el correo de tu cuenta, diciendo qué necesitas. Si escribes desde otro correo, te pediremos algo para confirmar que eres tú. No cobramos nada por atenderte.",
      "Te responderemos en un máximo de [PLAZO ARCO] días hábiles.",
      "Si no estás de acuerdo con nuestra respuesta, o no te respondemos, puedes presentar una reclamación ante la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.",
    ],
  },
  {
    titulo: "Borrar tu cuenta",
    parrafos: [
      "Puedes borrar tu cuenta tú misma desde la app: pestaña «Cuenta» → «Borrar mi cuenta». Te pediremos confirmar, porque no se puede deshacer.",
      "Antes de borrar, revisa que no tengas anotaciones sin subir. Al borrar se elimina todo lo que anotaste, también los fiados de tus clientes.",
      "Si tenías un plan pagado vigente, borrar la cuenta no da derecho a devolución por sí solo; revisa nuestra Política de devoluciones.",
    ],
  },
  {
    titulo: "Cómo cuidamos tus datos",
    parrafos: [
      "La conexión va cifrada (https). Cada bodega solo puede ver sus propios datos: la base de datos lo controla con reglas de acceso por cuenta. Los pagos los procesa Mercado Pago y nosotros nunca vemos tu tarjeta.",
      "Ningún sistema es perfecto. Si ocurre un incidente que afecte tus datos, lo resolveremos lo antes posible, te avisaremos y lo comunicaremos a la ANPD como manda la ley.",
      "Tú también ayudas: usa una clave que no uses en otro lado, no la compartas y cierra sesión en celulares prestados.",
    ],
  },
  {
    titulo: "Edad mínima",
    parrafos: [
      "Mi Bodega Digital es para personas mayores de 18 años que manejan un negocio. No la ofrecemos a menores de edad.",
    ],
  },
  {
    titulo: "Cambios a este aviso",
    parrafos: [
      "Si cambiamos este aviso te lo diremos dentro de la app antes de que el cambio empiece. Si el cambio necesita tu permiso, te lo pediremos de nuevo.",
    ],
  },
];
