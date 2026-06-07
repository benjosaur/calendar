import type { Metadata } from "next";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calendar",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexAuthNextjsServerProvider>
      {/* suppressHydrationWarning: the anti-flash script may add .dark before
          React hydrates, causing a class mismatch the browser can safely ignore. */}
      <html lang="en" className="h-full" suppressHydrationWarning>
        <head>
          {/* Reads localStorage / system preference before first paint to prevent
              a flash of the wrong theme on dark-mode initial loads. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var s=localStorage.getItem('theme');if(s==='dark'||(s===null&&matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}})()`,
            }}
          />
        </head>
        <body className="h-full">
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
