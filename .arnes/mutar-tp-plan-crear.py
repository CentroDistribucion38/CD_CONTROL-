#!/usr/bin/env python3
"""
TRASPASOS · PLAN (PANTALLA) — ROMPER CADA DEFENSA A PROPÓSITO

  python3 .arnes/mutar-tp-plan-crear.py          # todas
  python3 .arnes/mutar-tp-plan-crear.py F3 F7    # las que se digan

Los archivos se restauran SIEMPRE, aunque se corte a la mitad.
"""
import subprocess, sys, os

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(RAIZ)
PL = "src/app/(app)/traspasos/plan/Plan.tsx"
PG = "src/app/(app)/traspasos/plan/page.tsx"

M = [
 ("F1", PL, "const bloqueado = puedeEditar && !manda && publicadas.length > 0;", "const bloqueado = false;",
  "quien crea puede editar un día ya publicado"),
 ("F2", PL, "const bloqueado = puedeEditar && !manda && publicadas.length > 0;", "const bloqueado = puedeEditar && publicadas.length > 0;",
  "quien manda también queda bloqueado"),
 ("F3", PL, "const editaDia = puedeEditar && !bloqueado;", "const editaDia = puedeEditar;",
  "el bloqueado conserva botones y celdas"),
 ("F4", PL, "const base = !bloqueado && borrador.length ? borrador : publicadas;", "const base = borrador.length ? borrador : publicadas;",
  "el bloqueado ve el borrador del administrador como si fuera el plan"),
 ("F5", PL, "{bloqueado && (\n              <p className=\"plan-cerrado\"", "{false && (\n              <p className=\"plan-cerrado\"",
  "no se dice por qué no hay botones"),
 ("F6", PG, "manda={permisos.manda}", "manda={false}", "la página nunca le dice al plan que quien mira manda"),
 ("F7", PL, "<Celda n={val(t, x.clave)} puedeEditar={editaDia}", "<Celda n={val(t, x.clave)} puedeEditar={puedeEditar}",
  "las celdas de la rejilla ignoran el bloqueo"),
 ("F8", PL, "{editaDia && (\n            <div className=\"atajos-plan\">", "{puedeEditar && (\n            <div className=\"atajos-plan\">",
  "los atajos de armar aparecen con el día bloqueado"),
 ("F9", PL, "{editaDia && (\n              <div className=\"pie-publicar\">", "{puedeEditar && (\n              <div className=\"pie-publicar\">",
  "Publicar/Borrar aparecen con el día bloqueado"),
 ("F10", PL, "Solo el administrador puede cambiarlo o borrarlo.", "", "el aviso no dice a quién pedirle el cambio"),
 ("F11", PL, "const bloqueado = puedeEditar && !manda && publicadas.length > 0;", "const bloqueado = !manda && publicadas.length > 0;",
  "el aviso le sale también a quien solo mira"),
 ("F12", PL, "<Celda n={vacios[t] ?? 0} puedeEditar={editaDia}", "<Celda n={vacios[t] ?? 0} puedeEditar={puedeEditar}",
  "los vacíos se pueden cambiar con el día bloqueado"),
]

def correr():
    r = subprocess.run(["node", ".arnes/tp-plan-crear.mjs"], capture_output=True, text=True, timeout=300)
    return r.returncode, r.stdout + r.stderr

def main():
    pedido = sys.argv[1:]
    todas = [m for m in M if not pedido or m[0] in pedido]
    respaldo = {}
    for m in todas:
        if m[1] not in respaldo: respaldo[m[1]] = open(m[1], encoding="utf-8").read()
    huecos, sin = [], []
    try:
        for id_, arch, ancla, rep, que in todas:
            orig = respaldo[arch]
            n = orig.count(ancla)
            if n != 1:
                print(f"✗ ANCLA {id_:<4} aparece {n} veces"); sin.append(id_); continue
            open(arch, "w", encoding="utf-8").write(orig.replace(ancla, rep))
            try: cod, out = correr()
            finally: open(arch, "w", encoding="utf-8").write(orig)
            if cod == 0:
                print(f"✗ VERDE {id_:<4} {que}"); huecos.append(id_)
            elif "no pudo terminar" in out:
                print(f"✗ ARNÉS-ROTO {id_:<4} {que}: {out.strip().splitlines()[-1][:150]}"); huecos.append(id_)
            else:
                lin = [l for l in out.splitlines() if l.startswith("✗")][:1]
                print(f"✓ rojo  {id_:<4} {que}\n           {lin[0][:170] if lin else ''}")
            sys.stdout.flush()
    finally:
        for f, t in respaldo.items():
            if open(f, encoding="utf-8").read() != t:
                open(f, "w", encoding="utf-8").write(t); print(f"(restaurado {f})")
    print()
    if huecos or sin:
        print(f"✗ huecos {huecos}, sin ancla {sin}"); sys.exit(1)
    print(f"✓ {len(todas)} mutaciones, todas en rojo.")

if __name__ == "__main__":
    main()
