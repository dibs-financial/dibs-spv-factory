import { assertEquals } from "jsr:@std/assert@1";
import { selectAll } from "./records.ts";

Deno.test("selectAll pages past the PostgREST row cap and stops on a short page", async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => i);
  const ranges: Array<[number, number]> = [];
  const all = await selectAll<number>((from, to) => {
    ranges.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  });
  assertEquals(all.length, 2500);
  assertEquals(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

Deno.test("selectAll makes one extra call when the total is an exact multiple of the page size", async () => {
  let calls = 0;
  const all = await selectAll<number>((from, to) => {
    calls += 1;
    return Promise.resolve({ data: Array.from({ length: 4 }, (_, i) => i).slice(from, to + 1), error: null });
  }, 2);
  assertEquals(all, [0, 1, 2, 3]);
  assertEquals(calls, 3);
});
