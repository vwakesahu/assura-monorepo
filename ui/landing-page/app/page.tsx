'use client'
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AbstractPainting } from "@/components/abstract-painting";

export default function AbstractPaintingHeroPage() {
  return (
    <main className="flex h-screen w-full items-center justify-center bg-black">
      <div className="relative z-10 w-full">
        <div
          className={cn(
            "relative overflow-hidden rounded-3xl",
            "border border-white/20 dark:border-white/10",
            "bg-white/5 dark:bg-black/5",
            "shadow-[0_8px_32px_rgba(0,0,0,0.08)]",
            "backdrop-blur-sm",
            "h-screen"
          )}
        >
          {/* Abstract Painting Background */}
          <div className="absolute inset-0 overflow-hidden">
            <AbstractPainting />

            {/* Overlay gradient for better text readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/30" />
          </div>
          {/* Content container with backdrop blur for better readability */}
          <div className="relative z-10 flex h-full flex-col justify-between p-8 md:p-16">
            <div className="max-w-2xl space-y-6 md:space-y-8">
              <h2 className="font-medium text-6xl text-white/90 tracking-tight sm:text-4xl md:text-[7rem]">
                The Future
              </h2>

              <p className="ml-3 font-medium text-4xl text-white/50 tracking-tight sm:ml-7 sm:text-4xl md:text-6xl">
                was yesterday.
              </p>
            </div>

            <div className="space-y-8">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div>
                  <Button className="h-12 w-full rounded-full bg-white px-8 font-medium text-base text-slate-900 shadow-sm transition-all duration-300 hover:bg-white/90 hover:shadow-md">
                    CTA
                  </Button>
                </div>

                <div>
                  <Button
                    className="h-12 w-full rounded-full border-white/30 bg-transparent px-8 font-medium text-base text-white hover:bg-white/10 hover:text-white"
                    variant="outline"
                  >
                    Learn More <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
