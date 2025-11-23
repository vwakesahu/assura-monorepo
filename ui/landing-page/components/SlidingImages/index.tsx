'use client'
import { useRef } from 'react';
import { useScroll, useTransform, motion } from 'motion/react';

const slider1 = [
    {
        title: "Institutions",
        description: "Verifiable interface for liquidity provision and tokenization",
        color: "hsl(var(--muted))"
    },
    {
        title: "App Builders",
        description: "Launch compliance-ready applications instantly",
        color: "hsl(var(--muted))"
    },
    {
        title: "Users",
        description: "Generate attested tax reports for all wallet activity",
        color: "hsl(var(--muted))"
    },
    {
        title: "GateKeep",
        description: "TEE-attested compliance values verified on-chain",
        color: "hsl(var(--card))"
    }
]

const slider2 = [
    {
        title: "TEE Attested",
        description: "Secure and encrypted compliance verification",
        color: "hsl(var(--secondary))"
    },
    {
        title: "On-Chain Verified",
        description: "All attestations verified by your smart contract",
        color: "hsl(var(--muted))"
    },
    {
        title: "Programmable",
        description: "Configure compliance rules directly in your contract",
        color: "hsl(var(--secondary))"
    },
    {
        title: "Compliance Ready",
        description: "Become compliance-friendly in under an hour",
        color: "hsl(var(--muted))"
    }
]

export default function SlidingImages() {
    const container = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: container,
        offset: ["start end", "end start"]
    })

    const x1 = useTransform(scrollYProgress, [0, 1], [0, 150])
    const x2 = useTransform(scrollYProgress, [0, 1], [0, -150])
    const height = useTransform(scrollYProgress, [0, 0.9], [50, 0])

    return (
        <div ref={container} className="flex flex-col gap-[3vw] relative mt-[100px] sm:mt-[150px] md:mt-[200px] bg-background z-[1]">

            <motion.div style={{ height }} className="relative mt-[50px] sm:mt-[75px] md:mt-[100px]">
                <div className="h-[1550%] w-[120%] -left-[10%] rounded-[0_0_50%_50%] bg-background z-[1] absolute shadow-[0px_60px_50px_rgba(0,0,0,0.748)]"></div>
            </motion.div>
        </div>
    )
}

