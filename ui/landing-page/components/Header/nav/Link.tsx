'use client'
import { motion } from 'motion/react';

const slide = {
    initial: { x: 80 },
    enter: (i: number) => ({ x: 0, transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] as const, delay: 0.05 * i } }),
    exit: (i: number) => ({ x: 80, transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] as const, delay: 0.05 * i } })
}

const scale = {
    open: { scale: 1, transition: { duration: 0.3 } },
    closed: { scale: 0, transition: { duration: 0.4 } }
}

export default function NavLink({
    data,
    isActive,
    setSelectedIndicator,
    onClose
}: {
    data: { title: string; sectionId: string; index: number };
    isActive: boolean;
    setSelectedIndicator: (sectionId: string) => void;
    onClose?: () => void;
}) {
    const { title, sectionId, index } = data;

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        const element = document.getElementById(sectionId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            onClose?.();
        }
    };

    return (
        <motion.div
            className="relative flex items-center cursor-pointer"
            onMouseEnter={() => { setSelectedIndicator(sectionId) }}
            onClick={handleClick}
            custom={index}
            variants={slide}
            initial="initial"
            animate="enter"
            exit="exit"
        >
            <motion.div
                variants={scale}
                animate={isActive ? "open" : "closed"}
                className="w-[10px] h-[10px] bg-foreground rounded-full absolute left-[-30px]"
            />
            <a>{title}</a>
        </motion.div>
    )
}

