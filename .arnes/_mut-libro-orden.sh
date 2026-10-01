#!/usr/bin/env bash
cd /home/claude/cd38-inventario
L=src/modulos/inventario/libro.ts; T=.arnes/inv-libro-orden.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m $L 'porSitio(a, b, (x) => x.ubicacion_combinada ?? x.ubicacion ?? "") || natural(a.codigo, b.codigo)' 'natural(a.codigo, b.codigo)' $T
m $L 'return natural(a.calle, b.calle) || natural(a.modulo, b.modulo)' 'return natural(a.modulo, b.modulo) || natural(a.calle, b.calle)' $T
m $L 'natural(a.modulo, b.modulo) || natural(a.lado' 'natural(a.modulo, b.modulo, "x") || natural(a.lado' $T
m $L '(a ?? "").localeCompare(b ?? "", "es", { numeric: true })' '(a ?? "").localeCompare(b ?? "", "es")' $T
m $L 'horizontal: nums.includes(i + 1) ? "right" : "left"' 'horizontal: "center"' $T
m $L 'horizontal: nums.includes(c) ? "right" : "left", indent: 1' 'horizontal: "left", indent: 1' $T
m $L 'encabezado(h, 6, C, [12, 13, 14, 15, 16, 19, 20])' 'encabezado(h, 6, C)' $T
m $L '.sort((a, b) => porSitio(a, b, (x) => x.clave))' '.sort((a, b) => b.clave.localeCompare(a.clave))' $T
m $L 'porSitio(a, b, (x) => x.ubicacion))' 'a.ubicacion.localeCompare(b.ubicacion))' $T
