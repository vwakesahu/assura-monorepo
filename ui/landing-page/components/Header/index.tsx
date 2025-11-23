'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence } from 'motion/react';
import Image from 'next/image';
import Nav from './nav';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import RoundedButton from '../common/RoundedButton';
import Magnetic from '../common/Magnetic';
import { MenuIcon, XIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '../ui/button';
import { ThemeToggle } from '../ThemeToggle';
import Link from 'next/link';

export default function Header() {
    const header = useRef<HTMLDivElement>(null);
    const [isActive, setIsActive] = useState(false);
    const pathname = usePathname();
    const button = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isActive) setIsActive(false)
    }, [pathname])

    useLayoutEffect(() => {
        gsap.registerPlugin(ScrollTrigger)
        if (!button.current) return;

        gsap.to(button.current, {
            scrollTrigger: {
                trigger: document.documentElement,
                start: 0,
                end: window.innerHeight,
                onLeave: () => { if (button.current) gsap.to(button.current, { scale: 1, duration: 0.25, ease: "power1.out" }) },
                onEnterBack: () => { if (button.current) gsap.to(button.current, { scale: 0, duration: 0.25, ease: "power1.out" }); setIsActive(false) }
            }
        })
    }, [])

    return (
        <>
            <div ref={header} className="absolute flex z-[1] top-0 text-foreground p-4 sm:p-6 md:p-[35px] justify-between w-full font-light box-border items-center">
                <div className="flex cursor-pointer items-center gap-2 sm:gap-3 group">
                    <div className="relative w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:rotate-360">
                        <Image
                            src="/images/Assura-Light.svg"
                            alt="Assura"
                            width={45}
                            height={45}
                            className="absolute inset-0 m-auto dark:hidden w-full h-full"
                        />
                        <Image
                            src="/images/Assura-Dark.svg"
                            alt="Assura"
                            width={45}
                            height={45}
                            className="absolute inset-0 m-auto hidden dark:block w-full h-full"
                        />
                    </div>
                    <span className="text-lg sm:text-xl md:text-2xl font-medium -ml-2 sm:-ml-3 md:-ml-5">Assura</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                    <Link href="https://app.assura.network">
                    <Button
                        variant="outline"
                        className="rounded-full cursor-pointer py-3 px-3 sm:py-4 sm:px-4 md:py-6 md:px-6 text-xs sm:text-sm md:text-base bg-foreground text-background hover:bg-foreground/90 hover:text-background border-none shadow-none dark:bg-foreground dark:text-background dark:hover:bg-foreground/90 dark:hover:text-background"
                    >
                        <span className="hidden sm:inline">Launch app</span>
                        <span className="sm:hidden">App</span>
                    </Button></Link>
                    <ThemeToggle />
                </div>
            </div>
            <div ref={button} className="scale-0 fixed right-0 z-[4]">
                <div className="relative m-5 w-20 h-20 rounded-full bg-card cursor-pointer flex items-center justify-center border border-border overflow-hidden" onClick={() => { setIsActive(!isActive) }}>
                    <div className="relative w-6 h-6">
                        <AnimatePresence mode="wait">
                            {isActive ? (
                                <motion.div
                                    key="close"
                                    initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                                    exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                                    transition={{ duration: 0.3, ease: [0.76, 0, 0.24, 1] }}
                                    className="absolute inset-0 flex items-center justify-center"
                                >
                                    <XIcon className="text-foreground w-6 h-6" />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="menu"
                                    initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
                                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                                    exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
                                    transition={{ duration: 0.3, ease: [0.76, 0, 0.24, 1] }}
                                    className="absolute inset-0 flex items-center justify-center"
                                >
                                    <MenuIcon className="text-foreground w-6 h-6" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
            <AnimatePresence mode="wait">
                {isActive && <Nav onClose={() => setIsActive(false)} />}
            </AnimatePresence>
        </>
    )
}

