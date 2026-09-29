#!/usr/bin/env python3
"""ROMPER A PROPÓSITO el cierre de pantallas y la entrada de las ramas. Corre nv-permisos.mjs; verde = hueco."""
import subprocess, os
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(RAIZ)
MA, RE, NA = "src/components/Marco.tsx", "src/modulos/registro.ts", "src/components/Navegacion.tsx"
M = [
 ("N1", MA, "if (!e || permitidas.includes(e.seccion.ruta)) return null;", "return null;", "el cuerpo nunca cierra una pantalla"),
 ("N2", RE, "if (puedeVer(r.ruta)) return r.ruta;\n  return m.secciones.find", "return r.ruta;\n  return m.secciones.find", "la rama siempre lleva a su pantalla de entrada"),
 ("N3", RE, "const seccion = m.secciones.find((s) => s.ruta === p);", "const seccion = m.secciones.find((s) => p === s.ruta || p.startsWith(s.ruta + \"/\"));", "una dirección honda sin registrar se cierra"),
 ("N4", MA, "const otra = e.modulo.secciones.find((x) => !x.oculto && permitidas.includes(x.ruta));", "const otra = undefined;", "el aviso no ofrece la pantalla que sí tiene"),
 ("N5", NA, "href={entradaDeRama(actual, rama, (x) => deja.has(x))}", "href={rama.ruta}", "el «Conteos» de arriba del riel lleva al Tablero"),
 ("N6", NA, "const entra = entradaDeRama(actual, r, (x) => deja.has(x));", "const entra = r.ruta;", "el riel ofrece la rama por su entrada aunque no la tenga"),
 ("N7", RE, "s.rama === r.id && !s.oculto && puedeVer(s.ruta))?.ruta", "s.rama === r.id && !s.oculto)?.ruta", "la rama lleva a una pantalla sin mirar el permiso"),
]
malos = 0
for id_, f, a, b, d in M:
    src = open(f).read()
    assert src.count(a) == 1, f"{id_}: el texto ancla aparece {src.count(a)} veces"
    try:
        open(f, "w").write(src.replace(a, b))
        r = subprocess.run(["node", ".arnes/nv-permisos.mjs"], capture_output=True, text=True, timeout=120)
    finally:
        open(f, "w").write(src)
    if r.returncode == 0: print(f"✗ VERDE  {id_}  {d}"); malos += 1
    else: print(f"✓ rojo   {id_}  {d}")
print("✓ 7 mutaciones: cada defensa sostiene algo." if not malos else f"✗ {malos} sin cazar")
