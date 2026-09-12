"use server";

import { auth } from "@/auth";
import {
  appendConversationMessage,
  createConversation,
  updateConversationMessageState,
} from "@/data/conversations";
import type { ErnestWriteProposal } from "@/data/ernest-write-proposals";

export async function startConversation(assetId: string, firstQuestion: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sign in required." };
  const conversation = await createConversation(assetId, session.user.id, firstQuestion);
  if (!conversation) return { ok: false as const, error: "Could not create conversation." };
  return { ok: true as const, conversation };
}

export async function saveConversationMessage(
  assetId: string,
  conversationId: string,
  message: {
    role: "user" | "assistant";
    text: string;
    sources?: { documentId?: string; documentTitle: string; pageNumber: number }[];
    proposal?: ErnestWriteProposal;
    writeResult?: { ok: boolean; message: string };
  },
) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sign in required." };
  const messageId = await appendConversationMessage(conversationId, assetId, session.user.id, message);
  if (!messageId) return { ok: false as const, error: "Could not save conversation message." };
  return { ok: true as const, messageId };
}

export async function saveConversationMessageState(
  assetId: string,
  conversationId: string,
  messageId: string,
  state: { proposal?: ErnestWriteProposal; writeResult?: { ok: boolean; message: string } },
) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sign in required." };
  const ok = await updateConversationMessageState(messageId, conversationId, assetId, session.user.id, state);
  return ok ? { ok: true as const } : { ok: false as const, error: "Could not update conversation message." };
}
