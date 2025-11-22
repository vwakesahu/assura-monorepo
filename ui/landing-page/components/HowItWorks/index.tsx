'use client'
import { useInView, motion } from 'motion/react';
import { useRef } from 'react';

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

const steps = [
    "Integrate",
    "Attest",
    "Verify",
    "Configure"
]

export default function HowItWorks() {
    const howItWorks = useRef<HTMLDivElement>(null);
    const isInView = useInView(howItWorks);

    return (
        <div ref={howItWorks} className="pl-[200px] pr-[200px] mt-[200px] flex justify-center">
            <div className="max-w-[1400px] w-full">
                <div className="flex items-center justify-center gap-[60px]">
                    {steps.map((step, index) => (
                        <motion.div
                            key={index}
                            variants={opacity}
                            animate={isInView ? "open" : "closed"}
                            initial="initial"
                            custom={index * 0.2}
                            className="flex-1 text-center"
                        >
                            <h3 className="text-[48px] font-light m-0 mb-4 text-foreground">
                                {step.split(" ").map((word, i) => (
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
                            </h3>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    )
}

