#!/usr/bin/env python3
"""
SIDER · REVISIÓN AI NORMAL Y CERTIFICADA — ROMPER CADA DEFENSA A PROPÓSITO

Una prueba que pasa a la primera no dice nada. Esto rompe cada defensa de
la migración, de a una, y comprueba que el arnés se pone en ROJO. Si una
mutación sigue en VERDE es un hueco: o de la prueba, o una defensa que no
sostiene nada — y hay que decir cuál, no inventar una prueba para taparlo.

  python3 .arnes/mutar-sider-revision.py            # todas
  python3 .arnes/mutar-sider-revision.py M1 M5      # las que se digan

Incluye un CONTROL (R0: SQL roto a propósito) que tiene que fallar como
«la migración falló», para probar que el arnés no confunde «no corrió»
con «la defensa funciona».

NO SE PUEDEN PROBAR (y se dice):
  · la fecha «de hoy en Colombia» frente a la UTC: solo difieren entre las
    7 p. m. y la medianoche, y el arnés corre a la hora que sea.
  · el `coalesce(v_int, false)` de la llegada: la columna es NOT NULL, así
    que nunca vale NULL; es cinturón, no sostiene nada hoy.
"""
import subprocess, sys, os, re

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(RAIZ)
MIG = "supabase/migraciones/2026-09-sider-revision-ai-interna.sql"

# (id, ancla exacta, reemplazo, qué se rompe)
M = [
 ("R0", "\ncommit;\n", "\nselect esto_no_es_sql;\ncommit;\n", "CONTROL: SQL roto — tiene que fallar como «la migración falló»"),
 ("M1", "if not coalesce(v_int, false) and (select count(*)", "if (select count(*)",
  "el interno vuelve a exigir las fotos de una salida que no hubo (queda trancado)"),
 ("M2", "if not coalesce(v_int, false) and (select count(*)", "if false and (select count(*)",
  "NINGÚN camión exige fotos de salida (la regla se relajó para todos)"),
 ("M3", "  if not public.puede_editar('/sider/transito') then\n    raise exception 'Crear un camión interno",
  "  if not public.es_editor() then\n    raise exception 'Crear un camión interno",
  "crear pide es_editor() en vez del permiso de Tránsito"),
 ("M4", "from public.sider_origenes o where o.planta = p_planta and o.activo;", "from public.sider_origenes o where o.planta = p_planta;",
  "acepta un origen apagado"),
 ("M5", "   where o.activo and lower(btrim(o.cd_origen)) = lower(v_destino)", "   where lower(btrim(o.cd_origen)) = lower(v_destino)",
  "acepta un destino apagado"),
 ("M6", "  if lower(btrim(v_dest_ok)) = lower(btrim(v_origen)) then\n    raise exception 'El origen y el destino son el mismo CD';\n  end if;\n", "",
  "acepta origen y destino iguales"),
 ("M7", "where sku = btrim(coalesce(p_sku, '')) and activo)", "where sku = btrim(coalesce(p_sku, '')))",
  "acepta un material apagado"),
 ("M8", "if p_estibas is null or p_estibas <= 0 then", "if p_estibas is null or p_estibas < 0 then", "acepta cero estibas"),
 ("M9", "  if v_placa = '' then\n    raise exception 'Falta la placa';\n  end if;\n", "", "acepta una placa vacía"),
 ("M10", "     auth.uid(), true, true, auth.uid(), now())", "     auth.uid(), false, true, auth.uid(), now())",
  "el camión creado no queda marcado como interno"),
 ("M11", "     auth.uid(), true, true, auth.uid(), now())", "     auth.uid(), true, false, auth.uid(), now())",
  "el interno nace sin la revisión normal pedida"),
 ("M12", "     (now() at time zone 'America/Bogota')::date,\n     auth.uid()", "     null,\n     auth.uid()",
  "el interno nace sin fecha"),
 ("M13", "if not (public.puede_editar('/sider/sorting')\n          or (public.es_editor() and public.puede_editar('/sider/transito'))) then",
  "if not public.es_editor() then", "guardar vuelve a pedir es_editor() (el hueco de Portería)"),
 ("M14", "if not (public.puede_editar('/sider/sorting')\n          or (public.es_editor() and public.puede_editar('/sider/transito'))) then",
  "if not public.puede_editar('/sider/sorting') then", "se pierde el permiso de Tránsito de antes (quien hacía la AI ahí)"),
 ("M15", "if not (public.puede_editar('/sider/sorting')\n          or (public.es_editor() and public.puede_editar('/sider/transito'))) then",
  "if not (public.puede_editar('/sider/transito') or public.es_editor()) then", "editar cualquier pantalla alcanza (es_editor suelto en la unión)"),
 ("M16", "  if p_marcar and coalesce(v_interno, false) then\n    raise exception 'Un camión interno no lleva revisión AI certificada",
  "  if false and coalesce(v_interno, false) then\n    raise exception 'Un camión interno no lleva revisión AI certificada", "se le puede pedir AI certificada a un interno"),
 ("M17", "  if not p_marcar and coalesce(v_interno, false) then", "  if false and coalesce(v_interno, false) then",
  "se le puede quitar la revisión normal a un interno (por la función)"),
 ("M18", "    add constraint sider_interno_pasa_a_revision check (not interno or requiere_sorting);",
  "    add constraint sider_interno_pasa_a_revision check (true);", "la tabla ya no impide un interno sin revisión normal"),
 ("M19", "    and not exists (select 1 from public.sider_viajes x where x.id = v.id and x.interno)\n", "\n",
  "el seguimiento cuenta los internos como certificados por Sider"),
 ("M20", "   where v.estado <> 'anulado'\n     and not v.interno\n", "   where v.estado <> 'anulado'\n", "el calendario cuenta los internos"),
 ("M21", "where v.requiere_sorting\n  and v.estado <> 'anulado'\n  and exists (select 1 from public.sider_certificaciones c\n               where c.viaje_id = v.id and c.punta = 'llegada')\n",
  "where v.requiere_sorting\n  and v.estado <> 'anulado'\n", "la lista normal deja pasar camiones que no han llegado"),
 ("M22", "where v.requiere_ai\n  and v.estado <> 'anulado'\n  and exists (select 1 from public.sider_certificaciones c\n               where c.viaje_id = v.id and c.punta = 'llegada')\n",
  "where v.requiere_ai\n  and v.estado <> 'anulado'\n", "la lista certificada deja pasar camiones que no han llegado"),
 ("M23", "where v.requiere_sorting\n  and v.estado <> 'anulado'\n", "where v.requiere_sorting\n", "la lista normal deja pasar anulados"),
 ("M24", "                   where r.viaje_id = v.id and r.tipo = 'ai')\nunion all", "                   where r.viaje_id = v.id)\nunion all",
  "hacer la revisión normal apaga la certificada pendiente del mismo camión"),
 ("M25", "                   where r.viaje_id = v.id and r.tipo = 'sorting');", "                   where r.viaje_id = v.id);",
  "hacer la certificada apaga la normal pendiente del mismo camión"),
 ("M26", "   group by k.revision_id\n) t on t.revision_id = r.id;\n\ngrant select on public.v_sider_ai to authenticated;",
  "   group by k.revision_id\n) t on t.revision_id = r.id\nwhere r.tipo = 'ai';\n\ngrant select on public.v_sider_ai to authenticated;",
  "el informe vuelve a excluir la revisión normal"),
 ("M27", "join public.sider_ai_revisiones r on r.id = k.revision_id\njoin public.sider_ai_envases e on e.clave = r.envase;\n\ngrant select on public.v_sider_ai_detalle",
  "join public.sider_ai_revisiones r on r.id = k.revision_id and r.tipo = 'ai'\njoin public.sider_ai_envases e on e.clave = r.envase;\n\ngrant select on public.v_sider_ai_detalle",
  "el detalle del informe no trae los conteos de la revisión normal"),
 ("M28", "  r.tipo\nfrom public.sider_ai_revisiones r", "  r.tipo || '' as tipo\nfrom public.sider_ai_revisiones r",
  "CONTROL de equivalencia: tipo igual pero con otra expresión (debe seguir VERDE)"),
]

