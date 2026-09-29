#!/usr/bin/env python3
"""
TRASPASOS · PLAN — ROMPER CADA DEFENSA A PROPÓSITO

Una prueba que pasa a la primera no dice nada. Esto cambia UN texto de la
migración, la corre por el arnés y exige que se ponga en ROJO —y por la
razón correcta: la migración mutada tiene que APLICAR bien, y lo que falla
tiene que ser una comprobación, no el SQL roto (M0 lo demuestra).

  python3 .arnes/mutar-traspasos-plan-crear.py          # todas
  python3 .arnes/mutar-traspasos-plan-crear.py M3 M7    # las que se digan
"""
import subprocess, sys, os, re

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(RAIZ)
MIG = "supabase/migraciones/2026-09-traspasos-plan-crear-no-cambiar.sql"

EXIGE_G = "perform public.traspaso_plan_exige(p_fecha);\n\n  /* Se borra el borrador anterior"
EXIGE_P = "perform public.traspaso_plan_exige(p_fecha);\n\n  select count(*) into v_n"
EXIGE_B = "perform public.traspaso_plan_exige(p_fecha);\n\n  if p_fecha is null then"
EXIGE_V = "perform public.traspaso_plan_exige();\n\n  if coalesce(array_length(p_fechas, 1), 0) = 0 then"

# (id, ancla exacta, reemplazo, qué se rompe[, mensaje que debe parar la migración])
# NO SE MUTA `grant execute … to authenticated` de las cuatro funciones: `create or replace`
# conserva los permisos que ya tenían de las migraciones anteriores, así que quitar
# esa línea no cambia nada (se probó: verde). Es cinturón y tirantes, no una defensa.
M = [
 ("M0", "create or replace function public.traspaso_plan_publicado(p_fecha date)\nreturns boolean",
  "create or replace function public.traspaso_plan_publicado(p_fecha date)\nreturns booleanx",
  "CONTROL: SQL roto → tiene que fallar como «la migración falló», no como defensa"),
 ("M1", "  if p_fecha is not null and public.traspaso_plan_publicado(p_fecha) then",
  "  if false then",
  "el creador puede cambiar un día ya publicado"),
 ("M2", "  if not public.traspaso_plan_puede_armar() then",
  "  if false then",
  "nadie pide permiso de plan"),
 ("M3", "select public.manda()\n      or coalesce(public.mi_nivel_pantalla('/traspasos/plan'), 'ninguno') = 'editar'",
  "select public.es_editor()",
  "vuelve el candado viejo: es_editor() (el hueco del supervisor)"),
 ("M4", "coalesce(public.mi_nivel_pantalla('/traspasos/plan'), 'ninguno') = 'editar'",
  "coalesce((select rp.nivel::text from public.rol_permisos rp where rp.rol = public.mi_rol() and rp.seccion = '/traspasos/plan'), 'ninguno') = 'editar'",
  "solo cuenta el permiso del ROL: se ignora el de la persona"),
 ("M5", EXIGE_G, "\n\n  /* Se borra el borrador anterior", "guardar_plan sin candado"),
 ("M6", EXIGE_P, "\n\n  select count(*) into v_n", "publicar_plan sin candado"),
 ("M7", EXIGE_B, "\n\n  if p_fecha is null then", "borrar_plan sin candado"),
 ("M8", EXIGE_V, "\n\n  if coalesce(array_length(p_fechas, 1), 0) = 0 then", "planear varios días sin candado"),
 ("M9", "  if public.manda() then return; end if;\n\n  if not public.traspaso_plan_puede_armar()",
  "  if not public.traspaso_plan_puede_armar()",
  "quien manda también choca con el candado del día publicado"),
 ("M10", "                  where p.fecha = p_fecha and p.publicado\n                    and p.estado = 'registrado' and p.planeado > 0)",
  "                  where p.fecha = p_fecha\n                    and p.estado = 'registrado' and p.planeado > 0)",
  "un simple borrador cuenta como «publicado» (el creador no podría ni corregir el suyo)"),
 ("M11", "                  where p.fecha = p_fecha and p.publicado\n                    and p.estado = 'registrado' and p.planeado > 0)",
  "                  where p.fecha = p_fecha and p.publicado\n                    and p.planeado > 0)",
  "una línea anulada cuenta como plan publicado"),
 ("M12", "                    and p.estado = 'registrado' and p.planeado > 0)\n$$;",
  "                    and p.estado = 'registrado')\n$$;",
  "una línea publicada en cero cuenta como plan"),
 ("M3b", "select public.manda()\n      or coalesce(public.mi_nivel_pantalla('/traspasos/plan'), 'ninguno') = 'editar'",
  "select public.manda() or public.es_editor()\n      or coalesce(public.mi_nivel_pantalla('/traspasos/plan'), 'ninguno') = 'editar'",
  "el creador sigue pudiendo, pero además pasa cualquier es_editor() (el hueco del supervisor, aislado)"),
 ("M15", "select public.manda()\n      or coalesce(public.mi_nivel_pantalla('/traspasos/plan'), 'ninguno') = 'editar'",
  "select public.manda()\n      or coalesce(public.mi_nivel_pantalla('/traspasos/plan'), 'ninguno') = 'editar'\n      or exists (select 1 from public.rol_permisos rp where rp.rol = public.mi_rol() and rp.seccion = '/traspasos/plan' and rp.nivel = 'editar')",
  "el permiso del rol SUMA aunque a la persona se le haya bajado a «ver»"),
 ("M16", "select public.manda()\n      or coalesce(public.mi_nivel_pantalla('/traspasos/plan'), 'ninguno') = 'editar'",
  "select public.manda()\n      or coalesce(public.mi_nivel_pantalla('/traspasos/plan'), 'ninguno') = 'editar'\n      or exists (select 1 from public.perfiles pf where pf.id = auth.uid() and pf.permisos_extra->>'/traspasos/plan' = 'editar')",
  "el permiso de la persona vale aunque ya no esté activa"),
 # GUARDIA: la migración TIENE que negarse a aplicarse si una puerta conserva el candado viejo.
 ("G1", "  perform public.traspaso_plan_exige(p_fecha);\n\n  select count(*) into v_n",
  "  if not public.es_editor() then raise exception 'x'; end if;\n\n  select count(*) into v_n",
  "GUARDIA: publicar conserva es_editor() → la comprobación final tiene que PARAR la migración", "Siguen con el candado viejo"),
]

