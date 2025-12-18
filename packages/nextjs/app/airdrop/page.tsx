"use client";

import { AirdropMinter } from "../myNFTs/_components/AirdropMinter";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";

const AirdropPage: NextPage = () => {
  const { isConnected, isConnecting } = useAccount();

  return (
    <>
      <div className="flex items-center flex-col pt-10">
        <div className="px-5">
          <h1 className="text-center mb-8">
            <span className="block text-4xl font-bold">Airdrop NFTs</span>
            <span className="block text-lg opacity-70 mt-2">向多个地址一次性发放同一NFT</span>
          </h1>
        </div>
      </div>

      {!isConnected || isConnecting ? (
        <div className="flex justify-center">
          <RainbowKitCustomConnectButton />
        </div>
      ) : (
        <div className="flex justify-center px-5 mb-8">
          <AirdropMinter />
        </div>
      )}
    </>
  );
};

export default AirdropPage;
