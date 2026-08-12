# ZUUUM FIBRA · lo que hay que saber antes de tocar nada

Este archivo lo lee Claude Code solo, al abrir el proyecto. No es documentación
para lucirse: es lo que costó caro aprender, para no volver a pagarlo.

---

## De quién es esto

**ZUUUM FIBRA**, ISP en **Cuencamé, Durango**. Mixto FTTH + WISP.
**1,102 clientes** en **12 localidades**. El dueño es **Alan Ramos**, y es quien
usa el sistema todos los días.

Alan no es programador. Captura, cobra, y sube a los postes. Cuando algo no
funciona lo describe por lo que ve en la pantalla, no por el error técnico. Eso
no es un problema a resolver: es el usuario real, y el sistema tiene que servirle
a él.

---

## Reglas duras · esto no se negocia

Son de Alan, textuales:

> **Nunca entregues a la IA:** Contraseñas. Llaves privadas. Token completo de
> Supabase. Contraseñas de MikroTik u OLT. Datos bancarios. Acceso root de
> servidores. Las claves se colocan como variables de entorno.

De ahí salen tres reglas que ya están metidas en el código y **no se rompen**:

1. **Las credenciales de equipos NUNCA van a la base.** Ni de la OLT, ni del
   MikroTik, ni de UISP. La base sabe que el equipo existe y en qué IP vive; el
   usuario y la contraseña los lee un agente local de sus propias variables de
   entorno. Si algún día se necesita guardar cuál, se guarda **el nombre de la
   variable**, nunca el valor.
2. **No se crean cuentas de usuario ni se manejan contraseñas.** Alan crea su
   propio usuario en Supabase Auth. Si hace falta invitar a alguien, se usa el
   flujo de Supabase, nunca se escribe una contraseña en ningún lado.
3. **El MikroTik no se expone a IP pública.** Nunca.

---

## Reglas del negocio

Están metidas en la base, no en la pantalla. Si algo las contradice, la base gana.

| | |
|---|---|
| Pago | días 1 al 5 |
| Gracia | días 6 al 10 |
| Corte | día 11 |
| Reconexión | $30 |
| Equipo no devuelto | $550 |
| Cobro | por adelantado |
| Formas de pago | efectivo y transferencia |
| Cancelar un pago | **solo el administrador** |

---

## Cómo está armado

- **Next.js 15.1.6** App Router · **React 19** · **TypeScript estricto** · Tailwind
- **Supabase**: PostgreSQL 16, Auth, RLS, PostgREST, Storage
- Proyecto de Supabase: `fpldehpjnjpqbqdufppt`, región `us-east-1`

### El principio que ordena todo

> **Las validaciones van en la base, no en la pantalla.**

Una revisión en la pantalla se brinca desde cualquier otra puerta: una
importación, una consulta a mano, un botón que alguien agregue mañana. Todo lo
que de verdad importa —que un hilo vaya a un solo lado, que dos equipos no se
encimen en el rack, que no se borre algo que trae clientes— está como
restricción, disparador o función de PostgreSQL.

La pantalla no vuelve a redactar los mensajes de la base: **los enseña tal cual**.
La base ya sabe qué estorba y dónde está; volver a escribirlo arriba solo sirve
para decir menos.

### Convenciones

- **Todo en español.** Nombres de funciones, variables, columnas nuevas,
  comentarios, mensajes. `guardar_cable`, no `saveCable`. Es el idioma en que
  Alan lee los errores.
- **Los comentarios explican el porqué, no el qué.** El código ya dice qué hace.
  Lo que se pierde es la razón: por qué el punto se pega a la fibra, por qué el
  rack usa una restricción de exclusión y no un `if`.
- **Los mensajes de error orientan.** Nunca «no se puede borrar»: siempre
  *qué* estorba, con nombre, y *dónde* está el botón para arreglarlo. Esto se
  aprendió a golpes (migraciones 042, 043 y 044 son exactamente eso).
- Funciones privilegiadas: `security definer` + `set search_path = ''`.
- Vistas: `with (security_invoker = true)`.
- Toda tabla lleva RLS con `auth_org_id()` y `auth_has(permiso)`.

---

## Cómo se prueba

La suite son **393 aserciones en 20 archivos**, escritas como bloques `do $$`
que imprimen `PASA ·` o `FALLA ·`. No hay framework: es psql y `raise notice`.

(`prueba_con_padron_real.sql` es el archivo 21 y **no** va en la suite: se corre
a mano contra una copia del padrón de verdad, no contra datos inventados.)

```bash
# Levantar una base local desde cero y correr todo
createdb zrk
psql -d zrk -f supabase/pruebas/00_simular_supabase.sql
psql -d zrk -f supabase/ESQUEMA_COMPLETO.sql
for f in supabase/migraciones/0{19,2*,3*,4*}_*.sql; do psql -q -v ON_ERROR_STOP=1 -d zrk -f "$f"; done
for f in supabase/pruebas/prueba_*.sql; do psql -q -d zrk -f "$f"; done
```

