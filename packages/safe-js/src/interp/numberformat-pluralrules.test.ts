import { expect, it } from "vitest";
import { numberFormatIntl } from "./numberformat-pluralrules.js";

it.each([21, 100])("supports %i fraction digits in the private plural engine", maximumFractionDigits => {
  const value = new numberFormatIntl.PluralRules("en", { maximumFractionDigits });
  expect(value.resolvedOptions().maximumFractionDigits).toBe(maximumFractionDigits);
  expect(value.select(1)).toBe("one");
  expect(value.select(1.25)).toBe("other");
});

it("does not replace host Intl or its constructors", () => {
  const native = Intl.PluralRules;
  new numberFormatIntl.PluralRules("ru", { maximumFractionDigits: 100 });
  expect(Intl.PluralRules).toBe(native);
  expect(numberFormatIntl).not.toBe(Intl);
  expect(numberFormatIntl.PluralRules).not.toBe(Intl.PluralRules);
  expect(numberFormatIntl.Locale).toBe(Intl.Locale);
});

it.each(["ar", "ru", "en", "sl", "ak", "fr"])("preserves fractional plural operands for %s", locale => {
  for (const options of [{}, { minimumFractionDigits: 3 }, { maximumFractionDigits: 2 }]) {
    const actual = new numberFormatIntl.PluralRules(locale, options);
    const expected = new Intl.PluralRules(locale, options);
    for (const value of [1, 1.1, 1.01, 1.001, 2.2, 0.01, -1.1, 3.14, 0.5])
      expect(actual.select(value), JSON.stringify({ locale, options, value })).toBe(expected.select(value));
  }
});
