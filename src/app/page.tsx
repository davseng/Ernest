import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { AssetAppHeader } from "@/components/asset-app-header";
import { ErnestChat } from "@/components/ernest-chat";
import { getAssets } from "@/data/assets";
import { getConversationMessages, listConversations } from "@/data/conversations";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams?: Promise<{ asset?: string; chat?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const assets = await getAssets(session.user.id);
  const query = searchParams ? await searchParams : undefined;

  if (assets.length === 0) {
    return <div className="app-shell"><header className="site-header conversational-header"><Link className="brand" href="/" aria-label="Ernest home"><span className="brand-mark" aria-hidden="true">E</span>Ernest</Link><AccountMenu email={session.user.email} /></header><main className="empty-conversation-home"><h1>Ernest needs an asset to get started.</h1><p>Add an asset first, then Ernest can organize its knowledge and become the day-to-day interface for it.</p></main></div>;
  }

  const selectedAsset = assets.find((asset) => asset.id === query?.asset) ?? assets[0];
  const recentConversations = await listConversations(selectedAsset.id, session.user.id);
  const selectedConversation = query?.chat ? recentConversations.find((conversation) => conversation.id === query.chat) : undefined;
  const initialMessages = selectedConversation ? await getConversationMessages(selectedConversation.id, selectedAsset.id, session.user.id) : [];

  return (
    <div className="app-shell conversational-shell">
      <AssetAppHeader
        assetId={selectedAsset.id}
        assetName={selectedAsset.name}
        email={session.user.email}
        assets={assets.map((asset) => ({ id: asset.id, name: asset.name, type: asset.type }))}
      />
      <main className="conversation-main">
        <ErnestChat
          key={`${selectedAsset.id}:${selectedConversation?.id ?? "new"}`}
          assetId={selectedAsset.id} assetName={selectedAsset.name}
          initialConversationId={selectedConversation?.id}
          initialMessages={initialMessages.map((message) => ({ id: message.id, role: message.role, text: message.text, sources: message.sources?.map((source) => ({ documentTitle: source.documentTitle, pageNumber: source.pageNumber })), proposal: message.proposal, writeResult: message.writeResult }))}
          recentConversations={recentConversations.map((conversation) => ({ id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt.toISOString() }))}
        />
      </main>
    </div>
  );
}