**Las pruebas se corren SIEMPRE sobre una base recién creada.** No son
idempotentes: dejan datos, y correrlas dos veces sobre la misma base da falsos
negativos (código duplicado, cables repetidos). Si aparecen fallas raras de
`unique constraint`, es eso.

Antes de entregar:

```bash
npm run prueba     # tipos + lint + formato
npm run build
```

---

## Cómo se instala una migración en producción

Las migraciones van numeradas y **nunca se editan una vez instaladas**: se
escribe la siguiente. Van de la `001` a la `044`.

Para aplicarlas: SQL Editor de Supabase, pegar el archivo completo, Run. Todas
están escritas para poder correrse dos veces sin romper nada (`create or
replace`, `if not exists`, `drop ... if exists`).

**Verificar SIEMPRE contra la base después de instalar**, no confiar en que el
editor dijo «Success». Una vez se instaló dos veces la migración equivocada y
solo se detectó porque se consultó qué funciones existían de verdad.

---

## Trampas que ya costaron caro

Están aquí para no volver a pisarlas.

**PostgreSQL / plpgsql**

- `create or replace view` **no** deja reordenar ni renombrar columnas, solo
  agregar al final. Si hay que meter una columna, va al final.
- Cambiar el tipo de retorno de una función pide `drop function` primero.
- En `raise`, el marcador es `%` a secas. `%s` imprime el valor y luego una `s`
  suelta. Ya pasó dos veces y se lee mil veces al capturar.
- Los parámetros `OUT` de una función `returns table` **no** pueden llamarse
  igual que una columna de las tablas que se consultan: sale «column reference
  is ambiguous». Calificar todo.
- Dos ciclos `for r in` anidados no pueden compartir la variable de renglón: el
  de adentro le pisa el valor al de afuera y se recorre cualquier cosa.
- `select ... into` sobre un `record` sin renglones lo deja en nulos, no sin
  asignar. Sobre un `record` que nunca se tocó, sí truena.

**Next.js**

- Un archivo con `import 'server-only'` no puede ser importado por un componente
  de cliente. Los tipos y las constantes compartidas van en su propio archivo
  (`*_tipos.ts`), sin `server-only`.
- Después de una acción de servidor hay que llamar `router.refresh()`, si no la
  pantalla se queda con lo de antes y parece que no se guardó.

**El error que se repitió cuatro veces**

> Si el sistema toma algo en cuenta para decidir, **ese algo tiene que verse en
> la pantalla**, y si un mensaje dice «haz esto», **ese botón tiene que existir**.

Pasó con: un equipo amarrado a un sitio sin rack (invisible), un ODF sin sitio
(invisible), un puerto que no se podía desconectar desde ningún lado, y un
mensaje que mandaba a un botón «ya no se usa» que nunca se había programado.
Las migraciones **042, 043 y 044** son el arreglo. Vale la pena leerlas antes de
agregar pantallas nuevas.

---

## Dónde está cada cosa

```
supabase/
  ESQUEMA_COMPLETO.sql     el esquema base (001-018 ya fundidos)
  migraciones/019..044     una por cambio, en orden, nunca se editan
  pruebas/                 20 archivos de suite · 393 aserciones
src/
  app/(panel)/             las pantallas
  modulos/                 consultas (server-only) y acciones (use server)
  componentes/ui/          Boton, Tarjeta, Insignia, Borrar, Fotos…
  lib/                     formato, permisos, supabase, xlsx
```

Los módulos siguen siempre el mismo patrón: `consultas.ts` lee (con
`server-only`), `acciones.ts` escribe (con `'use server'`), `tipos.ts` comparte
sin ninguno de los dos.

---

## Qué está hecho

Cobranza y corte de caja · administración y roles · trabajo de campo ·
almacén y series · contratos · **red FTTH completa**: sitio → rack → OLT →
tarjeta → PON → ODF → cable → hilo → caja de empalme → splitter → NAP → cliente.
Mapa con trazado de rutas sobre postes. Diagrama del interior de la caja con
empalme arrastrando hilos. Excel de fusiones por caja. Trazabilidad e impacto
de corte.

## Qué falta

- **Subir el repositorio a GitHub.** Son 36 commits que viven en un solo disco
  duro. Es lo más urgente y no es código.
- `SUPABASE_SERVICE_ROLE_KEY` está vacía en `.env.local`. Solo bloquea invitar
  usuarios. **La pone Alan**, no se pide ni se guarda en ningún otro lado.
- **No correr el corte del día 11 hasta cuadrar julio.** Velardeña tiene cero
  captura de julio; si se corre el corte, se le corta a gente que sí pagó.
- **167 servicios sin precio.** Los tiene que poner Alan; no se inventan.
- El agente local que lee las OLT y los MikroTik: no existe todavía.

---

## Cómo trabaja Alan

Pide en mayúsculas y describe lo que ve. Cuando dice «no me aparece», casi
siempre es una de dos: el panel sigue corriendo la compilación anterior, o algo
existe en la base pero ninguna pantalla lo enseña. **Revisar la segunda antes de
dar por buena la primera.**

Entrega esperada: el cambio, sus pruebas, la suite completa en verde, y decirle
en una línea qué tiene que hacer él. Sin pedirle que revise código.
