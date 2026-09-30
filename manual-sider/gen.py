# -*- coding: utf-8 -*-
"""Instructivo T1 / T2 con capturas reales. Se corre:  python3 manual-sider/gen.py"""
import base64, os, sys
from PIL import Image
AQUI = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(AQUI, "img")
JPG = os.path.join(AQUI, "jpg")
os.makedirs(JPG, exist_ok=True)
FD = "/tmp/claude-0/fnt/node_modules/@fontsource/"

def b64(p): return base64.b64encode(open(p, "rb").read()).decode()
def cara(fam, d, ws):
    return "".join('@font-face{font-family:"%s";font-weight:%d;font-style:normal;src:url(data:font/woff2;base64,%s) format("woff2")}' % (fam, w, b64(f"{FD}{d}/files/{d}-latin-{w}-normal.woff2")) for w in ws)
FUENTES = cara("Archivo", "archivo", [600, 700, 800, 900]) + cara("IBM Plex Sans", "ibm-plex-sans", [400, 500, 600])

CROP = {"t02-filtros": 1350, "t09-pegar": 1350, "f01-tabla": 1000, "f01-tabla-der": 1000, "m01-pc": 1560}
def jpg(n):
    src = os.path.join(IMG, n + ".png"); dst = os.path.join(JPG, n + ".jpg")
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        im = Image.open(src).convert("RGB")
        if n in CROP: im = im.crop((0, 0, im.width, min(im.height, CROP[n])))
        if im.width > 1500: im = im.resize((1500, int(im.height * 1500 / im.width)), Image.LANCZOS)
        im.save(dst, quality=86, optimize=True)
    return "jpg/" + n + ".jpg"

def tira(n, k, caps=None):
    """Parte una captura muy alta en k tiras, cortando por filas de fondo liso (entre tarjetas)."""
    src = os.path.join(IMG, n + ".png")
    im = Image.open(src).convert("RGB"); W, Hh = im.size
    bg = im.getpixel((5, 5))
    def liso(y):
        return all(sum(abs(a - b) for a, b in zip(im.getpixel((x, y)), bg)) < 24 for x in range(0, W, 9))
    cortes = [0]
    for i in range(1, k):
        ideal = Hh * i // k; y = None
        for d in range(0, 260):
            for yy in (ideal + d, ideal - d):
                if cortes[-1] + 200 < yy < Hh - 100 and liso(yy): y = yy; break
            if y: break
        cortes.append(y or ideal)
    cortes.append(Hh)
    items = []
    for i in range(k):
        nm = f"{n}__{i}"; dst = os.path.join(JPG, nm + ".jpg")
        im.crop((0, cortes[i], W, cortes[i + 1])).save(dst, quality=86, optimize=True)
        items.append(("../jpg/" + nm, (caps or [""] * k)[i]))
    return items
def fila_t(items, cls=""):
    h = "".join(f'<figure><img src="{n.replace("../","")}.jpg" alt=""><figcaption>{c}</figcaption></figure>' for n, c in items)
    return f'<div class="fila n{len(items)} {cls}">{h}</div>'
def fig(n, cap="", cls=""):
    return f'<figure class="{cls}"><img src="{jpg(n)}" alt="">' + (f"<figcaption>{cap}</figcaption>" if cap else "") + "</figure>"
def fila(items, cls=""):
    """Varias capturas de celular lado a lado; cada una con su número/pie."""
    h = "".join(f'<figure><img src="{jpg(n)}" alt=""><figcaption>{c}</figcaption></figure>' for n, c in items)
    return f'<div class="fila n{len(items)} {cls}">{h}</div>'
def paso(n, titulo, cuerpo, figs=""):
    lado = ' lado' if ('fila n2' in figs or 'fila n1 una' in figs or 'fila n1 ' in figs) else ""
    return f'<div class="paso{lado}"><span class="n">{n}</span><h3>{titulo}</h3><div class="cuerpo"><div class="txt">{cuerpo}</div>{figs}</div></div>'
def ojo(t, x): return f'<div class="ojo-nota"><span class="rot-nota">{t}</span>{x}</div>'
def nota(t, x): return f'<div class="nota"><span class="rot-nota">{t}</span>{x}</div>'
def no(t, x): return f'<div class="no"><span class="rot-nota">{t}</span>{x}</div>'
def caso(si, haz, img=None, cap=""):
    f = f'<div class="cimg"><img src="{jpg(img)}" alt=""></div>' if img else ""
    return f'<div class="caso{" con" if img else ""}">{f}<div class="ctx"><p class="si"><span>SI VES</span>{si}</p><p class="haz"><span>HAZ ESTO</span>{haz}</p></div></div>'
def casos(*cs): return '<div class="casos">' + "".join(cs) + "</div>"
def sec(id, num, titulo, quien, intro):
    return f'<section id="{id}"><div class="cabeza-sec"><span class="num">SECCIÓN {num}</span><h2>{titulo}</h2><p class="quien">{quien}</p></div><p class="entrada">{intro}</p>'

H = []
A = H.append

