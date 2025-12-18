import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { hardhat } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

// 创建公共客户端来读取合约
const publicClient = createPublicClient({
  chain: hardhat,
  transport: http(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  try {
    // Next.js 15 requires awaiting params
    const { tokenId } = await params;

    if (!tokenId) {
      return NextResponse.json({ error: "Token ID is required" }, { status: 400 });
    }

    console.log(`[Metadata API] Fetching metadata for token ${tokenId}`);

    // 获取合约地址
    const nftContractAddress = deployedContracts[1337]?.YourCollectible?.address;
    
    if (!nftContractAddress) {
      console.error("[Metadata API] NFT contract address not found");
      return NextResponse.json({ error: "NFT contract not configured" }, { status: 500 });
    }

    // 从 YourCollectible 合约获取 tokenURI
    const tokenURI = await publicClient.readContract({
      address: nftContractAddress,
      abi: [
        {
          inputs: [{ name: "tokenId", type: "uint256" }],
          name: "tokenURI",
          outputs: [{ name: "", type: "string" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "tokenURI",
      args: [BigInt(tokenId)],
    });

    if (!tokenURI) {
      console.warn(`[Metadata API] Token ${tokenId} has no URI`);
      return NextResponse.json({ error: "Token URI not found" }, { status: 404 });
    }

    console.log(`[Metadata API] Token ${tokenId} URI: ${tokenURI}`);

    // 如果是 IPFS URL，转换为可访问的 URL
    const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
    let metadataUrl = tokenURI as string;
    if (metadataUrl.startsWith("ipfs://")) {
      metadataUrl = metadataUrl.replace("ipfs://", PINATA_GATEWAY);
    }

    console.log(`[Metadata API] Fetching metadata from: ${metadataUrl}`);

    // 获取元数据
    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) {
      console.error(`[Metadata API] Failed to fetch metadata: ${metadataResponse.status}`);
      return NextResponse.json({ error: "Failed to fetch metadata" }, { status: 500 });
    }

    const metadata = await metadataResponse.json();

    // 如果图片是 IPFS URL，也转换一下
    if (metadata.image && metadata.image.startsWith("ipfs://")) {
      metadata.image = metadata.image.replace("ipfs://", PINATA_GATEWAY);
    }

    console.log(`[Metadata API] Successfully fetched metadata for token ${tokenId}`);
    return NextResponse.json(metadata);
  } catch (error: any) {
    console.error("[Metadata API] Error:", error);
    
    // 更详细的错误信息
    if (error.message?.includes("returned no data")) {
      return NextResponse.json(
        { error: `Token does not exist or has no metadata` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}