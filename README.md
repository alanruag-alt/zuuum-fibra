# ZUUUM FIBRA · Panel administrativo

Panel web de administración para **ZUUUM FIBRA**, ISP mixto FTTH + WISP en
Cuencamé, Durango. 1,102 clientes en 12 localidades.

> **Si vas a trabajar en el código, lee primero [`CLAUDE.md`](CLAUDE.md).** Ahí
> están las reglas del negocio, las de seguridad, las convenciones y las trampas
> que ya costaron caro.
>
> **Si vas a empezar con Claude Code**, sigue
> [`EMPEZAR_CON_CLAUDE_CODE.md`](EMPEZAR_CON_CLAUDE_CODE.md).

---

## Qué hace

| Módulo | Qué resuelve |
|---|---|
| Cobranza y corte de caja | Pago días 1–5, gracia 6–10, corte día 11. Efectivo y transferencia. |
| Administración | Roles, permisos, zonas, ajustes, auditoría. |
| Trabajo de campo | Órdenes, agenda, instalaciones. |
| Almacén | Artículos, series, entradas y salidas. |
| Contratos | Alta, folio, cancelación. |
| **Red FTTH** | Del sitio al cliente: rack, OLT, tarjeta, PON, ODF, cable, hilo, caja de empalme, splitter, NAP. |
| Mapa | Trazado de rutas sobre postes, cajas sobre la fibra, diagnóstico de corte. |
| Caja por dentro | Empalmar arrastrando hilos, con los colores de la norma. Excel de fusiones. |
| Trazabilidad | Ruta completa de un servicio, e impacto de un corte. |

---

## Qué necesitas

| | |
|---|---|
| Node.js | 20 o más nuevo |
| npm | 10 o más nuevo |
| Supabase | proyecto `fpldehpjnjpqbqdufppt` |
| PostgreSQL 16 | solo si vas a correr las pruebas en local |

---

## Instalación

```bash
npm install
cp .env.example .env.local     # y pon los valores de tu proyecto de Supabase
npm run dev                    # http://localhost:3000
```

Las claves van **únicamente** en `.env.local`, que no se sube al repositorio.
Ver [`VARIABLES_DE_ENTORNO.md`](VARIABLES_DE_ENTORNO.md).

---

## Comandos

```bash
npm run dev        # desarrollo
npm run prueba     # tipos + lint + formato
npm run build      # compilar para producción
npm start          # servir lo compilado
```

Para Alan hay dos atajos en el escritorio: **ACTUALIZAR ZUUUM FIBRA** compila, y
**ABRIR ZUUUM FIBRA** levanta el panel.

---

## La base de datos

```
supabase/
  ESQUEMA_COMPLETO.sql     el esquema base
  migraciones/019..044     una por cambio, en orden, nunca se editan
  pruebas/                 20 archivos de suite · 393 aserciones
  COMO_APLICAR.md          cómo montarla en Supabase
```

Las migraciones se pegan completas en el SQL Editor de Supabase. Todas se pueden
correr dos veces sin romper nada.

Para correr las pruebas hace falta una base **recién creada** cada vez: no son
idempotentes. Los pasos exactos están en `CLAUDE.md`.

---

## Documentos

- [`CLAUDE.md`](CLAUDE.md) — reglas, convenciones y trampas. **Empieza aquí.**
- [`EMPEZAR_CON_CLAUDE_CODE.md`](EMPEZAR_CON_CLAUDE_CODE.md) — pasar el proyecto a Claude Code
- [`VARIABLES_DE_ENTORNO.md`](VARIABLES_DE_ENTORNO.md) — qué claves hacen falta y dónde van
- `supabase/COMO_APLICAR.md` — montar la base desde cero
- `supabase/CALIDAD_DE_DATOS.md` — qué se revisó del padrón real
