// Armazenamento de uso do DexGEO (Netlify Blobs).
// Cada contexto de deploy (produção, deploy preview, branch) usa um store
// próprio, para que testes nunca leiam ou apaguem os dados de produção.
import { getStore } from "@netlify/blobs";

export function usageStore(context) {
  const ctx = context?.deploy?.context || "production";
  const name = ctx === "production" ? "dexgeo-uso" : `dexgeo-uso-${ctx}`.replace(/[^a-z0-9-]/gi, "-");
  return getStore({ name, consistency: "strong" });
}

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });

export const clip = (v, n = 120) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
