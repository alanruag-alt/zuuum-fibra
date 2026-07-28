# PLAN MAESTRO · ZUUUM FIBRA

**Documento de alcance** · **versión 2.1 · ETAPA 1 CERRADA** · 28 de julio de 2026
Plataforma de administración para ISP mixto FTTH + WISP · Cuencamé, Durango

> ✅ **No quedan decisiones pendientes.** Las 20 preguntas del alcance están contestadas.
> Queda **una decisión de seguridad abierta** (sección 17.1, acceso a los MikroTik) que no
> frena las etapas 2 a 11.
>
> Este documento define **qué** se va a construir y en qué orden. No contiene código.

---

## 0. Punto de partida real

| Dato | Valor | De dónde salió |
|---|---:|---|
| Clientes en el padrón | **1,102** | `www PAGOS.xlsx`, 12 hojas leídas |
| Clientes con precio capturado | 935 | mismo archivo |
| Ingreso mensual facturable | **$398,588** | suma de precios |
| Ingreso no contabilizado (167 sin precio) | ~$71,000 | estimado al promedio de $426 |
| Zonas atendidas | 12 | ver sección 2 |
| Cobranza histórica | mar-2025 a jul-2026 | 10,705 marcas de pago |
| % de cobranza típico | 95–100% | por periodo |
| ONU en fibra | 158 | AdminOLT |
| OLT | 2 | VSOL V1600G0 · Huawei EA5800-X2 |
| Equipos WISP (CPE) | **206** | `CLIENTES CUENCAME.xlsx` |
| Sectoriales / APs | 13 | mismo archivo |
| Planes distintos hoy | 16 | de $100 a $2,690 · **se van a estandarizar** |

**Infraestructura confirmada:**

- **OLT #1 AdminOLT Vsol** — VSOL V1600G0, `172.28.69.18`, tarjeta 0, puertos 1–16, 130 ONU
- **OLT_HUAWEI_CUENCAME** — Huawei EA5800-X2, `172.28.69.253`, tarjeta 1, puertos 0–15, 28 ONU
- **AdminOLT** en la nube — **se sigue pagando por el momento**
- **CPE Ubiquiti**: 105 LiteBeam 5AC, 76 LiteBeam M5, NanoStation, Rocket y LiteAP
- **UISP (antes UNMS)** — plataforma de monitoreo del lado inalámbrico, se lee por su API
- **MikroTik** — se registran en el módulo de red conforme se vayan dando de alta
- **Dominio**: `panelzuuumfibra.com`, propiedad de Alan Ramos, registrado en **GoDaddy**
- **Correo del proyecto**: `alan@panelzuuumfibra.com`
- **Dispositivo de campo**: **SUNMI L2s PRO**, uno por técnico

---

## 1. Objetivo del sistema

Sustituir doce hojas de Excel, dos programas sueltos y el conocimiento que hoy vive en la
cabeza de dos o tres personas, por **una sola plataforma** donde:

1. Cada cliente tenga **un expediente único**: contrato, plan, ubicación, equipo instalado,
   punto de la red del que cuelga, historial de pagos, tickets e instalaciones.
2. La **red esté dibujada y sea consultable**: de la OLT al puerto PON, al splitter, a la NAP,
   al cliente. Y del lado inalámbrico: de la torre al sectorial, al CPE, al cliente.
3. El **técnico trabaje desde su SUNMI**, incluso sin señal, y lo que capture llegue solo
   cuando vuelva la conexión.
4. La **cobranza se cruce con la red**: poder contestar *"¿este que no paga sigue navegando?"*,
   que hoy es imposible.
5. Cada **cobrador vea su zona** y pueda cerrar su corte de caja.
6. Todo quede **auditado**: quién hizo qué, cuándo y desde dónde.

**Capacidad objetivo:** 1,500 clientes en el primer año, más de 5,000 sin rediseñar.

**Lo que el sistema NO hará en su primera versión:** facturación fiscal (CFDI), cobro con
tarjeta en línea, corte automático en el MikroTik ni mensajería por WhatsApp.

---

## 2. Zonas y cobradores *(nuevo en v2.0)*

Las 12 localidades **no son etiquetas: son zonas de cobranza**, y cada una tiene cobrador
asignado. Esto cambia el diseño de la base de datos y de los permisos.

| Zona | Clientes | Ingreso del mes |
|---|---:|---:|
| Cuencamé | 286 | $98,835 |
| Velardeña | 207 | $81,471 |
| Pasaje | 155 | $58,747 |
| Pedriceña | 110 | $37,328 |
| Cuatillos | 100 | $39,788 |
| La Fe | 77 | $27,800 |
| La Cuchilla | 42 | $13,748 |
| Vista Hermosa | 38 | $12,863 |
| El Tanque | 35 | $13,380 |
| 20 Amigos | 20 | $7,438 |
| Las Mercedes | 20 | $7,190 |
| Ocuila | 12 | — |

**Lo que implica:**

- Cada cliente pertenece a una zona.
- Una zona tiene uno o varios **cobradores** asignados.
- Un cobrador **solo ve los clientes de sus zonas** — se hace valer en la base de datos.
- Cada cobrador tiene su **corte de caja**: lo que cobró, en qué forma, y qué entregó.
- Los reportes se pueden ver por zona: cobranza, morosidad, altas, tickets.
- Una zona puede tener red FTTH, WISP o las dos.

**Corte de caja del cobrador:**

