/**
 * Se dibuja en toda pantalla que todavía usa datos inventados.
 * Desaparece cuando el módulo se conecta a la base de verdad.
 */
export function AvisoDatosSimulados() {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-naranja-200 bg-naranja-50 p-3 text-sm text-naranja-900">
      <span aria-hidden="true">⚠</span>
      <p>
        <strong>Datos simulados.</strong> Nada de lo que se ve aquí es real: son cifras inventadas
        para probar el diseño. Ningún dato de clientes de ZUUUM está cargado todavía.
      </p>
    </div>
  );
}
