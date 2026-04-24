// Type declaration for .rsfc single-file components.
declare module "*.rsfc" {
  import type { FC } from "react";
  const Component: FC;
  export default Component;
}