```
Abre turno → registra pagos en campo (funciona sin señal)
           → al volver, sincroniza
           → cierra turno: total cobrado en efectivo, en transferencia
           → entrega a oficina → oficina confirma la entrega
           → si no cuadra, queda la diferencia registrada y con nombre
```

---

## 3. Tipos de usuario y permisos

### 3.1 Cómo funcionan los permisos *(cambió en v2.0)*

El rol **no** es una caja cerrada. Funciona en dos capas:

```
ROL = plantilla de permisos          El administrador elige el rol al dar de alta
  +                                  a la persona, y de ahí puede prender o apagar
PERMISOS POR PERSONA                 permisos uno por uno.
  +
ALCANCE (zonas asignadas)            Además define qué zonas puede ver esa persona.
```

Así se resuelve el caso real: **una persona que hace dos actividades** (por ejemplo el
supervisor que también instala, o la de oficina que también cobra en una zona) no necesita dos
cuentas. Se le da el rol base y se le prenden los permisos extra.

**Regla que no se puede apagar:** aunque el administrador quisiera, no puede darle a un técnico
acceso a finanzas, costos ni utilidades. Esos permisos solo existen para Propietario y
Administrador. Se protege en la base de datos, no en la pantalla.

### 3.2 Los siete roles

| Rol | Quién es | Dónde trabaja | Alcance |
|---|---|---|---|
| **Propietario** | Dueño del ISP | Panel web | Todo |
| **Administrador** | Opera el sistema | Panel web | Todo |
| **Oficina y cobranza** | Recibe pagos, atiende clientes | Panel web | Zonas asignadas |
| **Supervisor** | Coordina técnicos | Panel + SUNMI | Zonas asignadas |
| **Técnico** | Instala, repara, mide | SUNMI | Sus órdenes |
| **Almacén** | Entrega y recibe equipo | Panel + SUNMI | Su almacén |
| **Cliente** | El suscriptor | Portal web | Lo suyo |

**Cobrador** no es un rol aparte: es el rol *Oficina y cobranza* con zonas asignadas y el
permiso de *cobro en campo* prendido.

### 3.3 Tabla de permisos base

Leyenda: **T** = todo · **L** = solo lectura · **P** = propios o de su zona · **—** = sin acceso

| Módulo | Propietario | Admin | Oficina | Supervisor | Técnico | Almacén | Cliente |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard | T | T | P | P | — | — | — |
| Clientes | T | T | P | P | L¹ | — | P |
| Prospectos | T | T | P | P | P | — | — |
| Contratos | T | T | P | L | L¹ | — | P |
| Planes de Internet | T | T | L | L | L | — | L |
| **Cobranza y pagos** | T | T | P | — | **—** | — | P |
| **Corte de caja** | T | T | P | — | — | — | — |
| **Recibos** | T | T | P | — | **—** | — | P |
| Tickets | T | T | P | P | P | — | P |
| Órdenes de trabajo | T | T | P | P | P | L | P |
| Agenda de instalaciones | T | T | P | P | P | — | — |
| Técnicos y cuadrillas | T | T | L | P | P | — | — |
| Inventario | T | T | L | L | L¹ | T | — |
| Movimientos de almacén | T | T | L | L | P | T | — |
| Red FTTH | T | T | L | P | L | — | — |
| Red WISP | T | T | L | P | L | — | — |
| OLT / puertos / ONT | T | T | L | P | L¹ | L | — |
| Equipos de red (MikroTik) | T | T | — | L | — | L | — |
| Mapas | T | T | L | P | L | — | — |
| Reportes e indicadores | T | T | P | P | — | — | — |
| **Finanzas y costos** | T | L² | — | — | — | — | — |
| Configuración | T | T | — | — | — | — | — |
| Usuarios, roles y permisos | T | T | — | — | — | — | — |
| Auditoría | T | L | — | — | — | — | — |

¹ Solo de los clientes u órdenes que tiene asignados ese día.
² El administrador ve finanzas solo si el propietario se lo habilita.

---

## 4. Reglas de negocio confirmadas

Esto es lo que va a programarse. **Todo es configurable desde el sistema** — los números son
los valores iniciales, no están escritos en el código.

### 4.1 Cobranza

| Regla | Valor | Configurable |
|---|---|:-:|
| El servicio se paga **por adelantado** | sí | — |
| Periodo de pago | del **día 1 al 5** | ✔ |
| Días de gracia | **5 días** — del 6 al 10 | ✔ |
| Corte del servicio | **día 11** | ✔ |
| Fecha de corte | **igual para todos**, no por fecha de alta | ✔ |
| Cargo por reconexión | **$30** | ✔ |
| Prorrateo del primer mes | **no aplica** (se paga adelantado) | ✔ |
| Formas de pago | **efectivo** y **transferencia bancaria** | ✔ |
| Quién cancela o corrige un pago | **solo el Administrador** | — |

**Calendario del mes, ya cerrado:**

```
 1 ─────────── 5      6 ──────────── 10        11 ──────────────►
 │ periodo de pago │  │ 5 días de gracia │     │ CORTE            │
 │ al corriente    │  │ aviso al cliente │     │ moroso           │
 └─────────────────┘  └──────────────────┘     └──────────────────┘
                                                reconexión: $30
```

### 4.2 Equipos

| Regla | Valor |
|---|---|
| Depósito en garantía al dar de alta | **no se cobra** |
| Cargo si el cliente **no devuelve** el equipo | **$550** |
| El equipo con serie queda ligado al expediente | sí |

