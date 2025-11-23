'use client'

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { motion } from "motion/react"

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return null
    }

    return (
        <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="relative w-12 h-12 rounded-full bg-card border border-border cursor-pointer flex items-center justify-center overflow-hidden transition-colors hover:bg-muted"
            aria-label="Toggle theme"
        >
            <motion.div
                initial={false}
                animate={{ rotate: theme === "dark" ? 180 : 0 }}
                transition={{ duration: 0.3, ease: [0.76, 0, 0.24, 1] }}
                className="absolute inset-0 flex items-center justify-center"
            >
                {theme === "dark" ? (
                    <Sun className="h-5 w-5 text-foreground" />
                ) : (
                    <Moon className="h-5 w-5 text-foreground" />
                )}
            </motion.div>
        </button>
    )
}

