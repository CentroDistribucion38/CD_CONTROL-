# CONTROL

Plataforma modular de gestión operativa. **Next.js 15 + Supabase + Vercel.**

Una sola app, un solo login, un menú principal de mosaicos. Cada área del negocio
es un **módulo** que se enciende cuando lo necesitas. El primero, ya construido y
funcionando, es **Inventario**.

```
CONTROL
├── Inventario      ✅ construido
├── Recibo          ▫ declarado, por construir
├── Almacenamiento  ▫
├── Picking         ▫
├── Despacho        ▫
├── Compras         ▫
├── Mantenimiento   ▫
└── Usuarios        ▫
```

---

## Cómo se agrega un módulo

Cuatro pasos. Sin tocar el núcleo, sin romper lo que ya funciona.

**1. Declararlo** en `src/modulos/registro.ts`:

```ts
{
  id: "recibo",
  nombre: "Recibo",
  descripcion: "Recepción contra orden de compra, inspección y novedades.",
  sigla: "RC",
  color: "bg-sky-600",
  ruta: "/recibo",
  activo: true,                    // ← esto lo enciende
  roles: ["admin", "supervisor"],  // opcional; vacío = todos
  secciones: [
    { nombre: "Resumen",     ruta: "/recibo" },
    { nombre: "Órdenes",     ruta: "/recibo/ordenes" },
  ],
}
```

Ese archivo es la única fuente de verdad: el mosaico del menú principal y el
submenú lateral se dibujan solos a partir de él.

**2. Las rutas** → `src/app/(app)/recibo/page.tsx` y las que declaraste en `secciones`.

**3. La lógica** → `src/modulos/recibo/acciones.ts` (server actions).

**4. El SQL** → `supabase/modulos/recibo.sql`, y lo corres en el SQL Editor.

Los módulos comparten `perfiles`, roles y los helpers `mi_rol()` / `es_editor()`
del núcleo, así que los permisos son consistentes en toda la plataforma sin
reescribirlos cada vez.

---

## Estructura

```
src/
  modulos/
    registro.ts              ← el mapa de la plataforma
    inventario/acciones.ts
  app/
    (app)/
      layout.tsx             ← sesión + menú lateral
      inicio/                ← menú principal (mosaicos)
      inventario/            ← módulo 1
    login/
    auth/callback/
  components/
  lib/
supabase/
  00-nucleo.sql              ← perfiles, roles, helpers. Una vez por proyecto.
  modulos/
    inventario.sql
    inventario-seed.sql      ← datos de ejemplo, opcional
```

---

## Puesta en marcha

### 1. Subir el código

```bash
cd control
git init
git add .
git commit -m "CONTROL — núcleo + módulo inventario"
git branch -M main
git remote add origin https://github.com/CD38/control.git
git push -u origin main
```

### 2. Base de datos

Supabase → **SQL Editor** → New query → ejecutar **en este orden**:

1. `supabase/00-nucleo.sql`
2. `supabase/modulos/inventario.sql`
3. `supabase/modulos/inventario-seed.sql` *(opcional, datos de ejemplo)*

### 3. Vercel

Import del repo `CD38/control`. Antes de Deploy, en **Environment Variables**:

| Name | Valor (Supabase → Settings → API) |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |

Solo esas dos. Deploy.

### 4. Auth

Supabase → **Authentication → URL Configuration**:

- Site URL: `https://<tu-proyecto>.vercel.app`
- Redirect URLs: `https://<tu-proyecto>.vercel.app/auth/callback` y `http://localhost:3000/auth/callback`

Entra y **regístrate**. El primer usuario queda `admin` automáticamente.

### 5. Local

```bash
cp .env.example .env.local   # pega las dos llaves
npm install
npm run dev
```

---

## Módulo Inventario

| Pantalla | Para qué |
|---|---|
| Resumen | Valor del inventario, referencias bajo mínimo, últimos movimientos |
| Productos | SKU, código de barras, unidad, costo, stock mínimo |
| Bodegas | Ubicaciones de almacenamiento |
| Movimientos | Kardex: entrada / salida / ajuste (con signo) / traslado |
| Conteos físicos | Toma física con ajuste automático |

**Flujo del conteo:** abrir → congela el saldo teórico de la bodega → capturar
cantidades → cerrar → genera un movimiento de `ajuste` por cada diferencia,
trazado al conteo. El kardex nunca se edita ni se borra: toda corrección es un
movimiento nuevo.

**Datos:** `bodegas`, `productos`, `existencias` (la mantiene un trigger),
`movimientos`, `conteos`, `conteo_lineas`.
Vistas: `v_existencias`, `v_conteo_diferencias`.
Funciones: `iniciar_conteo(uuid)`, `cerrar_conteo(uuid)`.

---

## Roles

| | admin | supervisor | operador |
|---|---|---|---|
| Ver todo | ✅ | ✅ | ✅ |
| Registrar movimientos y contar | ✅ | ✅ | ✅ |
| Crear productos, bodegas, conteos | ✅ | ✅ | — |
| Cambiar roles de otros | ✅ | — | — |

El primer usuario registrado queda `admin`. Para promover a alguien:
Supabase → Table Editor → `perfiles` → cambiar `rol`.

`existencias` no se escribe nunca desde el cliente — solo la toca el trigger.

---

## Personalizar

- **Colores y estilo:** `src/app/globals.css` (tokens `--color-tinta-*`, `--color-acento-*`)
- **Nombre y logo:** `src/app/layout.tsx`, `src/components/Navegacion.tsx`, `src/app/login/page.tsx`
- **Módulos:** `src/modulos/registro.ts`

## Reutilizar por cliente

En GitHub: repo → Settings → **Template repository**.
Cada cliente nuevo: *Use this template* → proyecto Supabase nuevo → correr el
núcleo + los módulos que ese cliente necesite → import en Vercel con las dos
variables. El plan Free de Supabase permite 2 proyectos activos por organización
y pausa los proyectos tras 1 semana sin uso.
