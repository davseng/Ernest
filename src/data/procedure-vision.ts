import "server-only";

import OpenAI from "openai";

import type { ExtractedProcedureCandidate, ProcedureType } from "@/data/procedures";

let client: OpenAI | undefined;

function openai() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for procedure extraction");
  client ??= new OpenAI({ apiKey });
  return client;
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.replace(/\u0000/g, "").trim()
    : null;
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export async function extractProcedureCandidatesFromPdf(
  bytes: Uint8Array,
  filename: string,
): Promise<ExtractedProcedureCandidate[]> {
  if (bytes.byteLength === 0) return [];

  const pdfDataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
  const response = await openai().responses.create({
    model: process.env.OPENAI_OCR_MODEL || "gpt-5.6-terra",
    reasoning: { effort: "low" },
    max_output_tokens: 12000,
    instructions: [
      "You are a careful visual procedure extractor for a vessel knowledge system.",
      "Inspect the ORIGINAL PDF visually. Use headings, spacing, numbering, checkboxes, bullets, indentation, columns, tables, and page layout to determine which action items belong to which procedure.",
      "The unit of extraction is a COMPLETE source-defined procedure or checklist, never an individual action item.",
      "When a heading is followed by checkbox items, bullets, numbered actions, or short action lines, return ONE procedure with the heading as title and EVERY supported action beneath it as separate ordered steps until the next procedure heading.",
      "If a procedure continues onto a later page, keep it as one procedure and preserve all continued steps in visible order. pageNumber is the page where the procedure begins.",
      "Classify each as emergency, checklist, or routine. Emergency is an immediate safety response. Checklist is a repeatable operational/safety/inspection checklist. Routine is a non-emergency operating or maintenance procedure with ordered actions.",
      "Do not invent, repair, complete, infer, or add missing steps, warnings, limits, settings, quantities, sequences, or equipment details.",
      "Do not turn headings with no actual action sequence into procedures. Do not treat placeholders, table-of-contents entries, references, or descriptive prose as procedures.",
      "Preserve source wording closely while removing decorative checkbox/bullet/step-number symbols from the step text.",
      "Return JSON only in exactly this shape: {\"procedures\":[{\"pageNumber\":1,\"title\":\"title\",\"procedureType\":\"routine|checklist|emergency\",\"notes\":\"source-supported context or null\",\"steps\":[{\"instruction\":\"action\",\"note\":\"source-supported qualifier or null\"}]}]}.",
      "Before returning, verify that every candidate has at least two explicit source-supported action steps and that no candidate title is merely one of those steps.",
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
            text: "Visually extract all complete procedures and checklists from this PDF using the document layout to preserve grouping and step order.",
          },
        ],
      },
    ],
  });

  const raw = stripJsonFence(response.output_text || "");
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Procedure vision model returned invalid JSON");
  }

  const values =
    parsed && typeof parsed === "object" && "procedures" in parsed
      ? (parsed as { procedures?: unknown }).procedures
      : undefined;
  if (!Array.isArray(values)) return [];

  return values.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const pageNumber = Number(row.pageNumber);
    const title = clean(row.title);
    const procedureType = clean(row.procedureType) as ProcedureType | null;
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !title ||
      !procedureType ||
      !["routine", "checklist", "emergency"].includes(procedureType)
    ) return [];

    const stepsRaw = Array.isArray(row.steps) ? row.steps : [];
    const steps = stepsRaw.flatMap((step) => {
      if (!step || typeof step !== "object") return [];
      const value = step as Record<string, unknown>;
      const instruction = clean(value.instruction);
      if (!instruction) return [];
      return [{ instruction, note: clean(value.note) }];
    });
    if (steps.length < 2) return [];

    return [{
      pageNumber,
      title,
      procedureType,
      notes: clean(row.notes),
      steps,
    } satisfies ExtractedProcedureCandidate];
  });
}
