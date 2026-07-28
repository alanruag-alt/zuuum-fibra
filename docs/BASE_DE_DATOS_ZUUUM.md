# BASE DE DATOS · ZUUUM FIBRA

**Etapa 3 · Diagrama y diccionario de datos** · versión 1.0 · 28 de julio de 2026
PostgreSQL sobre Supabase

> **Este documento es para revisar, no para ejecutar.** No hay migraciones todavía. Cuando lo
> apruebes, se convierte en SQL.
>
> Fuente: `PLAN_MAESTRO_ZUUUM_FIBRA.md` v2.1.

---

## 1. Convenciones

**Todas las tablas** llevan estos campos, sin excepción:

| Campo | Tipo | Para qué |
|---|---|---|
| `id` | `uuid` PK, por omisión `gen_random_uuid()` | Identificador |
| `org_id` | `uuid` → `organizations` | De quién es el dato |
| `created_at` | `timestamptz` por omisión `now()` | Cuándo se creó |
| `updated_at` | `timestamptz` por omisión `now()` | Se actualiza sola con disparador |
| `created_by` | `uuid` → `profiles` | Quién lo creó |
| `updated_by` | `uuid` → `profiles` | Quién lo tocó al último |
| `is_active` | `boolean` por omisión `true` | Baja lógica, donde aplica |
| `deleted_at` | `timestamptz` nulo | Borrado suave, donde aplica |

**Reglas generales:**

- **Nada se borra de verdad.** Todo es baja lógica. Un cliente dado de baja hace tres años
  sigue ahí con su historial. La única excepción son los datos de prueba.
- **Dinero:** `numeric(12,2)`. Nunca `float` — con decimales flotantes se pierden centavos.
- **Fechas:** siempre `timestamptz`, guardadas en UTC. La zona horaria se aplica al mostrar.
- **Textos con lista fija de valores:** columna `text` con restricción `CHECK`, no tipo `enum`
  de PostgreSQL. Agregar un valor a un `enum` en producción es un dolor; a un `CHECK` no.
- **Nombres en inglés y en singular para las columnas, plural para las tablas.** Es lo que
  espera Supabase y evita fricción con las herramientas.
- **Toda tabla con `org_id` tiene RLS activo.** Sin excepción.

---

## 2. Diagrama general

