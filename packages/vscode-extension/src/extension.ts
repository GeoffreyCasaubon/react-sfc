import * as path from "path";
import { ExtensionContext, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

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

  const traceLevel = workspace
    .getConfiguration("rsfc")
    .get<"off" | "messages" | "verbose">("trace.server", "off");

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "rsfc" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.rsfc"),
    },
    traceOutputChannel: traceLevel !== "off" ? undefined : undefined,
  };

  client = new LanguageClient(
    "rsfc",
    "RSFC Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();

  context.subscriptions.push({ dispose: () => client.stop() });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