**Cómo se modela:** el equipo se le presta al cliente sin cobrarle nada. El cargo de $550 se
genera **solo** cuando se cierra una orden de retiro con estado *no devuelto* o *perdido*. No
hay depósito en la cuenta del cliente, y por lo tanto no hay dinero que devolver a nadie —
eso simplifica bastante la contabilidad.

### 4.3 Planes

- Hoy hay **16 precios distintos** y **el precio cambia por localidad**.
- **La decisión es estandarizar** las velocidades y los precios, tanto FTTH como inalámbrico.
- **Cómo se hace la migración sin romper nada:**
  1. Se crea el catálogo nuevo, estandarizado.
  2. Cada cliente actual conserva su precio como **precio especial heredado**, marcado como tal.
  3. El sistema muestra en un reporte cuánto se dejaría de cobrar (o de más) si se pasara a
     todos al catálogo nuevo.
  4. La migración de cada cliente se hace cuando tú decidas, cliente por cliente o por zona.
- Los **167 clientes sin precio** reciben un **plan asignado automáticamente** al importar, y
  se puede corregir después. Quedan marcados como *precio por revisar* para que no se pierdan
  entre los demás.

### 4.4 Facturación

- Se emite **recibo interno con folio y PDF** para todos.
- **CFDI 4.0 queda para después**, y solo para los clientes que lo pidan. Requiere contratar
  un PAC. No entra en el MVP ni en la segunda etapa.

---

## 5. Dispositivo de campo: SUNMI L2s PRO *(nuevo en v2.0)*

Cada técnico va a traer un **SUNMI L2s PRO**. Esto no es un detalle menor: cambia cómo se
diseña la app.

**Lo que trae** (verificado contra la ficha del fabricante):

| | |
|---|---|
| Procesador | Cortex-A53 octa-core (4×2.0 GHz + 4×1.5 GHz) |
| Memoria | 4 GB RAM / 64 GB |
| Sistema | SUNMI OS sobre **Android 12** |
| Pantalla | 5.5" HD+ **1440×720** IPS |
| Escáner | motor industrial 1D/2D, hasta **3 lecturas por segundo**, lee códigos **rayados, sucios, arrugados o a un metro de distancia** |
| Cámara | trasera 13 MP con autofoco y flash |
| **GPS** | **sí** — AGPS, GPS, GLONASS, Beidou, Galileo |
| **Datos móviles** | **sí** — 2G/3G/4G, dos SIM (1 nano + 1 mini) |
| NFC | Type A y B, Mifare, Felica, ISO 14443 e ISO 15693 |
| Batería | 5000 mAh removible, carga rápida 18 W |
| Resistencia | **IP68**, caída de 1.5 m |
| WiFi | 2.4 y 5 GHz, a/b/g/n/ac |

**Lo que esto significa para el desarrollo:**

1. **El escáner es de hardware, no la cámara.** Es muchísimo más rápido y sirve con la ONU
   dentro de la caja o con la etiqueta maltratada. La app debe leer del motor del SUNMI
   (por su SDK o por *keyboard wedge*), y dejar la cámara **solo como respaldo**.
2. **Android 12 fija el piso.** Flutter con `minSdk 31`. Nada de pelear con versiones viejas.
3. **Pantalla de 720 px de ancho.** El diseño se hace para esa medida, con botones grandes:
   el técnico trae guantes y está bajo el sol.
4. **GPS de verdad, con GLONASS y Galileo.** La captura de coordenadas de la sección 7 es
   confiable, no aproximada.
5. **Tiene SIM.** El técnico sincroniza desde el campo cuando hay cobertura celular, aunque no
   haya WiFi. Aun así la app **trabaja sin señal por diseño**: en las comunidades no siempre
   hay red.
6. **IP68 y caída de 1.5 m.** Aguanta el trabajo real. Vale la pena.
7. **NFC disponible.** Idea a futuro (no MVP): etiqueta NFC pegada en cada NAP y en cada
   equipo, para que el técnico solo acerque el teléfono y el sistema sepa dónde está parado.

**Confirmado: son la versión con Google Play (GMS).** Eso deja abiertas dos puertas:

- **Notificaciones push por Firebase (FCM)** — se usan. Es el camino estándar en Android y no
  cuesta nada en el volumen de ZUUUM. Sirve para avisarle al técnico de una orden nueva o de
  una reasignación sin que tenga la app abierta.
- **Mapas de Google** — están disponibles, pero **la recomendación es seguir con
  OpenStreetMap**. Razones: el visor OSM ya está escrito y probado en los tres sistemas
  actuales, no necesita llave de API, no tiene facturación por consulta, y funciona con las
  teselas guardadas cuando no hay señal. Google Maps se puede agregar después si aparece una
  necesidad concreta que OSM no cubra — pero empezar con él sería pagar por algo que ya
  tenemos resuelto.

---

## 6. Módulos y submódulos

### 6.1 Dashboard
Indicadores en vivo · actividad reciente · mapa del día · alertas · estado de la red ·
**filtrable por zona**

### 6.2 Clientes
Padrón · expediente único · **zona** · direcciones y coordenadas · contactos · documentos ·
historial completo · estados: prospecto, activo, suspendido, moroso, baja

### 6.3 Prospectos
Registro · zona · cobertura disponible (cruce con red) · seguimiento · conversión

### 6.4 Contratos
Plantillas · generación desde el expediente · firma digital en el SUNMI · PDF · vigencias

### 6.5 Planes de Internet
Catálogo estandarizado · subida y bajada · precio · tipo de red · precios especiales heredados

