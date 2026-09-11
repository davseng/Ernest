"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { askErnest, type AskErnestState } from "@/app/assets/[id]/ask-actions";
import {
  saveConversationMessage,
  saveConversationMessageState,
  startConversation,
} from "@/app/assets/[id]/conversation-actions";
import { confirmErnestWrite } from "@/app/assets/[id]/ernest-write-actions";
import type { ErnestWriteProposal } from "@/data/ernest-write-proposals";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: AskErnestState["sources"];
  proposal?: ErnestWriteProposal;
  writeResult?: { ok: boolean; message: string };
};

type RecentConversation = {
  id: string;
  title: string;
  updatedAt: string;
};

const emptyState: AskErnestState = { question: "", answer: "", sources: [] };

function ProposalDetails({ proposal }: { proposal: ErnestWriteProposal }) {
  if (proposal.kind === "log") return <dl className="write-proposal-details"><div><dt>Type</dt><dd>{proposal.log.entryType}</dd></div><div><dt>Date</dt><dd>{proposal.log.occurredAt}</dd></div><div><dt>Title</dt><dd>{proposal.log.title}</dd></div><div className="write-proposal-wide"><dt>Entry</dt><dd>{proposal.log.body}</dd></div></dl>;
  if (proposal.kind === "component_fact") return <dl className="write-proposal-details"><div><dt>Component</dt><dd>{proposal.componentFact.componentName}</dd></div><div><dt>Field</dt><dd>{proposal.componentFact.field}</dd></div><div className="write-proposal-wide"><dt>Value</dt><dd>{proposal.componentFact.value}</dd></div></dl>;
  if (proposal.kind === "inventory_add") return <dl className="write-proposal-details"><div><dt>Inventory item</dt><dd>{proposal.inventory.name}</dd></div><div><dt>Location</dt><dd>{proposal.inventory.locationCode || "Not specified"}</dd></div>{proposal.inventory.quantity ? <div><dt>Quantity</dt><dd>{proposal.inventory.quantity}</dd></div> : null}{proposal.inventory.details ? <div className="write-proposal-wide"><dt>Details</dt><dd>{proposal.inventory.details}</dd></div> : null}</dl>;
  if (proposal.kind === "inventory_update") return <dl className="write-proposal-details"><div><dt>Inventory item</dt><dd>{proposal.inventory.currentName}</dd></div>{proposal.inventory.name ? <div><dt>New name</dt><dd>{proposal.inventory.name}</dd></div> : null}{proposal.inventory.locationCode ? <div><dt>Location</dt><dd>{proposal.inventory.locationCode}</dd></div> : null}{proposal.inventory.quantity ? <div><dt>Quantity</dt><dd>{proposal.inventory.quantity}</dd></div> : null}{proposal.inventory.details ? <div className="write-proposal-wide"><dt>Details</dt><dd>{proposal.inventory.details}</dd></div> : null}</dl>;
  return <dl className="write-proposal-details"><div><dt>Asset field</dt><dd>{proposal.assetFact.field}</dd></div><div className="write-proposal-wide"><dt>Value</dt><dd>{proposal.assetFact.value}</dd></div></dl>;
}

function conversationContext(messages: ChatMessage[]) {
  return messages
    .slice(-10)
    .map((message) => `${message.role === "user" ? "Owner" : "Ernest"}: ${message.text}`)
    .join("\n")
    .slice(-6000);
}

function autoTitle(question: string) {
  const compact = question.replace(/\s+/g, " ").trim();
  return compact.length <= 60 ? compact : `${compact.slice(0, 57).trimEnd()}…`;
}

