import { assertEquals } from "jsr:@std/assert@1";
import { allowedOrigins, corsHeadersFor } from "./http.ts";

function withEnv(value: string | undefined, fn: () => void) {
  const prev = Deno.env.get("DIBS_CORS_ORIGINS");
  if (value === undefined) Deno.env.delete("DIBS_CORS_ORIGINS");
  else Deno.env.set("DIBS_CORS_ORIGINS", value);
  try {
    fn();
  } finally {
    if (prev === undefined) Deno.env.delete("DIBS_CORS_ORIGINS");
    else Deno.env.set("DIBS_CORS_ORIGINS", prev);
  }
}

Deno.test("CORS: unset allowlist keeps * for Lovable preview", () => {
  withEnv(undefined, () => {
    assertEquals(allowedOrigins(), "*");
    const h = corsHeadersFor(new Request("https://x/", { headers: { Origin: "https://anything.example" } }));
    assertEquals(h["Access-Control-Allow-Origin"], "*");
  });
});

Deno.test("CORS: allowlist echoes a matching origin and omits others", () => {
  withEnv("https://app.dibs.financial, https://dibs.lovable.app/", () => {
    assertEquals(allowedOrigins(), ["https://app.dibs.financial", "https://dibs.lovable.app"]);
    const ok = corsHeadersFor(new Request("https://x/", { headers: { Origin: "https://dibs.lovable.app" } }));
    assertEquals(ok["Access-Control-Allow-Origin"], "https://dibs.lovable.app");
    assertEquals(ok["Vary"], "Origin");
    const blocked = corsHeadersFor(new Request("https://x/", { headers: { Origin: "https://evil.example" } }));
    assertEquals(blocked["Access-Control-Allow-Origin"], undefined);
  });
});