### 6.6 Cobranza
Periodos · registro de pagos (efectivo y transferencia) · **cobro en campo por zona** ·
**corte de caja por cobrador** · gracia y corte · morosos · reconexión con cargo ·
**cruce con estado de red**

### 6.7 Recibos
Recibo interno con folio · PDF · envío por correo · *(CFDI: futura)*

### 6.8 Tickets
Alta desde oficina o portal · categorías · prioridad · asignación · comentarios · adjuntos ·
cierre con causa raíz · agrupación como incidente de red

### 6.9 Órdenes de trabajo
Instalación · cambio de domicilio · retiro de equipo · mantenimiento · reparación ·
asignación · estados · evidencias · materiales · firma · cierre

### 6.10 Agenda de instalaciones
Calendario por día, técnico y zona · carga de trabajo · reprogramación

### 6.11 Técnicos y cuadrillas
Ficha · **teléfono SUNMI asignado** · productividad · tiempo promedio · material consumido ·
**ubicación durante la jornada** (el técnico ve cuándo está activa)

### 6.12 Inventario
Catálogo · existencias por almacén y por técnico · mínimos y alertas ·
**descuento automático al cerrar una orden** · series individuales · **depósito de $550**

### 6.13 Lectura de código de ONU
**Escáner de hardware del SUNMI** (principal) · cámara (respaldo) · lector USB en oficina ·
reconocimiento de fabricante por serial GPON · limpieza de prefijos

### 6.14 Generación de nombre Wi-Fi y contraseña
`ZUUUM_FIBRA_XXXX` · contraseña `ZF` + 4 + 4 dígitos · formatos configurables ·
QR de conexión · etiqueta imprimible

### 6.15 ONUs y routers instalados
Serial, MAC, modelo · potencia óptica · puerto PON · VLAN · IP · estado en la OLT

### 6.16 Red FTTH
OLT → tarjeta → puerto PON → troncal → cierre → splitter → NAP → puerto → cliente ·
hilos TIA-598 · fusiones con pérdida en dB · postes y vanos · distancia OTDR con guardas ·
diagnóstico de corte

### 6.17 Red WISP
Torre → sectorial → CPE → cliente · **coordenadas de torres y sectoriales** ·
**señal en vivo desde la API de UISP** · MAC, modelo, firmware · historial de señal

### 6.18 Equipos de red *(nuevo en v2.0)*
Registro de MikroTik y demás equipos: modelo, ubicación, IP, función, credenciales guardadas
cifradas y **solo accesibles por el agente local**, configuración respaldada, fecha del último
respaldo

### 6.19 Mapas y coordenadas
Clientes, NAP, cierres, postes, torres, sectoriales · capas · cobertura · rutas · KMZ ·
plano CFE · **vista por zona**

### 6.20 Fotografías y evidencias
Por orden y por ticket · comprimidas en el SUNMI antes de subir · Supabase Storage ·
con fecha, ubicación y autor

### 6.21 Firmas digitales
Firma del cliente en la pantalla del SUNMI: cierre de instalación y recepción de equipo

### 6.22 Notificaciones
Dentro del sistema · correo · **WhatsApp por la API oficial de Meta** *(etapa futura)*

### 6.23 Reportes e indicadores
Altas y bajas · **cobranza por zona y por cobrador** · instalaciones por técnico ·
tickets por causa · ocupación de NAP y de puertos PON · señal promedio por sectorial

### 6.24 Integración con equipos *(etapa posterior)*
Agente local · UISP · MikroTik · OLT · AdminOLT

### 6.25 Auditoría
Toda operación que cambie datos: quién, cuándo, desde qué dispositivo, valor anterior y nuevo

---

## 7. Flujos

### 7.1 De prospecto a cliente activo

```
1. Llega el interesado          → PROSPECTO: nombre, contacto, zona, dirección
2. Se revisa cobertura          → busca NAP o sectorial cercano con puertos libres
                                → CON COBERTURA · REQUIERE OBRA · SIN COBERTURA
3. Se cotiza el plan            → del catálogo estandarizado
4. Se convierte en CLIENTE      → contrato, plan, zona, depósito de equipo
                                → se crea la ORDEN DE INSTALACIÓN
5. Se instala                   → ver 7.2
6. Cliente ACTIVO               → primer periodo generado, se cobra por adelantado
```

**Estados:** nuevo → contactado → cotizado → agendado → convertido · perdido *(con motivo)*

### 7.2 Instalación

```
OFICINA                    TÉCNICO (SUNMI)                    SISTEMA
───────                    ───────────────                    ───────
Crea la orden                                                 Folio OI-0001
Asigna técnico y fecha     Recibe la orden en el SUNMI        Notificación
Reserva NAP y puerto       (trabaja sin señal)

                           Llega al domicilio
                           Foto de fachada
                           Coordenadas GPS               →     GPS/GLONASS/Galileo
                           Tiende el drop
                           Instala la roseta
                           Escanea la ONU (láser)        →     Detecta marca y modelo
                                                               Genera SSID y contraseña
                           Mide potencia NAP y ONU       →     Semáforo −25 a −8 dBm
                           Registra material             →     Descuenta del inventario
                           Fotos de la instalación
                           Cliente firma en pantalla     →     Contrato PDF
                           Cierra la orden               →     Cliente ACTIVO
                                                               Sube al volver la señal
```

**Regla:** no se cierra una orden sin foto, sin potencia medida y sin firma.
**El aprovisionamiento en la OLT no se hace desde el teléfono**: queda pendiente y lo ejecuta
la oficina, o el agente local cuando esté.

### 7.3 Ticket

