# Calidad de los datos del padrón

**Hallazgos de la carga de prueba** · 28 de julio de 2026

Se cargaron los 1,102 clientes de `www PAGOS.xlsx` en una base de prueba y se cuadró
contra el Excel. **Todo cuadró.** Pero en el camino salieron cosas que conviene arreglar
*antes* de la carga definitiva, porque migrar la suciedad sale caro después.

---

## 1. Las seis IP mal escritas

**Tres ya quedaron corregidas** en `CARGA_PADRON.sql`. Eran errores de dedo sin
ambigüedad, así que las arreglé y lo dejo anotado aquí para que lo sepas:

| Zona | Decía | Quedó | Por qué |
|---|---|---|---|
| CUE | `172.168.18.94.` | `172.168.18.94` | sobraba un punto al final |
| CUE | `172168.15.218` | `172.168.15.218` | faltaba un punto |
| PED | `1912.168.121.83` | `192.168.121.83` | 192 escrito como 1912 |

**Las otras tres NO las toqué**, porque adivinar sería peor que dejarlas vacías.
Quedaron en nulo: el cliente está completo, solo le falta la IP.

| Zona | Dice | Por qué no la corregí |
|---|---|---|
| CUA | `192.168.150.121.77` | trae cinco números; no se sabe cuál sobra |
| PAS | `checar para cortar` | no es una IP, es una nota |
| MER | `192.168.126.35/192.168.120.110` | son dos direcciones en una celda |

Estas tres las tienes que decidir tú, mirando el equipo. Cuando sepas cuáles son,
se corrigen desde el sistema en treinta segundos.

## 2. Ocho IP repetidas en dos clientes

Dos equipos con la misma IP en la misma red no pueden funcionar los dos. O uno ya se dio
de baja y quedó el registro viejo, o hay un error de captura.

| IP | Clientes |
|---|---|
| `192.168.121.54` | CUA: GILLERMO SOLIS ESQUIVEl · AMI: GUILLERMO SOLIS ESQUIVEL ( |
| `192.168.126.40` | PED: ADAN ANTUNEZ LOPEZ · PED: MA ESTHER FUENTES CASTRO |
| `192.168.126.42` | PED: MARIA DELFINA GONZALEZ CHA · OCU: MARIA EUGENIA GALVAN RODRI |
| `192.168.126.68` | PED: DANICA CORAL NERI LOZANO · AMI: DANICA CORAL NERI LOZANO |
| `192.168.126.72` | PED: ANGELICA LOZANO ORONA · PED: JOAQUIN JIMENEZ RAYO |
| `192.168.200.182` | PAS: JOSE GUADALUPE MARTINEZ FL · PAS: JOSE MANUEL MARTINEZ CASTR |
| `192.168.201.120` | LFE: CATARINO MEDRANO GONZALEZ · LFE: RAYMUNDO PEREZ |
| `192.168.201.147` | LFE: JESUS LUNA LUNA · LFE: JOSE CRUZ ADAME NAVA |

## 3. Un nombre repetido en la misma zona

- **MER** — «PAULINA JOSELIN RAMIREZ VIEZCA MINA EL CHOCOLATIN» aparece **2 veces**, con precios $450 y $2,690.

Se cargaron como dos clientes distintos, que es lo correcto si de verdad son dos.
Si es el mismo capturado dos veces, hay que unirlos.

## 4. Los 167 sin precio

| Zona | Sin precio |
|---|---:|
| Cuencamé | 52 |
| Pedriceña | 26 |
| Velardeña | 17 |
| Pasaje | 17 |
| Ocuila | 12 |
| Cuatillos | 11 |
| Las Mercedes | 9 |
| La Fe | 8 |
| La Cuchilla | 5 |
| 20 Amigos | 4 |
| Vista Hermosa | 3 |
| El Tanque | 3 |
| **Total** | **167** |

**Ocuila entero (12 de 12) no tiene un solo precio capturado.** Ahí no es un descuido:
es que esa hoja nunca se llenó.

Todos entraron al sistema marcados con `price_review_needed`, así que se pueden filtrar
en una pantalla y corregir uno por uno sin buscarlos entre los 1,102.

---

## Lo que recomiendo

1. **Corregir las 6 IP** en el Excel. Son cinco minutos.
2. **Revisar las 8 IP repetidas**: alguna seguro es un cliente dado de baja que quedó ahí.
3. **Decidir el nombre repetido** de Las Mercedes: ¿son dos clientes o uno duplicado?
4. **Los 167 sin precio** pueden entrar así y corregirse dentro del sistema. No frenan la
   migración. Pero son unos **$71,000 al mes** que hoy no se están sumando en ningún lado.

Ninguno de estos cuatro puntos impide migrar. Los cuatro salen más baratos ahora que después.
