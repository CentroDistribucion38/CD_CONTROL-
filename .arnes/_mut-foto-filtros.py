import subprocess, shutil, sys
C="src/app/(app)/inventario/conteo/Contar.tsx"
L="src/modulos/inventario/libro.ts"
T="src/app/(app)/roturas/en-sitio/tablero/Tablero.tsx"
CI="src/app/(app)/roturas/en-sitio/tablero/Cierre.tsx"
CS="src/app/(app)/roturas/en-sitio/tablero/cierre.css"
M=[
 (C,'const ruta = `${conteo.id}/${lineaId}.jpg`;','const ruta = `${conteo.id}/x.jpg`;',"inv-conteo-foto"),
 (C,'const foto = fotoNueva;','const foto = null as Foto | null;',"inv-conteo-foto"),
 (C,'if (foto) {\n      const idL = corrigiendo ?? await ultimoRenglon(mat.sku);','if (false as boolean) {\n      const idL = corrigiendo ?? await ultimoRenglon(mat.sku);',"inv-conteo-foto"),
 (C,'void supabase.storage.from("inventario").remove([rutaF]);','',"inv-conteo-foto"),
 (C,'if (f) {\n            fotosCola.current.delete(it.id);','if (false as boolean) {\n            fotosCola.current.delete(it.id);',"inv-conteo-foto"),
 (C,'{fotosDe[r.id] && (\n                      <button','{!fotosDe[r.id] && (\n                      <button',"inv-conteo-foto"),
 (L,'if (evid.length) {','if (true as boolean) {',"inv-libro-evidencias"),
 (L,"r.height = 170;","r.height = 18;","inv-libro-evidencias"),
 (L,"tl: { col: C.length - 1 + 0.04","tl: { col: 2 + 0.04","inv-libro-evidencias"),
 (T,'aplicar(d, h); setAbierto(false)','setAbierto(false)',"rt-cierre-turno"),
 (T,'{hayDiaTurno && (','{false && (',"rt-cierre-turno"),
 (CI,'{c.turnos.length !== 1 && (','{true && (',"rt-cierre-turno"),
 (CI,'{t.registros > 0 && (\n            <>\n              <div className="rtc-sec"><b>A qué','{false && (\n            <>\n              <div className="rtc-sec"><b>A qué',"rt-cierre-turno"),
 (CS,'background: var(--rt-tinta); color: #fff; position: relative; overflow: hidden;','background: #888; color: #fff; position: relative; overflow: hidden;',"rt-cierre-turno"),
 (CS,'height: 44px; border: 1.5px solid var(--rt-linea); border-radius: 0;','height: 44px; border: 1.5px solid var(--rt-linea); border-radius: 12px;',"rt-cierre-turno"),
]
vivos=[]
for f,a,b,t in M:
    s=open(f).read()
    if a not in s: print("NO ENCUENTRA",f,a[:40]); vivos.append(a[:40]); continue
    open(f,"w").write(s.replace(a,b,1))
    try:
        r=subprocess.run(["node",f".arnes/{t}.mjs"],capture_output=True,text=True,timeout=600)
        muerto = r.returncode!=0
    finally:
        open(f,"w").write(s)
    print("MUERTO" if muerto else "VIVO  ", t, a[:50].replace("\n"," "))
    if not muerto: vivos.append(a[:50])
print("vivos:",vivos)
