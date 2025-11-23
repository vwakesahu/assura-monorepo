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
    "Programmable Policy",
    "Offchain API",
    "Onchain Enforcement"
]

export default function HowItWorks() {
    const howItWorks = useRef<HTMLDivElement>(null);
    const isInView = useInView(howItWorks);

    return (
        <div ref={howItWorks} className="px-4 sm:px-6 md:px-12 lg:px-24 xl:pl-[200px] xl:pr-[200px] mt-[100px] sm:mt-[150px] md:mt-[200px] flex justify-center">
            <div className="max-w-[1400px] w-full">
                <div className="flex flex-col md:flex-row items-center justify-center gap-8 sm:gap-12 md:gap-[40px] lg:gap-[60px]">
                    {steps.map((step, index) => (
                        <motion.div
                            key={index}
                            variants={opacity}
                            animate={isInView ? "open" : "closed"}
                            initial="initial"
                            custom={index * 0.2}
                            className="flex-1 text-center w-full md:w-auto"
                        >
                            <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-[48px] font-light m-0 mb-3 sm:mb-4 text-foreground">
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

