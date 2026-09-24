export const normalizarUsuario = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9._-]/g,"");
