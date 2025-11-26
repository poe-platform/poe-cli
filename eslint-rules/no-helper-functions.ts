import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'noHelperFunction';

// Built-in global functions and constructors
const BUILTIN_GLOBALS = new Set([
  // Global functions
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURI', 'decodeURIComponent',
  'encodeURI', 'encodeURIComponent', 'escape', 'unescape', 'eval',
  // Constructors
  'Array', 'Boolean', 'Date', 'Error', 'Function', 'Map', 'Number', 'Object',
  'Promise', 'Proxy', 'RegExp', 'Set', 'String', 'Symbol', 'WeakMap', 'WeakSet',
  'BigInt', 'ArrayBuffer', 'DataView', 'Float32Array', 'Float64Array',
  'Int8Array', 'Int16Array', 'Int32Array', 'Uint8Array', 'Uint16Array', 'Uint32Array',
  // Node.js globals
  'Buffer', 'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval',
  'clearImmediate', 'require', 'console',
  // Common type coercion
  'String', 'Number', 'Boolean',
]);

// Common module/package names that are external
const COMMON_MODULES = new Set([
  'path', 'fs', 'os', 'util', 'crypto', 'http', 'https', 'url', 'querystring',
  'stream', 'events', 'child_process', 'cluster', 'dgram', 'dns', 'net', 'readline',
  'repl', 'tls', 'tty', 'v8', 'vm', 'zlib', 'assert', 'buffer', 'console', 'process',
  // Common npm packages
  'lodash', '_', 'underscore', 'ramda', 'R', 'moment', 'dayjs', 'axios', 'express',
  'react', 'vue', 'angular', 'jquery', '$', 'chalk', 'commander', 'yargs',
]);

