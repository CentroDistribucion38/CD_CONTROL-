"""Rompe a propósito la migración de Roturas dentro de Quiebra.

Lo usa .arnes/mutar-roturas-en-quiebra.sh. Está aparte y no dentro del
.sh porque cada mutación es una sustitución de texto con comillas y
saltos de línea dentro, y meterlas en un heredoc de bash es cómo se
acaba depurando el escape en vez del error.

    python3 .arnes/_mutar-qb.py <mutacion> [sin-guardia]

«sin-guardia» además desarma las comprobaciones finales de la propia
migración. Sirve para separar las dos redes: con la guardia puesta se
comprueba que ELLA caza el error; sin ella, que lo cazan las aserciones
de la prueba. Una mutación que no distingue las dos dice «verde» cuando
en realidad la cazó la otra red.
"""
import sys

BUENA = "/tmp/qb-buena.sql"
MUTADA = "/tmp/qb-mutada.sql"
PERM_BUENA = "/tmp/qb-perm-buena.sql"
PERM_MUTADA = "/tmp/qb-perm-mutada.sql"

INSERT_ROLES = """  select p.rol, '/quiebra/tablero', p.nivel
    from public.rol_permisos p
   where p.seccion = '/quiebra'
  on conflict (rol, seccion) do nothing;"""

UPDATE_PERSONAS = """  update public.perfiles
     set permisos_extra = permisos_extra
         || jsonb_build_object('/quiebra/tablero', permisos_extra -> '/quiebra')
   where permisos_extra ? '/quiebra'
     and not (permisos_extra ? '/quiebra/tablero');"""


def nivel_fijo(s):
    return s.replace(
        "  select p.rol, '/quiebra/tablero', p.nivel\n    from public.rol_permisos p",
        "  select p.rol, '/quiebra/tablero', 'ver'::nivel_permiso\n    from public.rol_permisos p")


def reparte_a_todos(s):
    return s.replace(INSERT_ROLES, """  select distinct p.rol, '/quiebra/tablero', 'ver'::nivel_permiso
    from public.rol_permisos p
  on conflict (rol, seccion) do nothing;""")


def pisa_lo_puesto(s):
    return s.replace("  on conflict (rol, seccion) do nothing;",
                     "  on conflict (rol, seccion) do update set nivel = excluded.nivel;")


def sin_personas(s):
    return s.replace(UPDATE_PERSONAS, "")


def inventa_personas(s):
    s = s.replace("""   where permisos_extra ? '/quiebra'
     and not (permisos_extra ? '/quiebra/tablero');""",
                  """   where not (permisos_extra ? '/quiebra/tablero');""")
    return s.replace(
        "jsonb_build_object('/quiebra/tablero', permisos_extra -> '/quiebra')",
        "jsonb_build_object('/quiebra/tablero', coalesce(permisos_extra -> '/quiebra', '\"ver\"'::jsonb))")


def mueve_no_copia(s):
    return s.replace("  on conflict (rol, seccion) do nothing;",
                     "  on conflict (rol, seccion) do nothing;\n\n"
                     "  delete from public.rol_permisos where seccion = '/quiebra';")


def comprueba_de_mas(s):
    return s.replace("""   where p.seccion = '/quiebra'
     and p.rol = any(v_roles_nuevos)
     and t.nivel is distinct from p.nivel;""",
                     """   where p.seccion = '/quiebra'
     and t.nivel is distinct from p.nivel;""")


MUTACIONES = {
    "nivel-fijo": nivel_fijo,
    "reparte-a-todos": reparte_a_todos,
    "pisa-lo-puesto": pisa_lo_puesto,
    "sin-personas": sin_personas,
    "inventa-personas": inventa_personas,
    "mueve-no-copia": mueve_no_copia,
    "comprueba-de-mas": comprueba_de_mas,
}


def sin_guardia(s):
    """Desarma las comprobaciones finales de la migración.

    Cambia cada `raise exception` de la sección 4 por un aviso. No se
    borran los `if`: borrarlos cambiaría las cuentas de las variables y
    la mutación dejaría de ser «lo mismo pero sin red»."""
    marca = "-- 4. QUEDÓ ASÍ"
    i = s.index(marca)
    cabeza, cola = s[:i], s[i:]
    cola = cola.replace("raise exception '", "raise notice 'DESARMADO: ")
    return cabeza + cola


def main():
    cual = sys.argv[1]

    if cual == "check-sin-ninguno":
        s = open(PERM_BUENA, encoding="utf-8").read()
        antes = s
        s = s.replace("e.value in ('ninguno', 'ver', 'editar')", "e.value in ('ver', 'editar')")
        assert s != antes, "la mutación del CHECK no encontró qué cambiar"
        open(PERM_MUTADA, "w", encoding="utf-8").write(s)
        return

    s = open(BUENA, encoding="utf-8").read()
    antes = s
    s = MUTACIONES[cual](s)
    assert s != antes, f"la mutación «{cual}» no encontró qué cambiar"

    if len(sys.argv) > 2 and sys.argv[2] == "sin-guardia":
        s = sin_guardia(s)

    open(MUTADA, "w", encoding="utf-8").write(s)


main()
