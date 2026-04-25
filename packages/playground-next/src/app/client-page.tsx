"use client";
import Hello from "../components/Hello.rsfc";
import ServerDataCard from "../components/ServerDataCard.rsfc";

interface Props {
  serverTime: string;
  environment: string;
  buildId: string;
}

export default function ClientPage({ serverTime, environment, buildId }: Props) {
  return (
    <>
      <ServerDataCard
        serverTime={serverTime}
        environment={environment}
        buildId={buildId}
      />
      <Hello />
    </>
  );
}
