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
    const phrase = "A simple thin layer that sits between your application contract and your users allowing any app to become compliance-friendly in under an hour.";
    const description = useRef<HTMLDivElement>(null);
    const isInView = useInView(description)

    return (
        <div ref={description} className="pl-[200px] pr-[200px] mt-[200px] flex justify-center">
            <div className="max-w-[1400px] flex gap-[50px] relative">
                <p className="m-0 text-[36px] gap-[8px] leading-[1.3]">
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
                    className="m-0 text-lg w-[80%] font-light"
                >
                    GateKeep provides three core programmable compliance values attested by our TEE and verified on-chain by your contract.
                </motion.p>

            </div>
        </div>
    )
}

