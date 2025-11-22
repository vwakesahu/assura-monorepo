'use client'
import { useRef, useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion } from 'motion/react';

const slideUp = {
    initial: {
        y: 300
    },
    enter: {
        y: 0,
        transition: { duration: 0.6, ease: [0.33, 1, 0.68, 1] as const, delay: 2.5 }
    }
}

export default function Landing() {
    const firstText = useRef<HTMLParagraphElement>(null);
    const secondText = useRef<HTMLParagraphElement>(null);
    const slider = useRef<HTMLDivElement>(null);
    let xPercent = 0;
    let direction = -1;

    useLayoutEffect(() => {
        gsap.registerPlugin(ScrollTrigger);
        if (!slider.current) return;

        gsap.to(slider.current, {
            scrollTrigger: {
                trigger: document.documentElement,
                scrub: 0.25,
                start: 0,
                end: window.innerHeight,
                onUpdate: (e: any) => direction = e.direction * -1
            },
            x: "-500px",
        })
        requestAnimationFrame(animate);
    }, [])

    const animate = () => {
        if (xPercent < -100) {
            xPercent = 0;
        }
        else if (xPercent > 0) {
            xPercent = -100;
        }
        if (firstText.current && secondText.current) {
            gsap.set(firstText.current, { xPercent: xPercent })
            gsap.set(secondText.current, { xPercent: xPercent })
        }
        requestAnimationFrame(animate);
        xPercent += 0.1 * direction;
    }

    return (
        <motion.main
            variants={slideUp}
            initial="initial"
            animate="enter"
            className="relative flex h-screen overflow-hidden"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-card via-background to-card"></div>

            {/* Centered content */}
            <div className="absolute top-[25%] left-1/2 -translate-x-1/2 max-w-[500px] text-foreground text-center">
                <p className="text-lg font-light mb-4">Compliance for</p>
                <p className='text-5xl font-light leading-tight'>For Institutions<br />Builders & Users</p>
            </div>

            <div className="absolute top-[calc(100vh-350px)]">
                <div ref={slider} className="relative whitespace-nowrap">
                    <p ref={firstText} className="relative m-0 text-foreground text-[230px] font-medium pr-[50px]">Compliance Layer -</p>
                    <p ref={secondText} className="absolute left-full top-0 m-0 text-foreground text-[230px] font-medium pr-[50px]">Compliance Layer -</p>
                </div>
            </div>
        </motion.main>
    )
}