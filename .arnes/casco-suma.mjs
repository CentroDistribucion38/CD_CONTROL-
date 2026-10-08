import { buildSync } from "esbuild";
import { writeFileSync } from "node:fs";
const js = buildSync({ entryPoints: ["src/modulos/casco/suma.ts"], bundle: true, write: false, format: "esm" }).outputFiles[0].text;
writeFileSync(new URL("./_suma.mjs", import.meta.url).pathname, js);
const { suma, esCuenta } = await import(new URL("./_suma.mjs", import.meta.url).href);
const fallas=[]; const t=(e,v)=>{ const r=suma(e); if(r!==v) fallas.push(`${JSON.stringify(e)} → ${r}, esperaba ${v}`) };
t("",0); t("56",56); t("=24+15-36",3); t("24 + 15 − 36",3); t("-5+10",5); t("(2+3)*4",20); t("10/4",2.5); t("1,5+1",2.5);
t("2+",null); t("abc",null); t("2**3",null); t("1/0",null); t("alert(1)",null); t("(1+2",null); t("1+2)",null); t("--3",3); t("3-+2",1);
// la cuenta real del Excel (CASCO!C2)
const c2="=24+15-36+21+32+3+20-36+32+61+26-5-20-36-36-36-29+77-36+28+5-8-36+10+9+21-36-36-36-36+71+3+9+2+33+5-1";
let esp=0; for (const m of c2.slice(1).match(/[+-]?\d+/g)) esp+=parseInt(m); t(c2, esp);
if(esCuenta("56")||!esCuenta("24+1")||!esCuenta("5-2")||esCuenta("=56")) fallas.push("esCuenta");
console.log(fallas.length?fallas.join("\n"):"suma OK (valor C2 = "+esp+")");
