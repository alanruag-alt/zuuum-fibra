export interface Poste {
  id: string;
  number: number | null;
  code: string | null;
  sort_order: number | null;
  latitude: number | null;
  longitude: number | null;
  pole_type: string;
  height_m: number | null;
  is_new: boolean;
  span_m: number | null;
  notes: string | null;
  is_active: boolean;
  cable_id: string | null;
  cable: string | null;
  zone_id: string | null;
  zona: string | null;
  viene_de: number | null;
}

export interface Plano {
  id: string;
  name: string;
  zone_id: string | null;
  config: ConfigPlano;
  updated_at: string;
}

/** Lo que va impreso en la hoja de CFE. */
export interface ConfigPlano {
  hoja?: 'carta' | 'tabloide';
  concesionario?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  proyecto?: string;
  tipo_fibra?: string;
  tipo_solicitud?: string;
  ubicacion?: string;
  dependencia?: string;
  emision?: string;
  acotacion?: string;
  dibujo?: string;
  representante?: string;
  autoriza?: string;
  id_proyecto?: string;
  postes_nuevos?: string;
  plano_num?: number;
  plano_total?: number;
  notas?: string;
  cable_id?: string | null;
}

export const PLANO_POR_DEFECTO: ConfigPlano = {
  hoja: 'carta',
  proyecto: 'TENDIDO DE FIBRA ÓPTICA',
  tipo_fibra: 'ADSS 12, 24 Y 48 HILOS',
  tipo_solicitud: 'RENTA DE POSTERÍA ANTE LA CFE',
  dependencia: 'CFE',
  acotacion: 'METROS',
  autoriza: 'CFE',
  plano_num: 1,
  plano_total: 1,
  notas:
    'NOTAS:\n1.- ACOTACIONES EN METROS.\n2.- LA FIBRA SE INSTALA EN POSTERÍA EXISTENTE DE CFE.',
};

export const TIPO_POSTE: Record<string, string> = {
  cfe_concreto: 'CFE · concreto',
  cfe_madera: 'CFE · madera',
  propio: 'Propio',
  telmex: 'Telmex',
  otro: 'Otro',
};