# ------------------------------------------------------------------ PORTADA
A('''<header class="tapa">
  <div class="marca-fila"><img src="../manual/img/logo-b.png" alt="Bavaria"><p class="quien-marca">Bavaria · CD38 Ag01<span>Barranquilla · Atlántico</span></p></div>
  <h1>T1 / T2<em>paso a paso</em></h1>
  <p class="bajada">Del vehículo que sale del CD de origen hasta el índice de cobro y el seguimiento del mes. Cada paso con la foto real de la pantalla, cada caso con lo que hay que hacer.</p>
  <div class="tiras"><span class="oro">SIN UBICACIÓN NO HAY CERTIFICADO</span><span>11 SECCIONES</span><span>CONTROL</span></div>
</header>
<nav class="indice"><h2>Lo que hay adentro</h2><ol>
<li><a href="#recorrido"><em>1</em> El recorrido de un vehículo <span class="quien">Todos</span></a></li>
<li><a href="#certificar"><em>2</em> Certificar y guardar la ficha <span class="quien">Supervisor · celular</span></a></li>
<li><a href="#salida"><em>3</em> Dar salida con la factura <span class="quien">Facturador</span></a></li>
<li><a href="#transito"><em>4</em> En tránsito y certificar la llegada <span class="quien">Supervisor · Administrador</span></a></li>
<li><a href="#revision"><em>5</em> Revisión AI <span class="quien">Quien revisa en el muelle</span></a></li>
<li><a href="#interno"><em>6</em> Crear un Vh Interno <span class="quien">Con permiso «Vh Interno (+)»</span></a></li>
<li><a href="#informe"><em>7</em> Informe AI <span class="quien">Todos</span></a></li>
<li><a href="#fuente"><em>8</em> Fuente principal <span class="quien">Todos</span></a></li>
<li><a href="#seguimiento"><em>9</em> Seguimiento e Importar <span class="quien">Todos · Importar: Supervisor</span></a></li>
<li><a href="#novedades"><em>10</em> Novedades <span class="quien">Supervisor · Administrador</span></a></li>
<li><a href="#maestro"><em>11</em> El maestro <span class="quien">Supervisor · Administrador</span></a></li>
<li><a href="#ayuda"><em>+</em> Si algo no sale <span class="quien">Todos</span></a></li>
</ol></nav>''')

# ------------------------------------------------------------------ 1 RECORRIDO
A(sec("recorrido", 1, "El recorrido de un vehículo", "Para entender dónde estás parado", "Un vehículo pasa por siete pantallas, siempre en este orden. <b>Cada pantalla deja una prueba</b>: la ubicación y las fotos de la salida, las de la llegada, el conteo de botellas. Nada se escribe dos veces."))
A('''<div class="cadena">
<div class="eslabon"><b>1 · Certificar</b><span>En el patio: materiales, placa, ubicación y 3 fotos. Queda una ficha pendiente</span></div>
<div class="eslabon"><b>2 · Dar salida</b><span>El facturador escribe la factura: nacen los viajes</span></div>
<div class="eslabon"><b>3 · En tránsito</b><span>Va en camino; aquí se certifica la llegada</span></div>
<div class="eslabon"><b>4 · Revisión AI</b><span>Se cuentan las botellas en el muelle</span></div>
<div class="eslabon"><b>5 · Informe AI</b><span>Qué se cobra al socio y por qué</span></div>
<div class="eslabon"><b>6 · Fuente principal</b><span>La lista de todos los viajes, con su evidencia</span></div>
<div class="eslabon"><b>7 · Seguimiento</b><span>Lo que llegó frente a lo certificado del mes</span></div>
</div>''')
A('''<div class="tabla-envuelta"><table><thead><tr><th>Pantalla</th><th>Quién la usa</th><th>Qué permiso pide</th></tr></thead><tbody>
<tr><td>Certificar</td><td>El supervisor, parado junto al vehículo</td><td>Editar en «Certificar»</td></tr>
<tr><td>Dar salida</td><td>El facturador (el administrador también)</td><td>Editar en «Dar salida». Sin él solo se ven las fichas propias</td></tr>
<tr><td>En tránsito</td><td>Supervisor o administrador</td><td>Ver para mirar · Editar para certificar la llegada</td></tr>
<tr><td>Revisión AI</td><td>Quien cuenta las botellas</td><td>Editar para revisar y corregir</td></tr>
<tr><td>Vh Interno (+)</td><td>Control</td><td>Su propio permiso: «Vh Interno (+)»</td></tr>
<tr><td>Informe AI · Fuente principal · Seguimiento</td><td>Todos</td><td>Ver</td></tr>
<tr><td>Novedades · Maestro · Importar</td><td>Supervisor y administrador</td><td>Editar</td></tr>
</tbody></table></div>''')
A(ojo("SI UNA PANTALLA NO TE DEJA ENTRAR", "Dice «Esta pantalla no es para tu rol». No es un error: pídele al administrador el permiso en <b>Administración → Roles</b>."))
A("</section>")

