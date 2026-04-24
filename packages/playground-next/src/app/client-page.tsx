"use client";
import dynamic from "next/dynamic";

const Hello = dynamic(() => import("../components/Hello.rsfc"), { ssr: false });

export default function ClientPage() {
  return <Hello />;
}
