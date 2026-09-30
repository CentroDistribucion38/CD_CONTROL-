#!/usr/bin/env python3
"""
REVISIÓN AI Y EL «+» — ROMPER CADA DEFENSA DE LAS PANTALLAS A PROPÓSITO

Cambia UN texto exacto de un componente y corre `sd-sorting.mjs`. Si sigue
en verde es un HUECO: o de la prueba, o una defensa que no sostiene nada,
y hay que decir cuál. Los archivos se restauran SIEMPRE.

  python3 .arnes/mutar-sider-pantallas.py            # todas
  python3 .arnes/mutar-sider-pantallas.py P3 P9      # las que se digan
"""
import subprocess, sys, os

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(RAIZ)

FA = "src/modulos/sider/FormularioAi.tsx"
SO = "src/app/(app)/sider/sorting/Sorting.tsx"
TR = "src/app/(app)/sider/transito/Transito.tsx"
NV = "src/app/(app)/sider/sorting/NuevoInterno.tsx"
VJ = "src/app/(app)/sider/Viajes.tsx"
IN = "src/app/(app)/sider/seguimiento/ai/Informe.tsx"
CSS = "src/app/(app)/sider/sider.css"

M = [
 ("P1", FA, '...(esSorting ? { p_tipo: "sorting" } : {}),', "p_tipo: tipo,", "la certificada manda p_tipo SIEMPRE (rompe el guardado antes de correr el SQL)"),
 ("P2", FA, '...(esSorting ? { p_tipo: "sorting" } : {}),', "", "la normal no manda su tipo (se guardaría como certificada)"),
 ("P3", SO, "{p.interno && (", "{true && (", "todas las tarjetas llevan el sello INTERNO"),
 ("P4", SO, '{p.interno ? "Lo creó " : "Lo pidió "}', '{"Lo pidió "}', "el interno dice «Lo pidió»"),
 ("P5", SO, "const pend = pendientes.filter((p) => p.tipo === c.tipo);", "const pend = pendientes;", "cada bloque mezcla los pendientes de las dos clases"),
 ("P6", SO, "const hech = hechos.filter((r) => tipoDe(r) === c.tipo);", "const hech = hechos;", "cada bloque mezcla las hechas de las dos clases"),
 ("P7", SO, 'r.tipo ?? "ai"', 'r.tipo ?? "sorting"', "una revisión sin tipo sale como normal"),
 ("P8", SO, "const puedeOperar = puedeEditar && !!maestros;", "const puedeOperar = !!maestros;", "sin permiso de edición igual salen botones si llegan los maestros"),
 ("P9", SO, "<i />{NOMBRE_TIPO[tipo].toUpperCase()}", "<i />CERTIFICADA", "el sello siempre dice CERTIFICADA"),
 ("P10", SO, 'className={"tr-vh " + (p.tipo === "ai" ? "ai" : "so")', 'className={"tr-vh " + "ai"', "todas las tarjetas se pintan de certificada"),
 ("P11", SO, "const nCert = pendientes.filter((p) => p.tipo === \"ai\").length;", "const nCert = pendientes.length;", "el contador de certificadas cuenta todo"),
 ("P12", TR, "const faltanFotos = !v.interno && v.fotos_salida < 3;", "const faltanFotos = v.fotos_salida < 3;", "al interno se le reclaman las fotos de salida en rojo"),
 ("P13", TR, "const sinEvidenciaSalida = !viaje.interno && viaje.fotos_salida < 3;", "const sinEvidenciaSalida = viaje.fotos_salida < 3;", "el recibo del interno se traba por fotos de una salida que no hubo"),
 ("P14", TR, "const sinEvidenciaSalida = !viaje.interno && viaje.fotos_salida < 3;", "const sinEvidenciaSalida = false;", "el recibo deja de exigir las fotos de salida a TODOS"),
 ("P15", SO, "      {puedeCrear && (\n        <button type=\"button\" className=\"tr-mas tr-fab\"", "      {true && (\n        <button type=\"button\" className=\"tr-mas tr-fab\"", "el «+» lo ve quien no tiene el permiso «Vh Interno (+)»"),
 ("P16", TR, "{esAdmin && !v.interno && (", "{esAdmin && (", "al interno se le ofrece pedir la revisión certificada"),
 ("P17", TR, "{v.interno ? (\n                  <span className=\"sello interno\"", "{false ? (\n                  <span className=\"sello interno\"", "el interno pierde su sello"),
 ("P18", NV, "const puede = faltan.length === 0 && !mismo;", "const puede = faltan.length === 0;", "deja crear con origen y destino iguales"),
 ("P19", NV, "      p_estibas: nEst,", "      p_estibas: estibas,", "manda las estibas como texto"),
 ("P20", NV, "      p_placa: placa,", "      p_placa: placa.trim(),", "(control de equivalencia: el envío ya recibe la placa limpia, .trim() no cambia nada — debe seguir VERDE)"),
 ("P21", NV, "      .filter((c) => plano(c) !== plano(DESTINO_POR_DEFECTO))\n", "", "Barranquilla sale repetida entre los destinos"),
 ("P22", NV, "sider: nEst / estibasPorSider,", "sider: nEst / 30,", "el sider se calcula con otro número de estibas"),
 ("P23", NV, "const DESTINO_POR_DEFECTO = \"Barranquilla\";", "const DESTINO_POR_DEFECTO = \"Barranquilla\" as string;", "(control: mismo valor con otra forma — debe seguir VERDE)"),
 ("P24", NV, "if (error) { setMal(traducirError(error.message)); return }", "if (error) { setMal(traducirError(error.message)) }\n    alCrear(placa.trim().toUpperCase());", "el «+» avisa que creó aunque la base rechazó"),
 ("P25", NV, "      p_destino: destino,", "      p_destino: DESTINO_POR_DEFECTO,", "el destino escogido no viaja"),
 ("P26", NV, "if (!PLACA_OK.test(placa)) faltan.push(\"la placa (3 letras y 3 números)\");", "", "no dice que falta la placa"),
 ("P31", NV, "const PLACA_OK = /^[A-Z]{3}[0-9]{3}$/;", "const PLACA_OK = /^[A-Z0-9]{6}$/;", "la placa acepta cualquier mezcla de letras y números"),
 ("P32", NV, ".replace(/[^A-Z0-9]/g, \"\").slice(0, 6);", ".slice(0, 6);", "la placa deja pasar espacios y signos"),
 ("P33", NV, ".replace(/[^A-Z0-9]/g, \"\").slice(0, 6);", ".replace(/[^A-Z0-9]/g, \"\").slice(0, 8);", "(control de equivalencia: el input ya lleva maxLength=6, el slice es doble cinturón — debe seguir VERDE)"),
 ("P35", CSS, ".sd.so-pantalla { padding-bottom: 96px }", "", "el «+» tapa el «Corregir» del último renglón"),
 ("P27", VJ, ': esInterno(v.id) ? "Vh Interno · sin salida" : `${v.fotos_salida}/3 fotos`}</div>', ': `${v.fotos_salida}/3 fotos`}</div>', "el interno sale con «0/3 fotos» en Fuente principal"),
 ("P28", IN, '((r.tipo ?? "ai") as TipoRevision) === "ai" ? "propio" : "normal"', '"propio"', "el informe marca todas como certificadas"),
 ("P29", IN, "{!filtro.tipo && (() => {", "{(() => {", "filtrado a una clase todavía cuenta las dos"),
 ("P36", SO, 'tipo: "sorting", css: "so"', 'tipo: "sorting", css: "ai"', "el bloque de la normal se pinta con el color de la certificada"),
 ("P37", CSS, ".sd .so-bloque.so { --so-c: #AA1874; --so-fondo: #FBEFF6 }", ".sd .so-bloque.so { --so-c: #6A3FA0; --so-fondo: #F3EEFA }", "el bloque de la normal usa el morado de la certificada"),
 ("P38", NV, 't.replace(/[^0-9]/g, "").slice(0, DOC_MAX)', 't.slice(0, DOC_MAX)', "el documento deja pasar letras y guiones"),
 ("P39", NV, 't.replace(/[^0-9]/g, "").slice(0, DOC_MAX)', 't.replace(/[^0-9]/g, "")', "(control de equivalencia: el maxLength=10 del campo ya corta, el slice es doble cinturón — debe seguir VERDE)"),
 ("P40", NV, "const DOC_MAX = 10;", "const DOC_MAX = 12;", "el documento admite hasta 12 dígitos"),
 ("P41", NV, "      p_factura: factura,", "      p_factura: null,", "el documento escrito no viaja a la base"),
 ("P42", NV, "maxLength={DOC_MAX} inputMode=\"numeric\"", "inputMode=\"numeric\"", "el campo del documento pierde su maxLength de 10"),
 ("P43", SO, "            router.refresh();\n            avisar.bien(`${placa} creado", "            avisar.bien(`${placa} creado", "al crear no se refresca la lista: el Vh Interno no aparece"),
 ("P44", SO, "            setCreando(false);\n            router.refresh();", "            router.refresh();", "el formulario no se cierra al crear"),
 ("P45", SO, '{p.interno ? "Creado" : "Llegó"} {cuando(p.llego_en)}', '{"Llegó"} {cuando(p.llego_en)}', "el Vh Interno dice «Llegó» aunque nunca llegó"),
 ("P46", VJ, 'esInterno(v.id) ? "Vh Interno · sin certificar"', 'false ? "Vh Interno · sin certificar"', "el Vh Interno sale con «0/3 fotos» de llegada en Fuente principal"),
 ("P47", NV, '  if (!factura) faltan.push("el documento (número de factura)");', "", "deja crear sin documento"),
 ("P48", NV, "      p_lote: null,", '      p_lote: "X",', "el Vh Interno viaja con un lote que nadie escribió"),
 ("P30", CSS, ".sd .tr-vh.ai.so-tarde { background: #F8F4FD; border-color: #DCCBF1; border-left-color: #6A3FA0 }", "", "una certificada con más de un día se pinta de la otra clase"),
]

