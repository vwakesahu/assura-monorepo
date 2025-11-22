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

export default function Unlock() {
    const phrase = "Unlock the $410T Global Financial System with Assura";
    const unlock = useRef<HTMLDivElement>(null);
    const isInView = useInView(unlock);

    return null

    return (

        <div ref={unlock} className="pl-[200px] pr-[200px] mt-[200px] flex justify-center">
            <div className="max-w-[1400px] flex flex-col gap-[50px] relative">
                <p className="m-0 text-[36px] gap-[8px] leading-[1.3] text-center">
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
                    className="m-0 text-lg font-light text-center"
                >
                    The next wave of financial innovation will come from bringing regulated markets onchain. Assura enables institutions to securely participate in digital asset markets while meeting their business and regulatory requirements.
                </motion.p>
            </div>
        </div>
    )
}

