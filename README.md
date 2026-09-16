# Mi Bodega Digital

El cuaderno de ventas y fiados de la bodega, en el celular.

Está pensado para una señora que hoy anota con lapicero en un cuaderno de
cincuenta céntimos: se abre desde el ícono del teléfono, tiene la caja del día
en la primera pantalla y cobra los fiados por WhatsApp sin teclear el mensaje.
Todo en soles y en castellano peruano.

**En vivo:** https://josel120.github.io/mi-bodega-digital/

---

## Qué hace

| Pantalla | Para qué sirve |
| --- | --- |
| **Caja Diaria** | Anotar ventas y gastos del día, ver el saldo, moverse entre días con las flechas, corregir o borrar lo que se apuntó mal y ver en qué se cobró más (efectivo, Yape, Plin, tarjeta). |
| **Fiados** | Llevar quién debe cuánto, sumar lo que se llevó fiado, descontar lo que abonó y mandarle el recordatorio por WhatsApp con el número de Yape ya puesto. |
| **Planes** | Apagada durante el piloto gratuito. Se enciende poniendo `MOSTRAR_PLANES = true` en `src/lib/features.ts`. |

Se instala como app: desde Chrome en Android, *Menú → Instalar aplicación*.

### Sin señal

La bodega de barrio es justo donde el celular se queda sin datos, así que la app
sigue trabajando sin internet:

- **Se lee** la caja del día y la lista de fiados desde lo último que se bajó al
  teléfono. Nunca se hace pasar por fresco: arriba dice "Sin señal" y de cuándo
  son los números.
- **Se anota** todo: ventas, gastos, correcciones, borrados, clientes nuevos,
  "Fió más" y "Abonó". Queda guardado en el teléfono y sube solo cuando vuelve
  la señal. Mientras tanto se ve un contador ("3 sin subir") y cada anotación
  pendiente sale marcada.
- **Lo único que no se puede** es entrar por primera vez: el correo y la clave
  los verifica Supabase. Ya con la sesión abierta, la app entra en modo avión.

Si algo no se puede subir (por ejemplo, un abono que ya no cabe porque cobraron
desde otro celular), no se descarta ni se recorta en silencio: sale un aviso
rojo con el monto y el nombre, para que lo resuelva una persona.

El cómo está en `src/lib/offline/` y en la sección 6 de
`supabase/01-endurecer-esquema.sql`.

---

## Correr el proyecto

Necesitas Node 22.

```bash
npm install
npm run dev     # http://localhost:3000
```

Crea un `.env.local` con las claves del proyecto de Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Las dos son claves públicas: viajan dentro del JavaScript que se descarga el
celular del bodeguero. Lo que protege los datos no son estas claves sino las
políticas RLS de la base. La clave `service_role` **nunca** va en este repo.

Otros comandos:

```bash
npm run build   # genera la web estática en out/
npm run lint
npx tsc --noEmit
```

---

## Cómo se publica

Cada push a `master` dispara `.github/workflows/deploy.yml`, que compila la web
estática y la sube a GitHub Pages. No hay servidor propio: lo que se publica es
una carpeta de archivos, y el navegador del bodeguero habla directo con
Supabase.

Como la app vive en `https://josel120.github.io/mi-bodega-digital/` y no en la
raíz del dominio, todas las rutas llevan ese prefijo. Si un cambio rompe ese
prefijo, la app sigue abriendo pero deja de instalarse y de funcionar sin
señal, sin avisar. Está explicado en `CLAUDE.md`.

---

## Base de datos

Tres tablas en Supabase: `merchants` (la bodega), `transactions` (ventas y
gastos) y `customers_debts` (fiados).

`supabase/01-endurecer-esquema.sql` es el guion que hay que correr **una vez**
en el SQL Editor antes de abrir la app a clientes de verdad. Agrega lo que la
base todavía no tiene: una bodega por cuenta, montos que no pueden ser
negativos, índices, el candado que impide que un usuario se regale el plan
pagado y la función que aplica los abonos anotados sin señal exactamente una
vez. Cada bloque explica qué problema tapa.

---

## Lo que falta antes de cobrar

- **Correo propio en Supabase.** Sin SMTP configurado, el correo de "olvidé mi
  contraseña" no le llega a un cliente real y pierde su cuaderno.
- **El guion de `supabase/`**, corrido y verificado.
- **Cobro.** La pantalla de planes llama a un endpoint de Mercado Pago que no
  existe: un sitio estático no puede crear preferencias de pago. Hace falta una
  Edge Function de Supabase para eso y para recibir el webhook.
- **Aviso de privacidad.** La app guarda nombres y celulares de los clientes de
  la bodega, que son datos personales de terceros (Ley 29733).

El detalle largo, con el porqué de cada uno, está en `TECH_LEAD_PROPOSALS.md`.
