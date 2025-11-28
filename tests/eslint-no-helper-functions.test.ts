import { describe, it, expect } from 'vitest';
import { RuleTester } from '@typescript-eslint/rule-tester';
import noHelperFunctions from '../eslint-rules/no-helper-functions.ts';

// Configure RuleTester for TypeScript
RuleTester.afterAll = () => {};

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('no-helper-functions rule', () => {
  it('should be a valid ESLint rule', () => {
    expect(noHelperFunctions).toBeDefined();
    expect(noHelperFunctions.meta).toBeDefined();
    expect(noHelperFunctions.create).toBeDefined();
  });

  ruleTester.run('no-helper-functions', noHelperFunctions, {
    valid: [
      // Function with multiple statements
      {
        code: `function foo() {
          const x = 1;
          return bar(x);
        }`,
      },
      // Function with logic before call
      {
        code: `function foo(a, b) {
          const sum = a + b;
          return process(sum);
        }`,
      },
      // Arrow function with multiple statements
      {
        code: `const foo = () => {
          console.log('hello');
          return bar();
        };`,
      },
      // Function that returns a value, not a call
      {
        code: `function foo() {
          return 42;
        }`,
      },
      // Function with conditional logic
      {
        code: `function foo(x) {
          if (x > 0) {
            return bar(x);
          }
          return baz(x);
        }`,
      },
      // Empty function
      {
        code: `function foo() {}`,
      },
      // Function that transforms arguments
      {
        code: `function foo(x) {
          return bar(x + 1);
        }`,
      },
      // Function with different argument order
      {
        code: `function foo(a, b) {
          return bar(b, a);
        }`,
      },
      // Async function with await and other logic
      {
        code: `async function foo() {
          const data = await fetch();
          return process(data);
        }`,
      },
      // Built-in global function calls are allowed
      {
        code: `const toNumber = (x) => parseInt(x);`,
      },
      {
        code: `const toString = (x) => String(x);`,
      },
      // Static methods on built-in objects are allowed
      {
        code: `const toNumber = (x) => Number.parseInt(x, 10);`,
      },
      {
        code: `const stringify = (x) => JSON.stringify(x);`,
      },
      {
        code: `const floor = (x) => Math.floor(x);`,
      },
      // Imported functions from external packages are allowed
      {
        code: `import lodash from 'lodash';
const wrap = (x) => lodash.map(x);`,
      },
      {
        code: `import { map } from 'lodash';
const wrap = (x) => map(x);`,
      },
      {
        code: `import * as R from 'ramda';
const wrap = (x) => R.map(x);`,
      },
      // Require from external packages are allowed
      {
        code: `const lodash = require('lodash');
const wrap = (x) => lodash.map(x);`,
      },
      {
        code: `const { map } = require('lodash');
const wrap = (x) => map(x);`,
      },
      {
        code: `const delay = (ms) => setTimeout(ms);`,
      },
      // Module/package method calls are allowed
      {
        code: `const getDir = (p) => path.dirname(p);`,
      },
      {
        code: `const readConfig = (p) => fs.readFileSync(p);`,
      },
      // Chained method calls are allowed (new Date().toISOString())
      {
        code: `const timestamp = () => new Date().toISOString();`,
      },
      {
        code: `const formatted = () => new Date().toISOString().replace(/[:.]/g, "-");`,
      },
      // Method calls on call results are allowed
      {
        code: `const upper = (s) => s.toString().toUpperCase();`,
      },
      // Functions using closure variables are allowed
      {
        code: `const outerVar = 'test';
const foo = (x) => bar(outerVar, x);`,
      },
      {
        code: `function outer() {
  const config = {};
  return function inner(x) {
    return process(config, x);
  };
}`,
      },
      {
        code: `const handler = (ctx) => ctx.send(message);`,
      },
      {
        code: `const logger = (msg) => console.log(prefix, msg);`,
      },
      // Method calls on closure variables are allowed
      {
        code: `const registry = createRegistry();
const wrapper = () => registry.require("test");`,
      },
      {
        code: `const obj = getObject();
const fn = (x) => obj.method(x);`,
      },
    ],
    invalid: [
      // Simple wrapper function
      {
        code: `function foo() {
          return bar();
        }`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Wrapper with same arguments passed through
      {
        code: `function foo(x) {
          return bar(x);
        }`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Wrapper with multiple arguments passed through
      {
        code: `function foo(a, b, c) {
          return bar(a, b, c);
        }`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Arrow function wrapper
      {
        code: `const foo = (x) => {
          return bar(x);
        };`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Arrow function with implicit return
      {
        code: `const foo = (x) => bar(x);`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Arrow function with no args
      {
        code: `const foo = () => bar();`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Async wrapper function
      {
        code: `async function foo() {
          return bar();
        }`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Async wrapper with await
      {
        code: `async function foo() {
          return await bar();
        }`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Method wrapper (function expression)
      {
        code: `const obj = {
          foo: function(x) {
            return bar(x);
          }
        };`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Method wrapper (shorthand)
      {
        code: `const obj = {
          foo(x) {
            return bar(x);
          }
        };`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Void function wrapper (no return, just calls)
      {
        code: `function foo(x) {
          bar(x);
        }`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
      // Void method wrapper in object
      // Async void wrapper
      {
        code: `async function foo(x) {
          await bar(x);
        }`,
        errors: [{ messageId: 'noHelperFunction' }],
      },
    ],
  });
});
