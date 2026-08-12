# Pasarle el proyecto a Claude Code

Alan: esto es para ti. Son unos diez minutos, una sola vez.

Claude Code es la misma cabeza con la que has estado trabajando, pero corriendo
**dentro de tu computadora**. La diferencia práctica: compila el panel él mismo,
ve los errores en el momento, y borra archivos. Se acaban las tres molestias que
ya conoces —el zip, el ACTUALIZAR, y la carpeta `_to_delete`.

---

## 1 · Instalarlo

Abre **PowerShell** (botón de Inicio, escribe «powershell», Enter) y pega:

```powershell
npm install -g @anthropic-ai/claude-code
```

Si dice que `npm` no existe, es que falta Node.js: instálalo de
<https://nodejs.org> (la versión LTS) y vuelve a intentar.

---

## 2 · Abrirlo en el proyecto

En la misma ventana, pega estas dos líneas:

```powershell
cd "C:\Users\user\Desktop\ZUUUM ONT WiFi\ZUUUM_Panel_Web\zuuum-fibra"
claude
```

La primera vez te va a pedir entrar con tu cuenta de Anthropic. Es la misma con
la que usas esta app.

**Importante:** tiene que ser esa carpeta exacta. Ahí está el `CLAUDE.md`, que es
donde quedó escrito todo lo del proyecto —las reglas del negocio, las de
seguridad, cómo se prueba, qué falta— y Claude Code lo lee solo al abrir. No
tienes que explicarle nada de eso.

---

## 3 · Qué decirle la primera vez

Algo así, en tus palabras:

> Lee el CLAUDE.md. Corre `npm run prueba` y `npm run build` para ver que todo
> esté en verde antes de empezar. Después dime qué encuentras que valga la pena
> acomodar.

De ahí en adelante le pides igual que aquí. Cuando cambie algo, él mismo compila
y te dice si truena; ya no le tienes que dar a ACTUALIZAR.

---

## 4 · Lo primero que le conviene hacer

Está anotado en el `CLAUDE.md`, pero por si acaso, en orden de urgencia:

1. **Subir el proyecto a GitHub.** Son 36 commits que viven en un solo disco
   duro. Si se te muere ese disco, se muere el sistema completo. Pídeselo así:
   *«ayúdame a subir esto a GitHub en un repositorio privado»*. Te va a pedir
   que crees la cuenta y le des permiso; **la contraseña la escribes tú**, él no
   la toca.
2. **Limpiar Pedriceña.** Quedó la OLT `huawei ma 5800` y el ODF `ODFPEDRI1`
   sueltos, de las pruebas. Ya hay botones para las dos cosas.
3. Cuadrar julio antes de correr el corte. Velardeña no tiene captura.

---

## Cosas que no cambian

- **La base de datos es la misma.** Claude Code se conecta al mismo Supabase con
  el mismo `.env.local`. No se copia nada, no se migra nada.
- **Las reglas de seguridad son las mismas** y ya están escritas en el
  `CLAUDE.md`: nada de contraseñas de OLT ni de MikroTik en la base, nadie crea
  cuentas por ti, el MikroTik no sale a internet.
- **Esta conversación no se puede mover para allá.** Por eso quedó el
  `CLAUDE.md`: es la memoria del proyecto, para que la sesión nueva no empiece
  de cero.

---

## Si algo sale mal

Copia lo que diga la ventana negra y mándamelo. Aquí seguimos.
