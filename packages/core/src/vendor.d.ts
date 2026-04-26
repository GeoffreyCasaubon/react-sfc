// Minimal ambient declarations for optional CSS preprocessor peer deps.
// The actual module types are irrelevant — css-compile.ts accesses them
// only via safe `as unknown as X` casts against locally-defined interfaces.
// These declarations exist solely to suppress TS7016 ("implicit any" on
// missing type packages) during the DTS build.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "less" { const _: any; export = _; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "stylus" { const _: any; export = _; }
