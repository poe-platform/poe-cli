import { expect, it } from "vitest";
import { extractNumberFormatData, numberFormatDataModule, extractPluralRulesData, isolateNumberFormatEngine, isolatePluralRulesEngine } from "../../scripts/numberformat-data.mjs";

const wrapper = (value: string) => `if (Intl.NumberFormat && typeof Intl.NumberFormat.__addLocaleData === 'function') { Intl.NumberFormat.__addLocaleData(${value}); }`;

it("extracts locale data without executing the dependency's global registration", () => {
  const data = { locale: "en", data: { numbers: { value: "test" } } };
  expect(extractNumberFormatData(wrapper(JSON.stringify(data)), "en.js")).toEqual(data);
});

it.each([
  "({locale:'en',data:globalThis.sideEffect()})",
  '{"locale":"en","data":{},"extra":true}',
  '{"locale":7,"data":{}}',
  '{"locale":"en","data":null}'
])("rejects code or malformed data instead of evaluating it: %s", payload => {
  expect(() => extractNumberFormatData(wrapper(payload), "en.js")).toThrow();
});

it("rejects unexpected registration calls and extra script statements", () => {
  const source = wrapper('{"locale":"en","data":{}}');
  expect(() => extractNumberFormatData(source.replace("Intl.NumberFormat.__addLocaleData(", "other("), "en.js")).toThrow();
  expect(() => extractNumberFormatData(source + "sideEffect();", "en.js")).toThrow();
});

it("generates lazy data factories with deterministic locale keys", () => {
  const values = [{ locale: "fr", data: {} }, { locale: "en", data: {} }];
  const source = numberFormatDataModule(values);
  expect(source).toContain('"en": () => (');
  expect(source.indexOf('"en": () => (')).toBeLessThan(source.indexOf('"fr": () => ('));
  expect(source).not.toContain("Intl.NumberFormat");
  expect(source).not.toContain("eval");
});

it("rejects duplicate locale registrations", () => {
  expect(() => numberFormatDataModule([{ locale: "en", data: {} }, { locale: "en", data: {} }])).toThrow();
});

it("interns repeated locale data without losing fresh object semantics", async () => {
  const shared = JSON.parse('{"__proto__":{"safe":true},"values":[0,1,null,false,"العربية",{"label":"a long repeated label"}]}');
  const values = Array.from({ length: 20 }, (_, index) => ({ locale: `en-x-${index}`, data: { shared, repeated: shared } }));
  const source = numberFormatDataModule(values);
  expect(Buffer.byteLength(source)).toBeLessThan(Buffer.byteLength(JSON.stringify(values)));
  const generated = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  for (const value of values) expect(generated.localeData[value.locale]()).toEqual(value);
  const first = generated.localeData[values[0]!.locale]();
  first.data.shared.values.push("changed");
  expect(first.data.repeated).toEqual(shared);
  expect(generated.localeData[values[0]!.locale]()).toEqual(values[0]);
  expect(Object.hasOwn(first.data.shared, "__proto__")).toBe(true);
  expect(Object.getPrototypeOf(first.data.shared)).toBe(Object.prototype);
});

it("preserves the dependency's license as a bundler-retained legal comment", () => {
  const license = "MIT License\nCopyright example";
  expect(numberFormatDataModule([{ locale: "en", data: {} }], license)).toContain(`/*!\n${license}\n*/`);
});

it("extracts a plural-rule factory without copying its global registration", () => {
  const expression = '{"locale":"en","data":{"fn":function(n){return n===1?"one":"other"}}}';
  const source = `if(Intl.PluralRules){Intl.PluralRules.__addLocaleData(${expression})}else{globalThis.registry=[]}`;
  expect(extractPluralRulesData(source, "en.js")).toEqual({ locale: "en", expression });
});

it("rejects executable plural-data initializers outside rule functions", () => {
  expect(() => extractPluralRulesData('if(Intl.PluralRules){Intl.PluralRules.__addLocaleData({locale:"en",data:sideEffect()})}', "en.js")).toThrow();
});

it("retains valid legacy locale aliases from the plural dataset", () => {
  const expression = '{"locale":"tl","data":{"fn":function(){return "other"}}}';
  expect(extractPluralRulesData(`if(Intl.PluralRules){Intl.PluralRules.__addLocaleData(${expression})}`, "tl.js").locale).toBe("tl");
});

it("gives the copied number engine a private Intl binding and removes stale source maps", () => {
  const source = "export const make=()=>new Intl.PluralRules();\n//# sourceMappingURL=index.js.map";
  const generated = isolateNumberFormatEngine(source, "MIT notice");
  expect(generated).toContain('import { numberFormatIntl as Intl }');
  expect(generated).toContain("new Intl.PluralRules()");
  expect(generated).toContain("MIT notice");
  expect(generated).not.toContain("sourceMappingURL");
  expect(generated).not.toContain("globalThis.Intl =");
});

it("rejects unexpected engine shape instead of silently leaving host plural rules", () => {
  expect(() => isolateNumberFormatEngine("export const make=()=>7", "MIT")).toThrow();
  expect(() => isolateNumberFormatEngine("const Intl={};export const make=()=>new Intl.PluralRules()", "MIT")).toThrow();
});

it("retains exact formatted plural text and rejects changed dependency shapes", () => {
  const source = 'function ResolvePluralInternal(){return PluralRuleSelect(locale, type, n, GetOperands(s, exponent));}\nfunction PluralRuleSelect(locale,type,n,operands){return "broken";}\nvar PluralRules=class PluralRules{resolvedOptions(){const internalSlots=getInternalSlots(this);const opts={};return opts;}};\n//# sourceMappingURL=index.js.map';
  const generated = isolatePluralRulesEngine(source, "MIT notice");
  expect(generated).toContain("PluralRuleSelect(locale, type, s, exponent)");
  expect(generated).toContain('fn(formattedString, type === "ordinal", exponent)');
  expect(generated).not.toContain("GetOperands(s, exponent)");
  expect(generated).not.toContain("sourceMappingURL");
  expect(generated).toContain("MIT notice");
  for (const field of ["roundingIncrement", "roundingMode", "roundingPriority", "trailingZeroDisplay"])
    expect(generated).toContain(`opts.${field} = internalSlots.${field};`);
  expect(() => isolatePluralRulesEngine(source.replace("return opts;", "return different;"), "MIT")).toThrow("resolved-options shape");
  expect(() => isolatePluralRulesEngine(source.replace("GetOperands(s, exponent)", "differentOperands(s)"), "MIT")).toThrow();
  expect(() => isolatePluralRulesEngine("export const other=1;", "MIT")).toThrow();
});
