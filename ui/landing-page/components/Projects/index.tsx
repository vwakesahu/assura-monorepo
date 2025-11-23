'use client';
import { useInView, motion } from 'motion/react';
import { useRef } from 'react';
import React from 'react';

const projects = [
    {
        title: "Protocols and Infrastructure",
        description: "Design secure ecosystems. Embed compliance rules into bridges, RPCs, nodes, and sequencers",
        src: "protocols.png",
        color: "hsl(var(--foreground))"
    },
    {
        title: "Asset Issuers",
        description: "Build regulated rails. Implement dynamic blacklists to control asset flows",
        src: "assets.png",
        color: "hsl(var(--muted))"
    },
    {
        title: "DeFi",
        description: "Onboard institutional capital. Ensure clean assets in vaults, liquidity pools, and trading platforms",
        src: "defi.png",
        color: "hsl(var(--secondary))"
    },
    {
        title: "AI Agents and Wallets",
        description: "Protect users. Power guardrails to avert exploits, enforce transaction rules, and prevent fraud",
        src: "ai.png",
        color: "hsl(var(--muted-foreground))"
    },
    {
        title: "Privacy",
        description: "Enable compliant transactions. Enforce AML/CFT rules for private payments and networks",
        src: "privacy.png",
        color: "hsl(var(--foreground))"
    },
    {
        title: "Real World Assets",
        description: "Verify liquidity requirements. Meet the expectations of financial institutions and prevent commingling of funds",
        src: "rwa.png",
        color: "hsl(var(--muted))"
    }
]

const slideUp = {
    initial: {
        y: "100%"
    },
    open: (i: number) => ({
        y: "0%",
        transition: { duration: 0.5, delay: 0.01 * i }
    }),
    closed: {
        y: "100%",
        transition: { duration: 0.5 }
    }
}

const opacity = {
    initial: {
        opacity: 0
    },
    open: {
        opacity: 1,
        transition: { duration: 0.5 }
    },
    closed: {
        opacity: 0,
        transition: { duration: 0.5 }
    }
}

export default function Projects() {
    const projectsRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(projectsRef);

    return (
        <div ref={projectsRef} className="px-4 sm:px-6 md:px-12 lg:px-24 xl:pl-[200px] xl:pr-[200px] mt-[100px] sm:mt-[150px] md:mt-[200px] lg:mt-[300px] flex justify-center">
            <div className="max-w-[1400px] w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 sm:gap-x-12 md:gap-x-[60px] lg:gap-x-[100px] gap-y-12 sm:gap-y-16 md:gap-y-[60px] lg:gap-y-[80px]">
                    {projects.map((project, index) => (
                        <React.Fragment key={index}>
                            <div>
                                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-[48px] m-0 font-normal text-foreground">
                                    {project.title.split(" ").map((word, i) => (
                                        <span key={i} className="relative overflow-hidden inline-flex mr-[3px]">
                                            <motion.span
                                                variants={slideUp}
                                                custom={i + index * 2}
                                                animate={isInView ? "open" : "closed"}
                                                initial="initial"
                                            >
                                                {word}
                                            </motion.span>
                                        </span>
                                    ))}
                                </h2>
                            </div>
                            <div>
                                <motion.p
                                    variants={opacity}
                                    animate={isInView ? "open" : "closed"}
                                    initial="initial"
                                    custom={index + 0.2}
                                    className="text-base sm:text-lg font-light text-muted-foreground leading-relaxed m-0"
                                >
                                    {project.description}
                                </motion.p>
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    )
}

