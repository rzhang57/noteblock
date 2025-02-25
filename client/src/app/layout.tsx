import type { Metadata } from "next";
import { Geist, Geist_Mono, Aldrich } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const aldrich = Aldrich({
    weight: "400",
    variable: "--font-aldrich",
    subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Noteblock",
  description: "Noteblock - the note-taking app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${aldrich.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
