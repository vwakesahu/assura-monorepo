'use client'
import React from 'react'

export default function Footer() {
  return (
    <div 
        className='relative h-[800px]'
        style={{clipPath: "polygon(0% 0, 100% 0%, 100% 100%, 0 100%)"}}
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
    <div className='bg-foreground py-8 px-12 h-full w-full flex flex-col justify-end'>
        <div className='flex justify-between items-end'>
            <h1 className='text-[14vw] leading-[0.8] mt-10 text-background font-light'>Assura Network</h1>
            <p className='text-background/70'>© 2025 Assura</p>
        </div>
    </div>
  )
}

