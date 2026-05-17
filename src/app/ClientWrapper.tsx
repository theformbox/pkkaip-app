'use client';
import dynamic from "next/dynamic";

const PkkaipApp = dynamic(() => import("@/components/PkkaipApp"), { ssr: false });

export default function ClientWrapper() {
  return <PkkaipApp />;
}
