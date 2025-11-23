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
        <div ref={featuresRef} className="px-4 sm:px-6 md:px-12 lg:px-24 xl:pl-[200px] xl:pr-[200px] mt-[100px] sm:mt-[150px] md:mt-[200px] flex justify-center">
            <div className="max-w-[1400px] w-full">
                <div className="mb-[50px] sm:mb-[75px] md:mb-[100px]">
                    <p className="m-0 text-xl sm:text-2xl md:text-3xl lg:text-[36px] gap-[8px] leading-[1.3] text-center px-4">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 md:gap-[40px]">
                    {features.map((feature, index) => (
                        <motion.div
                            key={index}
                            variants={opacity}
                            animate={isInView ? "open" : "closed"}
                            initial="initial"
                            custom={index * 0.15}
                            className="p-6 sm:p-8 md:p-[50px] border border-border rounded-2xl sm:rounded-3xl bg-card/50"
                        >
                            <div className="mb-4 sm:mb-6">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-foreground/10 flex items-center justify-center mb-4 sm:mb-6">
                                    <span className="text-foreground text-lg sm:text-xl">0{index + 1}</span>
                                </div>
                            </div>
                            <h3 className="text-xl sm:text-2xl md:text-[28px] font-light m-0 mb-3 sm:mb-4 text-foreground">
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
                                className="text-base sm:text-lg font-light text-muted-foreground leading-relaxed m-0"
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

