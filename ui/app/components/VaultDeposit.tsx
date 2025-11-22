'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { TOKENS, IMAGE_PATHS } from '@/lib/constants'
import { currentChain } from '@/lib/constants'

export default function VaultDeposit() {
  const [selectedToken, setSelectedToken] = useState(TOKENS[0])
  const [depositAmount, setDepositAmount] = useState('')
  const [vaultBalance, setVaultBalance] = useState('0.00')
  const { address, isConnected } = useAccount()
  
  const tokenAddress = selectedToken.available && 'address' in selectedToken 
    ? selectedToken.address 
    : undefined

  const { data: balance } = useBalance({
    address,
    token: tokenAddress,
    chainId: currentChain.id,
    enabled: isConnected && !!tokenAddress,
  })

  const handleDeposit = async () => {
    if (!depositAmount || !selectedToken.available || !isConnected) return
    
    // TODO: Implement actual deposit logic
    console.log('Depositing', depositAmount, selectedToken.symbol)
    
    // For now, just update vault balance (mock)
    const currentBalance = parseFloat(vaultBalance) || 0
    const newBalance = currentBalance + parseFloat(depositAmount)
    setVaultBalance(newBalance.toFixed(2))
    setDepositAmount('')
  }

  const handleMax = () => {
    if (balance) {
      const formatted = formatUnits(balance.value, balance.decimals)
      setDepositAmount(formatted)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-card via-background to-card p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-light text-foreground mb-2">Vault</h1>
            <p className="text-lg font-light text-muted-foreground">
              Deposit tokens and manage your vault balance
            </p>
          </div>
          <ConnectButton />
        </div>

        {/* Chain Info */}
        <Card className="border-border bg-card/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="relative w-12 h-12 rounded-full overflow-hidden">
                <Image
                  src={IMAGE_PATHS.chains.baseSepolia}
                  alt="Base Sepolia"
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <p className="text-sm font-light text-muted-foreground">Network</p>
                <p className="text-lg font-light text-foreground">Base Sepolia</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vault Balance */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-2xl font-light">Vault Balance</CardTitle>
            <CardDescription>Total tokens deposited in vault</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-light text-foreground">
              {vaultBalance} <span className="text-2xl text-muted-foreground">{selectedToken.symbol}</span>
            </div>
          </CardContent>
        </Card>

        {/* Deposit Section */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-2xl font-light">Deposit</CardTitle>
            <CardDescription>Select a token and enter amount to deposit</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Token Selection */}
            <div>
              <label className="text-sm font-light text-muted-foreground mb-3 block">
                Select Token
              </label>
              <div className="grid grid-cols-3 gap-4">
                {TOKENS.map((token) => (
                  <button
                    key={token.symbol}
                    onClick={() => {
                      if (token.available) {
                        setSelectedToken(token)
                        setDepositAmount('')
                      }
                    }}
                    disabled={!token.available}
                    className={`
                      relative p-4 rounded-3xl border transition-all
                      ${selectedToken.symbol === token.symbol
                        ? 'border-foreground bg-card'
                        : 'border-border bg-card/50 hover:bg-card'
                      }
                      ${!token.available ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative w-12 h-12 rounded-full overflow-hidden">
                        <Image
                          src={token.image}
                          alt={token.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-light text-foreground">{token.symbol}</p>
                        {token.comingSoon && (
                          <p className="text-xs font-light text-muted-foreground">Coming Soon</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Input */}
            {selectedToken.available && (
              <div className="space-y-3">
                <label className="text-sm font-light text-muted-foreground block">
                  Amount
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="text-lg h-14 pr-20"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      {balance && (
                        <button
                          onClick={handleMax}
                          className="text-xs font-light text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Max: {formatUnits(balance.value, balance.decimals)}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {balance && (
                  <p className="text-sm font-light text-muted-foreground">
                    Balance: {formatUnits(balance.value, balance.decimals)} {selectedToken.symbol}
                  </p>
                )}
              </div>
            )}

            {/* Deposit Button */}
            <Button
              onClick={handleDeposit}
              disabled={!isConnected || !selectedToken.available || !depositAmount || parseFloat(depositAmount) <= 0}
              className="w-full h-12 text-lg font-light rounded-full"
            >
              {!isConnected ? 'Connect Wallet' : `Deposit ${selectedToken.symbol}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

