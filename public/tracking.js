/* DexGEO — tracking.js
   Envia eventos de uso (acesso, análise, download) para /api/registro.
   O PDF nunca é enviado. Falhas de rede são ignoradas: a ferramenta continua funcionando. */
const ENDPOINT = "/api/registro";

function sessionId() {
  try {
    let id = sessionStorage.getItem("dexgeo.sessao");
    if (!id) { id = Math.random().toString(36).slice(2, 12); sessionStorage.setItem("dexgeo.sessao", id); }
    return id;
  } catch { return ""; }
}
const device = () => (matchMedia("(max-width: 767px)").matches ? "celular" : "computador");

export function track(tipo, user, payload = {}, { oncePerSession = false } = {}) {
  if (!user?.name || !user?.area) return;
  if (oncePerSession) {
    const key = `dexgeo.reg.${tipo}.${user.name}|${user.area}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* sem storage */ }
  }
  const body = JSON.stringify({ tipo, nome: user.name, area: user.area, sessao: sessionId(), dispositivo: device(), ...payload });
  try {
    fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: body.length < 60000 })
      .catch(() => {});
  } catch { /* ignora */ }
}