```
1. Entra el reporte                → sin servicio · lento · intermitente · cambio · otro
2. El sistema muestra solo:
   · estado del equipo (en línea, potencia, señal desde UISP si es WISP)
   · si hay más caídos en la misma NAP o el mismo sectorial
   → si son varios: se sugiere INCIDENTE DE RED
3. Prioridad y técnico
4. El técnico atiende desde el SUNMI
5. Cierre con causa raíz           → fibra cortada · conector sucio · equipo dañado ·
                                     energía · configuración · del cliente · falsa alarma
```

### 7.4 Cobranza

```
1. Día 1        → se genera el cargo de cada cliente activo
2. Días 1 al 5  → periodo de pago
                  · en oficina (efectivo o transferencia)
                  · en campo, con el cobrador de la zona
                  → recibo con folio
3. Días 6 al 8  → gracia. El sistema avisa a oficina y al cobrador de la zona
4. Día 9        → los que no pagaron pasan a MOROSO
                  → se arma la lista de suspensión, por zona
                  → MVP: la oficina suspende a mano
                  → Etapa 2: lo hace el agente local
5. Paga + $30   → reconexión
6. Fin del día  → cada cobrador cierra su corte de caja y entrega
```

### 7.5 Entrega y devolución de equipos

```
ENTREGA
  Almacén → técnico    → se descuenta del almacén, se carga al técnico
  Técnico → cliente    → se asigna al expediente, se registra el depósito de $550

DEVOLUCIÓN
  Baja del cliente     → orden de RETIRO DE EQUIPO
  El técnico recoge    → foto, estado: bueno / dañado / perdido
  Entra al almacén     → disponible, a reparación, o baja
  No lo devuelve       → se cobran $550
```

---

## 8. Qué se registra en cada proceso

| Proceso | Datos obligatorios | Datos opcionales |
|---|---|---|
| **Alta de prospecto** | nombre, teléfono, **zona** | dirección, referido, plan de interés |
| **Alta de cliente** | nombre, teléfono, dirección, **zona**, plan | correo, RFC, coordenadas, 2° contacto |
| **Instalación** | técnico, fecha, coordenadas, foto de fachada, potencia en ONU, serie, firma | potencia en NAP, metros de drop, material |
| **Equipo instalado** | tipo, marca, modelo, serie | MAC, IP, VLAN, puerto PON, SSID, contraseña |
| **Pago** | cliente, periodo, monto, forma, fecha, **quién lo recibió**, **zona** | referencia, observación |
| **Corte de caja** | cobrador, turno, total efectivo, total transferencia, entregado a | diferencia y su motivo |
| **Ticket** | cliente, categoría, descripción, quién reporta | prioridad, adjuntos |
| **Cierre de ticket** | causa raíz, qué se hizo, técnico | material, tiempo |
| **Movimiento de inventario** | artículo, cantidad, origen, destino, motivo, quién | orden, serie |
| **Elemento de red** | tipo, identificador, coordenadas | capacidad, puertos usados, fotos |
| **Equipo de red** | modelo, IP, función, ubicación | configuración respaldada, fecha |

---

## 9. Prioridad de cada función

### MVP

Inicio de sesión y roles · **permisos por persona** · **zonas** · clientes y prospectos ·
expediente · planes · órdenes de instalación · asignación de técnicos ·
app en el SUNMI (ver órdenes, capturar, cerrar) · **escaneo con el láser** ·
generación de SSID y contraseña + QR · GPS y fotografías · potencia óptica ·
firma del contrato · cierre de instalación · consulta de tickets e inventario ·
**importación del padrón desde Excel**

### Segunda etapa

Cobranza completa con gracia y corte · **cobro en campo y corte de caja** · recibos en PDF ·
red FTTH con trazabilidad · red WISP con **señal desde UISP** · registro de MikroTik ·
mapas con capas · reportes por zona y por cobrador · portal del cliente ·
notificaciones por correo · agenda · devolución de equipos · auditoría consultable

### Futura *(cada una con su condición)*

| Función | Qué hace falta antes |
|---|---|
| Integración con UISP | Token de API y confirmar que los 206 CPE están adoptados |
| Integración con MikroTik | Servidor Ubuntu + inventario de equipos + **resolver el acceso** (ver 17.1) |
| Integración directa con OLT | El agente local ya probado |
| Corte y reconexión automáticos | Las dos anteriores |
| Facturación CFDI 4.0 | Contratar un PAC |
| Cobro con tarjeta / OXXO | Elegir pasarela |
| WhatsApp por API oficial | Alta en Meta y presupuesto por conversación |
| Consultas con IA | Solo con datos no sensibles, ya acordado |
| Etiquetas NFC en NAP y equipos | Que la app esté en uso |
| Multi-empresa | 6 meses de ZUUUM en producción |

---

## 10. Criterios para dar por terminada cada etapa

