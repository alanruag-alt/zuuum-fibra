# Buenos días · lo que hice mientras dormías

**28 de julio de 2026**

Todo lo que se podía hacer sin tus contraseñas quedó hecho, probado y en su lugar.
Lo que falta son tres pegados en Supabase — unos 15 minutos.

---

## Lo que ya está listo

**Tu carpeta quedó ordenada.** El proyecto vive en:

```
Escritorio\ZUUUM ONT WiFi\ZUUUM_Panel_Web\zuuum-fibra\
├── src\  public\  package.json      el panel web
├── docs\                            plan maestro, base de datos, etapa 2
├── supabase\                        todo el SQL
└── .git\                            repositorio, con el primer commit hecho
```

Habías extraído el zip de la base **en el Escritorio** en lugar de dentro del proyecto.
Esa carpeta suelta, las versiones viejas de las migraciones y unos temporales de git
quedaron todos en **`Escritorio\_to_delete\`**.

**Puedes borrar esa carpeta entera sin miedo** — yo no puedo, el puente no me deja eliminar
nada de tu disco. Son 664 KB de cosas que ya no sirven.

**El panel web, revisado en tu propio equipo.** Tipos: sin errores. Formato: le faltaba
acomodo a dos archivos con el diseño nuevo, ya quedaron. ESLint no lo pude correr por el
puente —tarda demasiado— pero eso lo corres tú en un segundo.

**Las 17 migraciones ahora son un solo archivo.** En vez de pegar diecisiete veces, pegas
`ESQUEMA_COMPLETO.sql` una vez. Lo probé: 53 tablas, 91 políticas, y si lo pegas dos veces
por accidente **se detiene solo con un aviso claro y no toca nada**.

**El padrón quedó listo para cargar**, con tres IP ya corregidas.

**El repositorio git ya está creado**, rama `main`, con el primer commit: **80 archivos**.
`node_modules`, `.next` y `.env.local` quedan fuera, como debe ser — comprobado.

---

## Lo que te toca (15 minutos)

### 1 · Apaga el registro público en Supabase

*Authentication → Providers → Email* → desactiva **Enable email signups**.

Sin esto, cualquiera con tu URL se da de alta solo. Es lo primero.

### 2 · Pega el esquema

SQL Editor → *New query* → todo `supabase\ESQUEMA_COMPLETO.sql` → **Run**.

Tarda entre 10 y 30 segundos.

### 3 · Crea tu usuario

*Authentication → Users → Add user*, copia el UUID, y corre el SQL que viene en
`supabase\COMO_APLICAR.md` (paso 3). Quedas como Propietario.

### 4 · Carga el padrón

Pega `supabase\CARGA_PADRON.sql` → **Run** (2 segundos).
Luego `supabase\CUADRE.sql`: **las ocho líneas deben decir CUADRA.**

### 5 · Conecta el panel

Copia `.env.example` como `.env.local`, pon las llaves de *Settings → API*, y:

```powershell
npm run verificar
npm run dev
```

Corre `verificar` primero: toqué dos archivos de código con el formateador, y aunque ya
revisé tipos y formato en tu equipo, ESLint no lo pude correr por el puente. Tarda un minuto.

### 6 · Sube a GitHub

GitHub Desktop → *Add local repository* → escoge `zuuum-fibra` → *Publish repository*,
**con "Keep this code private" palomeado**.

---

## Lo que quiero que sepas

**Encontré cuatro errores míos probando.** Este contenedor trae PostgreSQL 16, así que
corrí las migraciones de verdad en lugar de suponer que estaban bien:

- Una vista multiplicaba el precio por el número de cargos. Un cliente de $797 aparecía
  con **$4,782** de mensualidad. Era un producto cartesiano.
- La carga cruzaba clientes por nombre, y en Las Mercedes hay dos que se llaman igual.
- Un índice hacía que dos cargos de reconexión chocaran entre sí.
- Una columna que documenté pero nunca creé: la migración no corría.

Los cuatro están corregidos y verificados.

**El cuadre contra tu Excel sale exacto:** 1,102 clientes · 935 con precio · 167 sin precio ·
**$398,588** · 10,705 marcas de pago. Al peso.

**Y la seguridad, probada con tus datos reales cargados:**

| Quién | Qué ve |
|---|---|
| Administrador | 1,102 clientes · 10,705 cargos |
| Cobrador de Velardeña | **207 clientes, 1 zona** — no 1,102 |
| Técnico | **0 clientes · 0 cargos · 0 pagos** |

---

## Tres cosas que necesitan tu ojo

**Tres IP que no me atreví a adivinar.** Están en `supabase\CALIDAD_DE_DATOS.md`. Una dice
literalmente *"checar para cortar"*, otra trae cinco números y otra trae dos direcciones en
la misma celda. Los clientes entraron completos, solo sin IP.

**Ocuila: 12 de 12 clientes sin precio.** Ahí no es descuido — esa hoja nunca se llenó.

**Los MikroTik.** Sigue abierta la decisión de la sección 17.1 del plan maestro: no exponerlos
a Internet. No frena nada de esto, pero es la decisión más importante que queda.

---

## Si algo falla

Mándame la captura del error y de qué paso venía. No sigas al siguiente: cada uno depende
del anterior.
