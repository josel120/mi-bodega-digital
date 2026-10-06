// BORRADOR — requiere validación de abogado peruano antes de cobrar.
//
// Textos y campos del Libro de Reclamaciones virtual de Mi Bodega Digital.
// Preparado el 2026-10-06 por legal-counsel (Gaia Nexus). No es asesoría legal.
// Los textos entre corchetes son datos pendientes que decide el dueño.
//
// Base normativa (Perú):
// - Ley 29571, Código de Protección y Defensa del Consumidor, arts. 150-152 (libro obligatorio).
// - DS 011-2011-PCM, Reglamento del Libro de Reclamaciones; modificado por DS 006-2014-PCM,
//   DS 058-2017-PCM y DS 101-2022-PCM (Anexo I vigente: formato de Hoja de Reclamación).
// - Ley 31435 (2022): plazo de respuesta de 15 días hábiles improrrogables.
//
// Fuentes consultadas el 2026-10-06. El proxy bloqueó gob.pe, elperuano.pe, indecopi.gob.pe y
// consumidor.gob.pe: los campos se tomaron de extractos oficiales del buscador y del formato del
// Anexo I conocido. ANTES DE PUBLICAR, un humano debe abrir el Anexo I y comparar campo por campo:
// - Anexo I, DS 101-2022-PCM (formato vigente): https://cdn.www.gob.pe/uploads/document/file/3510113/Anexo%20I%20DS%20N%20101-2022-PCM_.pdf.pdf?v=1660688658
// - DS 101-2022-PCM (El Peruano, norma 2095978-1): https://busquedas.elperuano.pe/dispositivo/NL/2095978-1
// - DS 011-2011-PCM (texto original): https://cdn.www.gob.pe/uploads/document/file/662494/Decreto_Supremo_N_011-2011-PCM.pdf?v=1588006949
// - Ley 31435 (plazo 15 días hábiles): https://busquedas.elperuano.pe/dispositivo/NL/2050405-1
// - Indecopi, preguntas y respuestas (12-11-2025): https://consumidor.gob.pe/wp-content/uploads/2020/07/Preguntas_Respuestas_LR_12.11.2025.pdf
// - Indecopi, «Tu Libro» (libro virtual gratuito): https://consumidor.indecopi.gob.pe/tulibro/
//
// Verificado (extractos oficiales): reclamo = disconformidad con el producto o servicio; queja =
// malestar o descontento con la atención al público; respuesta escrita en ≤15 días hábiles
// improrrogables por el medio indicado por el consumidor; el libro virtual va en el mismo medio donde
// se vende y debe permitir imprimir o enviar copia al correo; el proveedor conserva la constancia.
// Supuestos [ABOGADO]: lista exacta y orden de campos del Anexo I vigente; si el aviso del libro debe
// tener texto fijo; conservación de hojas (DS 011-2011-PCM fija un plazo mínimo: confirmar);
// libro físico de respaldo; si conviene usar «Tu Libro» de Indecopi en vez de uno propio.
//
// Notas para Desarrollo (no es texto para el usuario):
// - Numeración correlativa y código de identificación por hoja, asignados por el servidor.
// - Al enviar: mostrar la constancia en pantalla (imprimible) y enviar copia al correo del consumidor.
// - La sección «Observaciones y acciones adoptadas por el proveedor» la llena el proveedor al
//   responder; no va en CAMPOS porque no la llena el consumidor.
// - Las hojas tienen datos personales: tabla con RLS, sin acceso de otras bodegas, incluida en el
//   aviso de privacidad y con su plazo de conservación propio (no se borra con «Borrar mi cuenta»).

export const TITULO = "Libro de Reclamaciones";

export const ACTUALIZADO = "2026-10-06";

