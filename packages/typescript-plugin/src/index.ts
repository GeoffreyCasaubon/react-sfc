import type tsServer from "typescript/lib/tsserverlibrary";
import { makeVirtualContent } from "./virtual.js";

// ---------------------------------------------------------------------------
// @g-casau/rsfc-typescript-plugin
//
// A TypeScript Language Service Plugin that gives IDEs accurate prop types
// when importing `.rsfc` components.
//
// How it works:
//   import Counter from "./Counter.rsfc"
//   → TypeScript resolves the .rsfc file
//   → plugin redirects it to a virtual .rsfc.__rsfc__.tsx file
//   → the virtual file is generated from the <script> / <script setup> block
//   → TypeScript type-checks against the virtual file's exports
//
// Usage (tsconfig.json):
//   "compilerOptions": {
//     "plugins": [{ "name": "@g-casau/rsfc-typescript-plugin" }]
//   }
// ---------------------------------------------------------------------------

const VIRTUAL_EXT = ".__rsfc__.tsx";

function init(modules: { typescript: typeof tsServer }) {
  const ts = modules.typescript;

  function create(info: tsServer.server.PluginCreateInfo): tsServer.LanguageService {
    const logger = info.project.projectService.logger;
    const log = (msg: string) => logger.info(`[rsfc] ${msg}`);

    log("plugin loaded");

    const host = info.languageServiceHost;

    // --- readFile helper that delegates to the host or ts.sys ----------------
    function readFile(fileName: string): string | undefined {
      if (host.readFile) return host.readFile(fileName, "utf-8");
      return ts.sys.readFile(fileName, "utf-8");
    }

    function fileExists(fileName: string): boolean {
      if (host.fileExists) return host.fileExists(fileName);
      return ts.sys.fileExists(fileName);
    }

    // --- Virtual file content ------------------------------------------------
    function getVirtualContent(virtualPath: string): string | undefined {
      const rsfcPath = virtualPath.slice(0, -VIRTUAL_EXT.length);
      return makeVirtualContent(rsfcPath, (p) => {
        if (!fileExists(p)) return undefined;
        return readFile(p);
      });
    }

    // --- Override language service host methods -------------------------------

    // Serve virtual file snapshots
    const origGetScriptSnapshot = host.getScriptSnapshot.bind(host);
    host.getScriptSnapshot = (fileName) => {
      if (fileName.endsWith(VIRTUAL_EXT)) {
        const content = getVirtualContent(fileName);
        return content !== undefined ? ts.ScriptSnapshot.fromString(content) : undefined;
      }
      return origGetScriptSnapshot(fileName);
    };

    // Make virtual files exist and be readable
    if (host.fileExists) {
      const origFileExists = host.fileExists.bind(host);
      host.fileExists = (fileName) => {
        if (fileName.endsWith(VIRTUAL_EXT)) {
          return origFileExists(fileName.slice(0, -VIRTUAL_EXT.length));
        }
        return origFileExists(fileName);
      };
    }

    if (host.readFile) {
      const origReadFile = host.readFile.bind(host);
      host.readFile = (fileName, encoding) => {
        if (fileName.endsWith(VIRTUAL_EXT)) {
          return getVirtualContent(fileName);
        }
        return origReadFile(fileName, encoding);
      };
    }

    // Include virtual .tsx files in the project
    const origGetScriptFileNames = host.getScriptFileNames.bind(host);
    host.getScriptFileNames = () => {
      const names = origGetScriptFileNames();
      const virtual = names
        .filter((n) => n.endsWith(".rsfc"))
        .map((n) => n + VIRTUAL_EXT);
      return [...names, ...virtual];
    };

    // Version tracks .rsfc source (virtual file is always in sync)
    const origGetScriptVersion = host.getScriptVersion.bind(host);
    host.getScriptVersion = (fileName) => {
      if (fileName.endsWith(VIRTUAL_EXT)) {
        return origGetScriptVersion(fileName.slice(0, -VIRTUAL_EXT.length)) + "-virtual";
      }
      return origGetScriptVersion(fileName);
    };

    // Redirect module resolution: './Foo.rsfc' → './Foo.rsfc.__rsfc__.tsx'
    if (host.resolveModuleNames) {
      const origResolve = host.resolveModuleNames.bind(host);
      host.resolveModuleNames = (
        moduleNames,
        containingFile,
        reusedNames,
        redirectedRef,
        options,
        containingSourceFile,
      ) => {
        const resolved = origResolve(
          moduleNames,
          containingFile,
          reusedNames,
          redirectedRef,
          options,
          containingSourceFile,
        );
        return moduleNames.map((name, i) => {
          const r = resolved[i];
          if (r?.resolvedFileName.endsWith(".rsfc")) {
            return { ...r, resolvedFileName: r.resolvedFileName + VIRTUAL_EXT };
          }
          return r;
        });
      };
    }

    log("host patched");

    // Return the language service unmodified — type info comes from virtual files.
    return info.languageService;
  }

  return { create };
}

export = init;
