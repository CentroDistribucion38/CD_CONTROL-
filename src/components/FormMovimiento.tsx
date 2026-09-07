"use client";

import { useState } from "react";
import { registrarMovimiento } from "@/modulos/inventario/acciones";

type Opcion = { id: string; etiqueta: string };

export function FormMovimiento({
  productos,
  bodegas,
}: {
  productos: Opcion[];
  bodegas: Opcion[];
}) {
  const [tipo, setTipo] = useState("entrada");

  return (
    <form action={registrarMovimiento} className="tarjeta grid gap-4 md:grid-cols-4">
      <div>
        <label className="etiqueta">Tipo *</label>
        <select
          name="tipo"
          className="campo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="entrada">Entrada</option>
          <option value="salida">Salida</option>
          <option value="ajuste">Ajuste (+/−)</option>
          <option value="traslado">Traslado</option>
        </select>
      </div>

      <div className="md:col-span-2">
        <label className="etiqueta">Producto *</label>
        <select name="producto_id" className="campo" required>
          <option value="">Selecciona…</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="etiqueta">
          {tipo === "traslado" ? "Bodega origen *" : "Bodega *"}
        </label>
        <select name="bodega_id" className="campo" required>
          <option value="">Selecciona…</option>
          {bodegas.map((b) => (
            <option key={b.id} value={b.id}>
              {b.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {tipo === "traslado" && (
        <div>
          <label className="etiqueta">Bodega destino *</label>
          <select name="bodega_destino_id" className="campo" required>
            <option value="">Selecciona…</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.etiqueta}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="etiqueta">Cantidad *</label>
        <input
          name="cantidad"
          type="number"
          step="0.001"
          className="campo"
          required
          placeholder={tipo === "ajuste" ? "Usa signo: 5 o -5" : "0"}
        />
      </div>

      <div>
        <label className="etiqueta">Costo unitario</label>
        <input name="costo_unitario" type="number" step="0.01" className="campo" defaultValue={0} />
      </div>

      <div>
        <label className="etiqueta">Referencia</label>
        <input name="referencia" className="campo" placeholder="OC-1234" />
      </div>

      <div className="md:col-span-2">
        <label className="etiqueta">Nota</label>
        <input name="nota" className="campo" />
      </div>

      <div className="md:col-span-4">
        <button className="btn-primario">Registrar movimiento</button>
      </div>
    </form>
  );
}
