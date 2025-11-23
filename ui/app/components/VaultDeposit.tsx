'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CustomConnectButton } from './CustomConnectButton'
import { useAccount, useBalance } from 'wagmi'
import { formatUnits } from 'viem'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { TOKENS, IMAGE_PATHS } from '@/lib/constants'
import { currentChain } from '@/lib/constants'
import { ThemeToggle } from './ThemeToggle'

export default function VaultDeposit() {
  const [selectedToken, setSelectedToken] = useState(TOKENS[0])
  const [depositAmount, setDepositAmount] = useState('')
  const [vaultBalance, setVaultBalance] = useState('0.00')
  const [showDialog, setShowDialog] = useState(false)
  const { address, isConnected } = useAccount()

  const tokenAddress = selectedToken.available && 'address' in selectedToken
    ? selectedToken.address
    : undefined

  const { data: balance } = useBalance({
    address,
    token: tokenAddress,
    chainId: currentChain.id,
  })

  // Get balances for each available token
  const usdcToken = TOKENS.find(t => t.symbol === 'USDC' && t.available && 'address' in t)
  const { data: usdcBalance } = useBalance({
    address: isConnected && !!usdcToken ? address : undefined,
    token: usdcToken && 'address' in usdcToken ? usdcToken.address : undefined,
    chainId: currentChain.id,
  })

  const getTokenBalance = (tokenSymbol: string) => {
    if (tokenSymbol === 'USDC' && usdcBalance) {
      return parseFloat(formatUnits(usdcBalance.value, usdcBalance.decimals)).toFixed(2)
    }
    return '0.00'
  }

  // Check if user has no USDC
  const hasNoUSDC = isConnected && selectedToken.symbol === 'USDC' && (
    !usdcBalance ||
    parseFloat(formatUnits(usdcBalance.value, usdcBalance.decimals)) === 0
  )

  const handleGetUSDC = () => {
    window.open('https://faucet.circle.com/', '_blank')
  }

  const handleOpenDialog = () => {
    if (!isConnected || !selectedToken.available) return
    setShowDialog(true)
  }

  const handleConfirmDeposit = async () => {
    console.log('Depositing', depositAmount, selectedToken.symbol)
    const currentBalance = parseFloat(vaultBalance) || 0
    const newBalance = currentBalance + parseFloat(depositAmount)
    setVaultBalance(newBalance.toFixed(2))
    setDepositAmount('')
    setShowDialog(false)
  }

  const handleMax = () => {
    if (balance) {
      const formatted = formatUnits(balance.value, balance.decimals)
      setDepositAmount(formatted)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-[625px] mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex cursor-pointer items-center gap-3 group">
            <div className="relative w-12 h-12 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:rotate-360">
              <Image
                src="/images/Assura-Light.svg"
                alt="Assura"
                width={45}
                height={45}
                className="absolute inset-0 m-auto dark:hidden"
              />
              <Image
                src="/images/Assura-Dark.svg"
                alt="Assura"
                width={45}
                height={45}
                className="absolute inset-0 m-auto hidden dark:block"
              />
            </div>
            <span className="text-2xl font-medium -ml-5">Assura</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <CustomConnectButton />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mt-16">
        <div className="max-w-[625px] mx-auto px-8">
          {/* Current Vault Balance */}
          <div className="mb-16">
            <div className="text-lg font-light text-muted-foreground mb-3">Your Vault Balance</div>
            <div className="flex items-end gap-4">
              <div className="text-7xl font-light leading-none text-foreground">{vaultBalance}</div>
              <div className="text-3xl font-light text-muted-foreground pb-2">{selectedToken.symbol}</div>
            </div>
            <div className="flex gap-8 mt-6 text-base font-light">
              <div>
                <span className="text-muted-foreground">APY </span>
                <span className="text-foreground">4.2%</span>
              </div>
              <div>
                <span className="text-muted-foreground">TVL </span>
                <span className="text-foreground">$12.4M</span>
              </div>
              {/* {balance && (
                <div>
                  <span className="text-muted-foreground">Available </span>
                  <span className="text-foreground">
                    {parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4)} {selectedToken.symbol}
                  </span>
                </div>
              )} */}
            </div>
          </div>

          {/* Deposit Section */}
          <div>
            <div className="text-5xl font-normal mb-8 text-foreground">Deposit</div>

            {/* Token Selection */}
            <div className="mb-8">
              <div className="text-base font-light text-muted-foreground mb-4">Select Token</div>
              <div className="flex gap-4">
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
                      flex flex-col items-start gap-3 px-6 py-4 border border-border rounded-3xl transition-all
                      ${selectedToken.symbol === token.symbol
                        ? 'border-foreground'
                        : 'hover:opacity-50'
                      }
                      ${!token.available ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="relative w-10 h-10 rounded-full overflow-hidden">
                        <Image
                          src={token.image}
                          alt={token.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="text-left flex-1">
                        <div className="text-lg font-normal text-foreground">{token.symbol}</div>
                        {token.available && isConnected ? (
                          <div className="text-xs font-light text-muted-foreground">
                            {getTokenBalance(token.symbol)} {token.symbol}
                          </div>
                        ) : (
                          'comingSoon' in token && token.comingSoon && (
                            <div className="text-xs font-light text-muted-foreground">Coming Soon</div>
                          )
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Get USDC Button - Show when user has no USDC */}
            {hasNoUSDC && (
              <Button
                onClick={handleGetUSDC}
                variant="outline"
                className="w-full h-14 text-lg font-light rounded-full mb-4 border-2 flex items-center justify-center gap-2"
              >
                <div className="relative w-5 h-5 rounded-full overflow-hidden">
                  <Image
                    src={IMAGE_PATHS.chains.baseSepolia}
                    alt="Base"
                    fill
                    className="object-cover"
                  />
                </div>
                Get USDC on Base Sepolia
              </Button>
            )}

            {/* Deposit Button */}
            {selectedToken.available && (
              <Button
                onClick={handleOpenDialog}
                disabled={!isConnected}
                className="w-full h-14 text-lg font-light rounded-full"
              >
                {!isConnected ? 'Connect Wallet to Deposit' : 'Deposit'}
              </Button>
            )}
          </div>
        </div>
      </main>

      {/* Deposit Dialog with Form */}
      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent className="max-w-2xl rounded-3xl p-6">
          <AlertDialogHeader className="mb-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="relative w-10 h-10 rounded-full overflow-hidden">
                <Image
                  src={selectedToken.image}
                  alt={selectedToken.name}
                  fill
                  className="object-cover"
                />
              </div>
              <AlertDialogTitle className="text-3xl font-light">Deposit {selectedToken.symbol}</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base font-light text-muted-foreground">
              Enter the amount to deposit into your vault
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            {/* Available Balance */}
            {balance && (
              <div className="p-4 border border-border rounded-3xl bg-card/50">
                <div className="text-xs font-light text-muted-foreground mb-2 uppercase tracking-wider">Available Balance</div>
                <div className="flex items-center gap-3">
                  <div className="relative w-8 h-8 rounded-full overflow-hidden">
                    <Image
                      src={selectedToken.image}
                      alt={selectedToken.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="text-2xl font-light text-foreground">
                    {parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(2)} {selectedToken.symbol}
                  </div>
                </div>
              </div>
            )}

            {/* Show Get USDC button if user has no USDC */}
            {hasNoUSDC && (
              <div className="p-4 border border-border rounded-3xl bg-card/50">
                <div className="text-xs font-light text-muted-foreground mb-3 uppercase tracking-wider">No USDC Balance</div>
                <div className="text-sm font-light text-muted-foreground mb-4">
                  You need USDC to deposit. Get free testnet USDC from Circle&apos;s faucet.
                </div>
                <Button
                  onClick={handleGetUSDC}
                  variant="outline"
                  className="w-full h-16 text-base font-light border-2 flex items-center justify-center gap-2"
                >
                  <div className="relative overflow-hidden">
                    <Image
                      src={IMAGE_PATHS.chains.baseSepolia}
                      alt="Base"
                      width={24}
                      height={24}
                    />
                  </div>
                  Get USDC on Base Sepolia
                </Button>
              </div>
            )}

            {/* Amount Input */}
            <div>
              <div className="text-xs font-light text-muted-foreground mb-2 uppercase tracking-wider">Amount</div>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="text-3xl font-light h-16 pr-20 border-0 border-b-2 border-border rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-foreground transition-colors"
                />
                {balance && (
                  <button
                    onClick={handleMax}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-sm font-light text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Max
                  </button>
                )}
              </div>
            </div>

            {/* Summary */}
            {depositAmount && parseFloat(depositAmount) > 0 && (
              <div className="space-y-2">
                <div className="p-4 border border-border rounded-3xl bg-card/30">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-light text-muted-foreground">You will deposit</span>
                    <span className="text-lg font-light text-foreground">{depositAmount} {selectedToken.symbol}</span>
                  </div>
                  <div className="h-px bg-border mb-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-light text-muted-foreground">New vault balance</span>
                    <span className="text-lg font-light text-foreground">
                      {(parseFloat(vaultBalance) + parseFloat(depositAmount || '0')).toFixed(2)} {selectedToken.symbol}
                    </span>
                  </div>
                </div>

              </div>
            )}
          </div>

          <AlertDialogFooter className="gap-0 mt-4">
            <AlertDialogCancel
              onClick={() => setDepositAmount('')}
              className="rounded-full font-light h-12 px-8 text-sm"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeposit}
              disabled={!depositAmount || parseFloat(depositAmount) <= 0}
              className="rounded-full font-light h-12 px-8 text-sm"
            >
              Confirm Deposit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}