import { randomUUID } from "node:crypto";
import ClientPage from "./client-page";

// Force dynamic rendering: this page passes a timestamp as a prop,
// so static pre-generation at build time makes no sense.
export const dynamic = "force-dynamic";

// This is a React Server Component — it runs only on the server.
// Data computed here is serialised and passed as props to the client boundary.
export default function Page() {
  const serverTime = new Date().toISOString();
  const environment = process.env.NODE_ENV ?? "development";
  // Use a short build-stable ID so it doesn't change on every request in prod.
  const buildId = process.env.NEXT_BUILD_ID ?? randomUUID().slice(0, 8);

  return (
    <ClientPage
      serverTime={serverTime}
      environment={environment}
      buildId={buildId}
    />
  );
}