# ------------------------------------------------------------------ 2 CERTIFICAR
A(sec("certificar", 2, "Certificar y guardar la ficha", "Lo hace el supervisor · desde el celular", "Cada camión que va a salir se certifica <b>parado a su lado</b>: con la ubicación del celular, todos sus materiales y tres fotos. Al final se <b>guarda una ficha</b>: el camión <b>todavía no sale</b>, porque la salida se confirma con el número de factura (sección siguiente). Son seis pasos, numerados arriba, y no se puede saltar ninguno."))
A(paso(1, "Activa tu ubicación", "Va primero a propósito: si se pidiera al final, alguien podría llenar todo desde su casa. Toca <b>«Activar mi ubicación»</b>, espera la tarjeta con la <b>precisión en metros</b> y revisa la dirección (se puede corregir). Luego <b>«Seguir»</b>.", fila([("c01-inicio", "Antes de activarla, los demás pasos están cerrados."), ("c02-ubicacion", "Ubicación tomada: ±9 m y la dirección.")])))
A(paso(2, "Escoge el origen", "«¿De qué CD viene?». La lista sale del Maestro: si falta uno, se agrega allá. Un toque y pasa solo al siguiente paso.", fila([("c03-origen", "Los CD del Maestro."), ("c04-material", "«¿Qué trae?» — los materiales, también del Maestro.")])))
A(paso(3, "Escoge los materiales, uno o varios", "Toca cada material que trae el camión. <b>Al tocarlo se abre al lado su casilla de estibas</b>: escribe cuántas trae de ese material. Si trae tres, tocas tres y llenas tres casillas. Para quitar uno, tócalo otra vez. El botón de abajo dice cuántas casillas faltan por llenar y se enciende cuando están todas.", fila([("c04-material-dos", "Dos materiales tocados: cada uno con su casilla de estibas."), ("c04-material-listo", "Con las estibas puestas: «Seguir con 2 materiales». El tiquete de abajo ya suma todo.")])))
A(ojo("MATERIAL «SIN FACTORES»", "Si a un material le faltan cajas por estiba, unidades por caja o HL por unidad en el Maestro, sale con aviso naranja. <b>Se certifica igual</b> —la evidencia es lo importante—; sus cajas, unidades y HL quedan en «—» (nunca en 0) hasta que se completen en el Maestro."))
A(fila([("c04-sinfactores", "Con «Caja plástica azul» el tiquete avisa qué material no se puede calcular.")], "una"))
A(paso(4, "Placa", "Aquí <b>ya aparece lo que escogiste</b>, cada material con sus estibas, cajas, unidades y HL calculados. <b>Solo falta la placa</b> (se pone en mayúsculas sola). La observación es opcional. <b>La factura no se pide aquí</b>: la escribe el facturador cuando le dé salida. Si te equivocaste de material o de estibas, «Cambiar materiales o estibas» te devuelve.", fila([("c05-carga", "Dos materiales ya calculados; solo se escribe la placa.")], "una")))
A(paso(5, "Tres fotos", "<b>Costado izquierdo</b> (el lado completo del vehículo), <b>costado derecho</b> (el otro lado, completo) y <b>placa</b> (que se lea el número sin dudar). Cada foto sale <b>estampada sola</b> con la placa, la fecha, la hora y las coordenadas: sigue probando algo aunque salga del sistema por WhatsApp. Si te equivocas, toca la foto para repetirla.", fila([("c06-fotos-vacio", "El botón dice cuántas faltan."), ("c06-fotos-una", "Va una: «Faltan 2 fotos»."), ("c06-fotos-tres", "Las tres: se enciende «Seguir a guardar».")])))
A(paso(6, "Revisa y guarda", "Apenas terminas las fotos, revisa el resumen —placa, origen, cada material con sus estibas, dónde y cuántas fotos— y toca <b>«Guardar la ficha»</b>. <b>El camión todavía no sale ni aparece en En tránsito</b>: queda como ficha pendiente esperando al facturador. «Certificar otro vehículo» empieza por el origen; la ubicación ya está tomada.", fila([("c07-guardar", "Revisión final."), ("c08-listo", "«Ficha guardada»: queda pendiente hasta que el facturador le dé salida.")])))
A("<h3 class='sub'>Mis fichas pendientes</h3>")
A(paso("★", "Lo que guardaste y aún no sale", "Debajo del formulario aparece <b>«Mis fichas pendientes»</b>: solo las que tú creaste y todavía no tienen factura. Cada una se identifica por su placa y materiales. Si te equivocaste en algo —una placa, una estiba— no se edita: <b>toca «Descartar», confirma y vuelve a hacerla</b>. Las fichas de otros compañeros no las ves aquí.", fila([("c09-mis-fichas", "Dos fichas mías esperando factura. La de PQR305 tiene 2/3 fotos: hay que descartarla y rehacerla.")], "una")))
A("<h3 class='sub'>Casos: si algo sale distinto</h3>")
A(casos(
  caso("«Diste que no a la ubicación»", "Permite la ubicación en los permisos del navegador del celular y vuelve a tocar el botón. Sin ella la certificación no prueba nada, por eso no hay salida por otro lado.", "c01-negada"),
  caso("Precisión de ±200 m o más", "Sal a cielo abierto y vuelve a tomarla con «Volver a tomarla». No bloquea, pero queda guardada: con ese error no se sabe ni la manzana."),
  caso("«Este equipo no tiene ubicación»", "Certificar se hace desde el <b>celular</b>, no desde un computador."),
  caso("«La foto llegó vacía»", "Tómala de nuevo con la cámara. Si la escogiste del carrete, ábrela primero en Fotos para que se descargue."),
  caso("«La ficha quedó guardada, pero la foto no subió»", "Sin las tres fotos no se le puede dar salida. Ve a <b>«Mis fichas pendientes»</b>, descártala y vuelve a hacerla con buena señal."),
  caso("Me equivoqué en la placa o en las estibas", "Las fichas no se editan: <b>descártala</b> en «Mis fichas pendientes» y créala de nuevo. Si ya salió (ya tiene factura), el <b>administrador</b> la corrige o la anula con motivo en En tránsito o Fuente principal."),
  caso("El botón dice «Faltan las estibas de N materiales»", "Tocaste materiales pero falta escribir sus estibas. Llena cada casilla o quita el material que no viene."),
))
A("</section>")

# ------------------------------------------------------------------ 3 DAR SALIDA
A(sec("salida", 3, "Dar salida con la factura", "Lo hace el facturador · con el permiso «Dar salida»", "Aquí llegan las fichas que se certificaron en el patio. El facturador ve todas, <b>escribe el número de factura con el que el camión sale</b> y le da salida. <b>Solo entonces nacen los viajes</b> y pasan a En tránsito: uno por cada material, todos con la misma placa y la misma factura, y allá se ven como <b>una sola tarjeta</b>. La hora de salida es la de ese momento."))
A(paso(1, "Cada ficha es un camión", "Arriba dice cuántas fichas hay por dar salida. Cada tarjeta trae la <b>placa</b>, la ruta, cuántas fotos tiene (<b>3/3</b>), <b>cada material con sus estibas, cajas, unidades y HL</b>, los totales, quién certificó y hace cuánto. Una franja <b>roja</b> a la izquierda avisa que lleva más de 12 horas esperando.", fila([("d01-ficha", "Una ficha con dos materiales, lista para dar salida.")], "una")))
A(paso(2, "Escribe la factura y da salida", "Escribe el <b>número de factura</b>: <b>solo números, máximo 10 dígitos</b> (si escribes una letra o pasas de 10, no la recibe). <b>Sin factura el botón «Dar salida» no se enciende</b>. Al tocarlo, el aviso dice cuántos viajes quedaron en tránsito: dos materiales, dos viajes con la misma placa y la misma factura.", fila([("d02-factura", "Con la factura escrita, el botón se enciende.")], "una")))
A(fig("d04-pc", "En el computador las fichas van en columnas: se ven varias a la vez.", "ancha"))
A("<h3 class='sub'>Casos: si algo sale distinto</h3>")
A(casos(
  caso("«Le faltan fotos: no se le puede dar salida»", "La ficha no tiene las tres fotos (falló la subida en el patio). Quien la creó debe <b>descartarla y hacerla de nuevo</b>; el botón no aparece.", "d03-faltan-fotos"),
  caso("«Solo puedes ver tus fichas: falta el permiso Dar salida»", "Tu rol no puede dar salida. Solo ves lo que tú certificaste y puedes descartarlo. Pídele al administrador el permiso en <b>Administración → Roles</b>.", "d05-sin-permiso"),
  caso("La factura se escribió mal", "Antes de tocar «Dar salida» puedes corregirla. Ya dada la salida, el <b>administrador</b> corrige el viaje en En tránsito o Fuente principal."),
  caso("Se certificó un camión por error", "Toca <b>«Descartar»</b> y confirma. No queda rastro en En tránsito, porque nunca salió."),
  caso("Sale un solo camión con varias facturas", "Cada ficha lleva <b>una</b> factura. Certifica en el patio un camión por factura, para que cada una lleve la suya."),
))
A("</section>")