| Etapa | Terminada cuando |
|---|---|
| **1 · Alcance** | Este documento aprobado y contestadas las 4 preguntas de la sección 16 |
| **2 · Cuentas y repositorio** | Repositorio privado creado, compilación de prueba pasando en Vercel, `panelzuuumfibra.com` apuntando |
| **3 · Base de datos** | Diagrama aprobado, migraciones corren de cero, y **un cobrador de prueba no puede leer otra zona ni un técnico leer pagos** — probado con usuarios reales |
| **4 · Sesión y permisos** | Los siete roles entran y ven lo suyo; el admin puede prender y apagar permisos y se refleja al instante |
| **5 · Panel administrativo** | Navega en computadora, tableta y teléfono; compila limpio |
| **6 · Clientes** | Los 1,102 importados con su zona; el expediente muestra todo |
| **7 · Red FTTH/WISP** | 2 OLT, puertos, NAP, torres, 13 sectoriales y 206 CPE cargados; se sigue un cliente hasta su puerto |
| **8 · Inventario y ONU** | **Escaneo probado en el SUNMI real**, con una ONU dentro de su caja; existencias cuadran |
| **9 · Órdenes de trabajo** | Una instalación completa hecha por un técnico de verdad, en campo, con su SUNMI |
| **10 · Cobranza** | Un mes completo cobrado en el sistema, cuadrado contra el Excel, **y los cortes de caja de los cobradores cuadrados** |
| **11 · App móvil** | En los SUNMI de los técnicos; una instalación cerrada **sin señal** y sincronizada después |
| **12 · Integraciones** | Señal en vivo desde UISP, y una ONU aprovisionada desde el sistema y verificada en el equipo |
| **13 · Seguridad y respaldos** | Respaldo restaurado en limpio; revisión de permisos hecha |
| **14 · Publicación** | El equipo trabaja en el sistema y **el Excel se deja de usar** |

**Si el Excel sigue abierto, el sistema no está terminado.**

---

## 11. Arquitectura

```
                    ┌──────────────────────────────┐
   Navegador  ────► │  Panel web (Next.js/Vercel)  │ ──┐
                    │  panelzuuumfibra.com         │   │
                    └──────────────────────────────┘   │
                                                       ├──► Supabase
   SUNMI L2s  ────► ┌──────────────────────────────┐   │    · PostgreSQL
   del técnico      │  App Flutter (Android 12)    │ ──┤    · Auth
                    │  · escáner láser del SUNMI   │   │    · Storage
                    │  · GPS · cámara · firma      │   │    · Realtime
                    │  · base local: trabaja       │   │
                    │    sin señal                 │   │
                    └──────────────────────────────┘   │
                                                       │
   Cliente    ────► ┌──────────────────────────────┐   │
                    │  Portal de clientes          │ ──┘
                    └──────────────────────────────┘
                                                        ▲
                     Cloudflare (DNS, TLS, protección)  │
                     GoDaddy = registrador del dominio  │
                                                        │
   ┌────────────────────────────────────────────────────┴──────────┐
   │  RED DE ZUUUM (Cuencamé)                                       │
   │                                                                │
   │   Agente local (Ubuntu) ── SALE hacia Supabase.                │
   │        │                   NUNCA recibe conexiones de Internet │
   │        ├── OLT VSOL       172.28.69.18      telnet + SNMP      │
   │        ├── OLT Huawei     172.28.69.253     telnet + SNMP      │
   │        ├── MikroTik       ver advertencia 17.1                 │
   │        ├── UISP           API con X-Auth-App-Key               │
   │        └── AdminOLT       nube, con token                      │
   └────────────────────────────────────────────────────────────────┘
```

**El principio:** ni el panel ni la app tocan las OLT ni los MikroTik. El agente local **sale**
hacia la plataforma. Las contraseñas de los equipos nunca salen de la red de ZUUUM.

Ese agente **ya existe en versión de prueba**: es el `puente.js` que corre hoy, con telnet,
SNMP, websocket y la API de AdminOLT ya funcionando. Se reescribe para Ubuntu y para hablar
con Supabase, pero la lógica difícil ya está escrita y probada.

**El servidor Ubuntu no existe todavía.** Hay que ponerlo. Puede ser una máquina modesta —
un mini PC o incluso una Raspberry Pi 4 sirve para arrancar. Va en la oficina, con la red que
alcanza las OLT.

---

## 12. Integración con UISP *(nuevo en v2.0)*

La señal en vivo del lado inalámbrico sale de **UISP**, no de leer cada CPE uno por uno.

**UISP todavía no está montado.** Hay que instalarlo y adoptar los 206 CPE. Buena noticia:
**va en el mismo servidor Ubuntu del agente local**, no hace falta otro equipo. UISP es
gratuito y autoalojado; con 206 equipos pide algo modesto —4 GB de RAM y un par de núcleos son
suficientes— así que un mini PC decente corre las dos cosas sin apuros.

**Orden para montarlo:**

```
1. Poner el servidor Ubuntu en la oficina        (también hospeda el agente local)
2. Instalar UISP
3. Adoptar los 13 sectoriales
4. Adoptar los 206 CPE                            ← lo más tardado, se puede hacer por zona
5. Generar el token de API
6. El agente local empieza a leer la señal
```

Adoptar 206 equipos no es trivial: cada CPE hay que apuntarlo al servidor. Se puede hacer por
zona, sin prisa, mientras avanzan las otras etapas. **No bloquea nada más.**

**Lo que se confirmó de la API:**

- Autenticación por token en el encabezado **`X-Auth-App-Key`**
- El token se genera en **Configuración → Usuarios → API tokens**
- La documentación viva está en **`https://<tu-servidor-uisp>/nms/api-docs`**
- UISP mantiene un canal WebSocket y mensajes periódicos con cada equipo, así que la señal
  llega casi al momento

**Cómo se usa aquí:**

```
Agente local  →  pregunta a UISP cada pocos minutos por los 206 CPE
              →  guarda señal, firmware, tiempo en línea, MAC
              →  sube a Supabase solo lo que cambió
Plataforma    →  muestra la señal en el expediente del cliente
              →  alerta cuando un CPE baja de un umbral
              →  al abrir un ticket, ya sabe cómo está la señal
```

