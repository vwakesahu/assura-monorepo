'use client'
import React, { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TOKENS, currentChain } from '@/lib/constants'

// MockERC20 ABI - mint function
const MOCK_ERC20_ABI = [
    {
        inputs: [
            {
                internalType: 'address',
                name: 'to',
                type: 'address',
            },
            {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256',
            },
        ],
        name: 'mint',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const

const MOCK_USDC_ADDRESS = TOKENS.find((t) => t.symbol === 'USDC' && t.available && 'address' in t)
    ?.address as `0x${string}`

const Page = () => {
    const [mintAmount, setMintAmount] = useState('')
    const { address, isConnected } = useAccount()

    const { writeContract, data: hash, isPending } = useWriteContract()
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash,
    })

    const { data: balance, refetch: refetchBalance } = useBalance({
        address,
        token: MOCK_USDC_ADDRESS,
        chainId: currentChain.id,
        query: {
            enabled: !!address && !!MOCK_USDC_ADDRESS,
            refetchInterval: 5000,
        },
    })

    // Refetch balance when transaction succeeds
    React.useEffect(() => {
        if (isSuccess) {
            refetchBalance()
            setMintAmount('')
        }
    }, [isSuccess, refetchBalance])

    const handleMint = async () => {
        if (!address || !mintAmount || parseFloat(mintAmount) <= 0) {
            return
        }

        if (!MOCK_USDC_ADDRESS) {
            alert('Mock USDC address not configured')
            return
        }

        try {
            // Convert amount to wei/smallest unit (USDC has 6 decimals)
            const amountInWei = parseUnits(mintAmount, 6)

            writeContract({
                address: MOCK_USDC_ADDRESS,
                abi: MOCK_ERC20_ABI,
                functionName: 'mint',
                args: [address, amountInWei],
            })
        } catch (error) {
            console.error('Mint error:', error)
            alert(error instanceof Error ? error.message : 'Failed to mint tokens')
        }
    }

    return (
        <div className="min-h-screen bg-background p-8">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-4xl font-light mb-8 text-foreground">MockERC20 Mint Test</h1>

                {!isConnected && (
                    <div className="p-4 border border-border rounded-3xl bg-card/50 mb-6">
                        <p className="text-muted-foreground">Please connect your wallet to mint tokens</p>
                    </div>
                )}

                {isConnected && (
                    <div className="space-y-6">
                        {/* Current Balance */}
                        {balance && (
                            <div className="p-6 border border-border rounded-3xl bg-card/50">
                                <div className="text-xs font-light text-muted-foreground mb-2 uppercase tracking-wider">
                                    Current Balance
                                </div>
                                <div className="text-3xl font-light text-foreground">
                                    {parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(2)} USDC
                                </div>
                            </div>
                        )}

                        {/* Mint Form */}
                        <div className="p-6 border border-border rounded-3xl bg-card/50">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-light text-muted-foreground mb-2 block uppercase tracking-wider">
                                        Amount to Mint
                                    </label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={mintAmount}
                                        onChange={(e) => setMintAmount(e.target.value)}
                                        className="text-2xl font-light h-14 border-2 border-border rounded-full bg-transparent"
                                    />
                                </div>

                                <Button
                                    onClick={handleMint}
                                    disabled={!mintAmount || parseFloat(mintAmount) <= 0 || isPending || isConfirming}
                                    className="w-full h-14 text-lg font-light rounded-full"
                                >
                                    {isPending || isConfirming
                                        ? 'Processing...'
                                        : isSuccess
                                            ? 'Minted!'
                                            : 'Mint USDC'}
                                </Button>

                                {isSuccess && (
                                    <div className="p-4 border border-green-500/50 rounded-3xl bg-green-500/10">
                                        <p className="text-sm font-light text-green-500">
                                            ✓ Tokens minted successfully!
                                        </p>
                                        {hash && (
                                            <p className="text-xs font-light text-muted-foreground mt-2 break-all">
                                                TX: {hash}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Contract Info */}
                        <div className="p-4 border border-border rounded-3xl bg-card/30">
                            <div className="text-xs font-light text-muted-foreground mb-2 uppercase tracking-wider">
                                Contract Address
                            </div>
                            <div className="text-sm font-mono text-foreground break-all">
                                {MOCK_USDC_ADDRESS || 'Not configured'}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default Page