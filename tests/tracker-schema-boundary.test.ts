import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("generated data client boundary", () => {
  it.each(["tracker-data", "acquisition", "visibility"])(
    "%s emits no runtime imports when exposing schema-derived types",
    (name) => {
      const fileName = resolve(import.meta.dirname, "../src/lib/types", `${name}.ts`);
      const { outputText } = ts.transpileModule(readFileSync(fileName, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ESNext,
          verbatimModuleSyntax: true,
        },
        fileName,
      });
      const emitted = ts.createSourceFile(fileName, outputText, ts.ScriptTarget.ESNext);
      const imports = emitted.statements.filter(
        (statement) =>
          ts.isImportDeclaration(statement) ||
          (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined),
      );
      // All schema/Valibot imports in these shared entry points must erase from emitted JS.
      expect(imports.map((statement) => statement.getText(emitted))).toEqual([]);
    },
  );
});