def cuerpo(salida):
    return [l.strip()[:220] for l in salida.splitlines() if l.startswith("✗")][:2]

def mutar(id_, archivo, ancla, reemplazo):
    original = open(archivo, encoding="utf-8").read()
    n = original.count(ancla)
    if n != 1:
        return ("ANCLA", f"el texto aparece {n} veces")
    try:
        open(archivo, "w", encoding="utf-8").write(original.replace(ancla, reemplazo))
        r = subprocess.run(["node", ".arnes/sd-sorting.mjs"], capture_output=True, text=True, timeout=600)
    finally:
        open(archivo, "w", encoding="utf-8").write(original)
    return ("VERDE", "") if r.returncode == 0 else ("ROJO", cuerpo(r.stdout + r.stderr))

def main():
    pedido = sys.argv[1:]
    todas = [m for m in M if not pedido or m[0] in pedido]
    respaldo = {}
    for m in todas: respaldo.setdefault(m[1], open(m[1], encoding="utf-8").read())
    huecos, sinancla = [], []
    try:
        for id_, a, ancla, rep, que in todas:
            control = "control" in que
            est, det = mutar(id_, a, ancla, rep)
            if control:
                print(("✓ verde (esperado) " if est == "VERDE" else "✗ el control se puso ROJO ") + f" {id_:<4} {que}")
                if est != "VERDE": huecos.append(id_)
            else:
                print({"ROJO": "✓ rojo ", "VERDE": "✗ VERDE", "ANCLA": "✗ ANCLA"}[est] + f"  {id_:<4} {que}")
                if est == "ROJO":
                    for l in det: print(f"           {l}")
                elif est == "VERDE": huecos.append(id_)
                else: sinancla.append(id_); print("           " + det)
            sys.stdout.flush()
    finally:
        for f, t in respaldo.items():
            if open(f, encoding="utf-8").read() != t:
                open(f, "w", encoding="utf-8").write(t); print(f"(restaurado {f})")
    print()
    if huecos or sinancla:
        print(f"✗ {len(huecos)} hueco(s) {huecos} y {len(sinancla)} sin aplicar {sinancla}"); sys.exit(1)
    print(f"✓ {len(todas)} mutaciones: cada defensa sostiene algo.")

if __name__ == "__main__":
    main()
