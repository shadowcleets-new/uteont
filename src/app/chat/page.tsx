import { listConversations } from "@/lib/services/conversations";
import { ChatView } from "./chat-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat — UTEONT" };

export default async function ChatPage() {
  const recent = await listConversations(20).catch(() => []);
  const lastActive = recent.find((c) => c.status === "active") ?? recent[0] ?? null;
  return (
    <div className="h-screen flex flex-col">
      <ChatView initialConversationId={lastActive?.id ?? null} recent={recent} />
    </div>
  );
}
