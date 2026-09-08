import { describe, expect, it } from "vitest";

import { run } from "../../src/run.js";

describe("targeted Test262-style supported semantics", () => {
  it("imports registered modules without exposing an ambient loader", async () => {
    await expect(run("return (await import('fixture')).value",{modules:{fixture:{value:7}}}))
      .resolves.toMatchObject({ok:true,returnValue:7});
    await expect(run("try{await import('node:fs')}catch(error){return error.message.includes('Unknown module')}"))
      .resolves.toMatchObject({ok:true,returnValue:true});
  });
  it.each([
    [
      "keeps finally completion after catch",
      "try { throw 1; } catch (error) { return error; } finally { const observed = true; }",
      1
    ],
    [
      "uses short-circuit evaluation",
      "let calls = 0; function hit() { calls += 1; return true; } false && hit(); true || hit(); return calls;",
      0
    ],
    [
      "binds catch parameters lexically",
      "const error = 'outer'; try { throw 'inner'; } catch (error) { if (error !== 'inner') throw 'bad'; } return error;",
      "outer"
    ],
    [
      "supports class inheritance and super method dispatch",
      "class Base{value(){return 3}}class Child extends Base{value(){return super.value()+4}}return new Child().value()",
      7
    ],
    [
      "preserves private field values and brand checks",
      "class Box{#value=7;read(){return this.#value}has(value){return #value in value}}const box=new Box();return [box.read(),box.has(box),box.has({})]",
      [7, true, false]
    ],
    [
      "distinguishes array elisions from explicit undefined elements",
      "const values=[,undefined,,];return [values.length,0 in values,1 in values,2 in values]",
      [3, false, true, false]
    ]
  ])("%s", async (_name, source, expected) => {
    await expect(run(source)).resolves.toMatchObject({ ok: true, returnValue: expected });
  });
});

describe("explicit unsupported ECMAScript syntax", () => {
  it.skip("skips proxies and weak references outside the sandbox language", () => undefined);
});
