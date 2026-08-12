# Objetivo de Red FTTH · «Caja por dentro» e intervenciones

> Esta es la visión completa que definió Alan (2026-08-12). Es la guía de a dónde
> vamos. Se construye por partes; ver el estado y el orden en el roadmap al final.

## Concepto

Seleccionar un punto de una línea troncal de fibra y agregar una caja de empalme
o una caja NAP. Dentro de ese punto se podrá:

- Cortar completamente el cable.
- Abrir el cable sin cortar todos los hilos.
- Cortar únicamente uno o varios hilos.
- Dejar hilos continuos o en paso.
- Fusionar un hilo con otro cable de fibra.
- Conectar un hilo a la entrada de un splitter.
- Conectar las salidas del splitter con otros hilos o puertos NAP.
- Crear una nueva rama de fibra.
- Continuar interviniendo sobre cualquiera de las ramas creadas.

## Punto de intervención — tipos

1. Caja de empalme.
2. Caja NAP.
3. Caja de distribución.
4. Empalme directo.
5. Derivación de cable.
6. Splitter dentro de caja.
7. Reserva de fibra.

No siempre se corta todo el cable: en media sección puede abrirse la cubierta y
cortar solo los hilos que se usarán; los demás quedan como **hilos en paso**.

## Procedimiento en la interfaz

**Paso 1 · Seleccionar la troncal:** site de origen, OLT, puerto PON, ODF, puerto
del ODF, cable troncal, punto exacto de la intervención.

**Paso 2 · Crear el punto de intervención:** código, tipo de caja, coordenadas,
dirección/referencia, capacidad, número de charolas, fecha de instalación, estado
(proyectada/instalada/activa/dañada/fuera de servicio), fotos, notas.

**Paso 3 · Dividir visualmente el cable:** tramo anterior (llega) · punto de
intervención (caja/NAP) · tramo posterior (continúa). Aunque se divida visualmente,
conservar la relación con el cable troncal original.

**Paso 4 · Mostrar los hilos:** todos los tubos e hilos con su código de colores.
Por hilo: número, color de tubo, color de hilo, origen, destino actual, estado,
potencia óptica estimada/medida, tipo de conexión.

## Estados de los hilos

En paso · Cortado disponible · Fusión directa · Entrada de splitter · Salida de
splitter · Alimentación de NAP · Reserva · Ocupado · Dañado · Sin continuidad ·
Fuera de servicio.

## Operaciones de fusión (matriz visual)

Seleccionar un hilo de entrada y conectarlo con: el mismo hilo del cable que
continúa · un hilo diferente del que continúa · un hilo de un cable de derivación ·
la entrada de un splitter · una salida de splitter · la entrada de una NAP · un
puerto de distribución · una reserva sin conectar.

Cada fusión muestra: cable origen, tubo/hilo origen, cable destino, tubo/hilo
destino, tipo de fusión, pérdida estimada, pérdida medida, charola, posición,
fecha y técnico.

## Splitter

Tipos: 1×2, 1×4, 1×8, 1×16, 1×32, otro configurable. Seleccionar: hilo que
alimenta la entrada, tipo, relación, pérdida de inserción, ubicación física en la
caja, uso de cada salida. Cada salida → hilo de otro cable · puerto de NAP · otra
caja de empalme · otro splitter (si el diseño lo permite) · reserva. Las salidas
se numeran y **no pueden usarse dos veces**.

## Rama de fibra (recursivo)

Al fusionar un hilo con un cable nuevo, se puede crear una **rama**: nombre, tipo,
cantidad de hilos, cantidad de tubos, código de colores, punto de origen, destino
proyectado, longitud, reserva inicial y final, estado. La rama aparece en el mapa
conectada a la caja y puede intervenirse más adelante (otra caja, derivación,
splitter, NAP, terminal, otra rama). Cualquier cable nuevo puede alimentar otras
cajas: el procedimiento es **recursivo**.

## Cajas NAP

Recibe señal por: (1) un hilo que alimenta un splitter dentro de la propia NAP, o
(2) varios hilos de las salidas de un splitter en una caja de empalme anterior.
Muestra: código y ubicación, capacidad de puertos, cable/hilo que la alimenta,
splitter asociado, potencia de entrada, potencia estimada por puerto, puertos
disponibles/ocupados/dañados/reservados, clientes por puerto.

## Validaciones obligatorias