# ------------------------------------------------------------------ 3 TRANSITO
A(sec("transito", 4, "En tránsito y certificar la llegada", "Supervisor · Administrador", "Aquí están los vehículos que salieron y aún no llegan, <b>agrupados por CD de origen</b>: arriba el grupo con la espera más larga. Cuando el camión llega, se certifica su llegada con ubicación y tres fotos, igual que la salida."))
A(fila_t(tira("t01-lista", 3, ["La lista, agrupada por CD de origen: arriba el que lleva más tiempo esperando.", "Cada tarjeta: placa, ruta, material, estibas / sider / cajas / HL, quién salió y cuándo, y «N/3 fotos».", "«Pedir revisión AI» (solo administrador) y, abajo, «Certificar llegada»."]), "n3"))
A(paso(1, "Lee la tarjeta", "El reloj de arriba a la derecha dice cuánto lleva en camino. <b>Pasadas 24 horas se pone rojo</b> y el grupo dice «el más viejo lleva 31 h». En la cinta «Requiere atención» salen los que llevan más de un día y los que <b>salieron sin las tres fotos</b>: esos no se pueden cerrar.", ""))
A(paso(2, "Toca «Certificar llegada» y activa la ubicación", "Son dos pasos: <b>Dónde</b> y <b>Fotos</b>. Igual que al salir, primero se activa la ubicación: sin ella las fotos no se abren.", fila([("t03-llegada-inicio", "Paso «Dónde»."), ("t03-llegada-ubicacion", "Ubicación tomada: sigue a las fotos.")])))
A(paso(3, "Las tres fotos de la llegada", "Las mismas tres: costado izquierdo, costado derecho y placa. Aquí además hay una <b>observación</b> opcional de hasta 400 letras y una foto extra para probarla: «llegó con un sello roto», por ejemplo.", fila([("t04-llegada-fotos", "Faltan las tres: el botón está apagado."), ("t04-llegada-fotos-listas", "Con las tres: «Certificar la llegada de KLM872».")])))
A(paso(4, "Confirma", "Al certificar, el camión <b>sale de En tránsito</b>. El aviso dice a dónde pasó: «XXX quedó recibido» o «XXX llegó y pasó a Revisión AI – certificada» si el administrador la había pedido.", ""))
A("<h3 class='sub'>Filtrar y encontrar</h3>")
A(paso("A", "Filtros y lista de placas", "En el celular los filtros se pliegan: toca <b>«Filtrar»</b>. Filtra por placa, CD de origen y fechas. <b>Puedes pegar varias placas de Excel</b> en el campo de placa: la pantalla te dice cuáles vienen en camino y cuáles no (y copia esa lista).", fila([("t02-filtros", "Filtros abiertos."), ("t09-pegar", "Tres placas pegadas: «Filtrando · 0 de 4» porque ninguna coincide con las que están en camino.")])))
A("<h3 class='sub'>Solo el administrador</h3>")
A(paso("B", "Corregir, anular, pedir revisión AI", "Cada tarjeta trae <b>Escoger</b>, <b>Corregir</b> y <b>Anular</b>. <b>Corregir</b> cambia lo que alguien tecleó mal (placa, origen, material, estibas, observación); el HL y el sider se recalculan solos. <b>Anular</b> pide un <b>motivo obligatorio</b> (mínimo 4 letras): el viaje no se borra, queda en gris en Fuente principal con su motivo, deja de contar y se puede devolver.", fila([("t05-corregir", "Corregir el viaje."), ("t06-anular", "Anular: el motivo es obligatorio.")])))
A(paso("C", "Anular varios de una vez", "Marca <b>«Escoger»</b> en cada tarjeta (o «Los N» de un grupo): abajo aparece la barra con «Anular los 2». Se pide un solo motivo para todos.", fila([("t08-escoger", "Dos viajes escogidos.")], "una")))
A(paso("E", "Un camión con varios materiales es UNA tarjeta", "Cuando el facturador da salida a una ficha con dos o tres materiales, aquí aparece <b>una sola tarjeta</b>: la placa, la factura, cada material con sus estibas, cajas y HL, y el <b>total del camión</b>. No hay una tarjeta por material. <b>«Certificar llegada» se hace una sola vez</b> para todo el camión: la ubicación y las fotos valen para cada material. «Anular todo» anula el camión completo, con un solo motivo.", fila([("t10-multi", "Un camión con dos materiales y una factura. El administrador decide la revisión AI material por material.")], "una")))
A(ojo("REVISIÓN AI EN UN CAMIÓN CON VARIOS MATERIALES", "El administrador la pide <b>por material</b>: cada material trae su propio botón «Pedir revisión AI» / «Quitar revisión AI». Escoge solo a cuál(es) aplica: la tarjeta dice «Revisión AI · 1 de 2 materiales» y marca en morado el que la lleva. Al certificar la llegada, ese material pasa a Revisión AI y el otro queda recibido."))
A(paso("D", "Pedir o quitar la revisión AI", "El botón punteado <b>«Pedir revisión AI»</b> le avisa a Revisión AI que ese camión debe contarse cuando llegue. Se marca con un sello morado <b>«Revisión AI · certificada»</b> y el botón pasa a «Quitar revisión AI».", fila([("t07-pedir-ai", "Sin revisión pedida."), ("t07-quitar-ai", "Pedida: la tarjeta lo dice.")])))
A(casos(
  caso("Más de 24 h sin llegar («falta»)", "Confirma con el conductor. Si nunca salió o fue un error, el <b>administrador</b> lo anula con motivo."),
  caso("«Salieron sin las tres fotos»", "Toca «Certificar llegada»: sale el bloque «Faltan las fotos de la SALIDA» con <b>«Completarlas aquí mismo»</b>. Esas fotos llevan la hora actual y la marca «AÑADIDA DESPUÉS»."),
  caso("«A la salida de ese viaje le faltan fotos»", "La base no deja cerrar sin las tres de la salida. Complétalas y recarga la página para que se destranque el botón."),
  caso("Llegó con un problema", "Escríbelo en la <b>observación</b> al certificar y repórtalo en <b>Novedades</b> para que quede con responsable y fecha."),
  caso("Placa o material equivocados", "Pídele al administrador «Corregir». No cambia las horas ni las fotos."),
))
A("</section>")

