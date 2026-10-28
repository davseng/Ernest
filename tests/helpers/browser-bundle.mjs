import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
/** Bundle real React components with explicit loopback-only action adapters. */
export async function browserBundle(entries, stubs) {
  const modules = new Map();
  async function bundle(spec, from = resolve("package.json")) {
    const file = Object.hasOwn(stubs, spec)
      ? spec
      : spec.startsWith("@/")
        ? resolve("src", spec.slice(2)) +
          (spec.includes("components/") ? ".tsx" : ".ts")
        : createRequire(from).resolve(spec);
    if (modules.has(file)) return file;
    modules.set(file, "");
    let code = Object.hasOwn(stubs, spec)
      ? stubs[spec]
      : await readFile(file, "utf8");
    if (/\.tsx?$/.test(file))
      code = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText;
    for (const m of [...code.matchAll(/require\(["']([^"']+)["']\)/g)]) {
      const dep = await bundle(
        m[1],
        file.startsWith("/") ? file : resolve("package.json"),
      );
      code = code.replace(m[0], `__require(${JSON.stringify(dep)})`);
    }
    modules.set(file, code);
    return file;
  }
  const ids = {};
  for (const entry of entries) ids[entry] = await bundle(entry);
  const runtime = `const process={env:{NODE_ENV:'development'}};const modules={${[...modules].map(([id, code]) => `${JSON.stringify(id)}:(module,exports,__require)=>{${code}\n}`).join(",")}};const cache={};function __require(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};modules[id](m,m.exports,__require);return m.exports;}`;
  return { ids, runtime };
}