export const SECCIONES: { titulo: string; parrafos: string[] }[] = [
  {
    titulo: "Libro de Reclamaciones virtual",
    parrafos: [
      "Conforme al Código de Protección y Defensa del Consumidor, contamos con un Libro de Reclamaciones virtual a tu disposición.",
      "Proveedor: [RAZÓN SOCIAL] · RUC [RUC] · Domicilio: [DOMICILIO] · Correo: [CORREO DE CONTACTO].",
    ],
  },
  {
    titulo: "¿Reclamo o queja?",
    parrafos: [
      "Reclamo: cuando no estás conforme con el servicio que contrataste. Por ejemplo, un cobro que no corresponde o una función que no hace lo que ofrecimos.",
      "Queja: cuando no estás conforme con la atención que te dimos, aunque no tenga que ver directamente con el servicio. Por ejemplo, si no te respondimos o te atendimos mal.",
    ],
  },
  {
    titulo: "Qué pasa después",
    parrafos: [
      "Al enviar tu hoja verás una constancia con su número y fecha. Puedes imprimirla o guardarla con una captura de pantalla. Guárdala.",
      "Te respondemos por escrito en un plazo máximo de 15 días hábiles, al correo o a la dirección que nos indiques.",
      "Presentar un reclamo no te impide acudir a otras vías de solución ni es requisito previo para presentar una denuncia ante Indecopi.",
    ],
  },
  {
    titulo: "Antes de llenar",
    parrafos: [
      "Si es un problema de pago o de acceso, también puedes escribirnos a [CORREO DE CONTACTO]; muchas veces se resuelve rápido. Igual puedes usar este libro cuando quieras.",
      "Usamos los datos de esta hoja solo para atender tu reclamo o queja, como manda la ley, y los conservamos el tiempo que exige la norma. Más detalle en nuestro Aviso de privacidad.",
    ],
  },
];

type TipoCampo =
  | "texto"
  | "email"
  | "telefono"
  | "numero"
  | "fecha"
  | "opcion"
  | "area";

export const CAMPOS: {
  nombre: string;
  etiqueta: string;
  obligatorio: boolean;
  tipo: TipoCampo;
  opciones?: string[];
}[] = [
  // Cabecera: número correlativo, fecha y datos del proveedor los pone el sistema (ver notas arriba).
  // 1. Identificación del consumidor reclamante
  { nombre: "consumerName", etiqueta: "Nombre y apellidos", obligatorio: true, tipo: "texto" },
  {
    nombre: "documentType",
    etiqueta: "Tipo de documento",
    obligatorio: true,
    tipo: "opcion",
    opciones: ["DNI", "Carné de extranjería", "Pasaporte", "Otro"],
  },
  { nombre: "documentNumber", etiqueta: "Número de documento", obligatorio: true, tipo: "texto" },
  { nombre: "address", etiqueta: "Domicilio", obligatorio: true, tipo: "texto" },
  { nombre: "phone", etiqueta: "Teléfono", obligatorio: true, tipo: "telefono" },
  { nombre: "email", etiqueta: "Correo electrónico", obligatorio: true, tipo: "email" },
  {
    nombre: "isMinor",
    etiqueta: "¿Eres menor de edad?",
    obligatorio: true,
    tipo: "opcion",
    opciones: ["No", "Sí"],
  },
  // Solo si es menor de edad (el formato pide los datos del padre, madre o representante).
  {
    nombre: "guardianName",
    etiqueta: "Si eres menor de edad: nombre del padre, madre o apoderado",
    obligatorio: false,
    tipo: "texto",
  },
  {
    nombre: "guardianContact",
    etiqueta: "Si eres menor de edad: domicilio, teléfono o correo del padre, madre o apoderado",
    obligatorio: false,
    tipo: "texto",
  },
  // 2. Identificación del bien contratado
  {
    nombre: "itemType",
    etiqueta: "¿Sobre qué es?",
    obligatorio: true,
    tipo: "opcion",
    opciones: ["Servicio", "Producto"],
  },
  {
    nombre: "claimedAmount",
    etiqueta: "Monto reclamado (S/), si corresponde",
    obligatorio: false,
    tipo: "numero",
  },
  {
    nombre: "itemDescription",
    etiqueta: "Descripción del servicio (por ejemplo: plan mensual, plan anual, cobro del día…)",
    obligatorio: true,
    tipo: "texto",
  },
  {
    nombre: "paymentDate",
    etiqueta: "Fecha del pago o del hecho, si la recuerdas",
    obligatorio: false,
    tipo: "fecha",
  },
  // 3. Detalle de la reclamación y pedido del consumidor
  {
    nombre: "claimType",
    etiqueta: "Tipo",
    obligatorio: true,
    tipo: "opcion",
    opciones: ["Reclamo", "Queja"],
  },
  { nombre: "detail", etiqueta: "Detalle: cuéntanos qué pasó", obligatorio: true, tipo: "area" },
  { nombre: "request", etiqueta: "Pedido: qué solución quieres", obligatorio: true, tipo: "area" },
  {
    nombre: "responseChannel",
    etiqueta: "¿Cómo quieres recibir la respuesta?",
    obligatorio: true,
    tipo: "opcion",
    opciones: ["Por correo electrónico", "Por carta a mi domicilio"],
  },
  // Equivale a la firma del consumidor en la hoja física.
  {
    nombre: "declaration",
    etiqueta: "Declaro que los datos que doy son ciertos y presento esta hoja.",
    obligatorio: true,
    tipo: "opcion",
    opciones: ["Acepto"],
  },
];