# ------------------------------------------------------------------ 4 REVISION
A(sec("revision", 5, "Revisión AI", "Lo hace quien cuenta las botellas en el muelle", "Cada camión tiene una revisión: se cuentan las botellas con defectos para saber <b>qué se le cobra al socio</b>. Hay dos clases, que se hacen <b>igual</b> y las dos cobran y entran al Informe AI."))
A(casos(
  caso("<b>Revisión AI – certificada</b> (morado)", "Camión de Sider al que el administrador pidió revisión. Aparece aquí en cuanto se certifica su llegada.", "s01-cert"),
  caso("<b>Revisión AI – normal</b> (magenta)", "Es el <b>Vh Interno</b>: un camión que crea control aquí mismo con el «+». Nace ya recibido: no pasa por En tránsito.", "s01-interno"),
))
A(ojo("LA LISTA", "Arriba, <b>«POR HACER»</b> dice cuántos hay de cada clase y cuántos llevan más de un día. Cada tarjeta dice «Llegó hace 30 h» (o «Creado hace 26 h» si es Vh Interno); pasadas 24 h se pone en rojo. Abajo, <b>«Hechas»</b> muestra las últimas, con el botón «Corregir»."))
A(paso(1, "Abre el camión", "Toca <b>«Hacer la revisión»</b> en su tarjeta. Arriba ves la cinta con placa, planta, llegada, material y la clase de revisión.", fila([("s02-cinta", "La cinta del camión que vas a revisar.")], "una")))
A(paso(2, "Datos de arriba", "<b>El <u>turno</u> ya viene puesto</b> según la hora de Colombia: <b>A</b> de 6 a.m. a 2 p.m., <b>B</b> de 2 p.m. a 10 p.m. y <b>C</b> de 10 p.m. a 6 a.m. Solo lo cambias si estás cerrando el turno anterior. El <b>canal</b>, el <b>socio</b> y el <b>tipo de envase</b> también vienen puestos y no se escriben: un <b>camión certificado por Sider es de T1</b> (no lleva socio) y el <b>Vh Interno</b> ya dijo si es de un Socio (y cuál) o de T1. El envase sale del material. Las <b>botellas recibidas</b> salen de la tarjeta del camión. <b>Lo único que escribes son las botellas revisadas</b> y los defectos. Lo que falta sale marcado en rojo. <b>Ya no se pide el N.° ZCL3</b>.", fila([("s02-caja0", "Camión certificado por Sider: turno, canal T1 y envase ya vienen; solo faltan las revisadas."), ("s03-caja0", "Lleno: turno, canal, envase, 82.080 recibidas (las de la tarjeta, en gris) y 4.104 revisadas.")])))
A(ojo("EL VH INTERNO TRAE SU CANAL Y SU SOCIO", "El Vh Interno dijo <b>si es de un Socio o de T1</b> (y qué socio) cuando lo crearon: aparecen en gris, con la nota «Lo dijo el Vh Interno», y <b>no se cambian aquí</b>. Igual que en el certificado, <b>solo escribes las botellas revisadas</b> y cuentas los defectos."))
A(ojo("SI ES UN VH INTERNO, NO ESCOGES NADA MÁS", "El Vh Interno ya dijo <b>si es de un Socio o de T1</b> (y qué socio) cuando lo crearon, y el <b>tipo de envase sale de su material</b>. Esos tres datos aparecen en gris, con la nota «Lo dijo el Vh Interno» o «Sale del material del viaje», y <b>no se cambian aquí</b>. <b>Solo escribes las botellas revisadas</b> y cuentas los defectos."))
A(fila([("s05-interno-caja0", "Vh Interno de un socio: canal, socio y envase ya vienen; falta escribir las botellas revisadas."), ("s05-interno-panel", "El panel dice que solo falta una cosa: «Cuántas se revisaron».")]))
A(paso(3, "Cuenta los defectos", "<b>No se escribe: se cuenta con − y +</b>. Los defectos <b>que cobran</b> van con borde rojo (rota o despicado, faltante, cemento o pintura, no retornable…); los que <b>se cuentan pero no cobran</b> (hongo, etiqueta asoleada, cuerpo extraño, cajas malas, estiba mala) van aparte, bajo «Se registran · no cobran». Abajo, los comentarios para el facturador.", fila([("s03-caja1", "Conteo de la muestra: 30 rotas, 12 faltantes, 6 de cemento; 9 con hongo (no cobra)."), ("s03-defectos", "El índice se ve siempre abajo mientras cuentas: 1,17 %.")])))
A(paso(4, "Mira el panel y cierra", "El panel oscuro calcula solo: <b>Índice de cobro</b> = defectos que cobran ÷ botellas revisadas; <b>No se abona</b> = recibidas × índice; <b>Abono final SAP</b> = recibidas − no se abona; <b>Hectolitros</b> = defectos que cobran × litros ÷ 100. Si falta algo, «Falta para cerrar» lo dice. Cuando todo está, <b>«Cerrar revisión»</b>.", fila([("s02-panel", "Vacío: dice qué falta para cerrar."), ("s03-panel", "Listo: 1,17 % · no se abona 960 · abono final 81.120.")])))
A(ojo("SI TE EQUIVOCASTE", "En «Hechas» toca <b>«Corregir»</b>: se abre la misma pantalla con lo guardado y al cerrar <b>reescribe la revisión, no la duplica</b>. Queda anotado «corregida N veces»."))
A(fila([("s01-hechas", "Una revisión ya hecha, con su botón «Corregir».")], "una"))
A(ojo("ANULAR UN CAMIÓN (SOLO EL ADMINISTRADOR)", "Igual que en En tránsito, quien administra la plataforma ve en cada tarjeta una casilla <b>«Escoger»</b> y un botón <b>«Anular»</b>. Puedes escoger varios (de los dos bloques) y anularlos de una con el botón rojo de la barra oscura de abajo, o usar <b>«Escoger los N de este bloque»</b>. Siempre pide el <b>motivo</b> (obligatorio, mínimo 4 letras). <b>Anular no borra</b>: el camión sale de Revisión AI y queda en Fuente principal, en gris, y se puede devolver. <b>Para borrarlo del todo</b>: ve a Fuente principal, filtra por «Anulado» y usa <b>Eliminar</b> (pide escribir ELIMINAR; no se puede devolver)."))
A(fila([("s06-escoger", "Tarjeta escogida: casilla marcada y botón «Anular»."), ("s06-anular", "El cuadro nombra las placas y pide el motivo.")]))
A(casos(
  caso("«HAY QUE REVISARLO: se revisaron más botellas de las que llegaron»", "Revisa los números de recibidas y revisadas: la muestra no puede pasar de lo recibido."),
  caso("«Hay N botellas marcadas de M revisadas»", "Sumaste más defectos que botellas revisadas. Baja algún contador o corrige las revisadas."),
  caso("«Botellas recibidas» sale como casilla y dice «La tarjeta no pudo calcularlas»", "Es un material sin factores (cajas por estiba, unidades por caja): escribe tú las botellas que llegaron y avisa al administrador para completar el Maestro."),
  caso("No sale el botón «Hacer la revisión» ni el «Corregir»", "Solo puedes mirar: falta el permiso de Editar en «Revisión AI». Pídeselo al administrador en Roles."),
  caso("«Todavía no está certificada la llegada de ese viaje»", "Certifica la llegada en En tránsito y vuelve."),
  caso("«Falta preparar la Revisión AI en Supabase»", "Es una instalación pendiente: avisa al administrador."),
))
A("</section>")

