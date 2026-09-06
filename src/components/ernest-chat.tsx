"use client";

import { FormEvent, useState } from "react";

import { askErnest, type AskErnestState } from "@/app/assets/[id]/ask-actions";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: AskErnestState["sources"];
};

const emptyState: AskErnestState = { question: "", answer: "", sources: [] };

export function ErnestChat({ assetId, assetName }: { assetId: string; assetName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

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

  return (
    <section className="ernest-chat" aria-label={`Conversation about ${assetName}`}>
      <div className="ernest-chat-scroll">
        {messages.length === 0 ? (
          <div className="ernest-welcome">
            <div className="ernest-orb" aria-hidden="true">E</div>
            <h1>What can I help with on {assetName}?</h1>
            <p>Ask about manuals, maintenance, equipment, troubleshooting, or anything Ernest already knows about this asset.</p>
            <div className="ernest-prompts">
              <button type="button" onClick={() => setInput("What maintenance should I be thinking about next?")}>What maintenance is coming up?</button>
              <button type="button" onClick={() => setInput("What do we know about the engine?")}>What do we know about the engine?</button>
              <button type="button" onClick={() => setInput("How do I use the windlass safely?")}>How do I use the windlass safely?</button>
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
        <p className="ernest-composer-note">Ernest answers from verified knowledge and should say when it doesn’t know.</p>
      </div>
    </section>
  );
}
