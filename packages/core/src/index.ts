// @rsfc/core — public API

export type {
  RsfcBlockKind,
  RsfcBlock,
  RsfcParseError,
  RsfcDescriptor,
  RawSourceMap,
  VirtualModule,
  GeneratedOutput,
} from "./types.js";

export { parse } from "./parser.js";
