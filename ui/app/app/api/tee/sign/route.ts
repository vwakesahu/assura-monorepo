import { NextRequest, NextResponse } from "next/server";
import {
  encodeAbiParameters,
  keccak256,
  toBytes,
  hexToBytes,
  serializeSignature,
  type Hex,
} from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";

const TEE_PRIVATE_KEY = process.env.TEE_PRIVATE_KEY as `0x${string}`;

/**
 * Create EIP-191 signature for AttestedData
 */
async function createEIP191Signature(attestedData: {
  score: bigint;
  timeAtWhichAttested: bigint;
  chainId: bigint;
}): Promise<`0x${string}`> {
  const encodedData = encodeAbiParameters(
    [
      { name: "score", type: "uint256" },
      { name: "timeAtWhichAttested", type: "uint256" },
      { name: "chainId", type: "uint256" },
    ],
    [attestedData.score, attestedData.timeAtWhichAttested, attestedData.chainId]
  );

  const dataHash = keccak256(encodedData);
  const messagePrefix = "\x19Ethereum Signed Message:\n32";
  const messageBytes = new Uint8Array(
    messagePrefix.length + hexToBytes(dataHash).length
  );
  messageBytes.set(toBytes(messagePrefix), 0);
  messageBytes.set(hexToBytes(dataHash), messagePrefix.length);

  const messageHash = keccak256(messageBytes);
  const signature = await sign({
    hash: messageHash,
    privateKey: TEE_PRIVATE_KEY,
  });

  return serializeSignature(signature);
}

/**
 * Create EIP-712 signature for AttestedData
 */
async function createEIP712Signature(
  attestedData: {
    score: bigint;
    timeAtWhichAttested: bigint;
    chainId: bigint;
  },
  assuraVerifierAddress: `0x${string}`
): Promise<`0x${string}`> {
  const signer = privateKeyToAccount(TEE_PRIVATE_KEY);

  const domain = {
    name: "AssuraVerifier",
    version: "1",
    chainId: Number(attestedData.chainId),
    verifyingContract: assuraVerifierAddress,
  };

  const types = {
    AttestedData: [
      { name: "score", type: "uint256" },
      { name: "timeAtWhichAttested", type: "uint256" },
      { name: "chainId", type: "uint256" },
    ],
  };

  const signature = await signer.signTypedData({
    domain,
    types,
    primaryType: "AttestedData",
    message: attestedData,
  });

  return signature;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      score,
      timeAtWhichAttested,
      chainId,
      assuraVerifierAddress,
      signatureType = "eip712",
    } = body;

    // Validate required fields
    if (!score || !timeAtWhichAttested || !chainId || !assuraVerifierAddress) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: score, timeAtWhichAttested, chainId, assuraVerifierAddress",
        },
        { status: 400 }
      );
    }

    const attestedData = {
      score: BigInt(score),
      timeAtWhichAttested: BigInt(timeAtWhichAttested),
      chainId: BigInt(chainId),
    };

    let signature: `0x${string}`;

    if (signatureType === "eip191") {
      signature = await createEIP191Signature(attestedData);
    } else {
      signature = await createEIP712Signature(
        attestedData,
        assuraVerifierAddress as `0x${string}`
      );
    }

    return NextResponse.json({
      signature,
      attestedData: {
        score: attestedData.score.toString(),
        timeAtWhichAttested: attestedData.timeAtWhichAttested.toString(),
        chainId: attestedData.chainId.toString(),
      },
    });
  } catch (error) {
    console.error("Error signing with TEE:", error);
    return NextResponse.json(
      {
        error: "Failed to create signature",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
