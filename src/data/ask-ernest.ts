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

export async function answerErnestQuestion(
  question: string,
  context: ErnestContextPage[],
  structuredContext = "",
) {
  if (context.length === 0 && !structuredContext.trim()) {
    return "I couldn’t find enough verified information about this asset to answer that.";
  }

  const sourceText = context
    .map((page) => `SOURCE: ${page.documentTitle} — page ${page.pageNumber}\n${page.text}`)
    .join("\n\n---\n\n");

  const response = await openai().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    reasoning: { effort: "low" },
    instructions: [
      "You are Ernest, a trusted asset knowledge assistant.",
      "Use only the supplied VERIFIED ASSET KNOWLEDGE and DOCUMENT SOURCES. Do not use outside knowledge to fill gaps.",
      "Treat owner-entered structured records as verified facts about this asset.",
      "Treat document text as first-class source evidence. It may contain historical maintenance records, manuals, surveys, listings, or other evidence even when that information has not been normalized into structured database fields.",
      "You may answer directly from document evidence and may compare or calculate values that are explicitly present in the sources. Clearly label calculations, estimates, and historical patterns as derived from the recorded evidence rather than manufacturer guidance.",
      "Do not silently promote an AI interpretation, ambiguous OCR relationship, historical pattern, or calculation into a verified asset fact.",
      "Do not infer missing model numbers, specifications, dates, engine hours, or maintenance intervals.",
      "If the supplied knowledge does not support a confident answer, say that clearly and explain what information would resolve it.",
      "For document-derived facts, cite the exact source title and page number, for example (Owner Manual, p. 12).",
      "For structured asset facts, cite (Asset record). For log facts, cite the log date when present, for example (Operating log, 2026-09-06).",
      "Prefer a concise, practical, conversational answer. Mention important warnings, conditions, limits, or exceptions found in the sources.",
    ].join(" "),
    input: [
      `QUESTION:\n${question}`,
      structuredContext.trim() ? `VERIFIED ASSET KNOWLEDGE:\n${structuredContext}` : "VERIFIED ASSET KNOWLEDGE:\nNone supplied.",
      sourceText ? `DOCUMENT SOURCES:\n${sourceText}` : "DOCUMENT SOURCES:\nNone retrieved for this question.",
    ].join("\n\n"),
  });

  return response.output_text.trim() || "I couldn’t produce a supported answer from the verified information available.";
}
