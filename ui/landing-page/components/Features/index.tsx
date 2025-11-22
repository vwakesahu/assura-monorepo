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

const features = [
    {
        title: "Protocol Level Enforcement",
        description: "Integrate policies into the smart contract layer for robust risk management systems"
    },
    {
        title: "One Integration, any API",
        description: "Utilize any onchain or offchain data through a marketplace of Information Providers"
    },
    {
        title: "Programmable Rules",
        description: "Seamlessly customize and update policies in real-time to fit evolving business needs"
    },
    {
        title: "Transaction Observability",
        description: "Observe transaction activity in real-time, test policy workflows with sample data, and download transaction history for reporting purposes"
    }
]

export default function Features() {
    const featuresRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(featuresRef);

    return (
        <div ref={featuresRef} className="pl-[200px] pr-[200px] mt-[200px] flex justify-center">
            <div className="max-w-[1400px] w-full">
                <div className="mb-[100px]">
                    <p className="m-0 text-[36px] gap-[8px] leading-[1.3] text-center">
                        {
                            "Purposefully designed for blockchain systems".split(" ").map((word, index) => {
                                return (
                                    <span key={index} className="relative overflow-hidden inline-flex mr-[3px]">
                                        <motion.span
                                            variants={slideUp}
                                            custom={index}
                                            animate={isInView ? "open" : "closed"}
                                            key={index}
                                        >
                                            {word}
                                        </motion.span>
                                    </span>
                                )
                            })
                        }
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-[40px]">
                    {features.map((feature, index) => (
                        <motion.div
                            key={index}
                            variants={opacity}
                            animate={isInView ? "open" : "closed"}
                            initial="initial"
                            custom={index * 0.15}
                            className="p-[50px] border border-border rounded-3xl bg-card/50"
                        >
                            <div className="mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6">
                                    <span className="text-foreground text-xl">0{index + 1}</span>
                                </div>
                            </div>
                            <h3 className="text-[28px] font-light m-0 mb-4 text-foreground">
                                {feature.title.split(" ").map((word, i) => (
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
                            <motion.p
                                variants={opacity}
                                animate={isInView ? "open" : "closed"}
                                initial="initial"
                                custom={index + 0.2}
                                className="text-lg font-light text-muted-foreground leading-relaxed m-0"
                            >
                                {feature.description}
                            </motion.p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    )
}

