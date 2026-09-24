import React from "react";
import { createRoot } from "react-dom/client";
import { ClaveProvisional } from "@/components/ClaveProvisional";

const root = createRoot(document.getElementById("r")!);
root.render(<ClaveProvisional id="u1" nombre="Génesis Visbal" />);
