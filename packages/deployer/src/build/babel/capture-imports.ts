import babel from '@babel/core';

import { isNodeBuiltin } from '../isNodeBuiltin';

export function captureImports(dependencies: Map<string, [string, string][]>) {
  const t = babel.types;

  return {
    name: 'capture-imports',
    visitor: {
      ImportDeclaration(path) {
        const source = path.node.source.value;

        // do not capture node builtins
        if (isNodeBuiltin(source)) {
          return;
        }

        if (!dependencies.has(source)) {
          dependencies.set(source, [] as [string, string][]);
        }

        const bindings = dependencies.get(source)!;
        if (path.node.specifiers) {
          const specifiers = path.node.specifiers;
          for (const specifier of specifiers) {
            if (t.isImportNamespaceSpecifier(specifier)) {
              bindings.push(['*', specifier.local.name]);
            } else if (t.isImportDefaultSpecifier(specifier)) {
              bindings.push(['default', specifier.local.name]);
            } else {
              bindings.push([
                t.isStringLiteral(specifier.imported) ? `"${specifier.imported.value}"` : specifier.imported.name,
                specifier.local.name,
              ]);
            }
          }
        }
      },
    },
  } as babel.PluginObj;
}