Impedir: usar un hilo ocupado en dos fusiones · usar dos veces una salida de
splitter · conectar más puertos de los que tiene la NAP · fusión sin origen o
destino · conectar un hilo consigo mismo mal · superar la capacidad de caja/charola
· crear ciclos ópticos · eliminar una caja con conexiones activas sin advertir ·
asignar cliente a un puerto NAP ocupado.

Al cortar un hilo con servicio activo: **«Advertencia: este hilo tiene continuidad
hacia cajas NAP o clientes activos…»** + lista de cajas, puertos y clientes
afectados.

## Trazabilidad óptica

Seleccionar cualquier hilo, salida de splitter, NAP o cliente y ver el recorrido:
OLT → puerto PON → ODF → troncal → hilo → caja de empalme → fusión → splitter →
cable derivado → NAP → puerto → cliente. También inversa (cliente → OLT).

## Presupuesto óptico

Tras cada fusión/derivación recalcular: potencia de salida del PON, pérdida por
longitud, pérdidas por conectores, por fusiones, de cada splitter, potencia
estimada en NAP y en cliente, margen restante. Marcar **verde** (adecuada),
**amarillo** (cerca del límite), **rojo** (fuera de rango).

## Representación visual

Línea gruesa = troncal · línea delgada = derivación · punto circular = fusión
directa · rectángulo = caja empalme · rectángulo con puertos = NAP · triángulo =
splitter · línea continua = hilo activo · punteada = reserva · roja = cortado/
dañado/sin continuidad.

## Ejemplo

Troncal de 24 hilos; en un punto se agrega CE-01. Hilos 1–8 en paso. Hilo 9 se
corta y va a la entrada de un splitter 1×8. Salidas 1–4 alimentan cuatro NAP.
Salidas 5–6 reservadas. Salida 7 alimenta una derivación nueva de 12 hilos. Salida
8 disponible. La derivación sigue por otra calle; más adelante CE-02, donde un
hilo se fusiona con otro cable y otro alimenta una NAP. Todo queda registrado
gráficamente y en tabla de conexiones.

## Historial

Cada cambio guarda: usuario, fecha/hora, acción, configuración anterior y nueva,
fotos, potencias medidas, comentarios. Poder deshacer el último cambio si aún no
fue aprobado.

---

## Estado actual (2026-08-12)

La BASE (Supabase, migraciones 001–044) ya implementa casi todo. Faltan sobre
todo PANTALLAS y dos funciones nuevas.

| Tema | Estado | Nota |
|------|--------|------|
| Insertar caja en un punto del cable | ✅ | `insertar_caja_en_cable`, mapa/Derivar.tsx |
| Corte parcial de hilos (unos cortados, otros en paso) | ✅ | `fiber_strands.cut_at` |
| Fusiones (tabla + RPCs) | ✅ | falta charola/posición y pérdida medida vs estimada |
| Splitter (entrada, salidas numeradas, no repetir salida) | ✅ | completo |
| Rama de fibra derivada (recursiva) | ✅ | `ramal_desde`, `cerrar_ruta` |
| NAP (puertos, alimentación, clientes, potencia) | ✅ | |
| Validaciones obligatorias en la base | ✅ | muy completas (hilo/salida ocupada, capacidad, borrar con conexiones…) |
| Trazabilidad óptica OLT↔cliente | ✅ | `trazar_hilo`, `ruta_de_servicio` |
| «Caja por dentro» (dibujo: fusionar, splitter, líneas, mover, imagen) | ✅ | lo que venimos puliendo |
| División visual antes/caja/después sobre el trazo | 🟡 | el modelo conserva la troncal; falta pintar 3 tramos |
| Estados de hilo completos | 🟡 | hay 7; faltan «en paso», «sin continuidad», «fuera de servicio» como etiqueta propia |
| Aviso PREVIO al cortar/soltar un hilo con clientes activos | 🟡 | hoy avisa DESPUÉS; falta el modal con la lista y confirmar |
| Historial de la red + deshacer | 🟡 | `audit_logs` existe; falta pantalla y «deshacer» |
| Símbolos en el mapa (troncal grueso vs derivación delgada) | 🟡 | rico dentro de la caja; pobre en el mapa |
| **Presupuesto óptico** (dBm acumulado, margen, semáforo verde/amarillo/rojo) | ❌ | lo más grande que falta; hoy solo hay semáforo de Rx medido en NAP |

**Orden propuesto:** (A) terminar «Caja por dentro» — estados de hilo, tabla de
conexiones y el aviso previo al cortar con servicio; (B) presupuesto óptico; (C)
historial de la red + deshacer; (D) símbolos/tramos en el mapa.
