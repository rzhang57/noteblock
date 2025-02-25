import {GridBackground} from "@/components/GridBackground";
import Link from "next/link";
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
      <div className="flex flex-col items-center justify-center min-h-screen py-2">
          <main className="min-h-screen flex flex-col relative overflow-hidden">
              <GridBackground/>
              <div className="container mx-auto px-4 py-8 flex-grow flex flex-col justify-center items-center z-10">
                  <div className="flex flex-col items-center">
                      <div className="flex items-center space-x-4">
                          <h1 className="text-6xl font-bold text-gray-800">Noteblock</h1>
                      </div>
                  </div>
                  <h2 className="mt-4 text-xl text-gray-600 text-center max-w-md">
                      Organize your thoughts, compose your ideas, and harmonize your life.
                  </h2>
                  <Button asChild size="lg" className="mt-8 font-aldrich">
                      <Link href="/folders">Get Started</Link>
                  </Button>
              </div>
          </main>
      </div>
  );
}
