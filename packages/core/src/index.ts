// @rsfc/core — public API

export type {
  RsfcBlockKind,
  RsfcBlock,
  RsfcParseError,
  RsfcDescriptor,
  RawSourceMap,
  VirtualModule,
  GeneratedOutput,
  SourcePosition,
  SourceLocation,
  StyleBlock,
} from "./types.js";

export { parse } from "./parser.js";
export { generate } from "./generator.js";
