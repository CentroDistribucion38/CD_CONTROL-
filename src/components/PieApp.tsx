"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Pie de la portada: la marca a la izquierda, cerrar sesión a la derecha. */
export function PieApp() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <footer className="sh-pie">
      <span>
        <b>CD38</b>
      </span>
      <button type="button" onClick={salir} disabled={saliendo}>
        {saliendo ? "Saliendo…" : "Cerrar sesión"}
      </button>
    </footer>
  );
}
