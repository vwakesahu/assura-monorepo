'use client';
import { useState, useEffect, useRef } from 'react';
import Project from './components/Project';
import { motion } from 'motion/react';
import gsap from 'gsap';
import Image from 'next/image';
import RoundedButton from '../common/RoundedButton';

const projects = [
    {
        title: "Confidence Score",
        description: "Numeric score 0-1000 evaluating wallet activity and identity level",
        src: "confidence-score.png",
        color: "hsl(var(--foreground))"
    },
    {
        title: "Time",
        description: "Time-based lock with user-owned smart accounts for compliance",
        src: "time.png",
        color: "hsl(var(--muted))"
    },
    {
        title: "Expiry",
        description: "All attestations include expiry and must be refreshed when expired",
        src: "expiry.png",
        color: "hsl(var(--secondary))"
    },
    {
        title: "Config",
        description: "Fully programmable compliance rules configured in your smart contract",
        src: "config.png",
        color: "hsl(var(--muted-foreground))"
    }
]

const scaleAnimation = {
    initial: { scale: 0, x: "-50%", y: "-50%" },
    enter: { scale: 1, x: "-50%", y: "-50%", transition: { duration: 0.4, ease: [0.76, 0, 0.24, 1] as const } },
    closed: { scale: 0, x: "-50%", y: "-50%", transition: { duration: 0.4, ease: [0.32, 0, 0.67, 0] as const } }
}

export default function Projects() {
    const [modal, setModal] = useState({ active: false, index: 0 })
    const { active, index } = modal;
    const modalContainer = useRef<HTMLDivElement>(null);
    const cursor = useRef<HTMLDivElement>(null);
    const cursorLabel = useRef<HTMLDivElement>(null);

    let xMoveContainer = useRef<((x: number) => void) | null>(null);
    let yMoveContainer = useRef<((y: number) => void) | null>(null);
    let xMoveCursor = useRef<((x: number) => void) | null>(null);
    let yMoveCursor = useRef<((y: number) => void) | null>(null);
    let xMoveCursorLabel = useRef<((x: number) => void) | null>(null);
    let yMoveCursorLabel = useRef<((y: number) => void) | null>(null);

    useEffect(() => {
        if (!modalContainer.current || !cursor.current || !cursorLabel.current) return;

        //Move Container
        xMoveContainer.current = gsap.quickTo(modalContainer.current, "left", { duration: 0.8, ease: "power3" })
        yMoveContainer.current = gsap.quickTo(modalContainer.current, "top", { duration: 0.8, ease: "power3" })
        //Move cursor
        xMoveCursor.current = gsap.quickTo(cursor.current, "left", { duration: 0.5, ease: "power3" })
        yMoveCursor.current = gsap.quickTo(cursor.current, "top", { duration: 0.5, ease: "power3" })
        //Move cursor label
        xMoveCursorLabel.current = gsap.quickTo(cursorLabel.current, "left", { duration: 0.45, ease: "power3" })
        yMoveCursorLabel.current = gsap.quickTo(cursorLabel.current, "top", { duration: 0.45, ease: "power3" })
    }, [])

    const moveItems = (x: number, y: number) => {
        xMoveContainer.current?.(x)
        yMoveContainer.current?.(y)
        xMoveCursor.current?.(x)
        yMoveCursor.current?.(y)
        xMoveCursorLabel.current?.(x)
        yMoveCursorLabel.current?.(y)
    }

    const manageModal = (active: boolean, index: number, x: number, y: number) => {
        moveItems(x, y)
        setModal({ active, index })
    }

    return (
        <main
            onMouseMove={(e) => { moveItems(e.clientX, e.clientY) }}
            className="flex items-center pl-[200px] pr-[200px] flex-col mt-[300px]"
        >
            <div className="max-w-[1400px] w-full flex flex-col items-center justify-center mb-[100px]">
                {
                    projects.map((project, index) => {
                        return <Project index={index} title={project.title} description={project.description} manageModal={manageModal} key={index} />
                    })
                }
            </div>
            {/* <RoundedButton>
                <p>View docs</p>
            </RoundedButton> */}

        </main>
    )
}

