# ETAPA 2 · Cuentas, dominio y repositorio

**Lo que te toca a ti.** Yo no puedo —ni debo— crear tus cuentas ni tener tus contraseñas.
Esta es la lista, en orden, con lo que hay que anotar de cada una.

> **Regla que no se rompe:** nunca me pases contraseñas, llaves privadas, el token completo de
> Supabase, accesos de MikroTik o de las OLT, ni datos bancarios. Todo eso va en variables de
> entorno que tú configuras. Si alguna vez te pido algo así, no me lo des.

---

## Antes de empezar: el correo

Todo se da de alta con **`alan@panelzuuumfibra.com`**.

Si ese buzón todavía no existe, hay que crearlo primero — el dominio ya es tuyo en GoDaddy, así
que es cuestión de activar el correo (Google Workspace, Zoho, o el que incluya GoDaddy).

**Por qué importa:** si las cuentas quedan a nombre de un Gmail personal, el día que esa
persona ya no esté, el proyecto se queda sin acceso. Con correo del dominio, el control es de
la empresa.

---

## 1. GitHub

| | |
|---|---|
| Dónde | github.com |
| Correo | `alan@panelzuuumfibra.com` |
| Plan | Free alcanza |

**Qué hacer:**

1. Crear la cuenta (u organización, si prefieres separar lo de la empresa de lo personal).
2. Crear el repositorio **`zuuum-fibra`**, marcado como **privado**.
3. Activar la **verificación en dos pasos**. GitHub la exige y además es lo correcto.
4. Invitarme no hace falta: yo trabajo con los archivos y tú los subes, o me das acceso cuando
   decidas.

**Anotar:** el nombre exacto del usuario u organización.

---

## 2. Supabase

| | |
|---|---|
| Dónde | supabase.com |
| Entrar con | la cuenta de GitHub recién creada |
| Plan | Free para empezar; Pro (~$25 USD/mes) cuando crezca |

**Qué hacer:**

1. Crear el proyecto **`zuuum-fibra`**.
2. **Región: `us-east-1` o la más cercana a México.** Esto importa: mientras más lejos el
   servidor, más lento se siente el sistema en Cuencamé.
3. Guardar en un lugar seguro la contraseña de la base de datos que te muestra al crearlo.
   **Te la enseña una sola vez.**
4. Anotar de *Settings → API*:
   - La **URL del proyecto** (algo como `https://xxxxx.supabase.co`) — esta sí me la puedes
     pasar, no es secreta.
   - La llave **anon/public** — también se puede compartir, va en el navegador.
   - La llave **service_role** — **esta NO me la pases nunca.** Solo va en el servidor.

---

## 3. Cloudflare y el dominio

| | |
|---|---|
| Dónde | cloudflare.com |
| Plan | Free |

**Qué hacer:**

1. Crear la cuenta con el correo del dominio.
2. Agregar el sitio **`panelzuuumfibra.com`**.
3. Cloudflare te va a dar **dos nameservers** (algo como `xxx.ns.cloudflare.com`).
4. Entrar a **GoDaddy** → tu dominio → *Nameservers* → cambiar a los de Cloudflare.
5. Esperar. Puede tardar de unos minutos a unas horas.

**GoDaddy sigue siendo el dueño del registro** — ahí lo renuevas cada año. Cloudflare solo se
encarga del DNS, el certificado y la protección.

**Subdominios a crear después** (cuando ya haya algo que apuntar):

| Subdominio | Para |
|---|---|
| `sistema.panelzuuumfibra.com` | panel administrativo |
| `clientes.panelzuuumfibra.com` | portal de clientes |
| `api.panelzuuumfibra.com` | reservado |

---

## 4. Vercel

| | |
|---|---|
| Dónde | vercel.com |
| Entrar con | la cuenta de GitHub |
| Plan | Hobby (gratis) para empezar |

**Qué hacer:**

1. Crear la cuenta entrando con GitHub.
2. **No conectar el repositorio todavía** — primero tiene que existir el proyecto Next.js.
   Eso es la etapa siguiente.

---

## 5. El servidor Ubuntu

Este hace **dos trabajos**: hospeda el **agente local** que habla con las OLT y los MikroTik,
y hospeda **UISP** para monitorear los 206 CPE.

**Qué se necesita:**

| | Mínimo | Recomendado |
|---|---|---|
| Procesador | 2 núcleos | 4 núcleos |
| Memoria | 4 GB | 8 GB |
| Disco | 60 GB SSD | 120 GB SSD |
| Red | cableada, en la misma red que las OLT | igual, con IP fija |
| Sistema | Ubuntu Server 22.04 o 24.04 LTS | igual |

Un mini PC de los que se consiguen entre $3,000 y $6,000 pesos sobra. Una Raspberry Pi 4 de
8 GB también sirve para arrancar, aunque con 206 CPE en UISP va más justa.

**Dónde ponerlo:** en la oficina, conectado por cable, con IP fija, y **sin nada abierto hacia
Internet**. Si se va la luz seguido, vale la pena un no-break.

---

## 6. Google Play Console *(no todavía)*

Se da de alta cuando la app esté lista para instalarse en los SUNMI. Son ~$25 USD una sola vez.
Mientras tanto la app se puede instalar directamente en los teléfonos para probar.

---

## Resumen: qué me puedes pasar y qué no

| Dato | ¿Me lo puedes pasar? |
|---|---|
| Nombre del usuario u organización de GitHub | ✅ Sí |
| URL del proyecto de Supabase | ✅ Sí |
| Llave **anon / public** de Supabase | ✅ Sí — va en el navegador de todos modos |
| Nombre del proyecto en Vercel | ✅ Sí |
| IP del servidor Ubuntu **dentro de tu red** | ✅ Sí |
| Contraseña de la base de datos | ❌ **Nunca** |
| Llave **service_role** de Supabase | ❌ **Nunca** |
| Contraseñas de MikroTik o de las OLT | ❌ **Nunca** |
| Token de UISP | ❌ **Nunca** — va solo en el agente local |
| Cualquier dato bancario | ❌ **Nunca** |

Todo lo de la columna roja va en un archivo de variables de entorno **en tu equipo**, que nunca
se sube al repositorio. Yo te preparo el `.env.example` con los nombres de las variables, vacías.

---

## Cuando termines

Avísame con esto y sigo:

```
GitHub:    usuario/organización = ______________
           repositorio zuuum-fibra creado y privado  [ ]
Supabase:  URL = https://______________.supabase.co
           región = ______________
Cloudflare: dominio agregado                        [ ]
           nameservers cambiados en GoDaddy         [ ]
Vercel:    cuenta creada                            [ ]
Servidor:  conseguido [ ]   instalado [ ]   IP = ______________
```

**No hace falta que termines todo esto para que yo siga trabajando.** El diseño de la base de
datos —la etapa 3— no depende de las cuentas. Va en paralelo.
