"use client";

import { FormEvent, useState } from "react";

import { askErnest, type AskErnestState } from "@/app/assets/[id]/ask-actions";
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

const emptyState: AskErnestState = { question: "", answer: "", sources: [] };

function ProposalDetails({ proposal }: { proposal: ErnestWriteProposal }) {
  if (proposal.kind === "log") {
    return (
      <dl className="write-proposal-details">
        <div><dt>Type</dt><dd>{proposal.log.entryType}</dd></div>
        <div><dt>Date</dt><dd>{proposal.log.occurredAt}</dd></div>
        <div><dt>Title</dt><dd>{proposal.log.title}</dd></div>
        <div className="write-proposal-wide"><dt>Entry</dt><dd>{proposal.log.body}</dd></div>
      </dl>
    );
  }
  if (proposal.kind === "component_fact") {
    return (
      <dl className="write-proposal-details">
        <div><dt>Component</dt><dd>{proposal.componentFact.componentName}</dd></div>
        <div><dt>Field</dt><dd>{proposal.componentFact.field}</dd></div>
        <div className="write-proposal-wide"><dt>Owner-provided value</dt><dd>{proposal.componentFact.value}</dd></div>
      </dl>
    );
  }
  return (
    <dl className="write-proposal-details">
      <div><dt>Asset field</dt><dd>{proposal.assetFact.field}</dd></div>
      <div className="write-proposal-wide"><dt>Owner-provided value</dt><dd>{proposal.assetFact.value}</dd></div>
    </dl>
  );
}

export function ErnestChat({ assetId, assetName }: { assetId: string; assetName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || pending) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: question };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setPending(true);

    const formData = new FormData();
    formData.set("question", question);

    try {
      const result = await askErnest(assetId, emptyState, formData);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: result.error || result.answer || "I couldn’t answer that right now.",
        sources: result.sources,
        proposal: result.proposal,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: "I couldn’t answer that right now. Please try again." },
      ]);
    } finally {
      setPending(false);
    }
  }

  async function saveProposal(messageId: string, proposal: ErnestWriteProposal) {
    if (savingId) return;
    setSavingId(messageId);
    try {
      const result = await confirmErnestWrite(assetId, proposal);
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, proposal: result.ok ? undefined : message.proposal, writeResult: result }
        : message));
    } catch {
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, writeResult: { ok: false, message: "I couldn’t save that. Please try again." } }
        : message));
    } finally {
      setSavingId(null);
    }
  }

  function dismissProposal(messageId: string) {
    setMessages((current) => current.map((message) => message.id === messageId
      ? { ...message, proposal: undefined, writeResult: { ok: true, message: "Not saved." } }
      : message));
  }

  return (
    <section className="ernest-chat" aria-label={`Conversation about ${assetName}`}>
      <div className="ernest-chat-scroll">
        {messages.length === 0 ? (
          <div className="ernest-welcome">
            <div className="ernest-orb" aria-hidden="true">E</div>
            <h1>What can I help with on {assetName}?</h1>
            <p>Ask questions, record maintenance, or tell Ernest something you want remembered about this asset.</p>
            <div className="ernest-prompts">
              <button type="button" onClick={() => setInput("What maintenance should I be thinking about next?")}>What maintenance is coming up?</button>
              <button type="button" onClick={() => setInput("What do we know about the engine?")}>What do we know about the engine?</button>
              <button type="button" onClick={() => setInput("I changed the engine oil today.")}>Record maintenance</button>
            </div>
          </div>
        ) : (
          <div className="ernest-thread">
            {messages.map((message) => (
              <article className={`chat-message ${message.role}`} key={message.id}>
                <div className="chat-role">{message.role === "assistant" ? "Ernest" : "You"}</div>
                <div className="chat-bubble"><p>{message.text}</p></div>
                {message.sources && message.sources.length > 0 ? (
                  <div className="chat-sources">
                    {message.sources.map((source) => (
                      <span key={`${source.documentTitle}-${source.pageNumber}`}>{source.documentTitle} · p. {source.pageNumber}</span>
                    ))}
                  </div>
                ) : null}
                {message.proposal ? (
                  <div className="write-proposal">
                    <div className="write-proposal-heading">
                      <span>{message.proposal.kind === "log" ? "Proposed log entry" : "Proposed verified fact"}</span>
                      <strong>Nothing is saved until you confirm.</strong>
                    </div>
                    <p>{message.proposal.summary}</p>
                    <ProposalDetails proposal={message.proposal} />
                    <div className="write-proposal-actions">
                      <button
                        className="write-confirm"
                        type="button"
                        disabled={savingId === message.id}
                        onClick={() => saveProposal(message.id, message.proposal!)}
                      >
                        {savingId === message.id ? "Saving…" : "Confirm & save"}
                      </button>
                      <button className="write-cancel" type="button" onClick={() => dismissProposal(message.id)}>Don’t save</button>
                    </div>
                  </div>
                ) : null}
                {message.writeResult ? (
                  <p className={message.writeResult.ok ? "write-result success" : "write-result error"}>{message.writeResult.message}</p>
                ) : null}
              </article>
            ))}
            {pending ? (
              <article className="chat-message assistant">
                <div className="chat-role">Ernest</div>
                <div className="chat-bubble thinking"><span>Thinking</span><span>…</span></div>
              </article>
            ) : null}
          </div>
        )}
      </div>

      <div className="ernest-composer-wrap">
        <form className="ernest-composer" onSubmit={submit}>
          <textarea
            aria-label={`Message Ernest about ${assetName}`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={`Message Ernest about ${assetName}`}
            rows={1}
            maxLength={500}
          />
          <button type="submit" disabled={pending || !input.trim()} aria-label="Send message">↑</button>
        </form>
        <p className="ernest-composer-note">Ernest reads automatically. Durable writes always require your confirmation.</p>
      </div>
    </section>
  );
}
