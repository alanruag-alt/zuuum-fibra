# ZUUUM FIBRA · Panel administrativo

Panel web de administración para ZUUUM FIBRA, ISP mixto FTTH + WISP en Cuencamé, Durango.

Esta es la **estructura inicial** (etapa 3 del orden de desarrollo). Todavía **no** hay módulos
completos: hay carcasa, inicio de sesión, menú y un tablero con datos inventados.

Documentos de referencia:

- `PLAN_MAESTRO_ZUUUM_FIBRA.md` — qué se va a construir y en qué orden
- `BASE_DE_DATOS_ZUUUM.md` — diagrama y diccionario de datos
- `ETAPA_2_CUENTAS.md` — cuentas, dominio y servidor

---

## Qué necesitas

| | |
|---|---|
| Node.js | 20 o más nuevo |
| npm | 10 o más nuevo |
| Cuenta de Supabase | con el proyecto `zuuum-fibra` creado |

Para revisar qué versión traes:

```bash
node -v
npm -v
```

---

## Instalación

```bash
# 1. Instalar las dependencias
npm install

# 2. Crear tu archivo de variables a partir del ejemplo
cp .env.example .env.local

# 3. Abrir .env.local y poner los valores de tu proyecto de Supabase
#    (panel de Supabase -> Settings -> API)

# 4. Levantar el servidor de desarrollo
npm run dev
```

Queda en <http://localhost:3000>.

Sin las variables de Supabase la aplicación **compila pero no deja entrar**: el inicio de
sesión va a fallar porque no hay a quién preguntarle.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Compilación de producción |
| `npm run start` | Sirve lo compilado |
| `npm run lint` | Revisión de código con ESLint |
| `npm run lint:fix` | Igual, pero corrige lo que puede |
| `npm run tipos` | Revisa los tipos de TypeScript sin compilar |
| `npm run formato` | Formatea todo con Prettier |
| `npm run formato:revisar` | Revisa el formato sin tocar archivos |
| `npm run prueba` | tipos + lint + formato |
| `npm run verificar` | `prueba` + `build` — **esto es lo que hay que correr antes de subir** |

---

## Cómo está organizado

```
src/
├── app/                      Rutas (App Router de Next.js)
│   ├── entrar/               Inicio de sesión — pública
│   ├── (panel)/              Todo lo que pide sesión
│   │   ├── layout.tsx        Carcasa: menú lateral + barra superior
│   │   └── tablero/          Tablero principal
│   ├── auth/salir/           Cierre de sesión
│   ├── layout.tsx            Raíz
│   ├── error.tsx             Pantalla de error
│   └── not-found.tsx         Pantalla de 404
│
├── componentes/
│   ├── ui/                   Piezas reutilizables (Boton, Tarjeta, Tabla…)
│   └── layout/               Menú lateral, barra superior, carcasa
│
├── modulos/                  Un directorio por módulo del plan maestro
│   └── tablero/
│       ├── tipos.ts          Tipos del módulo
│       └── datos-simulados.ts  ← se borra al conectar la base
│
├── lib/
│   ├── supabase/             Clientes de navegador, servidor y middleware
│   ├── constantes.ts         Roles, estados, rutas públicas
│   ├── permisos.ts           Permisos del lado del navegador
│   └── formato.ts            Pesos, fechas, porcentajes, semáforo óptico
│
├── tipos/                    Tipos compartidos
└── middleware.ts             Refresca la sesión y protege las rutas
```

**La regla de la organización por módulos:** cada módulo del plan maestro (clientes, cobranza,
red, inventario, órdenes, tickets) va a tener su propio directorio en `src/modulos/` con sus
tipos, sus consultas y sus componentes propios. Lo que se comparte entre módulos sube a
`src/componentes/ui` o a `src/lib`. Así se puede trabajar un módulo sin romper los demás.

---

## Sobre el idioma del código

Rutas, carpetas, componentes y variables están **en español**. Es a propósito: el equipo que va
a mantener esto habla español, y `cobranza` se entiende mejor que `billing` cuando hay que
buscar algo con prisa. Las palabras reservadas de React y Next (`layout`, `page`, `middleware`)
se quedan como el framework las pide, porque de eso depende que funcione.

---

## Seguridad

- **Ninguna credencial vive en el código.** Todo entra por variables de entorno.
- `.env.local` está en `.gitignore` y no se sube nunca.
- La llave `SUPABASE_SERVICE_ROLE_KEY` **se salta todas las políticas de la base**. Solo va en
  el servidor y jamás con el prefijo `NEXT_PUBLIC_`.
- Los permisos que hay en `src/lib/permisos.ts` sirven para **decidir qué se dibuja**, no para
  proteger datos. La protección de verdad son las políticas RLS de PostgreSQL: si alguien
  manipula el navegador, la base sigue negándole la información.
- Las contraseñas de OLT, MikroTik y UISP **no van en este proyecto**. Viven únicamente en el
  agente local, dentro de la red de ZUUUM.

---

## Estado actual

| | |
|---|---|
| ✅ | Proyecto Next.js con TypeScript |
| ✅ | Tailwind CSS con los colores de la marca |
| ✅ | ESLint y Prettier |
| ✅ | Organización por módulos |
| ✅ | `.env.example` sin secretos |
| ✅ | Conexión preparada para Supabase (navegador, servidor y middleware) |
| ✅ | Diseño adaptable: computadora, tableta y teléfono |
| ✅ | Menú lateral con los módulos del plan maestro |
| ✅ | Pantalla de inicio de sesión |
| ✅ | Tablero con datos simulados |
| ⬜ | Perfiles, roles y permisos leídos de la base — **etapa 4** |
| ⬜ | Módulos completos — **etapa 6 en adelante** |

---

## Lo que sigue

1. Crear las tablas en Supabase (ver `BASE_DE_DATOS_ZUUUM.md`).
2. Conectar el inicio de sesión a `profiles`, `user_roles` y `user_permissions`.
3. Construir el módulo de clientes e importar el padrón.

**Un módulo por vez:** planear → aprobar → programar → probar → corregir → documentar →
respaldar.
