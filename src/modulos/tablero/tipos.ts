export interface ResumenTablero {
  clientesActivos: number;
  clientesMorosos: number;
  onuEnLinea: number;
  onuFueraDeLinea: number;
  senalARevisar: number;
  instalacionesHoy: number;
  ticketsAbiertos: number;
  cobradoDelMes: number;
  esperadoDelMes: number;
}

export interface FilaZona {
  id: string;
  nombre: string;
  clientes: number;
  cobrados: number;
  esperado: number;
  cobrado: number;
}

export interface Actividad {
  id: string;
  cuando: string;
  quien: string;
  texto: string;
  tipo: 'alta' | 'pago' | 'orden' | 'ticket' | 'red';
}

export interface Pendiente {
  id: string;
  titulo: string;
  detalle: string;
  gravedad: 'alta' | 'media' | 'baja';
}
