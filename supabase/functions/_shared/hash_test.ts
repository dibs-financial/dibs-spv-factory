import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { canonicalJson, computeLedgerHash, ledgerPreimage, sha256Hex } from "./hash.ts";

Deno.test("canonicalJson sorts keys at every depth and drops undefined", () => {
  const a = canonicalJson({ b: 1, a: { z: [3, { y: 1, x: 2 }], w: undefined } });
  const b = canonicalJson({ a: { z: [3, { x: 2, y: 1 }] }, b: 1 });
  assertEquals(a, b);
  assertEquals(a, '{"a":{"z":[3,{"x":2,"y":1}]},"b":1}');
});

Deno.test("ledgerPreimage matches the documented format", () => {
  const preimage = ledgerPreimage({
    previousHash: undefined,
    spvId: "spv_1",
    eventType: "SERIES_CREATED",
    timestamp: "2026-01-01T00:00:00.000Z",
    eventData: { b: 2, a: 1 },
  });
  assertEquals(preimage, 'GENESIS|spv_1|SERIES_CREATED|2026-01-01T00:00:00.000Z|{"a":1,"b":2}');
});

Deno.test("computeLedgerHash is deterministic and key-order independent", async () => {
  const base = { previousHash: "abc", spvId: "spv_1", eventType: "KYC_PASS", timestamp: "t" };
  const h1 = await computeLedgerHash({ ...base, eventData: { x: 1, y: 2 } });
  const h2 = await computeLedgerHash({ ...base, eventData: { y: 2, x: 1 } });
  const h3 = await computeLedgerHash({ ...base, eventData: { y: 2, x: 3 } });
  assertEquals(h1, h2);
  assertNotEquals(h1, h3);
  assertEquals(h1.length, 64);
});

Deno.test("sha256Hex known vector", async () => {
  assertEquals(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});