def cuerpo_falla(salida):
    out = []
    for l in salida.splitlines():
        if l.startswith(("FALLA supabase", "vuelta")) or "does not exist, skipping" in l: continue
        if l.startswith("✗") or "ERROR:" in l or re.match(r"^\s+(FALLA|ERROR)", l):
            out.append(l.strip()[:200])
    return out[:2]

def correr(mutado):
    open(".arnes/_mutada.sql", "w", encoding="utf-8").write(mutado)
    e = dict(os.environ); e["MIGRACION"] = ".arnes/_mutada.sql"
    r = subprocess.run(["bash", ".arnes/correr-traspasos-plan-crear.sh", "plancrear_mut"],
                       capture_output=True, text=True, env=e, timeout=900)
    return r.returncode, r.stdout + r.stderr

def main():
    pedido = sys.argv[1:]
    todas = [m for m in M if not pedido or m[0] in pedido]
    original = open(MIG, encoding="utf-8").read()
    huecos, sin_ancla = [], []
    try:
        for id_, ancla, reemplazo, que, *guardia in todas:
            n = original.count(ancla)
            if n != 1:
                print(f"✗ ANCLA {id_:<4} el texto aparece {n} veces"); sin_ancla.append(id_); continue
            cod, out = correr(original.replace(ancla, reemplazo))
            if guardia:
                ok = cod != 0 and "la migración falló" in out and guardia[0] in out
                print(("✓ para " if ok else "✗ NO PARÓ") + f" {id_:<4} {que}")
                if not ok: huecos.append(id_)
                continue
            if id_ == "M0":
                ok = cod != 0 and "la migración falló" in out
                print(("✓ rojo  " if ok else "✗ VERDE/ROJO-EQUIVOCADO") + f" {id_:<4} {que}")
                if not ok: huecos.append(id_)
                continue
            if cod == 0:
                print(f"✗ VERDE {id_:<4} {que}"); huecos.append(id_)
            else:
                if "la migración falló" in out or "no se puede leer" in out:
                    print(f"✗ SQL-ROTO {id_:<4} {que}: la mutación no aplicó, no prueba nada"); huecos.append(id_)
                else:
                    print(f"✓ rojo  {id_:<4} {que}")
                    for l in cuerpo_falla(out): print(f"           {l}")
            sys.stdout.flush()
    finally:
        if os.path.exists(".arnes/_mutada.sql"): os.remove(".arnes/_mutada.sql")
    print()
    if huecos or sin_ancla:
        print(f"✗ huecos {huecos}, sin ancla {sin_ancla}"); sys.exit(1)
    print(f"✓ {len(todas)} mutaciones, todas en rojo: cada defensa sostiene algo.")

if __name__ == "__main__":
    main()
