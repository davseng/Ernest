"use server";

import { auth } from "@/auth";
import { answerErnestQuestion } from "@/data/ask-ernest";
import { getErnestDocumentContext } from "@/data/document-context";

export type AskErnestState = {
  question: string;
  answer: string;
  sources: { documentTitle: string; pageNumber: number }[];
  error?: string;
};

export const emptyAskErnestState: AskErnestState = {
  question: "",
  answer: "",
  sources: [],
};

export async function askErnest(
  assetId: string,
  _previousState: AskErnestState,
  formData: FormData,
): Promise<AskErnestState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ...emptyAskErnestState, error: "Please sign in again." };
  }

  const question = String(formData.get("question") ?? "").trim().slice(0, 500);
  if (!question) {
    return { ...emptyAskErnestState, error: "Enter a question." };
  }

  try {
    const context = await getErnestDocumentContext(assetId, session.user.id, question);
    const answer = await answerErnestQuestion(question, context);
    const seen = new Set<string>();
    const sources = context
      .filter((page) => {
        const key = `${page.documentId}:${page.pageNumber}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((page) => ({ documentTitle: page.documentTitle, pageNumber: page.pageNumber }));

    return { question, answer, sources };
  } catch (error) {
    console.error("Ask Ernest failure", error);
    return {
      question,
      answer: "",
      sources: [],
      error: "Ernest couldn’t answer that right now. Please try again.",
    };
  }
}
