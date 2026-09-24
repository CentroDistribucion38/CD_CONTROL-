
import { createRoot } from "react-dom/client";
import { Base } from "../src/app/(app)/inventario/base/Base";
const w = window as any;
createRoot(document.getElementById("r")!).render(<div className="fe"><Base enviadas={[]} abiertas={[]} conteos={w.C} tope={false} /></div>);
