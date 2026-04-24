// Minimal ambient declarations for untyped optional peer dependencies.
// These are only used via dynamic import inside compileCss().

declare module "less" {
  const less: {
    render(input: string, options?: Record<string, unknown>): Promise<{ css: string }>;
  };
  export default less;
}

declare module "stylus" {
  const stylus: {
    render(str: string, options?: Record<string, unknown>): string;
  };
  export default stylus;
}
