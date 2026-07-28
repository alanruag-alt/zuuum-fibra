export interface ElementoMenu {
  id: string;
  etiqueta: string;
  ruta: string;
  icono: string;
  /** Permiso mínimo para verlo. Si es null, lo ve cualquier sesión. */
  permiso: string | null;
  /** Módulos que todavía no existen se dibujan apagados. */
  listo: boolean;
}

export interface GrupoMenu {
  titulo: string;
  elementos: ElementoMenu[];
}
