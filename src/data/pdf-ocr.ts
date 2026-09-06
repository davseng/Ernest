import "server-only";

import OpenAI from "openai";

import type { ExtractedPage } from "@/data/pdf-text";

let client: OpenAI | undefined;

function openai() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for OCR fallback");
  client ??= new OpenAI({ apiKey });
  return client;
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function cleanOcrText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Use the model's native PDF vision support only for pages whose embedded PDF
 * text is too weak to be useful. The model receives the complete PDF so page
 * numbering remains stable, but it is instructed to transcribe only the
 * requested pages and to preserve visible row/column relationships.
 */
export async function ocrPdfPages(
  bytes: Uint8Array,
  filename: string,
  pageNumbers: number[],
): Promise<ExtractedPage[]> {
  const requested = [...new Set(pageNumbers)]
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
    .sort((a, b) => a - b);
  if (requested.length === 0) return [];

  const response = await openai().responses.create({
    model: process.env.OPENAI_OCR_MODEL || "gpt-5.6-terra",
    reasoning: { effort: "low" },
    instructions: [
      "You are a careful document transcription engine for asset records.",
      "Read the requested PDF pages visually, including scanned/image-only pages.",
      "Transcribe what is visibly present; do not summarize, infer, correct, complete, or add outside knowledge.",
      "Preserve table row relationships. Use TAB characters between visible columns when practical and newline characters between rows.",
      "Keep headings and labels that help interpret rows.",
      "If text is genuinely unreadable, write [unclear] rather than guessing.",
      "Return JSON only in exactly this shape: {\"pages\":[{\"pageNumber\":1,\"text\":\"...\"}]}",
      "Return only the requested page numbers, once each, in ascending order.",
    ].join(" "),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: filename || "document.pdf",
            file_data: Buffer.from(bytes).toString("base64"),
          },
          {
            type: "input_text",
            text: `Transcribe PDF page${requested.length === 1 ? "" : "s"} ${requested.join(", ")} with layout/table relationships preserved.`,
          },
        ],
      },
    ],
  });

  const raw = stripJsonFence(response.output_text || "");
  if (!raw) throw new Error("OCR model returned no transcription");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OCR model returned invalid JSON");
  }

  const pagesValue =
    parsed && typeof parsed === "object" && "pages" in parsed
      ? (parsed as { pages?: unknown }).pages
      : undefined;
  if (!Array.isArray(pagesValue)) throw new Error("OCR model response did not contain pages");

  const requestedSet = new Set(requested);
  const seen = new Set<number>();
  const pages: ExtractedPage[] = [];

  for (const candidate of pagesValue) {
    if (!candidate || typeof candidate !== "object") continue;
    const pageNumber = (candidate as { pageNumber?: unknown }).pageNumber;
    const text = cleanOcrText((candidate as { text?: unknown }).text);
    if (typeof pageNumber !== "number" || !requestedSet.has(pageNumber) || seen.has(pageNumber)) continue;
    seen.add(pageNumber);
    pages.push({ pageNumber, text });
  }

  return pages.sort((a, b) => a.pageNumber - b.pageNumber);
}
