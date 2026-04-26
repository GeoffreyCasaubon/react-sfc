import { readFileSync, writeFileSync } from "node:fs";
import { compileFile, parseFile } from "./compile.js";

const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
).version as string;

const HELP = `
Usage: rsfc <command> [options]

Commands:
  compile <file.rsfc>    Compile to standalone JavaScript (styles inlined)
  parse   <file.rsfc>    Parse and output the descriptor as JSON

Options:
  -o, --out <file>       Write output to a file instead of stdout
  --version              Print version number
  --help                 Print this help message

Examples:
  rsfc compile src/App.rsfc
  rsfc compile src/App.rsfc -o dist/App.js
  rsfc parse src/App.rsfc | jq '.docs'
`.trim();

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function flag(...names: string[]): string | true | undefined {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx === -1) continue;
    // If next arg exists and isn't a flag, return it as value
    const next = args[idx + 1];
    if (next !== undefined && !next.startsWith("-")) return next;
    return true;
  }
  return undefined;
}

const cmd = args.find((a) => !a.startsWith("-"));
const outFile = flag("--out", "-o");
const outPath = outFile === true ? undefined : outFile;

if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(HELP);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION);
  process.exit(0);
}

// The input file is the first positional arg after the command
const cmdIdx = args.indexOf(cmd);
const inputFile = args
  .slice(cmdIdx + 1)
  .find((a) => !a.startsWith("-") && a !== outPath);

if (!inputFile) {
  console.error(`rsfc ${cmd}: missing input file\nRun "rsfc --help" for usage.`);
  process.exit(1);
}

function emit(content: string): void {
  if (outPath) {
    writeFileSync(outPath, content, "utf-8");
    process.stderr.write(`Written to ${outPath}\n`);
  } else {
    process.stdout.write(content);
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

if (cmd === "compile") {
  compileFile(inputFile)
    .then((code) => emit(code))
    .catch((err) => {
      process.stderr.write(`rsfc compile: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
} else if (cmd === "parse") {
  try {
    const descriptor = parseFile(inputFile);
    emit(JSON.stringify(descriptor, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(`rsfc parse: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
} else {
  process.stderr.write(`rsfc: unknown command "${cmd}"\nRun "rsfc --help" for usage.\n`);
  process.exit(1);
}