**El token de UISP vive únicamente en el agente local**, nunca en el panel ni en la app.

---

## 13. Lo que ya está hecho y se reaprovecha

| Ya resuelto | Dónde está | Estado |
|---|---|---|
| **Codificador de QR** (ISO/IEC 18004, sin librerías) | sistema ONT | 602 pruebas |
| **Generación de SSID y contraseña** configurable | sistema ONT | listo |
| **Reconocimiento de marca por serial GPON** | sistema ONT | HWTC, ZTEG, ALCL… |
| **Etiquetas imprimibles** con auto-ajuste | sistema ONT | listo |
| **Hoja de instalación** en PDF con QR | sistema ONT | listo |
| **Lector de .xlsx** sin librerías | Centro de Mando | importó los 1,102 |
| **Trazabilidad FTTH completa** | sistema FTTH | hilos, fusiones, splitters, NAP |
| **Distancia OTDR con guardas** | sistema FTTH | 50 m site, 20 m poste, 20 m caja |
| **Plano para CFE** | sistema FTTH | listo |
| **Mapa OSM sin librerías** | los tres | teselas, capas, arrastre |
| **API de AdminOLT mapeada** | puente | tres puertas documentadas |
| **Cliente websocket a mano** (RFC 6455) | puente | listo |
| **SNMPv2c a mano** | puente | GET y WALK |
| **Telnet a OLT** con perfiles por marca | puente | Huawei probado |
| **Aprovisionamiento de ONU** | puente + ONT | probado en tu OLT |
| **Configuración de WiFi de la ONU** | puente + ONT | probado |
| **Cálculo del índice de puerto** por marca | puente | verificado con 8 ONU |
| **Base compartida con control de versión** | puente | atómica, con respaldos |

**Más de 240 pruebas automatizadas** que pasan. Ese código se traduce, no se reinventa.

---

## 14. Costos de la infraestructura

| Servicio | Plan | Costo aproximado |
|---|---|---|
| Supabase | Free, luego Pro | $0 – $25 USD/mes |
| Vercel | Hobby o Pro | $0 – $20 USD/mes |
| Cloudflare | Free | $0 |
| Dominio `panelzuuumfibra.com` | GoDaddy, anual | ya lo tienes |
| Google Play Console | pago único | ~$25 USD |
| **SUNMI L2s PRO** | por técnico | **POR CONFIRMAR** — depende de cuántos |
| Servidor Ubuntu del agente | mini PC o Raspberry Pi 4 | ~$2,000 – $6,000 MXN, una vez |
| AdminOLT | se sigue pagando | lo actual |
| UISP | autoalojado | gratis |

**Ojo con Supabase Storage:** las fotos son lo que más crece. Con 1,500 clientes y 5 fotos por
instalación comprimidas a 300 KB son unos 2 GB. Manejable si se comprime en el SUNMI antes de
subir — como ya se hace hoy.

---

## 15. Riesgos

| Riesgo | Probabilidad | Cómo se maneja |
|---|---|---|
| **MikroTik expuesto a Internet** | **Alta** | Ver advertencia 17.1. Es el riesgo más serio de la lista |
| El proyecto es más grande de lo que parece | Alta | Un módulo por vez, terminado y probado |
| La operación se detiene en la migración | Media | Los sistemas actuales siguen hasta que lo nuevo esté probado |
| Los datos del Excel están sucios | Alta | 167 sin precio, nombres repetidos, zonas escritas de varias formas |
| Los técnicos no adoptan la app | **Baja** | El SUNMI les resuelve el trabajo: escaneo instantáneo, no llenar papel |
| Sin señal en las comunidades | Alta | La app trabaja sin conexión por diseño; además el SUNMI trae SIM |
| Depender de AdminOLT | Media | El camino directo por telnet y SNMP ya está escrito |
| Depender de UISP | Media | Es autoalojado; si se cae, se pierde la señal en vivo, no el padrón |
| Una sola persona sabe cómo funciona todo | Alta | Todo documentado en el repositorio, en español |

---

## 16. Decisiones cerradas

Las 20 preguntas del alcance están contestadas. Resumen de las últimas cuatro:

| Pregunta | Respuesta |
|---|---|
| ¿Corte el día 9 o el 11? | **Día 11.** Pago del 1 al 5, gracia del 6 al 10 |
| ¿Los $550 son depósito o cargo? | **Cargo**, solo si no devuelven el equipo. No hay depósito |
| ¿Los SUNMI traen GMS? | **Sí.** Se usa Firebase para push; los mapas siguen en OpenStreetMap |
| ¿UISP está montado? | **No.** Se instala en el mismo servidor Ubuntu del agente local |

**Queda una sola decisión abierta, y es de seguridad:** cómo alcanzar los MikroTik
(sección 17.1). No frena las etapas 2 a 11.

---

## 17. Advertencias técnicas

### 17.1 ⚠ MikroTik por IP pública — **no lo recomiendo**

En tu revisión anotaste que los MikroTik *"se conectarán por medio de IP pública"*. Entiendo la
intención: que el sistema los alcance desde afuera. Pero eso es exactamente lo contrario de lo
que protege la arquitectura que acordamos, y es el camino por el que se han perdido redes
completas.

**El problema concreto:** los servicios de administración de RouterOS —Winbox en el 8291, la
API en el 8728, SSH y el WebFig— expuestos a Internet son objetivo permanente de barridos
automáticos. Ha habido campañas grandes de infección de MikroTik justamente por ahí. Y aquí no
hablamos de un router: hablamos de los que llevan el servicio de **1,102 clientes**.

