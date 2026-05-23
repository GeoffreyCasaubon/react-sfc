import * as fs from "fs";
import * as path from "path";
import { ExtensionContext, commands, window, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

function resolveTsdk(): string {
  // Check VS Code typescript.tsdk workspace/user setting
  const configured = workspace.getConfiguration("typescript").get<string>("tsdk");
  if (configured) {
    if (path.isAbsolute(configured)) return configured;
    for (const folder of workspace.workspaceFolders ?? []) {
      const resolved = path.join(folder.uri.fsPath, configured);
      if (fs.existsSync(path.join(resolved, "typescript.js"))) return resolved;
    }
    return configured;
  }

  // Walk up from each workspace folder to find TypeScript (handles monorepos)
  for (const folder of workspace.workspaceFolders ?? []) {
    let current = folder.uri.fsPath;
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(current, "node_modules", "typescript", "lib");
      if (fs.existsSync(path.join(candidate, "typescript.js"))) return candidate;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return "";
}

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));
  const outputChannel = window.createOutputChannel("RSFC Language Server");

  // Prefer workspace TypeScript, fall back to typescript.js bundled in dist/tslib
  const bundledTsdk = path.join(context.extensionPath, "dist", "tslib");
  const tsdk = resolveTsdk() || (fs.existsSync(path.join(bundledTsdk, "typescript.js")) ? bundledTsdk : "");

  outputChannel.appendLine(`[RSFC] tsdk resolved: "${tsdk}" (bundled fallback: "${bundledTsdk}")`);
  outputChannel.appendLine(`[RSFC] workspaceFolders: ${JSON.stringify(workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [])}`);

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "rsfc" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.rsfc"),
    },
    outputChannel,
    initializationOptions: { typescript: { tsdk } },
  };

  client = new LanguageClient(
    "rsfc",
    "RSFC Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();

  context.subscriptions.push(outputChannel);
  context.subscriptions.push({ dispose: () => client.stop() });

  context.subscriptions.push(
    commands.registerCommand("rsfc.restartServer", async () => {
      await client.stop();
      await client.start();
      window.showInformationMessage("RSFC: Language Server restarted.");
    }),
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