# ------------------------------------------------------------------ 5 VH INTERNO
A(sec("interno", 6, "Crear un Vh Interno", "Control · con el permiso «Vh Interno (+)»", "Un <b>Vh Interno</b> es un camión que <b>no certificó Sider</b>. Se crea aquí mismo, con el botón redondo <b>«+»</b> de Revisión AI. <b>Nace ya recibido</b>: no pasa por En tránsito ni pide certificar la llegada; queda directo en «Revisión AI – normal»."))
A(paso(1, "Toca el «+»", "El botón flotante está abajo a la derecha. Si no lo ves, tu rol no tiene el permiso «Vh Interno (+)»: pídeselo al administrador (Administración → Roles).", fila([("v01-fab", "Con permiso: el «+» flota abajo a la derecha."), ("v05-sin-mas", "Sin permiso: no hay «+».")])))
A(paso(2, "Di de quién es: Socio o T1", "Lo primero es tocar <b>«Socio»</b> o <b>«T1»</b>. De eso depende lo que sigue: si es de un <b>Socio</b>, <b>no lleva documento ni factura</b>: en su lugar escoges <b>qué socio</b> es (obligatorio). Si es de <b>T1</b>, sí lleva el <b>número de factura</b>: solo números, <b>de 1 a 10 dígitos, y es obligatorio</b>. Lo que escojas aquí es lo que después <b>llega ya puesto a la Revisión AI</b>: quien revisa no lo vuelve a escoger.", fila([("v07-socio-vacio", "Socio: aparece el desplegable de socios y no hay documento."), ("v07-t1-vacio", "T1: aparece el número de factura y no hay socio.")])))
A(paso(3, "Llena los datos del camión", "<b>Placa</b>: 3 letras y 3 números, sin más. <b>CD origen</b> y <b>destino</b> (Barranquilla por defecto; no pueden ser el mismo). Después el <b>material</b>: escribe el código o parte del nombre y escógelo, y pon sus <b>estibas</b>. Sider, cajas, unidades y HL se calculan solos.", fila([("v02-modal", "El formulario vacío: primero «¿De quién es?»."), ("v07-socio-lleno", "Camión de un Socio, lleno: el botón se enciende sin documento."), ("v03-llena", "Camión de T1, lleno: con su factura.")])))
A(paso(4, "¿Trae otro material en la misma factura?", "Toca <b>«+ Agregar otro material de esta factura»</b>: aparece un bloque nuevo con su propio material y <b>sus propias estibas</b>. Puedes agregar hasta 10. Cada material queda como <b>su propia tarjeta de revisión</b> (con sus botellas recibidas), pero todos con la misma placa, origen, destino y factura. Abajo ves el <b>total</b> de todos. Junto a cada material ves si sus cajas y unidades se calcularon (punto verde) o si <b>falta un factor en el Maestro</b> (aviso ámbar con «completar»): igual se puede crear el camión. Un material <b>no se puede repetir</b>: si es el mismo, suma las estibas en su línea. Con «Quitar» sacas un bloque. <b>Se crean todos o ninguno.</b>", fila([("v06-mas", "Al tocar el «+» sale el bloque «Material 2 de 2»."), ("v06-dos", "Los dos materiales llenos, con el total del camión."), ("v06-sin-factor", "Si un material no tiene factores en el Maestro, sale el aviso ámbar con «completar» y el total dice «falta mat. 2».")])))
A(paso(5, "«Crear Vh Interno»", "Aviso: «XXX creado: ya está en Revisión AI». Aparece con su sello <b>VH INTERNO</b> y se revisa como cualquier otro (si pusiste varios materiales, una tarjeta por cada uno).", ""))
A(ojo("SI EL BOTÓN NO SE ENCIENDE", "Lee la línea roja de abajo: dice exactamente qué falta —si es de un socio o de T1, el socio, la placa, el CD de origen, el material, las estibas o el documento (solo en T1)— y <b>«Sin eso el botón no se enciende»</b>."))
A(fila([("v04-falta", "Placa a medias («ABC»): dice «3 letras y 3 números, sin más» y qué más falta.")], "una"))
A(casos(
  caso("«El origen y el destino son el mismo CD»", "Escoge otro destino. Barranquilla es el de fábrica."),
  caso("«El documento son solo números…»", "Escribe solo dígitos, de 1 a 10. Sin guiones, letras ni espacios."),
  caso("Es de un socio y no tengo la factura", "Está bien: un <b>Socio</b> no lleva documento. Toca «Socio» y escoge cuál."),
  caso("Me equivoqué entre Socio y T1", "Toca el otro botón: el formulario cambia solo y no arrastra el socio ni la factura que habías puesto."),
  caso("Creé un Vh Interno por error", "El <b>administrador</b> lo anula con motivo. No se puede borrar."),
))
A("</section>")