**Las tres formas de resolverlo, de mejor a peor:**

| | Cómo | Qué tan seguro |
|---|---|---|
| **1. Agente local en la LAN** *(recomendada)* | El agente vive en la misma red que los MikroTik y los alcanza por IP privada. Hacia Internet solo sale, nunca recibe. **Cero puertos abiertos.** | Muy seguro |
| **2. VPN WireGuard** | Si algún MikroTik está en otro sitio, se une por VPN al servidor del agente. Un solo puerto UDP, con llaves. | Seguro |
| **3. IP pública con lista blanca** | Solo si no queda otra: puertos cambiados, acceso limitado por dirección de origen, sin Winbox abierto, contraseñas largas y RouterOS al día. | Aceptable a duras penas |

**Mi recomendación:** opción 1 para los MikroTik de la oficina y de las OLT, y opción 2 para
los que estén en las torres o en otras localidades. Así el sistema los alcanza todos **sin
abrir un solo puerto** hacia Internet.

Si aun así prefieres la IP pública, se puede hacer — pero quiero que quede escrito aquí que se
decidió a sabiendas, y con la lista blanca como mínimo obligatorio.

### 17.2 GoDaddy y Cloudflare no pelean

`panelzuuumfibra.com` está en GoDaddy y el plan usa Cloudflare. No hay conflicto:

- **GoDaddy sigue siendo el registrador** — ahí se renueva el dominio.
- Se apuntan los **nameservers de GoDaddy a Cloudflare**, y a partir de ahí Cloudflare maneja
  el DNS, el certificado y la protección.
- Es un cambio de dos campos en el panel de GoDaddy y tarda unas horas en propagarse.

Los subdominios quedarían así:

| Subdominio | Para qué |
|---|---|
| `panelzuuumfibra.com` | sitio o redirección al panel |
| `sistema.panelzuuumfibra.com` | panel administrativo |
| `clientes.panelzuuumfibra.com` | portal de clientes |
| `api.panelzuuumfibra.com` | reservado |

### 17.3 La ubicación del técnico tiene implicaciones

El SUNMI trae GPS y se puede guardar la ubicación durante la jornada. Es útil para saber dónde
anda una cuadrilla y para verificar que la instalación se hizo donde dice.

Dos cosas que conviene dejar por escrito desde ahora:

1. **El técnico debe saber que se está guardando.** En la app, un indicador visible cuando la
   ubicación está activa. No es un rastreo escondido.
2. **Solo durante el turno.** Fuera del horario, apagado. La app no debe pedir permiso de
   ubicación en segundo plano permanente si no hace falta.

Es una recomendación, no un requisito legal que yo pueda afirmar con certeza. Si el tema
importa, vale la pena consultarlo con quien lleve la parte laboral.

---

## 18. Orden de trabajo

```
1  Alcance ......................... v2.0 · faltan 4 respuestas   ← AQUÍ
2  Cuentas y repositorio ........... GitHub, Supabase, Vercel, Cloudflare
3  Base de datos ................... diagrama → aprobación → migraciones
4  Sesión y permisos ............... Auth + RLS por rol, por persona y por zona
5  Panel administrativo ............ esqueleto, menú, dashboard
6  Clientes ........................ padrón + expediente + zonas + importación
7  Red FTTH y WISP ................. OLT, NAP, torres, sectoriales, mapas
8  Inventario y ONU ................ existencias + escaneo SUNMI + SSID
9  Órdenes de trabajo .............. flujo completo del técnico
10 Cobranza y contratos ............ pagos, corte de caja, recibos, firma
11 App móvil ....................... Flutter en el SUNMI, sin señal
12 Integraciones ................... agente local, UISP, MikroTik, OLT
13 Seguridad, pruebas y respaldos .. antes de producción
14 Publicación ..................... y se apaga el Excel
```

**En cada paso:** planear → aprobar → programar → probar → corregir → documentar → respaldar.
Al terminar cada módulo: **parar y esperar aprobación.**

---

## 19. Lo que sigue

**La etapa 1 está cerrada.** Dos cosas avanzan en paralelo:

| Tú | Yo |
|---|---|
| **Etapa 2** — crear las cuentas y el repositorio, apuntar el dominio a Cloudflare. Ver `ETAPA_2_CUENTAS.md` | **Etapa 3** — diseño de la base de datos: diagrama y diccionario de datos. Ver `BASE_DE_DATOS_ZUUUM.md` |
| Conseguir el servidor Ubuntu | Sin migraciones hasta que apruebes el diseño |
| Decidir el acceso a los MikroTik (17.1) | |

No hace falta que termines la etapa 2 para que yo diseñe la base: el diseño no depende de que
las cuentas existan. Cuando las dos cosas estén listas, se ejecutan las migraciones.

Mientras tanto **el sistema actual sigue trabajando**. No se apaga nada hasta que lo nuevo esté
probado en campo.

---

*Documento vivo. Cada decisión que se resuelva se actualiza aquí, y este archivo es la fuente
de verdad del proyecto.*

**Historial:**
· **v1.0** (28 jul 2026) — alcance inicial, 16 decisiones marcadas POR DEFINIR
· **v2.0** (28 jul 2026) — decisiones resueltas; zonas y cobradores, SUNMI L2s PRO, UISP,
  permisos por persona, advertencias de seguridad
· **v2.1** (28 jul 2026) — **ETAPA 1 CERRADA**: corte el día 11, $550 como cargo y no
  depósito, SUNMI con GMS, UISP a montar en el servidor del agente
