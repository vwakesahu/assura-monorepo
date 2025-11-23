'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from './ui/button'
import { formatAddress } from '@/lib/utils'

export function CustomConnectButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading'
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated')

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button
                    onClick={openConnectModal}
                    // variant="outline"
                    className="rounded-full font-light border-border hover:opacity-70 transition-opacity h-12"
                  >
                    Connect Wallet
                  </Button>
                )
              }

              return (
                <Button
                  onClick={openAccountModal}
                //   variant="outline"
                  className="rounded-full font-light border-border hover:opacity-70 transition-opacity h-12"
                >
                  {account.displayName || formatAddress(account.address)}
                </Button>
              )
            })()}
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}