export function ErnestChat({
  assetId,
  assetName,
  initialConversationId,
  initialMessages,
  recentConversations,
}: {
  assetId: string;
  assetName: string;
  initialConversationId?: string;
  initialMessages: ChatMessage[];
  recentConversations: RecentConversation[];
}) {
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [recents, setRecents] = useState<RecentConversation[]>(recentConversations);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [thinkHarder, setThinkHarder] = useState(false);
  const [thinkingHarderNow, setThinkingHarderNow] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || pending) return;

    const useThinkHarder = thinkHarder;
    const prior = conversationContext(messages);
    const tempUserId = crypto.randomUUID();
    setMessages((current) => [...current, { id: tempUserId, role: "user", text: question }]);
    setInput("");
    setThinkHarder(false);
    setThinkingHarderNow(useThinkHarder);
    setPending(true);

    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const started = await startConversation(assetId, question);
        if (!started.ok) throw new Error(started.error);
        activeConversationId = started.conversation.id;
        setConversationId(activeConversationId);
        setRecents((current) => [{
          id: started.conversation.id,
          title: started.conversation.title,
          updatedAt: new Date().toISOString(),
        }, ...current.filter((conversation) => conversation.id !== started.conversation.id)]);
        const url = new URL(window.location.href);
        url.searchParams.set("asset", assetId);
        url.searchParams.set("chat", activeConversationId);
        window.history.replaceState(null, "", url.toString());
      } else {
        setRecents((current) => current.map((conversation) =>
          conversation.id === activeConversationId
            ? { ...conversation, updatedAt: new Date().toISOString() }
            : conversation,
        ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      }

      const savedUser = await saveConversationMessage(assetId, activeConversationId, { role: "user", text: question });
      if (savedUser.ok) {
        setMessages((current) => current.map((message) => message.id === tempUserId ? { ...message, id: savedUser.messageId } : message));
      }

      const formData = new FormData();
      formData.set("question", question);
      formData.set("conversation", prior);
      formData.set("thinkHarder", useThinkHarder ? "true" : "false");
      const result = await askErnest(assetId, emptyState, formData);
      const assistantText = result.error || result.answer || "I couldn’t answer that right now.";
      const savedAssistant = await saveConversationMessage(assetId, activeConversationId, {
        role: "assistant",
        text: assistantText,
        sources: result.sources,
        proposal: result.proposal,
      });

      setMessages((current) => [...current, {
        id: savedAssistant.ok ? savedAssistant.messageId : crypto.randomUUID(),
        role: "assistant",
        text: assistantText,
        sources: result.sources,
        proposal: result.proposal,
      }]);

      if (!conversationId) {
        const title = autoTitle(question);
        setRecents((current) => current.map((conversation) =>
          conversation.id === activeConversationId ? { ...conversation, title } : conversation,
        ));
      }
    } catch {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "I couldn’t save or continue that conversation right now. Please try again.",
      }]);
    } finally {
      setPending(false);
      setThinkingHarderNow(false);
    }
  }

  async function saveProposal(messageId: string, proposal: ErnestWriteProposal) {
    if (savingId) return;
    setSavingId(messageId);
    try {
      const result = await confirmErnestWrite(assetId, proposal);
      const nextProposal = result.ok ? undefined : proposal;
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, proposal: nextProposal, writeResult: result }
        : message));
      if (conversationId) {
        await saveConversationMessageState(assetId, conversationId, messageId, {
          proposal: nextProposal,
          writeResult: result,
        });
      }
    } catch {
      const writeResult = { ok: false, message: "I couldn’t save that. Please try again." };
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, writeResult } : message));
    } finally {
      setSavingId(null);
    }
  }

  async function dismissProposal(messageId: string) {
    const writeResult = { ok: true, message: "Not saved." };
    setMessages((current) => current.map((message) => message.id === messageId
      ? { ...message, proposal: undefined, writeResult }
      : message));
    if (conversationId) {
      await saveConversationMessageState(assetId, conversationId, messageId, { writeResult });
    }
  }

  function newChat() {
    if (pending || savingId) return;
    if (messages.some((message) => message.proposal) && !window.confirm("Start a new chat? Any unconfirmed proposal will stay in this conversation so you can return to it later.")) return;
    setConversationId(undefined);
    setMessages([]);
    setInput("");
    setThinkHarder(false);
    const url = new URL(window.location.href);
    url.searchParams.set("asset", assetId);
    url.searchParams.delete("chat");
    window.history.replaceState(null, "", url.toString());
  }

  return <section className="ernest-chat" aria-label={`Conversation about ${assetName}`}>
    <div className="ernest-chat-scroll">
      {messages.length === 0 ? <div className="ernest-welcome">
        <div className="ernest-welcome-toolbar">
          <details className="recent-chats-menu">
            <summary>Recent chats</summary>
            <div className="recent-chats-panel">
              <strong>Recent chats</strong>
              {recents.length ? recents.map((conversation) => (
                <Link key={conversation.id} href={`/?asset=${assetId}&chat=${conversation.id}`}>
                  <span>{conversation.title}</span>
                  <small>{new Date(conversation.updatedAt).toLocaleDateString()}</small>
                </Link>
              )) : <p>No saved chats yet.</p>}
            </div>
          </details>
        </div>
        <div className="ernest-orb" aria-hidden="true">E</div>
        <h1>What do you need from Ernest?</h1>
        <p className="ernest-context">Working with <strong>{assetName}</strong></p>
        <p>Ask a question, run an onboard task, or tell Ernest something that changed.</p>
        <div className="ernest-operate-actions"><Link href={`/assets/${assetId}/procedures#checklists`}>✓ <span>Checklist</span></Link><Link className="emergency-action" href={`/assets/${assetId}/procedures#emergency`}>! <span>Emergency</span></Link><button type="button" onClick={() => setInput("I want to record an update: ")}>＋ <span>Update</span></button></div>
        <div className="ernest-prompts"><button type="button" onClick={() => setInput("Where can I find ")}>Find something</button><button type="button" onClick={() => setInput("What maintenance should I be thinking about next?")}>Maintenance</button><button type="button" onClick={() => setInput("What do we know about the engine?")}>Ask about equipment</button></div>
      </div> : <div className="ernest-thread">
        <div className="chat-thread-toolbar">
          <details className="recent-chats-menu">
            <summary>Recent chats</summary>
            <div className="recent-chats-panel">
              <strong>Recent chats</strong>
              {recents.length ? recents.map((conversation) => (
                <Link key={conversation.id} href={`/?asset=${assetId}&chat=${conversation.id}`}>
                  <span>{conversation.title}</span><small>{new Date(conversation.updatedAt).toLocaleDateString()}</small>
                </Link>
              )) : <p>No saved chats yet.</p>}
            </div>
          </details>
          <button type="button" onClick={newChat} disabled={pending || !!savingId}>＋ New chat</button>
        </div>
        {messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}>
          <div className="chat-role">{message.role === "assistant" ? "Ernest" : "You"}</div>
          <div className="chat-bubble"><p>{message.text}</p></div>
          {message.sources?.length ? <div className="chat-sources">{message.sources.map((source) => <span key={`${source.documentTitle}-${source.pageNumber}`}>✓ {source.documentTitle} · p. {source.pageNumber}</span>)}</div> : null}
          {message.proposal ? <div className="write-proposal">
            <div className="write-proposal-heading"><span>{message.proposal.kind.startsWith("inventory_") ? "Proposed inventory change" : message.proposal.kind === "log" ? "Proposed log entry" : "Proposed verified fact"}</span><strong>Nothing is saved until you confirm.</strong></div>
            <p>{message.proposal.summary}</p><ProposalDetails proposal={message.proposal}/>
            <div className="write-proposal-actions"><button className="write-confirm" type="button" disabled={savingId === message.id} onClick={() => saveProposal(message.id, message.proposal!)}>{savingId === message.id ? "Saving…" : "Confirm & save"}</button><button className="write-cancel" type="button" onClick={() => dismissProposal(message.id)}>Don’t save</button></div>
          </div> : null}
          {message.writeResult ? <p className={message.writeResult.ok ? "write-result success" : "write-result error"}>{message.writeResult.message}</p> : null}
        </article>)}
        {pending ? <article className="chat-message assistant"><div className="chat-role">Ernest</div><div className="chat-bubble thinking"><span>{thinkingHarderNow ? "Thinking harder" : "Thinking"}</span><span>…</span></div></article> : null}
      </div>}
    </div>
    <div className="ernest-composer-wrap">
      <div className="ernest-composer-controls">
        <button className={thinkHarder ? "think-harder-toggle active" : "think-harder-toggle"} type="button" aria-pressed={thinkHarder} disabled={pending} onClick={() => setThinkHarder((current) => !current)}>✦ Think harder</button>
        {thinkHarder ? <span>For the next message only</span> : null}
      </div>
      <form className="ernest-composer" onSubmit={submit}><textarea aria-label={`Ask or tell Ernest about ${assetName}`} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask or tell Ernest anything…" rows={1} maxLength={500}/><button type="submit" disabled={pending || !input.trim()} aria-label="Send message">↑</button></form><p className="ernest-composer-note">Ernest can read your trusted knowledge. Changes require confirmation.</p>
    </div>
  </section>;
}
