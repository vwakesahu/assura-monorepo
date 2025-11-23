'use client'
import { useState } from 'react'
import { motion } from 'motion/react';
import NavLink from './Link';
import Curve from './Curve';
import { ThemeToggle } from '../../ThemeToggle';

const menuSlide = {
    initial: { x: "calc(100% + 100px)" },
    enter: { x: "0", transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] as const } },
    exit: { x: "calc(100% + 100px)", transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] as const } }
}

const navItems = [
    {
        title: "Home",
        sectionId: "landing",
    },
    {
        title: "Description",
        sectionId: "description",
    },
    {
        title: "Features",
        sectionId: "projects",
    },

]

export default function Nav({ onClose }: { onClose?: () => void }) {
    const [selectedIndicator, setSelectedIndicator] = useState<string | null>(null);

    return (
        <motion.div
            variants={menuSlide}
            initial="initial"
            animate="enter"
            exit="exit"
            className="h-screen bg-card border-l fixed right-0 top-0 text-foreground z-[3] w-full sm:w-auto"
        >
            <div className="box-border h-full p-8 sm:p-12 md:p-16 lg:p-[100px] flex flex-col justify-between">
                <div
                    onMouseLeave={() => { setSelectedIndicator(null) }}
                    className="flex flex-col text-3xl sm:text-4xl md:text-5xl lg:text-[56px] gap-3 mt-10 sm:mt-16 md:mt-20"
                >
                    <div className="text-muted-foreground border-b border-muted-foreground uppercase text-[11px] mb-10">
                        <p>Navigation</p>
                    </div>
                    {
                        navItems.map((data, index) => {
                            return <NavLink
                                key={index}
                                data={{ ...data, index }}
                                isActive={selectedIndicator == data.sectionId}
                                setSelectedIndicator={setSelectedIndicator}
                                onClose={onClose}
                            />
                        })
                    }
                </div>
                <div className="flex items-center justify-center pb-8">
                    <ThemeToggle />
                </div>
            </div>
            <Curve />
        </motion.div>
    )
}

