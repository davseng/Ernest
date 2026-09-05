import "server-only";

import OpenAI from "openai";

import type { ErnestContextPage } from "@/data/document-context";

let client: OpenAI | undefined;

function openai() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  client ??= new OpenAI({ apiKey });
  return client;
}

export async function answerErnestQuestion(question: string, context: ErnestContextPage[]) {
  if (context.length === 0) {
    return "I couldn’t find enough relevant information in the extracted documents to answer that.";
  }

  const sourceText = context
    .map((page) => `SOURCE: ${page.documentTitle} — page ${page.pageNumber}\n${page.text}`)
    .join("\n\n---\n\n");

  const response = await openai().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    reasoning: { effort: "low" },
    instructions: [
      "You are Ernest, an asset knowledge assistant.",
      "Answer only from the supplied source text. Do not use outside knowledge to fill gaps.",
      "If the sources do not support a confident answer, say that clearly.",
      "Cite factual claims using the exact source title and page number in parentheses, for example (Owner Manual, p. 12).",
      "Prefer a concise practical answer. Mention important warnings, conditions, limits, or exceptions found in the sources.",
    ].join(" "),
    input: `QUESTION:\n${question}\n\nSOURCE TEXT:\n${sourceText}`,
  });

  return response.output_text.trim() || "I couldn’t produce a supported answer from the available documents.";
}
