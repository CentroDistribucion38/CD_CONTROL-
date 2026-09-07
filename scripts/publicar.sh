#!/usr/bin/env bash
# Publica esta plantilla en un repo nuevo de la cuenta CD38.
# Uso:  ./scripts/publicar.sh nombre-del-repo
set -euo pipefail

REPO="${1:-control}"
CUENTA="CD38"

if [ -d .git ]; then
  echo "Ya existe un repo git aquí. Aborto para no pisar nada."
  exit 1
fi

git init -q
git add .
git commit -qm "CONTROL — núcleo + módulo inventario"
git branch -M main
git remote add origin "https://github.com/${CUENTA}/${REPO}.git"

echo
echo "Listo localmente. Crea el repo vacío en:"
echo "  https://github.com/new  →  owner ${CUENTA}, nombre ${REPO}, sin README"
echo
echo "Y luego:"
echo "  git push -u origin main"
