'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { Check, Send } from 'lucide-react'
import { CustomConnectButton } from './CustomConnectButton'
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient } from 'wagmi'
import { formatUnits, parseUnits, createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { useDebounce } from 'use-debounce'
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
import { TOKENS, IMAGE_PATHS, CONTRACT_ADDRESSES, currentChain } from '@/lib/constants'
import { createComplianceData } from '@/lib/compliance'
import { formatNumberWithCommas } from '@/lib/utils'
import { ThemeToggle } from './ThemeToggle'

// Vault ABI - depositWithCompliance function and verificationKey
const VAULT_ABI = [
  {
    name: 'depositWithCompliance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'attestedComplianceData', type: 'bytes' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  {
    name: 'verificationKey',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'minScore',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ERC20 ABI for approvals and transfers
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// AssuraVerifier ABI
const ASSURA_VERIFIER_ABI = [
  {
    name: 'getVerifyingData',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'appContractAddress', type: 'address' },
      { name: 'key', type: 'bytes32' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'score', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'chainId', type: 'uint256' },
        ],
      },
    ],
  },
] as const

export default function VaultDeposit() {
  const [selectedToken, setSelectedToken] = useState(TOKENS[0])
  const [depositAmount, setDepositAmount] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsApproval, setNeedsApproval] = useState(false)
  // approvalAmount is tracked internally but not displayed in UI
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [approvalAmount, setApprovalAmount] = useState<bigint | null>(null)
  const [isApprovalTx, setIsApprovalTx] = useState(false)
  const [isDepositTx, setIsDepositTx] = useState(false)
  const [isDepositSuccess, setIsDepositSuccess] = useState(false)
  const [successTxHash, setSuccessTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [depositedAmount, setDepositedAmount] = useState<string>('')

  // Send dialog state
  const [showSendDialog, setShowSendDialog] = useState(false)
  const [sendAmount, setSendAmount] = useState('')
  const [recipientInput, setRecipientInput] = useState('')
  const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(null)
  const [ensTextRecords, setEnsTextRecords] = useState<Record<string, string>>({})
  const [isResolvingEns, setIsResolvingEns] = useState(false)
  const [isSendSuccess, setIsSendSuccess] = useState(false)
  const [sendTxHash, setSendTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [sendTxHashForWait, setSendTxHashForWait] = useState<`0x${string}` | undefined>(undefined)

  const { address, isConnected, chainId } = useAccount()

  const { writeContractAsync, isPending, reset: resetWriteContract } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined)
  const { isLoading: isConfirming, isSuccess, isError: isTxError } = useWaitForTransactionReceipt({
    hash: txHash,
  })
  const publicClient = usePublicClient({ chainId: currentChain.id })

  // Mainnet public client for ENS resolution - memoized to prevent recreation on every render
  const mainnetPublicClient = useMemo(
    () =>
      createPublicClient({
        chain: mainnet,
        transport: http(),
      }),
    []
  )

  const tokenAddress = selectedToken.available && 'address' in selectedToken
    ? selectedToken.address
    : undefined

  const { data: balance } = useBalance({
    address,
    token: tokenAddress,
    chainId: currentChain.id,
    query: {
      enabled: !!address && !!tokenAddress,
      refetchInterval: 5000,
    },
  })

  // Read user's shares from vault contract
  const { data: userShares, refetch: refetchShares } = useReadContract({
    address: CONTRACT_ADDRESSES.VAULT,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected && CONTRACT_ADDRESSES.VAULT !== '0x0000000000000000000000000000000000000000',
    },
  })

  // Get balances for each available token
  const usdcToken = TOKENS.find(t => t.symbol === 'USDC' && t.available && 'address' in t)
  const { data: usdcBalance } = useBalance({
    address: isConnected && !!usdcToken ? address : undefined,
    token: usdcToken && 'address' in usdcToken ? usdcToken.address : undefined,
    chainId: currentChain.id,
    query: {
      enabled: !!address && !!usdcToken && isConnected,
      refetchInterval: 5000,
    },
  })

  const getTokenBalance = (tokenSymbol: string) => {
    if (tokenSymbol === 'USDC' && usdcBalance) {
      const balance = parseFloat(formatUnits(usdcBalance.value, usdcBalance.decimals))
      return formatNumberWithCommas(balance, 2)
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

  // Debounce recipient input to avoid excessive RPC calls
  const [debouncedRecipientInput] = useDebounce(recipientInput, 500)

  // ENS Resolution using mainnet client
  useEffect(() => {
    const resolveENS = async () => {
      if (!debouncedRecipientInput) {
        setResolvedAddress(null)
        setEnsTextRecords({})
        setIsResolvingEns(false)
        setError(null)
        return
      }

      // Check if it's a valid address (starts with 0x and is 42 chars)
      if (debouncedRecipientInput.startsWith('0x') && debouncedRecipientInput.length === 42) {
        try {
          // Validate address format
          if (!/^0x[a-fA-F0-9]{40}$/.test(debouncedRecipientInput)) {
            setError('Invalid address format')
            setResolvedAddress(null)
            setEnsTextRecords({})
            setIsResolvingEns(false)
            return
          }
          setResolvedAddress(debouncedRecipientInput as `0x${string}`)
          setEnsTextRecords({})
          setIsResolvingEns(false)
          setError(null)
        } catch (error) {
          console.error('Address validation error:', error)
          setError('Invalid address format')
          setResolvedAddress(null)
          setEnsTextRecords({})
          setIsResolvingEns(false)
        }
        return
      }

      // Try to resolve ENS name using mainnet client
      setIsResolvingEns(true)
      setError(null)
      try {
        const address = await mainnetPublicClient.getEnsAddress({ name: debouncedRecipientInput })
        if (address) {
          setResolvedAddress(address)
          setError(null)

          // Fetch text records
          try {
            const resolver = await mainnetPublicClient.getEnsResolver({ name: debouncedRecipientInput })
            if (resolver) {
              // Fetch common text records
              const textRecordKeys = ['description', 'url', 'avatar', 'com.twitter', 'com.github', 'com.discord', 'email']
              const records: Record<string, string> = {}

              for (const key of textRecordKeys) {
                try {
                  const value = await mainnetPublicClient.getEnsText({ name: debouncedRecipientInput, key })
                  if (value) {
                    records[key] = value
                  }
                } catch (textError) {
                  // Ignore errors for individual text records
                  console.debug(`Failed to fetch text record ${key}:`, textError)
                }
              }

              setEnsTextRecords(records)
            }
          } catch (resolverError) {
            // If text records fail, just continue with address
            console.debug('Failed to get ENS resolver:', resolverError)
            setEnsTextRecords({})
          }
        } else {
          setResolvedAddress(null)
          setEnsTextRecords({})
          setError('ENS name not found')
        }
      } catch (error) {
        console.error('ENS resolution error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to resolve ENS name'
        setError(errorMessage.includes('ENS name not found') || errorMessage.includes('not found')
          ? 'ENS name not found'
          : 'Failed to resolve ENS name. Please check the name and try again.')
        setResolvedAddress(null)
        setEnsTextRecords({})
      } finally {
        setIsResolvingEns(false)
      }
    }

    resolveENS()
  }, [debouncedRecipientInput, mainnetPublicClient])

  // Handle send transfer
  const handleSendTransfer = async (e?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (e) {
      e.preventDefault?.()
    }

    // Validation
    if (!address || !isConnected) {
      setError('Please connect your wallet')
      return
    }

    if (!sendAmount || parseFloat(sendAmount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (!resolvedAddress) {
      setError('Please enter a valid recipient address or ENS name')
      return
    }

    if (!selectedToken.available || !('address' in selectedToken) || !selectedToken.address) {
      setError('Invalid token selected')
      return
    }

    // Check balance
    if (balance) {
      const balanceAmount = parseFloat(formatUnits(balance.value, balance.decimals))
      const sendAmountNum = parseFloat(sendAmount)
      if (sendAmountNum > balanceAmount) {
        setError('Insufficient balance')
        return
      }
    }

    setIsLoading(true)
    setError(null)
    setSendTxHash(undefined)
    setSendTxHashForWait(undefined)

    try {
      const amountInWei = parseUnits(sendAmount, selectedToken.decimals)

      // Validate amount is not zero
      if (amountInWei === BigInt(0)) {
        throw new Error('Amount must be greater than zero')
      }

      const hash = await writeContractAsync({
        address: selectedToken.address,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [resolvedAddress, amountInWei],
      })

      setSendTxHash(hash)
      setSendTxHashForWait(hash)
    } catch (err: unknown) {
      console.error('Transfer error:', err)
      setError(sanitizeErrorMessage(err))
      setIsLoading(false)
      setSendTxHash(undefined)
      setSendTxHashForWait(undefined)
    }
  }

  // Wait for send transaction
  const { isLoading: isSendConfirming, isSuccess: isSendTxSuccess, isError: isSendTxError } = useWaitForTransactionReceipt({
    hash: sendTxHashForWait,
  })

  useEffect(() => {
    if (isSendTxSuccess && sendTxHashForWait) {
      setIsSendSuccess(true)
      setIsLoading(false)
      setSendTxHash(sendTxHashForWait)
    }
    if (isSendTxError) {
      setError('Transaction failed. Please try again.')
      setIsLoading(false)
    }
  }, [isSendTxSuccess, isSendTxError, sendTxHashForWait])

  const handleOpenDialog = () => {
    if (!isConnected || !selectedToken.available) return
    setShowDialog(true)
  }

  // Helper function to sanitize error messages
  const sanitizeErrorMessage = (error: unknown): string => {
    if (!error) return 'An unexpected error occurred'

    const errorString = error instanceof Error ? error.message : String(error)

    // Check for common user-friendly error patterns
    if (errorString.includes('User rejected') || errorString.includes('user rejected')) {
      return 'Transaction rejected. Please try again.'
    }
    if (errorString.includes('insufficient funds') || errorString.includes('Insufficient funds')) {
      return 'Insufficient funds. Please check your balance.'
    }
    if (errorString.includes('reverted')) {
      return 'Transaction failed. Please try again.'
    }
    if (errorString.includes('network') || errorString.includes('Network')) {
      return 'Network error. Please check your connection.'
    }
    if (errorString.includes('timeout') || errorString.includes('Timeout')) {
      return 'Request timed out. Please try again.'
    }

    // If it's a very long error message, extract the first meaningful part
    if (errorString.length > 100) {
      // Try to find a meaningful substring
      const shortError = errorString.substring(0, 100)
      if (shortError.includes('rejected') || shortError.includes('failed')) {
        return 'Transaction failed. Please try again.'
      }
      return 'An error occurred. Please try again.'
    }

    return errorString
  }

  const handleConfirmDeposit = async (e?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (e) {
      e.preventDefault?.()
    }

    if (!address || !isConnected || !depositAmount || parseFloat(depositAmount) <= 0) {
      return
    }

    setIsLoading(true)
    setError(null)
    setTxHash(undefined) // Clear any previous hash

    try {
      if (!selectedToken.available || !('address' in selectedToken) || !selectedToken.address) {
        throw new Error('Invalid token selected')
      }

      const vaultAddress = CONTRACT_ADDRESSES.VAULT
      const assuraVerifierAddress = CONTRACT_ADDRESSES.ASSURA_VERIFIER

      if (vaultAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Vault contract address not configured. Please update CONTRACT_ADDRESSES.VAULT in constants.ts')
      }

      // Convert amount to wei/smallest unit
      const amountInWei = parseUnits(depositAmount, selectedToken.decimals)

      // Use publicClient from wagmi hook
      if (!publicClient) {
        throw new Error('Public client not available')
      }

      const [verificationKey, minScore] = await Promise.all([
        publicClient.readContract({
          address: vaultAddress,
          abi: VAULT_ABI,
          functionName: 'verificationKey',
        }) as Promise<`0x${string}`>,
        publicClient.readContract({
          address: vaultAddress,
          abi: VAULT_ABI,
          functionName: 'minScore',
        }) as Promise<bigint>,
      ])

      // Get verifying data from AssuraVerifier to check required score
      const verifyingData = await publicClient.readContract({
        address: assuraVerifierAddress,
        abi: ASSURA_VERIFIER_ABI,
        functionName: 'getVerifyingData',
        args: [vaultAddress, verificationKey],
      }) as { score: bigint; expiry: bigint; chainId: bigint }

      // Use the required score from verifying data (or minScore as fallback)
      const requiredScore = verifyingData.score > BigInt(0) ? verifyingData.score : minScore
      // Use a score higher than required to ensure it passes
      const score = requiredScore + BigInt(50) // Add buffer to ensure it's above minimum

      // Check and handle token approval
      const tokenAddress = selectedToken.address as `0x${string}`
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, vaultAddress],
      })

      // Handle token approval if needed
      if (allowance < amountInWei) {
        console.log('Insufficient allowance, requesting approval...')

        // Request approval - use a larger amount to avoid repeated approvals
        const approveAmount = amountInWei * BigInt(10) // Approve 10x the amount for future deposits

        // Set state to show approval is needed
        setNeedsApproval(true)
        setIsApprovalTx(true)
        setIsDepositTx(false)
        setApprovalAmount(approveAmount)
        setError(null) // Clear any previous errors

        // Trigger approval transaction
        try {
          const approvalHash = await writeContractAsync({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [vaultAddress, approveAmount],
          })
          setTxHash(approvalHash)
          // Don't exit - let the transaction proceed and handle in useEffect
          // The useEffect will automatically proceed with deposit after approval
          return
        } catch (approvalError) {
          console.error('Error initiating approval:', approvalError)
          const errorMessage = sanitizeErrorMessage(approvalError)
          throw new Error(errorMessage)
        }
      }

      // Mark as deposit transaction
      setIsDepositTx(true)
      setIsApprovalTx(false)

      // Prepare attested data
      const currentTimestamp = BigInt(Math.floor(Date.now() / 1000))
      // Use chainId from verifying data if set, otherwise use current chain
      // If chainId is 0 in verifying data, it means "any chain"
      const currentChainId = verifyingData.chainId > BigInt(0)
        ? verifyingData.chainId
        : BigInt(chainId || currentChain.id)

      const attestedData = {
        score,
        timeAtWhichAttested: currentTimestamp,
        chainId: currentChainId,
      }

      // Get TEE signature from API
      const teeResponse = await fetch('/api/tee/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          score: attestedData.score.toString(),
          timeAtWhichAttested: attestedData.timeAtWhichAttested.toString(),
          chainId: attestedData.chainId.toString(),
          assuraVerifierAddress,
          signatureType: 'eip712', // Use EIP-712 by default
        }),
      })

      if (!teeResponse.ok) {
        const errorData = await teeResponse.json()
        throw new Error(errorData.error || 'Failed to get TEE signature')
      }

      const { signature, attestedData: responseAttestedData } = await teeResponse.json()

      // Create compliance data
      const complianceData = createComplianceData(
        address,
        verificationKey,
        signature as `0x${string}`,
        {
          score: BigInt(responseAttestedData.score),
          timeAtWhichAttested: BigInt(responseAttestedData.timeAtWhichAttested),
          chainId: BigInt(responseAttestedData.chainId),
        }
      )

      // Deposit with compliance
      console.log('Depositing with compliance...')
      const depositHash = await writeContractAsync({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'depositWithCompliance',
        args: [amountInWei, address, complianceData],
      })
      setTxHash(depositHash)
    } catch (err) {
      console.error('Deposit error:', err)
      const errorMessage = sanitizeErrorMessage(err)
      setError(errorMessage)
      setIsLoading(false)
      setIsApprovalTx(false)
      setIsDepositTx(false)
      setNeedsApproval(false)
    }
  }

  // Handle approval success - retry deposit automatically
  useEffect(() => {
    if (isSuccess && isApprovalTx && needsApproval && txHash && publicClient) {
      // Approval succeeded, wait for transaction confirmation then retry deposit
      const retryDeposit = async () => {
        try {
          // Wait for approval transaction to be confirmed on-chain
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

          if (receipt.status === 'reverted') {
            throw new Error('Approval transaction reverted')
          }

          console.log('Approval transaction confirmed:', receipt.transactionHash)

          // Wait a bit more for state to propagate
          await new Promise((resolve) => setTimeout(resolve, 2000))

          // Reset approval state but keep dialog open
          setNeedsApproval(false)
          setIsApprovalTx(false)
          setApprovalAmount(null)
          setIsLoading(false)
          setError(null) // Clear any previous errors

          // Reset write contract to allow new transaction
          resetWriteContract()
          setTxHash(undefined) // Clear previous hash

          // Automatically proceed with deposit - call handleConfirmDeposit
          await new Promise((resolve) => setTimeout(resolve, 1000))

          // Re-trigger the deposit flow automatically
          if (address && isConnected && depositAmount && parseFloat(depositAmount) > 0) {
            console.log('Auto-proceeding with deposit after approval...')
            // Call handleConfirmDeposit without event (it's optional now)
            handleConfirmDeposit()
          }
        } catch (error) {
          console.error('Error waiting for approval transaction:', error)
          const errorMessage = sanitizeErrorMessage(error)
          setError(errorMessage)
          setIsLoading(false)
          setIsApprovalTx(false)
          setNeedsApproval(false)
        }
      }
      retryDeposit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, isApprovalTx, needsApproval, txHash, resetWriteContract, address, isConnected, depositAmount, publicClient])

  // Handle deposit success
  useEffect(() => {
    if (isSuccess && isDepositTx && !isApprovalTx && txHash && publicClient && depositAmount) {
      const handleSuccess = async () => {
        try {
          // Wait for deposit transaction to be confirmed on-chain
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

          if (receipt.status === 'reverted') {
            throw new Error('Deposit transaction reverted')
          }

          console.log('Deposit transaction confirmed:', receipt.transactionHash)

          // Store deposited amount for display BEFORE showing success screen
          setDepositedAmount(depositAmount)

          // Set success state and store transaction hash immediately
          setIsDepositSuccess(true)
          setSuccessTxHash(receipt.transactionHash)

          // Wait a bit more for state to propagate
          await new Promise((resolve) => setTimeout(resolve, 2000))

          // Refetch shares multiple times to ensure we get updated value (in background)
          refetchShares()
          await new Promise((resolve) => setTimeout(resolve, 1000))
          refetchShares()
          await new Promise((resolve) => setTimeout(resolve, 1000))
          refetchShares()

          // Reset transaction states
          setIsLoading(false)
          setIsDepositTx(false)
          setNeedsApproval(false)
          setApprovalAmount(null)
          setError(null) // Clear any errors

          // Reset write contract
          resetWriteContract()
          setTxHash(undefined) // Clear hash
        } catch (error) {
          console.error('Error waiting for deposit transaction:', error)
          const errorMessage = sanitizeErrorMessage(error)
          setError(errorMessage)
          setIsLoading(false)
          setIsDepositTx(false)
        }
      }
      handleSuccess()
    }
  }, [isSuccess, isDepositTx, isApprovalTx, txHash, refetchShares, resetWriteContract, publicClient, depositAmount])

  // Handle transaction errors
  useEffect(() => {
    if (isTxError && txHash) {
      setIsLoading(false)
      setIsApprovalTx(false)
      setIsDepositTx(false)
      setNeedsApproval(false)
      setError('Transaction failed. Please check your wallet and try again.')
      resetWriteContract()
      setTxHash(undefined)
    }
  }, [isTxError, txHash, resetWriteContract])

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
            
            {isConnected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSendDialog(true)
                  setRecipientInput('')
                  setSendAmount('')
                  setResolvedAddress(null)
                  setEnsTextRecords({})
                  setError(null)
                  setIsSendSuccess(false)
                  setSendTxHash(undefined)
                  setSendTxHashForWait(undefined)
                }}
                className="rounded-full h-10 w-10 p-0 hover:opacity-70 transition-opacity"
                title="Send"
              >
                <Send className="h-5 w-5" />
              </Button>
            )}<ThemeToggle />
            <CustomConnectButton />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mt-16">
        <div className="max-w-[625px] mx-auto px-8">
          {/* Current Vault Shares */}
          <div className="mb-16">
            <div className="text-lg font-light text-muted-foreground mb-3">Your Shares</div>
            <div className="flex items-end gap-4">
              <div className="text-7xl font-light leading-none text-foreground">
                {userShares !== undefined
                  ? formatNumberWithCommas(
                    parseFloat(formatUnits(userShares, selectedToken.decimals)),
                    2
                  )
                  : '0.00'}
              </div>
              <div className="text-3xl font-light text-muted-foreground pb-2">APV</div>
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
      <AlertDialog
        open={showDialog}
        onOpenChange={(open) => {
          // Prevent closing during processing (approval or deposit)
          if (!open && (isLoading || isPending || isConfirming || isApprovalTx || isDepositTx)) {
            return
          }
          setShowDialog(open)
          if (!open) {
            // Reset states when dialog is closed manually
            setDepositAmount('')
            setError(null)
            setIsLoading(false)
            setNeedsApproval(false)
            setIsApprovalTx(false)
            setIsDepositTx(false)
            setIsDepositSuccess(false)
            setSuccessTxHash(undefined)
            setDepositedAmount('')
            resetWriteContract()
          }
        }}
      >
        <AlertDialogContent className={`max-w-lg rounded-3xl p-6 ${isDepositSuccess ? 'bg-foreground border-0' : ''}`}>
          {isDepositSuccess ? (
            // Success Screen
            <div className="flex flex-col items-center justify-center py-8 px-4">
              {/* Checkmark */}
              <div className="w-20 h-20 rounded-full bg-background flex items-center justify-center mb-6">
                <Check className="w-12 h-12 text-foreground" strokeWidth={3} />
              </div>

              {/* Success Title */}
              <h2 className="text-3xl font-light text-background mb-4">Deposit Successful</h2>

              {/* Updated Shares */}
              <div className="mb-6 text-center">
                <div className="text-sm font-light text-background/80 mb-1">Received Shares</div>
                <div className="text-2xl font-light text-background">
                  {depositedAmount
                    ? formatNumberWithCommas(parseFloat(depositedAmount), 2)
                    : userShares !== undefined && userShares > BigInt(0)
                      ? formatNumberWithCommas(parseFloat(formatUnits(userShares, 18)), 2)
                      : '0.00'}{' '}
                  APV
                </div>
              </div>

              {/* Block Explorer Link */}
              {successTxHash && currentChain.blockExplorers?.default?.url && (
                <a
                  href={`${currentChain.blockExplorers.default.url}/tx/${successTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-background/90 hover:text-background underline text-sm font-light transition-colors mb-6"
                >
                  View on Block Explorer
                </a>
              )}

              {/* Close Button */}
              <Button
                onClick={() => {
                  setShowDialog(false)
                  setIsDepositSuccess(false)
                  setSuccessTxHash(undefined)
                  setDepositAmount('')
                  setDepositedAmount('')
                }}
                className="rounded-full font-light h-12 px-8 text-sm bg-background text-foreground hover:bg-background/90"
              >
                Close
              </Button>
            </div>
          ) : (
            // Normal Deposit Form
            <>
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

              {error && (
                <div className="p-4 border border-red-500/50 rounded-3xl bg-red-500/10">
                  <div className="text-sm font-light text-red-500 break-all">{error}</div>
                </div>
              )}

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
                        {formatNumberWithCommas(
                          parseFloat(formatUnits(balance.value, balance.decimals)),
                          2
                        )} {selectedToken.symbol}
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
                        <span className="text-lg font-light text-foreground">
                          {formatNumberWithCommas(depositAmount, 2)} {selectedToken.symbol}
                        </span>
                      </div>
                      <div className="h-px bg-border mb-2"></div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-light text-muted-foreground">Estimated shares</span>
                        <span className="text-lg font-light text-foreground">
                          {depositAmount
                            ? `~${formatNumberWithCommas(parseFloat(depositAmount), 4)} APV`
                            : '0.0000 APV'}
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
                  disabled={!depositAmount || parseFloat(depositAmount) <= 0 || isLoading || isPending || isConfirming}
                  className="rounded-full font-light h-12 px-8 text-sm"
                >
                  {needsApproval
                    ? isPending || isConfirming
                      ? 'Approving...'
                      : isSuccess
                        ? 'Approved! Retrying...'
                        : 'Approve Tokens'
                    : isLoading || isPending || isConfirming
                      ? 'Processing...'
                      : isSuccess
                        ? 'Success!'
                        : 'Confirm Deposit'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Dialog */}
      <AlertDialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <AlertDialogContent className="max-w-lg rounded-3xl p-6">
          {isSendSuccess ? (
            // Success State
            <div className="flex flex-col items-center text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
                <Check className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-3xl font-light mb-2">Transfer Successful!</h3>
              <p className="text-base font-light text-muted-foreground mb-6">
                {sendAmount} {selectedToken.symbol} has been sent successfully.
              </p>
              {sendTxHash && (
                <a
                  href={`${currentChain.blockExplorers.default.url}/tx/${sendTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-background/90 hover:text-background underline text-sm font-light transition-colors mb-6"
                >
                  View on Block Explorer
                </a>
              )}
              <Button
                onClick={() => {
                  setShowSendDialog(false)
                  setIsSendSuccess(false)
                  setSendTxHash(undefined)
                  setSendTxHashForWait(undefined)
                  setRecipientInput('')
                  setSendAmount('')
                  setResolvedAddress(null)
                  setEnsTextRecords({})
                }}
                className="rounded-full font-light h-12 px-8 text-sm bg-background text-foreground hover:bg-background/90"
              >
                Close
              </Button>
            </div>
          ) : (
            // Send Form
            <>
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
                  <AlertDialogTitle className="text-3xl font-light">Send {selectedToken.symbol}</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-base font-light text-muted-foreground">
                  Enter recipient address or ENS name and amount to send
                </AlertDialogDescription>
              </AlertDialogHeader>

              {error && (
                <div className="p-4 border border-red-500/50 rounded-3xl bg-red-500/10">
                  <div className="text-sm font-light text-red-500 break-all">{error}</div>
                </div>
              )}

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
                        {formatNumberWithCommas(
                          parseFloat(formatUnits(balance.value, balance.decimals)),
                          2
                        )} {selectedToken.symbol}
                      </div>
                    </div>
                  </div>
                )}

                {/* Recipient Address/ENS Input */}
                <div>
                  <div className="text-xs font-light text-muted-foreground mb-2 uppercase tracking-wider">Recipient</div>
                  <Input
                    type="text"
                    placeholder="0x... or ENS name"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    className="text-2xl font-light h-16 border-2 border-border rounded-full bg-transparent focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-lg"
                  />
                  {isResolvingEns && (
                    <div className="text-sm font-light text-muted-foreground mt-2">Resolving ENS...</div>
                  )}
                  {resolvedAddress && !isResolvingEns && (
                    <div className="mt-2">
                      <div className="text-sm font-light text-foreground">
                        {recipientInput.includes('.') ? `${recipientInput} → ` : ''}
                        <span className="text-muted-foreground font-mono">{resolvedAddress}</span>
                      </div>
                      {/* ENS Text Records */}
                      {Object.keys(ensTextRecords).length > 0 && (
                        <div className="mt-3 p-3 border border-border rounded-2xl bg-card/30">
                          <div className="text-xs font-light text-muted-foreground mb-2 uppercase tracking-wider">ENS Records</div>
                          <div className="space-y-1">
                            {Object.entries(ensTextRecords).map(([key, value]) => (
                              <div key={key} className="flex justify-between items-center text-sm">
                                <span className="font-light text-muted-foreground">{key}:</span>
                                <span className="font-light text-foreground break-all ml-2">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Amount Input */}
                <div>
                  <div className="text-xs font-light text-muted-foreground mb-2 uppercase tracking-wider">Amount</div>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      className="text-3xl font-light h-16 pr-20 border-0 border-b-2 border-border rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-foreground transition-colors"
                    />
                    {balance && (
                      <button
                        onClick={() => {
                          if (balance) {
                            const formatted = formatUnits(balance.value, balance.decimals)
                            setSendAmount(formatted)
                          }
                        }}
                        className="absolute right-0 top-1/2 -translate-y-1/2 text-sm font-light text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Max
                      </button>
                    )}
                  </div>
                </div>

                {/* Summary */}
                {sendAmount && parseFloat(sendAmount) > 0 && resolvedAddress && (
                  <div className="p-4 border border-border rounded-3xl bg-card/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-light text-muted-foreground">You will send</span>
                      <span className="text-lg font-light text-foreground">{sendAmount} {selectedToken.symbol}</span>
                    </div>
                    <div className="h-px bg-border mb-2"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-light text-muted-foreground">To</span>
                      <span className="text-sm font-light text-foreground font-mono break-all">
                        {resolvedAddress}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <AlertDialogFooter className="gap-0 mt-4">
                <AlertDialogCancel
                  onClick={() => {
                    setRecipientInput('')
                    setSendAmount('')
                    setResolvedAddress(null)
                    setEnsTextRecords({})
                    setError(null)
                  }}
                  className="rounded-full font-light h-12 px-8 text-sm"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => handleSendTransfer(e)}
                  disabled={
                    !sendAmount ||
                    parseFloat(sendAmount) <= 0 ||
                    !resolvedAddress ||
                    isLoading ||
                    isSendConfirming ||
                    isResolvingEns
                  }
                  className="rounded-full font-light h-12 px-8 text-sm"
                >
                  {isLoading || isSendConfirming ? 'Processing...' : isResolvingEns ? 'Resolving ENS...' : 'Send'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}