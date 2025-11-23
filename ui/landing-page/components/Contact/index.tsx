'use client'
import Image from 'next/image';
import RoundedButton from '../common/RoundedButton';
import { useRef } from 'react';
import { useScroll, motion, useTransform } from 'motion/react';
import Magnetic from '../common/Magnetic';

export default function Contact() {
    const container = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: container,
        offset: ["start end", "end end"]
    })
    const x = useTransform(scrollYProgress, [0, 1], [0, 100])
    const y = useTransform(scrollYProgress, [0, 1], [-500, 0])
    const rotate = useTransform(scrollYProgress, [0, 1], [120, 90])

    return (
        <motion.div
            style={{ y }}
            ref={container}
            className="text-background flex flex-col items-center justify-center bg-foreground relative"
        >
            <div className="pt-[100px] sm:pt-[150px] md:pt-[200px] w-full max-w-[1800px] bg-foreground">
                <div className="border-b border-border/30 pb-[50px] sm:pb-[75px] md:pb-[100px] px-4 sm:px-6 md:px-12 lg:px-24 xl:ml-[200px] xl:mr-[200px] relative">
                    <span className="flex items-center">
                        <div className="w-[100px] h-[100px] relative rounded-full overflow-hidden flex items-center justify-center">
                            <Image
                                src="/images/Assura-Light.svg"
                                alt="Assura"
                                width={80}
                                height={80}
                                className="dark:hidden object-contain"
                            />
                            <Image
                                src="/images/Assura-Dark.svg"
                                alt="Assura"
                                width={80}
                                height={80}
                                className="hidden dark:block object-contain"
                            />
                        </div>
                        <h2 className="ml-[0.3em] text-3xl sm:text-4xl md:text-[5vw] m-0 font-light">Get started</h2>
                    </span>
                    <h2 className="text-3xl sm:text-4xl md:text-[5vw] m-0 font-light">with Assura</h2>
                    <motion.div style={{ x }} className="hidden md:block absolute left-[calc(100%-400px)] top-[calc(100%-75px)]">
                        <RoundedButton backgroundColor="hsl(var(--muted))" className="w-[180px] h-[180px] bg-muted text-muted-foreground rounded-full absolute flex items-center justify-center cursor-pointer opacity-70 border-border/20">
                            <p className="m-0 text-base font-light z-[2] relative">Get in touch</p>
                        </RoundedButton>
                    </motion.div>
                    <motion.svg
                        style={{ rotate, scale: 2 }}
                        width="9"
                        height="9"
                        viewBox="0 0 9 9"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="absolute top-[30%] left-full"
                    >
                        <path d="M8 8.5C8.27614 8.5 8.5 8.27614 8.5 8L8.5 3.5C8.5 3.22386 8.27614 3 8 3C7.72386 3 7.5 3.22386 7.5 3.5V7.5H3.5C3.22386 7.5 3 7.72386 3 8C3 8.27614 3.22386 8.5 3.5 8.5L8 8.5ZM0.646447 1.35355L7.64645 8.35355L8.35355 7.64645L1.35355 0.646447L0.646447 1.35355Z" className="fill-background" />
                    </motion.svg>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 mt-[50px] sm:mt-[75px] md:mt-[100px] px-4 sm:px-6 md:px-12 lg:px-24 xl:ml-[200px] xl:mr-[200px]">
                    <RoundedButton className="opacity-70 border-border/30">
                        <p>contact@assura.network</p>
                    </RoundedButton>
                    <RoundedButton className="opacity-70 border-border/30">
                        <p>Documentation</p>
                    </RoundedButton>
                </div>
                <div className="flex flex-col sm:flex-row justify-between mt-[100px] sm:mt-[150px] md:mt-[200px] p-4 sm:p-5 gap-8 sm:gap-0">
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-[10px] items-start sm:items-end">
                        <span className="flex flex-col gap-[15px]">
                            <h3 className="m-0 p-[2.5px] cursor-default text-muted-foreground font-light text-base">Version</h3>
                            <p className="m-0 p-[2.5px] cursor-pointer relative after:content-[''] after:w-0 after:h-[1px] after:bg-background after:block after:mt-[2px] after:relative after:left-1/2 after:-translate-x-1/2 after:transition-[width] after:duration-200 after:[transition-timing-function:linear] hover:after:w-full">2025 © Assura</p>
                        </span>
                        <span className="flex flex-col gap-[15px]">
                            <h3 className="m-0 p-[2.5px] cursor-default text-muted-foreground font-light text-base">Network</h3>
                            <p className="m-0 p-[2.5px] cursor-pointer relative after:content-[''] after:w-0 after:h-[1px] after:bg-background after:block after:mt-[2px] after:relative after:left-1/2 after:-translate-x-1/2 after:transition-[width] after:duration-200 after:[transition-timing-function:linear] hover:after:w-full">Compliance Layer</p>
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-[10px] items-start sm:items-end">
                        <span className="flex flex-col gap-[15px]">
                            <h3 className="m-0 p-[2.5px] cursor-default text-muted-foreground font-light text-base">socials</h3>
                            <Magnetic>
                                <p className="m-0 p-[2.5px] cursor-pointer relative after:content-[''] after:w-0 after:h-[1px] after:bg-background after:block after:mt-[2px] after:relative after:left-1/2 after:-translate-x-1/2 after:transition-[width] after:duration-200 after:[transition-timing-function:linear] hover:after:w-full">GitHub</p>
                            </Magnetic>
                        </span>
                        <Magnetic>
                            <p className="m-0 p-[2.5px] cursor-pointer relative after:content-[''] after:w-0 after:h-[1px] after:bg-background after:block after:mt-[2px] after:relative after:left-1/2 after:-translate-x-1/2 after:transition-[width] after:duration-200 after:[transition-timing-function:linear] hover:after:w-full">Twitter</p>
                        </Magnetic>
                        <Magnetic>
                            <p className="m-0 p-[2.5px] cursor-pointer relative after:content-[''] after:w-0 after:h-[1px] after:bg-background after:block after:mt-[2px] after:relative after:left-1/2 after:-translate-x-1/2 after:transition-[width] after:duration-200 after:[transition-timing-function:linear] hover:after:w-full">Discord</p>
                        </Magnetic>
                        <Magnetic>
                            <p className="m-0 p-[2.5px] cursor-pointer relative after:content-[''] after:w-0 after:h-[1px] after:bg-background after:block after:mt-[2px] after:relative after:left-1/2 after:-translate-x-1/2 after:transition-[width] after:duration-200 after:[transition-timing-function:linear] hover:after:w-full">LinkedIn</p>
                        </Magnetic>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

