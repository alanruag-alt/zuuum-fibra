# Variables de entorno

Todas van en `.env.local`, que **nunca** se sube al repositorio.

En Vercel se cargan en *Settings → Environment Variables*, no en un archivo.

---

## Obligatorias

| Variable | ¿Secreta? | De dónde sale | Para qué |
|---|:-:|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase → Settings → API → Project URL | A qué proyecto se conecta |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase → Settings → API → anon public | Llave pública del navegador |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sí** | Supabase → Settings → API → service_role | Tareas del servidor que se saltan RLS |

### Por qué dos llaves

La **anon** viaja al navegador de todos modos: cualquiera que abra las herramientas de
desarrollo la puede ver. No pasa nada, porque no da acceso a nada por sí sola — lo que decide
qué puede leer cada quien son las políticas RLS de la base.

La **service_role** es otra cosa: **se salta todas las políticas**. Con ella se puede leer y
escribir cualquier renglón de cualquier tabla. Por eso:

- Nunca lleva el prefijo `NEXT_PUBLIC_`.
- Nunca se usa en un componente de navegador.
- Si se filtra, se rota de inmediato desde el panel de Supabase.

---

## Opcionales

| Variable | Por omisión | Para qué |
|---|---|---|
| `NEXT_PUBLIC_URL_SITIO` | `http://localhost:3000` | Armar ligas absolutas en correos |
| `NEXT_PUBLIC_NOMBRE_APP` | `ZUUUM FIBRA` | Nombre que se muestra |

---

## Todavía no se usan

| Variable | Cuándo entra |
|---|---|
| `AGENTE_CLAVE_COMPARTIDA` | Etapa 12, cuando exista el agente local |

**Lo que nunca va a estar en este proyecto**, ni siquiera como variable: contraseñas de las
OLT, de los MikroTik, ni el token de UISP. Todo eso vive únicamente en el agente local, dentro
de la red de ZUUUM, y jamás sale de ahí.

---

## Revisar que estén bien

```bash
npm run dev
```

Si falta alguna obligatoria, el inicio de sesión falla al conectarse. La compilación sí pasa:
Next.js no exige que las variables existan para compilar.
