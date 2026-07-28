# Cómo montar la base en Supabase

Proyecto: `fpldehpjnjpqbqdufppt` · región `us-east-1`

Todo está probado contra PostgreSQL 16. Son **tres pegados** en el SQL Editor.

---

## Antes de nada: apaga el registro público

*Authentication → Providers → Email* → desactiva **Enable email signups** y las
confirmaciones por correo.

Este es un sistema interno: **las cuentas las crea el administrador**, nadie se registra
solo. Si esto se queda prendido, cualquiera con tu URL se puede dar de alta.

---

## Paso 1 · El esquema

SQL Editor → *New query*.

**Ojo:** hay que pegar el **contenido** del archivo, no su nombre. Ábrelo con el Bloc de
notas, `Ctrl+A` para seleccionar todo, `Ctrl+C`, y `Ctrl+V` en el editor de Supabase.

Pega **todo** `ESQUEMA_COMPLETO.sql` → **Run**.

Tarda entre 10 y 30 segundos. Debe decir *Success. No rows returned.*

Deja: **53 tablas · 95 políticas de seguridad · 131 índices · 43 permisos · 7 roles ·
tus 12 zonas · 14 ajustes.**

Si lo pegas dos veces por accidente, se detiene solo con un aviso claro y **no toca nada**.

---

## Paso 2 · Comprobar que quedó bien

Pega esto en otra consulta:

```sql
select 'tablas' as que, count(*) from pg_tables where schemaname='public'
union all select 'politicas', count(*) from pg_policies where schemaname='public'
union all select 'permisos',  count(*) from public.permissions
union all select 'roles',     count(*) from public.roles
union all select 'zonas',     count(*) from public.zones
union all select 'ajustes',   count(*) from public.settings;
```

Esperado: **53 · 95 · 43 · 7 · 12 · 14**

Y esta, que es la importante — **no debe devolver ni un renglón**:

```sql
select tablename from pg_tables t
 where schemaname='public'
   and not exists (select 1 from pg_class c
                     join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public' and c.relname=t.tablename
                      and c.relrowsecurity);
```

Si sale alguna tabla, esa quedó sin protección. Mándamela.

> Esta consulta ya sirvió de algo: la primera vez destapó que las cuatro particiones del
> historial de señal quedaban abiertas. Está corregido en la migración 018.

---

## Paso 3 · Tu usuario

Las migraciones **no crean usuarios**. Eso lo haces tú, para que la primera contraseña
del sistema no haya pasado por ningún lado.

1. *Authentication → Users → **Add user*** → tu correo y una contraseña
2. Pega `CREAR_PROPIETARIO.sql` en el SQL Editor
3. Cambia **solo las dos líneas marcadas con ←** (tu correo y tu nombre) → **Run**

**No hay que copiar el UUID.** El script lo busca solo por el correo. Un UUID tiene 36
caracteres en cinco grupos —`8-4-4-4-12`— y basta perder uno al copiar para que reviente
con un error que no dice qué pasó.

Si el correo no existe todavía, el script te dice cuáles sí están dados de alta.

Al terminar debe salir una tabla con tu nombre, el rol **Propietario**, alcance `all`
y **43 permisos**.

## Paso 4 · El padrón

Van **dos archivos, en este orden**:

1. Pega todo `CARGA_1_DATOS.sql` → **Run**. Deja los 1,102 renglones en una tabla de paso
   y te muestra el conteo. Todavía no toca nada del sistema.
2. Pega todo `CARGA_2_PROCESAR.sql` → **Run**. Arma clientes, servicios, periodos y cobranza,
   y borra la tabla de paso al terminar. Tarda unos 2 segundos.

Luego pega `CUADRE.sql`. **Las ocho líneas deben decir CUADRA:**

| | |
|---|---|
| Clientes | 1,102 |
| Servicios | 1,102 |
| Con precio | 935 |
| Sin precio | 167 |
| Ingreso mensual | $398,588 |
| Marcas de pago | 10,705 |
| Clientes con 2 servicios | 0 |
| IP capturadas | 891 |

Si alguna dice *REVISAR*, párale y mándame la captura.

Para ver el detalle por zona y mes: `CUADRE_DETALLE.sql`.

---

## Conectar el panel web

En `zuuum-fibra`, copia `.env.example` como `.env.local` y llena:

```
NEXT_PUBLIC_SUPABASE_URL=https://fpldehpjnjpqbqdufppt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=  ← Settings → API → anon public
SUPABASE_SERVICE_ROLE_KEY=      ← Settings → API → service_role
```

Luego `npm run dev`. El modo demostración se apaga solo y ya te pide contraseña de verdad.

---

## Los archivos

| Archivo | Para qué |
|---|---|
| `ESQUEMA_COMPLETO.sql` | Todo el esquema, un solo pegado |
| `CREAR_PROPIETARIO.sql` | Tu usuario, sin copiar UUID |
| `CARGA_1_DATOS.sql` | Los datos del Excel a una tabla de paso |
| `CARGA_2_PROCESAR.sql` | Los convierte en clientes y cobranza |
| `CUADRE.sql` | Comprobar que cuadró |
| `CUADRE_DETALLE.sql` | Ver por zona y por mes |
| `CALIDAD_DE_DATOS.md` | Lo que hay que arreglar del Excel |
| `REINICIAR_BASE.sql` | ⚠ Borra todo. Solo si algo sale mal |
| `migraciones/` | Las 17 por separado, por si hace falta ver una |
| `pruebas/` | Las pruebas de seguridad |
