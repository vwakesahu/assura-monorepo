'use client'
import { useInView, motion } from 'motion/react';
import { useRef } from 'react';
import RoundedButton from '../common/RoundedButton';

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

export default function Description() {
    const phrase = "Policy for blockchain applications. Define transaction rules to secure financial products and enforce compliance requirements.";
    const description = useRef<HTMLDivElement>(null);
    const isInView = useInView(description)

    return (
        <div ref={description} className="px-4 sm:px-6 md:px-12 lg:px-24 xl:pl-[200px] xl:pr-[200px] mt-[100px] sm:mt-[150px] md:mt-[200px] flex justify-center">
            <div className="max-w-[1400px] flex flex-col lg:flex-row gap-6 sm:gap-8 md:gap-[50px] relative">
                <p className="m-0 text-xl sm:text-2xl md:text-3xl lg:text-[36px] gap-[8px] leading-[1.3]">
                    {
                        phrase.split(" ").map((word, index) => {
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
                <motion.p
                    variants={opacity}
                    animate={isInView ? "open" : "closed"}
                    className="m-0 text-base sm:text-lg w-full lg:w-[80%] font-light"
                >
                    Assura enables financial technology companies to enforce compliance and business rule requirements for applications built on public blockchains.
                </motion.p>

            </div>
        </div>
    )
}

