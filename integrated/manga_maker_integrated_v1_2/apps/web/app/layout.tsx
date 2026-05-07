import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/studio/QueryProvider";

export const metadata: Metadata = {
  title: "Manga Maker Studio Flow",
  description: "Dynamic frontend for the Manga Maker story-state engine.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