# ------------------------------------------------------------------ 6 INFORME
A(sec("informe", 7, "Informe AI", "Todos · solo lectura", "Aquí se ven las revisiones <b>ya cerradas</b>: qué se cobra al socio y por qué. Filtra por fechas, clase de revisión (certificada o normal), socio, envase y canal."))
_t = tira("i01-informe", 2)
A(f'<figure class="ancha"><img src="{_t[0][0].replace("../","")}.jpg" alt=""><figcaption>Arriba: filtros y las cifras del periodo, con «Por qué hay tres cifras distintas».</figcaption></figure>')
A(f'<figure class="ancha"><img src="{_t[1][0].replace("../","")}.jpg" alt=""><figcaption>Abajo: «Qué defecto lo explica», «A quién llamar» y la revisión por revisión, con su clase (CERTIFICADA / NORMAL).</figcaption></figure>')
A(paso(1, "Las tres cifras distintas", "El informe muestra tres totales de «botellas con defectos» y <b>es normal que no sean iguales</b>: <b>Índice de cobro</b> (nueve categorías: es <b>el que se factura</b>), <b>Total botellas con defectos</b> (diez: suma hongo y etiqueta asoleada, no cobra) y <b>Total en hectolitros</b> (once categorías).", ""))
A(paso(2, "«A quién llamar»", "Lista los socios con más botellas que <b>no se les abonan</b>, con su índice: dice si es un problema suyo o si simplemente manda mucho.", ""))
A("</section>")

# ------------------------------------------------------------------ 7 FUENTE
A(sec("fuente", 8, "Fuente principal", "Todos", "La lista de <b>todos los viajes</b> (los 500 más recientes), con sus cifras, su estado y su evidencia. Si dudas de un camión, búscalo aquí por su placa: ahí queda todo."))
A(fig("f01-tabla", "Izquierda de la tabla: filtros (placa, CD origen, material, estado), datos del viaje y salida.", "ancha"))
A(fig("f01-tabla-der", "Derecha de la tabla (se llega deslizando): llegada, <b>estado con sus sellos</b>, quién, <b>el ojo de la evidencia</b> con su número de fotos, y las acciones.", "ancha"))
A(paso(1, "Los sellos", "<b>EN TRÁNSITO</b>: salió y aún no llega · <b>RECIBIDO</b>: ya certificó la llegada · <b>ANULADO</b>: no cuenta, con su motivo · <b>SIN FACTORES</b>: al material le faltan factores · <b>IMPORTADO</b>: vino de un Excel, sin fotos · <b>VH INTERNO</b>: creado con el «+», sin salida ni llegada · <b>REVISIÓN NORMAL</b> (pendiente o hecha) · <b>N/3 FOTOS</b>: cada punto exige 3; en rojo si faltan.", ""))
A(paso(2, "El ojo: la evidencia", "En cada fila, el ojo abre las <b>fotos, dirección y coordenadas</b> de la salida y la llegada. Quien puede editar completa desde ahí las fotos que falten (quedan marcadas «AÑADIDA DESPUÉS»). Los enlaces de las fotos duran 10 minutos: si no cargan, recarga la página.", ""))
A(paso(3, "Exportar a Excel", "Elige el periodo y, si quieres, «con fotos». Máximo 180 fotos por archivo: si te pasas, exporta por mes. <i>Solo el administrador</i> ve además <b>Corregir</b> y <b>Anular</b>, los mismos de En tránsito (Anular pide siempre un motivo; el viaje queda en gris y trae «Devolver» y «Eliminar»). <b>Eliminar</b> borra el registro completo (viaje, certificaciones, fotos y revisión AI) y <b>no se puede devolver</b>: solo sale en los camiones ya anulados y pide escribir <b>ELIMINAR</b>. Arriba de la tabla hay «Eliminar los N anulados» para borrar varios de una vez.", ""))
A("</section>")

