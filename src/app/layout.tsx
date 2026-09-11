import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "./conversation.css";
import "./recent-chats.css";
import "./operate-v08.css";
import "./vault.css";
import "./photo-evidence.css";

export const metadata: Metadata = {
  title: "Ernest — Asset assistant",
  description: "A conversational, verified knowledge assistant for the things you care for.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
