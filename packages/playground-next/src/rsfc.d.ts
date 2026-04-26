// Type declaration for .rsfc single-file components.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "*.rsfc" {
  import type { FC } from "react";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Component: FC<any>;
  export default Component;
}
