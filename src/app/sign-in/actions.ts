"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";

export async function requestSignInLink(formData: FormData) {
  const email = formData.get("email");

  if (typeof email !== "string" || email.trim() === "") {
    redirect("/sign-in?error=EmailSignInError");
  }

  let destination: string;
  try {
    // Asking Auth.js not to redirect here keeps its errors inside this action.
    // Otherwise an SMTP or adapter failure escapes as an opaque Next.js digest.
    destination = await signIn("nodemailer", {
      email: email.trim(),
      redirect: false,
      redirectTo: "/",
    });
  } catch (error) {
    const type = error instanceof AuthError ? error.type : "Configuration";
    redirect(`/sign-in?error=${encodeURIComponent(type)}`);
  }

  redirect(destination);
}