# ------------------------------------------------------------------ 8 SEGUIMIENTO
A(sec("seguimiento", 9, "Seguimiento e Importar", "Todos · Importar lo hace el supervisor", "Compara <b>lo que llegó</b> a Barranquilla (el ZLDE que se importa de SAP) con <b>lo que se certificó</b>. Es el número del mes."))
A(fig("g01-informe", "Pestaña «3 Informe»: por CD de origen, vehículos e hectolitros, con el % de cumplimiento y el % de certificación.", "ancha"))
A(fila([("g02-zlde", "Pestaña 1 · ZLDE: lo que llegó."), ("g03-certificado", "Pestaña 2 · Certificado: lo de Fuente principal.")], "dos-pc"))
A(paso(1, "Cómo se lee", "<b>% Certificación = HL certificado ÷ HL de envase que llegó</b>; la meta es 10 %. <b>BU MTD</b> = lo que se debía certificar (10 % de lo recibido). <b>% Cumplimiento</b> = real ÷ BU. Semáforo del % de certificación: <b>menos de 5 % rojo</b>, <b>5 a 9 % naranja</b>, <b>más de 9 % verde</b>.", ""))
A(ojo("SI SALE 0 % O «—»", "Falta una mitad: lo que llegó (ZLDE) o lo certificado en ese rango. Los <b>Vh Interno no cuentan</b> aquí."))
A(paso(2, "Importar un Excel", "Desde Seguimiento, botón <b>«Importar»</b> (permiso de editar). Escoge la pestaña — <b>ZLDE</b> (lo que llegó) o <b>Base de datos</b> (históricos) —, el archivo (.xlsx, .xls o .csv), revisa las columnas detectadas y el resumen «Qué quedó», y guarda. <b>Reimportar reemplaza los meses del archivo</b> y nunca toca lo certificado con fotos.", fila([("g05-importar", "La pantalla Importar.")], "una")))
A(ojo("SKU U ORIGEN DESCONOCIDO", "Agrégalo en el <b>Maestro</b> y vuelve a importar."))
A("</section>")

# ------------------------------------------------------------------ 9 NOVEDADES
A(sec("novedades", 10, "Novedades", "Supervisor · Administrador", "Lo que salió mal, <b>con responsable y fecha</b>: sello roto, faltante, estibas golpeadas, cliente cerrado. Queda un hilo de respuestas y se cierra diciendo qué se hizo."))
A(fig("n03-pc", "La lista, con el contador de abiertas y sus filtros. Cada novedad dice el motivo, la placa, cuántos días lleva y a quién le toca.", "ancha"))
A(paso(1, "Reportar una novedad", "Toca <b>«Reportar novedad»</b>. Escoge el <b>tramo</b> (T1: lo que llega de otro CD; T2: el reparto al cliente), el <b>motivo</b>, el <b>viaje</b> (la factura, el lote y el SKU se llenan solos y se pueden corregir), a <b>quién le toca</b>, cuándo pasó y cuánto vino mal.", fila_t(tira("n02-form", 2, ["Tramo, motivo, viaje y a quién le toca.", "Cuándo pasó, factura, lote, cuánto vino mal y qué pasó."]), "n2")))
A(paso(2, "Responder o cerrar", "<b>«Responder»</b> deja tu respuesta en el hilo y la novedad sigue abierta. <b>«Cerrar con esto»</b> exige decir <b>qué se hizo</b>. Una novedad cerrada no admite respuestas: si hay algo más, se abre una nueva. Desde los 7 días abierta, la antigüedad se pone roja.", ""))
A("</section>")

# ------------------------------------------------------------------ 10 MAESTRO
A(sec("maestro", 11, "El maestro", "Supervisor · Administrador", "El catálogo del que salen todas las cifras: los <b>CD de origen</b>, los <b>materiales con sus factores</b> y las <b>estibas por sider</b>."))
A(fig("m01-pc", "Los tres bloques del Maestro y, arriba, el aviso de materiales sin factores.", "ancha"))
A(paso(1, "Materiales y factores", "Para cada material: <b>cajas por estiba</b>, <b>unidades por caja</b> y <b>HL por unidad</b>. Con ellos se calculan cajas, unidades y HL. Un material sin factores sale en «—» (nunca en 0) y su viaje lleva el sello «sin factores». Están vacíos a propósito: poner un 1 sería inventarse el dato.", ""))
A(paso(2, "Estibas por sider", "De fábrica <b>36</b>: un sider es un vehículo lleno. Si lo cambias, cambian <b>todos</b> los sider.", ""))
A(ojo("EL BOTÓN «×»", "Si hay viajes que usan un CD o material, <b>no se borra: se desactiva</b>. Recuerda tocar <b>«Guardar el maestro»</b>: mientras no lo hagas, no queda."))
A("</section>")

# ------------------------------------------------------------------ AYUDA
A(sec("ayuda", "+", "Si algo no sale", "Lámina de ayuda rápida", "Los mensajes de la aplicación dicen qué hacer. Estos son los más frecuentes."))
A(casos(
  caso("«Esta pantalla no es para tu rol»", "Pide el permiso al administrador en Administración → Roles."),
  caso("Las fotos no cargan en el ojo", "Los enlaces duran 10 minutos. Recarga la página."),
  caso("La exportación con fotos se corta", "Máximo 180 fotos por archivo: exporta por mes."),
  caso("Seguimiento en 0 % o «—»", "Falta lo que llegó (ZLDE) o lo certificado en ese rango. Importa el ZLDE del mes."),
  caso("HL vacío o «sin factores»", "Completa los factores del material en el Maestro."),
  caso("«Falta preparar / crear el módulo…»", "Es una instalación pendiente. Avisa al administrador."),
))
A(ojo("PARA RECORDAR", "<b>Ubicación, tres fotos y la placa bien.</b> Con eso el resto del recorrido fluye solo. Y si dudas de un camión, búscalo en Fuente principal por su placa: ahí queda todo."))
A('<footer><img src="../manual/img/logo-b.png" alt=""><span>Instructivo T1 / T2 · CONTROL · CD38 Ag01 · capturas reales del aplicativo con datos de ejemplo.</span></footer></section>'.replace("</section>", ""))
A("</section>")

CSS = open(os.path.join(AQUI, "estilo.css"), encoding="utf-8").read()
html = f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>T1 / T2 paso a paso</title><style>{FUENTES}{CSS}</style></head><body><div class="hoja">{"".join(H)}</div></body></html>'
open(os.path.join(AQUI, "instructivo.html"), "w", encoding="utf-8").write(html)
print("ok", len(html) // 1024, "KB")
