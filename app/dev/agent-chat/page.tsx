import { notFound } from "next/navigation";
import { AgentChatPreview } from "./preview";

// Dev-only preview of the agent chat bubble and window in every state. Never ships: 404 in production.
//   /dev/agent-chat                 live: bubble + window wired to useAgentChat (mock /api/claim/*/ask in tests)
//   /dev/agent-chat?view=states     every state side by side, static
//   live options: claim=none · home=outside|db · snap=half|expanded · panel=1 · hidden=1
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  return <AgentChatPreview view={one("view") === "states" ? "states" : "live"} claim={one("claim")} home={one("home")} snap={one("snap")} panel={one("panel") === "1"} hidden={one("hidden") === "1"} />;
}