```
┌─ A · ORGANIZACIÓN Y SEGURIDAD ──────────────────────────────────────────┐
│                                                                          │
│  organizations ──┬── branches (oficinas y almacenes)                     │
│                  ├── zones (las 12 zonas de cobranza)                    │
│                  └── profiles ──┬── user_roles ──── roles ──┐            │
│                                 ├── user_permissions        ├ permissions│
│                                 └── user_zones ──► zones    │            │
│                                            role_permissions ┘            │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
┌─ B · COMERCIAL ────────────────────┼─────────────────────────────────────┐
│                                    ▼                                      │
│  service_plans ◄──── customer_services ──► customers ──┬── addresses     │
│                                                        ├── contracts     │
│  prospects ──────────────────────────► (se convierte)  └── zone_id       │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
┌─ C · COBRANZA ─────────────────────┼─────────────────────────────────────┐
│                                    ▼                                      │
│  billing_periods ──► charges ◄── payment_allocations ──► payments        │
│                         │                                    │            │
│                         └──► receipts                        ├─► cash_    │
│  service_suspensions ◄──────────────────────────────────────┘   sessions │
└──────────────────────────────────────────────────────────────────────────┘

┌─ D · INVENTARIO ─────────────────────────────────────────────────────────┐
│  inventory_items ──► inventory_stock ──► branches                        │
│         │                                                                 │
│         └──► equipment_units (con número de serie) ──► customers         │
│                     │                                                     │
│              inventory_movements                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ E · RED ────────────────────────────────────────────────────────────────┐
│  network_sites ──► network_devices ──┬── olt_cards ──► pon_ports         │
│   (OLT, torres)   (OLT, MikroTik,    │                     │              │
│                    sectoriales)      └── device_readings   │              │
│                                                            ▼              │
│  network_elements (NAP, cierres, splitters, postes) ──► fiber_links      │
│                        │                                                  │
│                        └──────────► customer_services (de dónde cuelga)  │
└──────────────────────────────────────────────────────────────────────────┘

┌─ F · OPERACIÓN ──────────────────────────────────────────────────────────┐
│  work_orders ──┬── work_order_assignments ──► profiles                   │
│                ├── work_order_photos                                      │
│                ├── work_order_materials ──► inventory_items              │
│                ├── installation_readings                                  │
│                └── customer_signatures                                    │
│  tickets ──────── ticket_comments                                         │
└──────────────────────────────────────────────────────────────────────────┘

┌─ G · SISTEMA ────────────────────────────────────────────────────────────┐
│  settings · notifications · audit_logs · attachments · import_batches    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Diccionario de datos

### GRUPO A · Organización y seguridad

#### `organizations`
Preparada para multi-empresa desde el principio, aunque hoy solo haya una fila: ZUUUM FIBRA.
Agregar esto después obliga a tocar todas las tablas.

| Campo | Tipo | Notas |
|---|---|---|
| `name` | `text` NOT NULL | "ZUUUM FIBRA" |
| `legal_name` | `text` | Razón social |
| `tax_id` | `text` | RFC |
| `phone`, `email`, `address` | `text` | |
| `logo_url` | `text` | Supabase Storage |
| `timezone` | `text` | `America/Monterrey` |
| `currency` | `text` | `MXN` |

#### `branches`
Oficinas y almacenes. El inventario vive aquí.

| Campo | Tipo | Notas |
|---|---|---|
| `name` | `text` NOT NULL | "Oficina Cuencamé" |
| `type` | `text` CHECK | `office` · `warehouse` · `both` |
| `address` | `text` | |
| `latitude`, `longitude` | `numeric(10,7)` | |

#### `zones` — *las 12 zonas de cobranza*

| Campo | Tipo | Notas |
|---|---|---|
| `name` | `text` NOT NULL | "Cuencamé", "Velardeña"… |
| `code` | `text` UNIQUE por org | `CUE`, `VEL` — para folios |
| `branch_id` | `uuid` → `branches` | A qué oficina reporta |
| `network_type` | `text` CHECK | `ftth` · `wisp` · `mixed` |
| `latitude`, `longitude` | `numeric(10,7)` | Centro, para el mapa |
| `notes` | `text` | |

> **Nota sobre el nombre.** En tu lista original venía como `communities`. La cambio a `zones`
> porque en el alcance quedó claro que no son solo localidades: son **zonas de cobranza con
> cobrador asignado**. Si prefieres conservar `communities`, se cambia y ya.

#### `profiles`
Extiende `auth.users` de Supabase. **No guarda contraseñas** — de eso se encarga Supabase Auth.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK → `auth.users.id` | Mismo id que Auth |
| `full_name` | `text` NOT NULL | |
| `email`, `phone` | `text` | |
| `employee_code` | `text` | |
| `branch_id` | `uuid` → `branches` | |
| `device_id` | `text` | Número de serie del SUNMI asignado |
| `avatar_url` | `text` | |
| `last_seen_at` | `timestamptz` | |
| `is_active` | `boolean` | Al desactivar, no puede entrar |

#### `roles`
Los siete del alcance. Se pueden crear más.

| Campo | Tipo | Notas |
|---|---|---|
| `code` | `text` UNIQUE | `owner` · `admin` · `office` · `supervisor` · `technician` · `warehouse` · `customer` |
| `name` | `text` | "Propietario", "Oficina y cobranza"… |
| `is_system` | `boolean` | Los del sistema no se borran |
| `scope_type` | `text` CHECK | `all` · `zones` · `own` |

#### `permissions`
Catálogo fijo. Un renglón por acción posible.

| Campo | Tipo | Notas |
|---|---|---|
| `code` | `text` UNIQUE | `customers.read`, `payments.create`, `cash.close`… |
| `module` | `text` | `customers`, `payments`, `network`… |
| `name` | `text` | En español, para la pantalla |
| `is_sensitive` | `boolean` | **Los sensibles no se pueden dar a técnicos ni a almacén, ni con permiso individual** |

#### `role_permissions`
Qué trae cada rol de fábrica. `(role_id, permission_id)` único.

#### `user_roles`
Qué rol tiene cada persona. Se permite más de uno.

| Campo | Tipo |
|---|---|
| `user_id` | `uuid` → `profiles` |
| `role_id` | `uuid` → `roles` |

#### `user_permissions` — *lo que el administrador prende y apaga*

| Campo | Tipo | Notas |
|---|---|---|
| `user_id` | `uuid` → `profiles` | |
| `permission_id` | `uuid` → `permissions` | |
| `granted` | `boolean` | `true` = se le da además del rol · `false` = se le quita |
| `granted_by` | `uuid` → `profiles` | Queda quién se lo dio |
| `reason` | `text` | Opcional pero recomendable |

> **El candado.** Un disparador impide insertar un permiso con `is_sensitive = true` para
> alguien cuyo único rol sea técnico, almacén o cliente. Aunque el administrador lo intente,
> la base lo rechaza.

#### `user_zones` — *el alcance*

| Campo | Tipo | Notas |
|---|---|---|
| `user_id` | `uuid` → `profiles` | |
| `zone_id` | `uuid` → `zones` | |
| `can_collect` | `boolean` | Si puede cobrar en esa zona |

Sin renglones aquí y con rol de alcance `zones`, la persona **no ve nada**. Es a propósito:
más vale que no vea nada a que vea de más.

---

### GRUPO B · Comercial

#### `service_plans`

| Campo | Tipo | Notas |
|---|---|---|
| `name` | `text` NOT NULL | "Básico 20", "Premium 100" |
| `code` | `text` UNIQUE | |
| `download_mbps`, `upload_mbps` | `integer` | |
| `price` | `numeric(12,2)` NOT NULL | |
| `network_type` | `text` CHECK | `ftth` · `wisp` · `both` |
| `is_legacy` | `boolean` | **Los 16 precios viejos entran marcados así** |
| `visible_for_sale` | `boolean` | Los heredados no se ofrecen a nuevos |
| `notes` | `text` | |

#### `prospects`

| Campo | Tipo | Notas |
|---|---|---|
| `full_name`, `phone`, `email` | `text` | Nombre y teléfono obligatorios |
| `zone_id` | `uuid` → `zones` NOT NULL | |
| `address_text` | `text` | Aproximada |
| `latitude`, `longitude` | `numeric(10,7)` | |
| `interested_plan_id` | `uuid` → `service_plans` | |
| `coverage_status` | `text` CHECK | `unknown` · `covered` · `needs_build` · `no_coverage` |
| `nearest_element_id` | `uuid` → `network_elements` | NAP o sectorial más cercano |
| `status` | `text` CHECK | `new` · `contacted` · `quoted` · `scheduled` · `converted` · `lost` |
| `lost_reason` | `text` CHECK | `no_coverage` · `price` · `competitor` · `no_answer` · `other` |
| `converted_customer_id` | `uuid` → `customers` | |

#### `customers`

| Campo | Tipo | Notas |
|---|---|---|
| `customer_code` | `text` UNIQUE por org | Folio visible, correlativo |
| `full_name` | `text` NOT NULL | |
| `phone` | `text` NOT NULL | |
| `phone_alt`, `email` | `text` | |
| `tax_id` | `text` | RFC, solo si pide factura |
| `zone_id` | `uuid` → `zones` NOT NULL | **Define quién lo ve** |
| `status` | `text` CHECK | `active` · `suspended` · `overdue` · `cancelled` |
| `billing_day` | `integer` por omisión 1 | Por si algún día se personaliza |
| `notes` | `text` | |
| `legacy_id` | `text` | El ID que traía en el Excel |
| `import_batch_id` | `uuid` → `import_batches` | De qué importación vino |
| `price_review_needed` | `boolean` | **Los 167 sin precio entran con esto en `true`** |

#### `addresses`
Un cliente puede tener varias (instalación, cobro, correspondencia).

| Campo | Tipo | Notas |
|---|---|---|
| `customer_id` | `uuid` → `customers` | |
| `type` | `text` CHECK | `installation` · `billing` · `other` |
| `street`, `number`, `neighborhood`, `city`, `state`, `postal_code` | `text` | |
| `reference` | `text` | "Casa azul, frente a la tienda" — en el campo esto vale más que la calle |
| `latitude`, `longitude` | `numeric(10,7)` | |
| `gps_accuracy_m` | `numeric(6,2)` | Precisión que reportó el SUNMI |
| `is_primary` | `boolean` | |

#### `contracts`

| Campo | Tipo | Notas |
|---|---|---|
| `customer_id` | `uuid` → `customers` | |
| `contract_number` | `text` UNIQUE | |
| `plan_id` | `uuid` → `service_plans` | |
| `start_date`, `end_date` | `date` | |
| `status` | `text` CHECK | `draft` · `active` · `expired` · `cancelled` |
| `pdf_url` | `text` | Storage |
| `signature_id` | `uuid` → `customer_signatures` | |
| `signed_at` | `timestamptz` | |

#### `customer_services`
**El corazón del sistema.** Un cliente puede tener más de un servicio.

| Campo | Tipo | Notas |
|---|---|---|
| `customer_id` | `uuid` → `customers` | |
| `contract_id` | `uuid` → `contracts` | |
| `plan_id` | `uuid` → `service_plans` NOT NULL | |
| `custom_price` | `numeric(12,2)` | **Precio heredado.** Si es nulo, manda el del plan |
| `address_id` | `uuid` → `addresses` | Dónde está instalado |
| `network_type` | `text` CHECK | `ftth` · `wisp` |
| `equipment_unit_id` | `uuid` → `equipment_units` | La ONU o el CPE instalado |
| `pon_port_id` | `uuid` → `pon_ports` | Si es FTTH |
| `network_element_id` | `uuid` → `network_elements` | De qué NAP cuelga |
| `parent_device_id` | `uuid` → `network_devices` | De qué sectorial cuelga, si es WISP |
| `ip_address` | `inet` | |
| `vlan` | `integer` | |
| `wifi_ssid` | `text` | |
| `wifi_password` | `text` | Ver sección 7, datos protegidos |
| `status` | `text` CHECK | `pending` · `active` · `suspended` · `cancelled` |
| `activated_at`, `suspended_at`, `cancelled_at` | `timestamptz` | |

---

### GRUPO C · Cobranza

#### `billing_periods`
Un renglón por mes. Es lo que hace que la cobranza sea auditable.

| Campo | Tipo | Notas |
|---|---|---|
| `year`, `month` | `integer` | |
| `label` | `text` | `2026-07` |
| `due_date` | `date` | **Día 5** |
| `grace_end_date` | `date` | **Día 10** |
| `cutoff_date` | `date` | **Día 11** |
| `status` | `text` CHECK | `open` · `closed` |
| `generated_at` | `timestamptz` | Cuándo se generaron los cargos |
| `closed_at` | `timestamptz` | |

#### `charges`
Todo lo que se le cobra al cliente. **No solo mensualidades.**

| Campo | Tipo | Notas |
|---|---|---|
| `customer_id` | `uuid` → `customers` | |
| `service_id` | `uuid` → `customer_services` | Nulo si no es de un servicio |
| `period_id` | `uuid` → `billing_periods` | Nulo si es un cargo suelto |
| `type` | `text` CHECK | `monthly` · `reconnection` · `installation` · `equipment_loss` · `other` |
| `description` | `text` | |
| `amount` | `numeric(12,2)` NOT NULL | |
| `balance` | `numeric(12,2)` NOT NULL | Lo que falta por pagar |
| `due_date` | `date` | |
| `status` | `text` CHECK | `pending` · `partial` · `paid` · `cancelled` |
| `cancelled_by`, `cancelled_reason` | `uuid`, `text` | **Solo administrador** |

Los tres cargos automáticos del alcance:
`reconnection` = **$30** · `equipment_loss` = **$550** · `monthly` = precio del servicio.

#### `payments`

| Campo | Tipo | Notas |
|---|---|---|
| `receipt_number` | `text` UNIQUE por org | Folio del recibo |
| `customer_id` | `uuid` → `customers` | |
| `zone_id` | `uuid` → `zones` | Copiado del cliente, para reportes rápidos |
| `amount` | `numeric(12,2)` NOT NULL CHECK > 0 | |
| `method` | `text` CHECK | `cash` · `transfer` |
| `reference` | `text` | Referencia de la transferencia |
| `paid_at` | `timestamptz` NOT NULL | Cuándo pagó |
| `received_by` | `uuid` → `profiles` NOT NULL | **Quién lo recibió** |
| `cash_session_id` | `uuid` → `cash_sessions` | En qué corte de caja entra |
| `collected_in_field` | `boolean` | Cobro en campo o en oficina |
| `latitude`, `longitude` | `numeric(10,7)` | Dónde se cobró, si fue en campo |
| `status` | `text` CHECK | `applied` · `cancelled` |
| `cancelled_by`, `cancelled_at`, `cancelled_reason` | | **Solo administrador** |
| `device_synced_at` | `timestamptz` | Cuándo llegó del SUNMI |
| `client_uuid` | `uuid` UNIQUE | **Lo genera el teléfono.** Evita pagos duplicados al sincronizar |

> **`client_uuid` es importante.** Sin él, un cobrador con mala señal puede terminar
> registrando el mismo pago dos veces. Con él, la base rechaza el duplicado sola.

#### `payment_allocations`
A qué cargos se aplicó cada pago. Permite pagos parciales y adelantados.

| Campo | Tipo |
|---|---|
| `payment_id` | `uuid` → `payments` |
| `charge_id` | `uuid` → `charges` |
| `amount` | `numeric(12,2)` |

#### `cash_sessions` — *el corte de caja*

| Campo | Tipo | Notas |
|---|---|---|
| `collector_id` | `uuid` → `profiles` NOT NULL | |
| `zone_id` | `uuid` → `zones` | |
| `opened_at`, `closed_at` | `timestamptz` | |
| `expected_cash` | `numeric(12,2)` | Lo que suma el sistema |
| `expected_transfer` | `numeric(12,2)` | |
| `declared_cash` | `numeric(12,2)` | Lo que el cobrador dice traer |
| `difference` | `numeric(12,2)` | Generada: declarado − esperado |
| `payment_count` | `integer` | |
| `status` | `text` CHECK | `open` · `closed` · `delivered` · `verified` |
| `delivered_to` | `uuid` → `profiles` | Quién recibió el dinero |
| `verified_at` | `timestamptz` | |
| `notes` | `text` | Obligatorio si hay diferencia |

#### `service_suspensions`
Historial de cortes y reconexiones. Sirve para saber a quién se le corta seguido.

| Campo | Tipo | Notas |
|---|---|---|
| `service_id` | `uuid` → `customer_services` | |
| `suspended_at`, `reactivated_at` | `timestamptz` | |
| `reason` | `text` CHECK | `overdue` · `requested` · `technical` · `other` |
| `method` | `text` CHECK | `manual` · `agent` — **en el MVP siempre `manual`** |
| `suspended_by`, `reactivated_by` | `uuid` → `profiles` | |
| `reconnection_charge_id` | `uuid` → `charges` | El cargo de $30 |

#### `receipts`

| Campo | Tipo |
|---|---|
| `payment_id` | `uuid` → `payments` |
| `receipt_number` | `text` |
| `pdf_url` | `text` |
| `sent_to`, `sent_at` | `text`, `timestamptz` |

---

### GRUPO D · Inventario

#### `inventory_items` — *el catálogo*

| Campo | Tipo | Notas |
|---|---|---|
| `sku` | `text` UNIQUE | |
| `name` | `text` NOT NULL | |
| `category` | `text` CHECK | `ont` · `cpe` · `router` · `drop_cable` · `connector` · `outlet` · `patchcord` · `splitter` · `other` |
| `unit` | `text` CHECK | `piece` · `meter` · `roll` |
| `is_serialized` | `boolean` | Si lleva número de serie |
| `min_stock` | `numeric(12,2)` | Para la alerta |
| `cost` | `numeric(12,2)` | **Sensible.** Oculto a técnico y almacén |
| `brand`, `model` | `text` | |

#### `inventory_stock`
Existencias por ubicación. Una fila por artículo y por lugar.

| Campo | Tipo | Notas |
|---|---|---|
| `item_id` | `uuid` → `inventory_items` | |
| `location_type` | `text` CHECK | `branch` · `technician` · `vehicle` |
| `location_id` | `uuid` | Sucursal o persona |
| `quantity` | `numeric(12,2)` | |

Único por `(item_id, location_type, location_id)`.

#### `equipment_units` — *equipos con número de serie*

| Campo | Tipo | Notas |
|---|---|---|
| `item_id` | `uuid` → `inventory_items` | |
| `serial_number` | `text` UNIQUE por org NOT NULL | |
| `gpon_serial` | `text` | El de la ONU, ya limpio |
| `mac_address` | `macaddr` | |
| `brand`, `model`, `firmware` | `text` | |
| `status` | `text` CHECK | `in_stock` · `assigned` · `installed` · `repair` · `lost` · `retired` |
| `location_type`, `location_id` | | Dónde está ahora |
| `customer_id` | `uuid` → `customers` | Si está instalado |
| `installed_at`, `removed_at` | `timestamptz` | |
| `install_count` | `integer` | Cuántas veces se ha reinstalado |

#### `inventory_movements`
Todo movimiento queda. Nada se edita hacia atrás.

| Campo | Tipo | Notas |
|---|---|---|
| `item_id` | `uuid` → `inventory_items` | |
| `equipment_unit_id` | `uuid` → `equipment_units` | Si es serializado |
| `quantity` | `numeric(12,2)` | |
| `movement_type` | `text` CHECK | `purchase` · `transfer` · `install` · `return` · `adjustment` · `loss` |
| `from_type`, `from_id` / `to_type`, `to_id` | | Origen y destino |
| `work_order_id` | `uuid` → `work_orders` | Si vino de una orden |
| `reason` | `text` | |
| `performed_by` | `uuid` → `profiles` NOT NULL | |

---

### GRUPO E · Red

#### `network_sites`
Sitios físicos: caseta de OLT, torres.

| Campo | Tipo | Notas |
|---|---|---|
| `name` | `text` | "Torre Cuencamé Centro" |
| `type` | `text` CHECK | `olt_site` · `tower` · `pop` · `other` |
| `zone_id` | `uuid` → `zones` | |
| `latitude`, `longitude`, `elevation_m` | `numeric` | |
| `height_m` | `numeric(6,2)` | Altura de la torre |
| `access_notes` | `text` | Llaves, permisos, quién abre |

#### `network_devices`
OLT, MikroTik, sectoriales, switches. Todo lo administrable.

| Campo | Tipo | Notas |
|---|---|---|
| `name` | `text` NOT NULL | `OLT_HUAWEI_CUENCAME` |
| `device_type` | `text` CHECK | `olt` · `router` · `switch` · `sector` · `ap` · `server` |
| `vendor` | `text` | `huawei` · `vsol` · `mikrotik` · `ubiquiti` |
| `model` | `text` | `EA5800-X2`, `CCR2004`, `Rocket 5AC` |
| `site_id` | `uuid` → `network_sites` | |
| `zone_id` | `uuid` → `zones` | |
| `mgmt_ip` | `inet` | `172.28.69.253` |
| `mac_address` | `macaddr` | |
| `firmware` | `text` | |
| `uisp_id` | `text` | Su identificador en UISP |
| `credentials_ref` | `text` | **Nombre de la variable de entorno en el agente. Nunca la contraseña** |
| `latitude`, `longitude` | `numeric(10,7)` | |
| `azimuth`, `tilt`, `beam_width` | `numeric` | Solo sectoriales |
| `status` | `text` CHECK | `online` · `offline` · `unknown` · `maintenance` |
| `last_seen_at` | `timestamptz` | |
| `config_backup_url`, `config_backup_at` | `text`, `timestamptz` | |

> **Las contraseñas de los equipos no se guardan aquí ni en ningún lado de la base.** Solo
> queda el *nombre* de la variable de entorno que el agente local lee de su propio archivo.
> Si alguien se lleva un respaldo completo de la base, no se lleva ni un acceso.

#### `olt_cards` y `pon_ports`

`olt_cards`: `device_id`, `slot_number`, `card_type`, `port_count`, `status`.

`pon_ports`:

| Campo | Tipo | Notas |
|---|---|---|
| `card_id` | `uuid` → `olt_cards` | |
| `port_number` | `integer` | **VSOL 1–16 · Huawei 0–15** |
| `port_index` | `integer` | El índice calculado por marca — ya resuelto |
| `max_onus` | `integer` | Normalmente 128 |
| `used_onus` | `integer` | |
| `status` | `text` CHECK | `up` · `down` · `disabled` |

#### `network_elements`
NAP, cierres, splitters, postes, rosetas.

| Campo | Tipo | Notas |
|---|---|---|
| `element_type` | `text` CHECK | `nap` · `closure` · `splitter` · `pole` · `hand_hole` |
| `code` | `text` UNIQUE por org | `NAP-CUE-018` |
| `zone_id` | `uuid` → `zones` | |
| `parent_element_id` | `uuid` → `network_elements` | De qué cuelga |
| `pon_port_id` | `uuid` → `pon_ports` | A qué puerto llega |
| `latitude`, `longitude` | `numeric(10,7)` | |
| `capacity`, `used_ports` | `integer` | 8, 16… |
| `split_ratio` | `text` | `1:8`, `1:16` |
| `insertion_loss_db` | `numeric(5,2)` | |
| `otdr_distance_m`, `real_distance_m` | `numeric(10,2)` | Con las guardas ya resueltas |
| `installed_at` | `date` | |
| `photo_url` | `text` | |

#### `fiber_links`
Tramos de fibra entre dos elementos.

| Campo | Tipo | Notas |
|---|---|---|
| `from_element_id`, `to_element_id` | `uuid` → `network_elements` | |
| `cable_type` | `text` | `ADSS 12F`, `Drop 1F` |
| `fiber_count` | `integer` | |
| `fiber_color` | `text` | Código TIA-598 |
| `length_m` | `numeric(10,2)` | |
| `loss_db` | `numeric(5,2)` | |
| `path` | `jsonb` | Puntos del trazo para el mapa |

#### `device_readings`
Histórico de señal. **La tabla que más va a crecer.**

| Campo | Tipo | Notas |
|---|---|---|
| `device_id` | `uuid` → `network_devices` | |
| `equipment_unit_id` | `uuid` → `equipment_units` | Si es de una ONU o CPE |
| `service_id` | `uuid` → `customer_services` | |
| `read_at` | `timestamptz` NOT NULL | |
| `source` | `text` CHECK | `uisp` · `snmp` · `telnet` · `adminolt` · `manual` |
| `rx_power_dbm`, `tx_power_dbm` | `numeric(6,2)` | Óptica |
| `signal_dbm`, `noise_floor_dbm`, `ccq` | `numeric(6,2)` | Radio, de UISP |
| `uptime_seconds` | `bigint` | |
| `status` | `text` | `online` · `offline` |

> **Cuidado con el volumen.** 206 CPE + 158 ONU leídos cada 5 minutos son ~105,000 renglones
> al día. Dos medidas desde el principio: **particionar por mes** y **guardar solo cuando el
> valor cambia más de un umbral**. Con eso el histórico de un año es manejable. Además: los
> datos con más de 90 días se resumen a promedios por hora y se borran los crudos.

---

### GRUPO F · Operación

#### `work_orders`

| Campo | Tipo | Notas |
|---|---|---|
| `order_number` | `text` UNIQUE por org | `OI-0001` |
| `type` | `text` CHECK | `installation` · `relocation` · `removal` · `maintenance` · `repair` |
| `customer_id` | `uuid` → `customers` | |
| `service_id` | `uuid` → `customer_services` | |
| `ticket_id` | `uuid` → `tickets` | Si viene de un reporte |
| `zone_id` | `uuid` → `zones` | |
| `status` | `text` CHECK | `draft` · `scheduled` · `in_progress` · `completed` · `cancelled` |
| `priority` | `text` CHECK | `low` · `normal` · `high` · `urgent` |
| `scheduled_for` | `timestamptz` | |
| `started_at`, `completed_at` | `timestamptz` | |
| `reserved_element_id` | `uuid` → `network_elements` | NAP apartada |
| `reserved_port` | `integer` | |
| `description`, `resolution_notes` | `text` | |
| `client_uuid` | `uuid` UNIQUE | Para sincronizar desde el SUNMI |

> **Regla de cierre.** Un disparador impide pasar a `completed` si no hay al menos una foto,
> una lectura de potencia y una firma. Se valida en la base, no en la app: así ni un error de
> programación ni una app vieja pueden saltárselo.

#### `work_order_assignments`

`work_order_id` · `technician_id` → `profiles` · `role` (`lead` · `helper`) ·
`assigned_at` · `accepted_at`

#### `work_order_photos`

| Campo | Tipo | Notas |
|---|---|---|
| `work_order_id` | `uuid` | |
| `photo_type` | `text` CHECK | `facade` · `installation` · `equipment` · `reading` · `other` |
| `storage_path` | `text` NOT NULL | Supabase Storage |
| `latitude`, `longitude` | `numeric(10,7)` | Dónde se tomó |
| `taken_at` | `timestamptz` | |
| `taken_by` | `uuid` → `profiles` | |
| `file_size_bytes` | `integer` | |

#### `work_order_materials`

`work_order_id` · `item_id` · `equipment_unit_id` · `quantity` · `movement_id`

#### `installation_readings`

| Campo | Tipo | Notas |
|---|---|---|
| `work_order_id` | `uuid` | |
| `reading_point` | `text` CHECK | `nap` · `ont` · `cpe` |
| `rx_power_dbm`, `tx_power_dbm` | `numeric(6,2)` | |
| `signal_dbm` | `numeric(6,2)` | WISP |
| `is_acceptable` | `boolean` | Generada: entre −25 y −8 dBm |
| `measured_at` | `timestamptz` | |

#### `customer_signatures`

| Campo | Tipo | Notas |
|---|---|---|
| `customer_id` | `uuid` | |
| `work_order_id`, `contract_id` | `uuid` | |
| `purpose` | `text` CHECK | `installation` · `contract` · `equipment_receipt` · `equipment_return` |
| `signature_url` | `text` | PNG en Storage |
| `signer_name` | `text` | Quién firmó, si no fue el titular |
| `signed_at` | `timestamptz` | |
| `latitude`, `longitude` | `numeric(10,7)` | |

#### `tickets`

| Campo | Tipo | Notas |
|---|---|---|
| `ticket_number` | `text` UNIQUE por org | |
| `customer_id`, `service_id`, `zone_id` | `uuid` | |
| `category` | `text` CHECK | `no_service` · `slow` · `intermittent` · `equipment` · `billing` · `other` |
| `priority` | `text` CHECK | `low` · `normal` · `high` · `urgent` |
| `status` | `text` CHECK | `open` · `assigned` · `in_progress` · `waiting` · `resolved` · `closed` |
| `assigned_to` | `uuid` → `profiles` | |
| `parent_incident_id` | `uuid` → `tickets` | **Para agrupar cuando se cae una NAP** |
| `root_cause` | `text` CHECK | `fiber_cut` · `dirty_connector` · `equipment_failure` · `power` · `configuration` · `customer_side` · `false_alarm` |
| `opened_at`, `resolved_at`, `closed_at` | `timestamptz` | |

#### `ticket_comments`

`ticket_id` · `author_id` · `body` · `is_internal` (el cliente no ve los internos) ·
`attachment_url`

---

### GRUPO G · Sistema

#### `settings`
Todos los parámetros del alcance viven aquí, no en el código.

| Clave | Valor inicial |
|---|---|
| `billing.due_day` | `5` |
| `billing.grace_days` | `5` |
| `billing.cutoff_day` | `11` |
| `billing.reconnection_fee` | `30.00` |
| `billing.equipment_loss_fee` | `550.00` |
| `billing.advance_payment` | `true` |
| `wifi.ssid_format` | `ZUUUM_FIBRA_{last4}` |
| `wifi.password_format` | `ZF{last4}{random4}` |
| `optical.rx_min_dbm` | `-25.0` |
| `optical.rx_max_dbm` | `-8.0` |
| `otdr.guard_site_m` / `guard_pole_m` / `guard_box_m` | `50` / `20` / `20` |

#### `notifications`

`user_id` · `customer_id` · `channel` (`in_app` · `email` · `push` · `whatsapp`) ·
`type` · `title` · `body` · `data` (`jsonb`) · `read_at` · `sent_at` · `status`

#### `audit_logs`

| Campo | Tipo | Notas |
|---|---|---|
| `table_name`, `record_id` | `text`, `uuid` | |
| `action` | `text` CHECK | `insert` · `update` · `delete` |
| `old_values`, `new_values` | `jsonb` | Solo los campos que cambiaron |
| `user_id` | `uuid` | |
| `ip_address` | `inet` | |
| `user_agent`, `device_id` | `text` | |
| `created_at` | `timestamptz` | |

Se llena con disparadores, no desde la aplicación. Así no se puede evitar.
**Nadie puede modificarla ni borrarla, ni el propietario.** Solo lectura.

#### `attachments`
Archivos sueltos: identificación, comprobante, croquis.

`entity_type` · `entity_id` · `file_name` · `storage_path` · `mime_type` · `size_bytes`

#### `import_batches`
Cada importación de Excel queda registrada, con la posibilidad de deshacerla.

`source_file` · `row_count` · `created_count` · `updated_count` · `error_count` ·
`errors` (`jsonb`) · `status` · `imported_by`

---

## 4. Índices

Además de las llaves primarias y foráneas:

```
customers          (org_id, zone_id, status)          ← la consulta más común
customers          (org_id, customer_code)
customers          búsqueda de texto sobre full_name  ← trigram, para buscar con errores
customer_services  (customer_id, status)
customer_services  (pon_port_id) · (network_element_id)
charges            (customer_id, status) · (period_id, status)
payments           (customer_id, paid_at DESC)
payments           (zone_id, paid_at DESC)            ← reportes por zona
payments           (cash_session_id)
payments           (client_uuid) UNIQUE               ← evita duplicados al sincronizar
work_orders        (status, scheduled_for)
work_orders        (zone_id, status)
tickets            (status, priority, opened_at DESC)
equipment_units    (serial_number) UNIQUE · (gpon_serial) · (customer_id)
device_readings    (equipment_unit_id, read_at DESC)  ← particionada por mes
network_elements   (zone_id, element_type)
audit_logs         (table_name, record_id, created_at DESC)
```

---

## 5. Seguridad a nivel de renglón (RLS)

**Activo en todas las tablas.** Sin excepción. Si a alguien se le olvida activarlo en una tabla
nueva, esa tabla queda expuesta — por eso va como paso obligatorio en cada migración.

### Cómo funciona

Tres funciones auxiliares, marcadas `security definer`:

```
auth_org_id()          → la organización del usuario que está pidiendo
auth_has(permission)   → ¿tiene ese permiso, por rol o individual?
auth_zones()           → lista de zonas que puede ver (vacía = todas, si su rol es 'all')
```

### Las políticas, en palabras

| Tabla | Quién puede leer | Quién puede escribir |
|---|---|---|
| `customers` | Misma org **y** (alcance total **o** el cliente está en sus zonas) | `customers.write` |
| `payments` | `payments.read` **y** su zona | `payments.create`; **cancelar solo `payments.cancel`, que solo tiene el administrador** |
| `charges` | igual que pagos | solo el sistema y el administrador |
| `cash_sessions` | El cobrador ve **las suyas**; oficina y admin ven las de sus zonas | El cobrador abre y cierra las suyas |
| `work_orders` | Alcance total, o su zona, o **asignadas a él** | El técnico solo las suyas y solo mientras están `in_progress` |
| `inventory_items` | Todos los internos… | …pero **`cost` se oculta** con una vista aparte |
| `service_plans` | Todos | `plans.write` |
| `network_devices` | `network.read` | `network.write`. **`credentials_ref` nunca sale al cliente web** |
| `audit_logs` | `audit.read` | **Nadie.** Ni actualizar ni borrar |
| `profiles` | El suyo siempre; los demás con `users.read` | El suyo; los demás con `users.write` |
| Todo lo del cliente | El cliente ve **solo lo suyo**, ligado por su `auth.uid()` | Nada, salvo abrir tickets |

### Las tres pruebas que tienen que pasar antes de dar por buena la etapa 3

1. **Un técnico consulta `payments`** → devuelve **cero renglones**. No error: cero. Ni siquiera
   debe saber que existen.
2. **Un cobrador de Velardeña consulta `customers`** → devuelve **207**, no 1,102.
3. **Un administrador intenta darle `finance.read` a un técnico** → la base **rechaza** la
   operación.

Si alguna falla, la etapa no está terminada.

---

## 6. Reglas de borrado

| Relación | Regla | Por qué |
|---|---|---|
| `customers` → `payments` | **RESTRICT** | Jamás se borra un cliente con pagos. Se da de baja |
| `customers` → `customer_services` | CASCADE en baja lógica | |
| `work_orders` → fotos, materiales, lecturas, firmas | CASCADE | No sirven sin su orden |
| `zones` → `customers` | **RESTRICT** | No se borra una zona con clientes |
| `service_plans` → `customer_services` | **RESTRICT** | Un plan en uso no se borra; se marca `is_active = false` |
| `profiles` → todo lo que creó | **SET NULL** en `created_by` | Se va una persona, no se pierde el historial |
| `inventory_items` → movimientos | **RESTRICT** | El histórico no se toca |
| `equipment_units` → `customer_services` | **SET NULL** | Se retira el equipo, el servicio sigue |

---

## 7. Datos protegidos

| Dato | Cómo se maneja |
|---|---|
| **Contraseñas de usuarios** | Nunca en nuestras tablas. Las guarda Supabase Auth |
| **Contraseñas de OLT y MikroTik** | **Nunca en la base.** Solo el nombre de la variable de entorno del agente local |
| **Token de UISP** | Solo en el agente local |
| **Contraseña de WiFi del cliente** | En la base, pero visible solo con `services.read_credentials`. Oficina y técnicos asignados sí; nadie más |
| **Costos de inventario** | Columna `cost` fuera de la vista que usan técnico y almacén |
| **Coordenadas de clientes** | Solo para quien tiene alcance en esa zona |
| **Ubicación del técnico** | Solo durante su turno; visible para supervisor y admin |
| **Fotos y firmas** | Storage con políticas iguales a las de la tabla que las referencia. **Nada público** |

**Cifrado:** Supabase cifra en reposo y en tránsito. No hace falta cifrar columna por columna
para este caso — lo que sí hace falta es **no guardar lo que no debe estar** (las contraseñas
de los equipos), que es más efectivo que cifrarlas.

---

## 8. Historial de cambios

Tres capas:

1. **`audit_logs`** — quién cambió qué, con valor anterior y nuevo. Por disparador, en todas
   las tablas que importan.
2. **Tablas de historial propias** donde el histórico *es* el dato: `service_suspensions`,
   `inventory_movements`, `device_readings`, `payment_allocations`.
3. **Campos de rastro** en cada tabla: `created_by`, `updated_by`, `created_at`, `updated_at`.

Nada se sobrescribe en silencio.

---

## 9. Respaldos

| Capa | Qué | Cuándo | Se guarda |
|---|---|---|---|
| Supabase automático | Base completa | Diario (Pro: cada hora) | 7 días (Pro: 30) |
| Exportación propia | `pg_dump` completo | Diario, en el servidor Ubuntu | 30 días |
| Fuera de sitio | Copia cifrada | Semanal | 6 meses |
| Storage | Fotos y PDF | Semanal | 3 meses |

**Prueba de restauración cada tres meses.** Un respaldo que nunca se ha restaurado no es un
respaldo: es una suposición. Se restaura en limpio y se verifica que los 1,102 clientes estén
completos.

---

## 10. Orden de las migraciones

```
001  extensiones (uuid, pgcrypto, pg_trgm) + funciones auxiliares
002  organizations · branches · zones
003  profiles · roles · permissions · role_permissions
004  user_roles · user_permissions · user_zones + el candado de permisos sensibles
005  settings
006  service_plans · customers · addresses · contracts · customer_services
007  prospects
008  billing_periods · charges · payments · payment_allocations
009  cash_sessions · receipts · service_suspensions
010  inventory_items · inventory_stock · equipment_units · inventory_movements
011  network_sites · network_devices · olt_cards · pon_ports
012  network_elements · fiber_links
013  device_readings (particionada por mes)
014  work_orders + assignments, photos, materials, readings, signatures
015  tickets · ticket_comments
016  notifications · attachments · import_batches
017  audit_logs + disparadores de auditoría
018  políticas RLS de todas las tablas
019  vistas e índices de reportes
020  datos semilla: roles, permisos, las 12 zonas, ajustes iniciales
```

Cada migración corre sola y se puede repetir sin romper nada.

---

## 11. Antes de programar, dime

1. **`zones` o `communities`.** Cambié el nombre porque son zonas de cobranza. ¿De acuerdo?
2. **Un cliente puede tener dos servicios** (por ejemplo casa y negocio). Lo dejé abierto.
   ¿Pasa en la práctica?
3. **Los folios.** ¿Correlativo por organización (`OI-0001`) o por zona (`OI-CUE-0001`)?
   Por zona ayuda a que cada cobrador reconozca lo suyo.
4. **`device_readings`.** Propongo guardar solo cuando la señal cambia más de 1 dBm, y resumir
   a promedios por hora después de 90 días. ¿Te parece, o quieres el crudo completo?
5. **Prueba de aceptación.** Antes de la migración quiero cargar los 1,102 clientes en una base
   de prueba y cuadrar los totales contra el Excel. ¿Lo hacemos así?

---

*Cuando esto esté aprobado, se escribe el SQL. Ni un `CREATE TABLE` antes.*
