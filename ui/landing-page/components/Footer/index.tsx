'use client'
import React from 'react'

export default function Footer() {
    return (
        <div
            className='relative h-[800px]'
            style={{ clipPath: "polygon(0% 0, 100% 0%, 100% 100%, 0 100%)" }}
        >
            <div className='relative h-[calc(100vh+800px)] -top-[100vh]'>
                <div className='h-[800px] sticky top-[calc(100vh-800px)]'>
                    <Content />
                </div>
            </div>
        </div>
    )
}

const Content = () => {
    return (
        <div className='bg-foreground py-6 sm:py-8 px-4 sm:px-8 md:px-12 h-full w-full flex flex-col justify-end'>
            <div className='flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 sm:gap-0'>
                <h1 className='text-4xl sm:text-6xl md:text-8xl lg:text-[14vw] leading-[0.8] mt-6 sm:mt-8 md:mt-10 text-background font-light'>Assura Network</h1>
                <p className='text-sm sm:text-base text-background/70'>© 2025 Assura</p>
            </div>
        </div>
    )
}

