import type { Metadata } from "next";
import Script from "next/script";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = { title: "Forgeline", description: "A web view for the Forgeline software factory" };

// Runs before the first paint so the page never flashes the wrong theme. "system" follows the OS.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("forgeline.theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){document.documentElement.classList.add("dark")}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="forgeline-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
