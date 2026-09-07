"use client";

import { reportarQuiebra } from "@/modulos/quiebra/acciones";
import { avanzarConTeclado } from "@/lib/teclado";

type Opcion = { id: string; etiqueta: string };

export function FormQuiebra({
  productos,
  bodegas,
  causas,
}: {
  productos: Opcion[];
  bodegas: Opcion[];
  causas: Opcion[];
}) {
  return (
    <form
      action={reportarQuiebra}
      onKeyDown={avanzarConTeclado}
      className="tarjeta space-y-4"
    >
      <div>
        <label className="etiqueta">Producto averiado *</label>
        <select name="producto_id" className="campo" required autoFocus>
          <option value="">Selecciona…</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="etiqueta">Bodega *</label>
          <select name="bodega_id" className="campo" required>
            <option value="">Selecciona…</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="etiqueta">Cantidad averiada *</label>
          <input
            name="cantidad"
            type="number"
            step="0.001"
            min="0.001"
            className="campo"
            placeholder="0"
            required
          />
        </div>

        <div>
          <label className="etiqueta">Causa</label>
          <select name="causa_id" className="campo">
            <option value="">Sin especificar</option>
            {causas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="etiqueta">Lote o fecha de vencimiento</label>
          <input name="lote" className="campo" placeholder="Opcional" />
        </div>
      </div>

      <div>
        <label className="etiqueta">Qué pasó</label>
        <textarea
          name="nota"
          className="campo min-h-24"
          placeholder="Describe brevemente cómo se produjo la avería"
        />
      </div>

      <div className="flex gap-3">
        <button className="btn-primario">Reportar avería</button>
      </div>

      <p className="text-xs text-bv-texto-2">
        Queda registrado a tu nombre y con la fecha y hora actuales.
      </p>
    </form>
  );
}