def cuerpo_falla(salida):
    vistas = []
    for l in salida.splitlines():
        if l.startswith(("FALLA supabase", "vuelta")) or "does not exist, skipping" in l: continue
        if re.match(r"^\s+· ", l) or "ERROR:" in l or l.startswith("✗"):
            vistas.append(l.strip()[:200])
    return vistas[:2]

def correr(cmd, env=None):
    e = dict(os.environ); e.update(env or {})
    r = subprocess.run(cmd, capture_output=True, text=True, env=e, timeout=900)
    return r.returncode, r.stdout + r.stderr

def mutar(ancla, reemplazo):
    original = open(MIG, encoding="utf-8").read()
    n = original.count(ancla)
    if n != 1:
        return ("ANCLA", f"el texto aparece {n} veces: la mutación no se pudo aplicar")
    open(".arnes/_mutada.sql", "w", encoding="utf-8").write(original.replace(ancla, reemplazo))
    cod, out = correr(["bash", ".arnes/correr-sider-revision.sh", "mut"], {"MIGRACION": ".arnes/_mutada.sql"})
    return ("VERDE", "") if cod == 0 else ("ROJO", cuerpo_falla(out))

def main():
    pedido = sys.argv[1:]
    todas = [m for m in M if not pedido or m[0] in pedido]
    huecos, mal, esperados_verdes = [], [], {"M28"}
    try:
        for id_, ancla, reemplazo, que in todas:
            estado, detalle = mutar(ancla, reemplazo)
            if id_ in esperados_verdes:
                marca = "✓ verde (esperado)" if estado == "VERDE" else "✗ ROJO inesperado"
                print(f"{marca}  {id_:<4} {que}")
                if estado != "VERDE": huecos.append(id_)
                continue
            marca = {"ROJO": "✓ rojo ", "VERDE": "✗ VERDE", "ANCLA": "✗ ANCLA"}[estado]
            print(f"{marca}  {id_:<4} {que}")
            if estado == "ROJO":
                for l in detalle: print(f"           {l}")
            elif estado == "VERDE": huecos.append(id_)
            else: mal.append(id_); print(f"           {detalle}")
            sys.stdout.flush()
    finally:
        if os.path.exists(".arnes/_mutada.sql"): os.remove(".arnes/_mutada.sql")
    print()
    if huecos or mal:
        print(f"✗ {len(huecos)} hueco(s) {huecos} y {len(mal)} mutación(es) sin aplicar {mal}")
        sys.exit(1)
    print(f"✓ {len(todas)} mutaciones: cada defensa sostiene algo.")

if __name__ == "__main__":
    main()