const noHelperFunctions: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow helper functions that only call another function and do nothing else',
    },
    messages: {
      noHelperFunction:
        'Remove helper function "{{name}}" - it only wraps "{{callee}}" without adding value',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    function isSimpleIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
      return node.type === 'Identifier';
    }

    function getCalleeName(node: TSESTree.CallExpression): string {
      if (isSimpleIdentifier(node.callee)) {
        return node.callee.name;
      }
      if (node.callee.type === 'MemberExpression' && isSimpleIdentifier(node.callee.property)) {
        return node.callee.property.name;
      }
      return '<anonymous>';
    }

    function isBuiltinOrExternalCall(node: TSESTree.CallExpression): boolean {
      const callee = node.callee;

      // Direct call to built-in global: parseInt(x), String(x), etc.
      if (isSimpleIdentifier(callee)) {
        return BUILTIN_GLOBALS.has(callee.name);
      }

      // Method call on an object: path.dirname(), fs.readFile(), etc.
      if (callee.type === 'MemberExpression') {
        // Check if it's a call on a known module: path.dirname()
        if (isSimpleIdentifier(callee.object)) {
          if (COMMON_MODULES.has(callee.object.name)) {
            return true;
          }
        }

        // Check for chained method calls: new Date().toISOString(), str.replace(), etc.
        // These are method calls on expressions, which are typically built-in methods
        if (callee.object.type === 'NewExpression') {
          return true; // new Something().method()
        }

        if (callee.object.type === 'CallExpression') {
          return true; // something().method() - chained calls
        }

        // Method calls on literals or other expressions are typically built-in
        if (callee.object.type === 'Literal' ||
            callee.object.type === 'TemplateLiteral' ||
            callee.object.type === 'ArrayExpression' ||
            callee.object.type === 'ObjectExpression') {
          return true;
        }
      }

      // new Constructor() calls
      if (node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'NewExpression') {
        return true;
      }

      return false;
    }

    function getFunctionName(
      node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression
    ): string {
      if (node.type === 'FunctionDeclaration' && node.id) {
        return node.id.name;
      }
      if (node.parent?.type === 'VariableDeclarator' && isSimpleIdentifier(node.parent.id)) {
        return node.parent.id.name;
      }
      if (node.parent?.type === 'Property' && isSimpleIdentifier(node.parent.key)) {
        return node.parent.key.name;
      }
      return '<anonymous>';
    }

    function getParamNames(params: TSESTree.Parameter[]): string[] {
      return params
        .filter((p): p is TSESTree.Identifier => p.type === 'Identifier')
        .map((p) => p.name);
    }

    function getArgumentNames(args: TSESTree.CallExpressionArgument[]): string[] {
      return args
        .filter((a): a is TSESTree.Identifier => a.type === 'Identifier')
        .map((a) => a.name);
    }

    function arraysEqual(a: string[], b: string[]): boolean {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => val === b[idx]);
    }

    // Keys to skip when traversing AST to avoid circular references
    const SKIP_KEYS = new Set(['parent', 'range', 'loc', 'start', 'end', 'tokens', 'comments']);

    function collectIdentifiers(node: TSESTree.Node): Set<string> {
      const identifiers = new Set<string>();
      const visited = new WeakSet<object>();
      
      function visit(n: TSESTree.Node) {
        if (visited.has(n)) return;
        visited.add(n);
        
        if (n.type === 'Identifier') {
          identifiers.add(n.name);
        }
        // Recursively visit child nodes, skipping parent references
        for (const key of Object.keys(n)) {
          if (SKIP_KEYS.has(key)) continue;
          const child = (n as any)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && item.type) {
                  visit(item);
                }
              }
            } else if (child.type) {
              visit(child);
            }
          }
        }
      }
      
      visit(node);
      return identifiers;
    }

    function usesClosureVariables(
      node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
      callExpr: TSESTree.CallExpression
    ): boolean {
      const paramNames = new Set(getParamNames(node.params));
      const functionName = node.type === 'FunctionDeclaration' && node.id ? node.id.name : null;
      
      // Collect all identifiers used in the call expression
      const usedIdentifiers = collectIdentifiers(callExpr);
      
      // Get the callee name(s) to exclude from closure check
      const calleeNames = new Set<string>();
      if (isSimpleIdentifier(callExpr.callee)) {
        calleeNames.add(callExpr.callee.name);
      } else if (callExpr.callee.type === 'MemberExpression') {
        if (isSimpleIdentifier(callExpr.callee.object)) {
          calleeNames.add(callExpr.callee.object.name);
        }
        if (isSimpleIdentifier(callExpr.callee.property)) {
          calleeNames.add(callExpr.callee.property.name);
        }
      }
      
      // Check if any identifier is not a parameter, not the callee, and not a built-in
      for (const id of usedIdentifiers) {
        if (!paramNames.has(id) &&
            !calleeNames.has(id) &&
            !BUILTIN_GLOBALS.has(id) &&
            !COMMON_MODULES.has(id) &&
            id !== functionName) {
          // This is a closure variable
          return true;
        }
      }
      
      return false;
    }

    function isHelperFunction(
      node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression
    ): TSESTree.CallExpression | null {
      const body = node.body;

      // Arrow function with expression body (implicit return)
      if (body.type === 'CallExpression') {
        // Skip built-in or external calls
        if (isBuiltinOrExternalCall(body)) {
          return null;
        }
        // Skip if using closure variables
        if (usesClosureVariables(node, body)) {
          return null;
        }
        const paramNames = getParamNames(node.params);
        const argNames = getArgumentNames(body.arguments);
        if (arraysEqual(paramNames, argNames)) {
          return body;
        }
        return null;
      }

      // Arrow function with await expression body
      if (body.type === 'AwaitExpression' && body.argument.type === 'CallExpression') {
        // Skip built-in or external calls
        if (isBuiltinOrExternalCall(body.argument)) {
          return null;
        }
        // Skip if using closure variables
        if (usesClosureVariables(node, body.argument)) {
          return null;
        }
        const paramNames = getParamNames(node.params);
        const argNames = getArgumentNames(body.argument.arguments);
        if (arraysEqual(paramNames, argNames)) {
          return body.argument;
        }
        return null;
      }

      // Block body - check for single return statement
      if (body.type === 'BlockStatement') {
        const statements = body.body;

        // Must have exactly one statement
        if (statements.length !== 1) {
          return null;
        }

        const stmt = statements[0];

        // Must be a return statement
        if (stmt.type !== 'ReturnStatement' || !stmt.argument) {
          return null;
        }

        let callExpr: TSESTree.CallExpression | null = null;

        // Direct call: return foo()
        if (stmt.argument.type === 'CallExpression') {
          callExpr = stmt.argument;
        }
        // Await call: return await foo()
        else if (
          stmt.argument.type === 'AwaitExpression' &&
          stmt.argument.argument.type === 'CallExpression'
        ) {
          callExpr = stmt.argument.argument;
        }

        if (!callExpr) {
          return null;
        }

        // Skip built-in or external calls
        if (isBuiltinOrExternalCall(callExpr)) {
          return null;
        }

        // Skip if using closure variables
        if (usesClosureVariables(node, callExpr)) {
          return null;
        }

        // Check if arguments are just passed through unchanged
        const paramNames = getParamNames(node.params);
        const argNames = getArgumentNames(callExpr.arguments);

        if (arraysEqual(paramNames, argNames)) {
          return callExpr;
        }
      }

      return null;
    }

    function checkFunction(
      node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression
    ) {
      const callExpr = isHelperFunction(node);
      if (callExpr) {
        context.report({
          node,
          messageId: 'noHelperFunction',
          data: {
            name: getFunctionName(node),
            callee: getCalleeName(callExpr),
          },
        });
      }
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
    };
  },
};

export default noHelperFunctions;