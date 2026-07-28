/**
 * DATOS INVENTADOS. Ni un solo dato real de ZUUUM.
 * Los nombres de persona son ficticios a propósito.
 *
 * Este archivo se borra cuando el módulo se conecte a Supabase.
 */

import type { Actividad, FilaZona, Pendiente, ResumenTablero } from '@/modulos/tablero/tipos';

export const RESUMEN: ResumenTablero = {
  clientesActivos: 1180,
  clientesMorosos: 42,
  onuEnLinea: 168,
  onuFueraDeLinea: 7,
  senalARevisar: 12,
  instalacionesHoy: 5,
  ticketsAbiertos: 9,
  cobradoDelMes: 318400,
  esperadoDelMes: 402150,
};

export const ZONAS: FilaZona[] = [
  {
    id: 'z1',
    nombre: 'Zona Norte',
    clientes: 290,
    cobrados: 268,
    esperado: 101500,
    cobrado: 93800,
  },
  {
    id: 'z2',
    nombre: 'Zona Centro',
    clientes: 210,
    cobrados: 199,
    esperado: 82300,
    cobrado: 78000,
  },
  { id: 'z3', nombre: 'Zona Sur', clientes: 158, cobrados: 141, esperado: 59400, cobrado: 53000 },
  {
    id: 'z4',
    nombre: 'Zona Oriente',
    clientes: 112,
    cobrados: 108,
    esperado: 37900,
    cobrado: 36550,
  },
  {
    id: 'z5',
    nombre: 'Zona Poniente',
    clientes: 101,
    cobrados: 88,
    esperado: 40200,
    cobrado: 35100,
  },
  { id: 'z6', nombre: 'Zona Sierra', clientes: 78, cobrados: 74, esperado: 28100, cobrado: 26700 },
];

export const ACTIVIDAD: Actividad[] = [
  {
    id: 'a1',
    cuando: 'hace 12 min',
    quien: 'Usuario de prueba 1',
    texto: 'Registró un pago de $450',
    tipo: 'pago',
  },
  {
    id: 'a2',
    cuando: 'hace 34 min',
    quien: 'Usuario de prueba 2',
    texto: 'Cerró la orden OI-0184',
    tipo: 'orden',
  },
  {
    id: 'a3',
    cuando: 'hace 1 h',
    quien: 'Usuario de prueba 3',
    texto: 'Dio de alta un cliente nuevo',
    tipo: 'alta',
  },
  {
    id: 'a4',
    cuando: 'hace 2 h',
    quien: 'Sistema',
    texto: 'NAP-DEMO-07 dejó de responder',
    tipo: 'red',
  },
  {
    id: 'a5',
    cuando: 'hace 3 h',
    quien: 'Usuario de prueba 1',
    texto: 'Abrió el ticket TK-0091',
    tipo: 'ticket',
  },
];

export const PENDIENTES: Pendiente[] = [
  {
    id: 'p1',
    titulo: '7 ONU fuera de línea',
    detalle: 'Cuatro cuelgan de la misma NAP: puede ser un corte',
    gravedad: 'alta',
  },
  {
    id: 'p2',
    titulo: '42 clientes morosos',
    detalle: 'Se cortan el día 11 si no pagan',
    gravedad: 'alta',
  },
  {
    id: 'p3',
    titulo: '12 equipos con señal baja',
    detalle: 'Por debajo de −25 dBm',
    gravedad: 'media',
  },
  {
    id: 'p4',
    titulo: '3 cortes de caja sin entregar',
    detalle: 'De ayer, pendientes de verificar',
    gravedad: 'media',
  },
  {
    id: 'p5',
    titulo: '2 artículos bajo el mínimo',
    detalle: 'Conectores y rosetas',
    gravedad: 'baja',
  },
];
