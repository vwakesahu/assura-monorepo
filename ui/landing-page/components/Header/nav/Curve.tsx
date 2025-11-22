'use client'
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

export default function Curve() {
    const [dimension, setDimension] = useState({ width: 0, height: 0 });

    useEffect(() => {
        setDimension({ width: window.innerWidth, height: window.innerHeight });
    }, []);

    const initialPath = `M100 0 L100 ${dimension.height} Q-100 ${dimension.height / 2} 100 0`
    const targetPath = `M100 0 L100 ${dimension.height} Q100 ${dimension.height / 2} 100 0`

    const curve = {
        initial: {
            d: initialPath
        },
        enter: {
            d: targetPath,
            transition: { duration: 1, ease: [0.76, 0, 0.24, 1] as const }
        },
        exit: {
            d: initialPath,
            transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] as const }
        }
    }

    return (
        <svg className="absolute top-0 left-[-99px] w-[100px] h-full fill-card stroke-none">
            {dimension.width > 0 && (
                <motion.path
                    variants={curve}
                    initial="initial"
                    animate="enter"
                    exit="exit"
                />
            )}
        </svg>
    )
}

