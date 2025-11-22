'use client'
import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import Magnetic from './Magnetic';

export default function RoundedButton({
    children,
    backgroundColor,
    className = "",
    ...attributes
}: {
    children: React.ReactNode;
    backgroundColor?: string;
    className?: string;
    [key: string]: any;
}) {
    const defaultBg = backgroundColor || "hsl(var(--primary))";
    const circle = useRef<HTMLDivElement>(null);
    let timeline = useRef<gsap.core.Timeline | null>(null);
    let timeoutId: NodeJS.Timeout | null = null;

    useEffect(() => {
        if (!circle.current) return;

        timeline.current = gsap.timeline({ paused: true })
        timeline.current
            .to(circle.current, { top: "-25%", width: "150%", duration: 0.4, ease: "power3.in" }, "enter")
            .to(circle.current, { top: "-150%", width: "125%", duration: 0.25 }, "exit")
    }, [])

    const manageMouseEnter = () => {
        if (timeoutId) clearTimeout(timeoutId)
        timeline.current?.tweenFromTo('enter', 'exit');
    }

    const manageMouseLeave = () => {
        timeoutId = setTimeout(() => {
            timeline.current?.play();
        }, 300)
    }

    return (
        <Magnetic>
            <div
                className={`rounded-[3em] border border-border cursor-pointer relative flex items-center justify-center py-[15px] px-[60px] overflow-hidden ${className}`}
                onMouseEnter={manageMouseEnter}
                onMouseLeave={manageMouseLeave}
                {...attributes}
            >
                {children}
                <div
                    ref={circle}
                    style={{ backgroundColor: backgroundColor || defaultBg }}
                    className="w-full h-[150%] absolute rounded-full top-full"
                />
            </div>
        </Magnetic>
    )
}

