import "server-only";

import OpenAI from "openai";
import { parseVisualPages } from "@/domain/visual-evidence";

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

  // Responses API inline file inputs require a base64 data URL, not a bare
  // base64 payload. Keep the MIME type explicit so the API renders this as PDF.
  const pdfDataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;

  const response = await openai().responses.create({
    model: process.env.OPENAI_OCR_MODEL || "gpt-5.6-terra",
    reasoning: { effort: "low" },
    instructions: [
      "You are a careful document transcription engine for asset records.",
      "Read the requested PDF pages visually, including scanned/image-only pages.",
      "Transcribe what is visibly present; do not summarize, infer, correct, complete, or add outside knowledge.",
      "Preserve table row relationships. Use TAB characters between visible columns when practical and newline characters between rows.",
      "Keep headings and labels that help interpret rows. For schematics and stowage plans include visible labels and explicit connected-to, inside, adjacent-to, and directional relationships. Do not infer connectivity from proximity or a crossing without a visible junction. Relationships are unverified interpretations, never established vessel facts. Include uncertainty and [unclear] whenever a path, label, orientation or compartment cannot be established.",
      "If text is genuinely unreadable, write [unclear] rather than guessing.",
      "Return JSON only in exactly this shape: {\"pages\":[{\"pageNumber\":1,\"text\":\"...\",\"relationships\":[\"visible label and supported relationship, with uncertainty\"]}]}",
      "Return only the requested page numbers, once each, in ascending order.",
    ].join(" "),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: filename || "document.pdf",
            file_data: pdfDataUrl,
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

  return parseVisualPages(parsed, requested);
}
