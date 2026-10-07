const W = window as any;
const q = new URLSearchParams(location.hash.slice(1));
const foto = (txt: string) => {
  const c = document.createElement("canvas"); c.width = 640; c.height = 480; const g = c.getContext("2d")!;
  g.fillStyle = "#7a8f6a"; g.fillRect(0, 0, 640, 480); g.fillStyle = "#c9b27c"; g.fillRect(40, 260, 560, 180);
  g.fillStyle = "#222"; g.font = "bold 44px sans-serif"; g.fillText(txt, 60, 120);
  return new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.8));
};
export const createClient = () => ({
  rpc: async (n: string, a: any) => {
    (W.__rpc ||= []).push({ n, a });
    if (q.get("sinsql")) return { data: null, error: { message: "Could not find the function public.conteo_evidencias in the schema cache" } };
    if (q.get("vacio")) return { data: [], error: null };
    const src = (n === "conteo_evidencias" ? W.__novs : W.__cob) as any[];
    return { data: src.filter((f) => f.dia >= a.p_desde && f.dia <= a.p_hasta), error: null };
  },
  auth: { getUser: async () => ({ data: { user: { id: "u1", email: "jefe@x" } } }) },
  from: (t?: string) => t === "productos"
    ? { select: () => ({ limit: async () => ({ data: W.__prods ?? Array.from({ length: 200 }, (_, i) => ({ sku: String(3100 + i), unidades_por_caja: 24, hl: 0.0033 })), error: null }) }) }
    : ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nombre: "Cristian Sampayo", usuario: "cris" } }) }) }) }),
  storage: { from: () => ({
    download: async (ruta: string) => { (W.__desc ||= []).push(ruta); if (ruta.includes("rota")) return { data: null, error: { message: "no" } }; return { data: await foto(ruta.slice(-14)), error: null } },
    createSignedUrl: async (ruta: string) => { const b = await foto(ruta.slice(-14)); const u = await new Promise<string>((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.readAsDataURL(b) }); return { data: { signedUrl: u }, error: null } },
  }) },
});
