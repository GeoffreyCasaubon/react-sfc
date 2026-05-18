import * as path from "path";
import { ExtensionContext, commands, window, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));
  const outputChannel = window.createOutputChannel("RSFC Language Server");

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
    traceOutputChannel: outputChannel,
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
