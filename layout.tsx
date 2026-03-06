import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creator Spots Map",
  description: "Find spots reviewed by your favorite creators",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-stone-50 text-stone-900">
        {children}
      </body>
    </html>
  );
}
