"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";

import { WagmiProvider } from "wagmi";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { currentChain } from "@/lib/constants";

export const RainbowkitProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const [queryClient] = useState(() => new QueryClient());
    const REOWN_APP_ID = process.env.NEXT_PUBLIC_REOWN_APP_ID || 'reown-app-id';

    const chain = currentChain;

    const config = getDefaultConfig({
        appName: "Comfy",
        projectId: REOWN_APP_ID as string,
        chains: [chain],
        ssr: false,
    });

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider>{children}</RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
};

