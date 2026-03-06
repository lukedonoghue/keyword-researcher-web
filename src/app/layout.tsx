import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/providers/auth-provider";
import { WorkflowProvider } from "@/providers/workflow-provider";
import { ThemeProvider } from "@/providers/theme-provider";

const commitSha = (process.env.NEXT_PUBLIC_APP_COMMIT_SHA || "local").slice(0, 7);

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Keyword Researcher | Grow My Ads",
  description: "Google Ads keyword research and campaign builder",
  icons: { icon: "/gma-favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try { const t = localStorage.getItem('theme');
            if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme:dark)').matches))
              document.documentElement.classList.add('dark');
          } catch {}
        `}} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="pointer-events-none fixed bottom-2 right-2 z-[9999] rounded bg-yellow-400 px-2 py-0.5 text-[10px] font-bold text-black shadow-lg">
          {commitSha}
        </div>
        <ThemeProvider>
          <TooltipProvider>
            <AuthProvider>
              <WorkflowProvider>
                {children}
              </WorkflowProvider>
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
