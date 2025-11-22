'use client';
import React from 'react'

export default function Project({
    index,
    title,
    description,
    manageModal
}: {
    index: number;
    title: string;
    description?: string;
    manageModal: (active: boolean, index: number, x: number, y: number) => void;
}) {
    return (
        <div
            onMouseEnter={(e) => { manageModal(true, index, e.clientX, e.clientY) }}
            onMouseLeave={(e) => { manageModal(false, index, e.clientX, e.clientY) }}
            className="flex w-full justify-between items-center py-[50px] px-[100px] border-t border-border cursor-pointer transition-all duration-200 hover:opacity-50 last:border-b last:border-border group"
        >
            <h2 className="text-[60px] m-0 font-normal transition-all duration-400 group-hover:-translate-x-[10px]">{title}</h2>
            <p className="transition-all duration-400 font-light group-hover:translate-x-[10px]">{description || "Core Feature"}</p>
        </div>
    )
}

