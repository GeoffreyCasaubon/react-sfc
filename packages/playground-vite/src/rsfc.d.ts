// Type declaration for .rsfc single-file components.
// The default export is always a React functional component.
declare module "*.rsfc" {
  import type { FC } from "react";
  const Component: FC;
  export default Component;
}
