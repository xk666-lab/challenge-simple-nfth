import { useState } from "react";
import { parseEther } from "viem";
import { Collectible } from "./MyHoldings";
import { Address, AddressInput } from "~~/components/scaffold-eth";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import deployedContracts from "~~/contracts/deployedContracts";

export const NFTCard = ({ nft, selectable, selected, onSelectedChange }: { nft: Collectible; selectable?: boolean; selected?: boolean; onSelectedChange?: (checked: boolean) => void; }) => {
  const [transferToAddress, setTransferToAddress] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [showAuction, setShowAuction] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [minBid, setMinBid] = useState("");
  const [commitDuration, setCommitDuration] = useState("");
  const [revealDuration, setRevealDuration] = useState("");
  const [isListing, setIsListing] = useState(false);

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "YourCollectible" });
  const { writeContractAsync: writeMarketplaceContract } = useScaffoldWriteContract({ contractName: "NFTMarketplace" });

  const handleSellNFT = async () => {
    if (!sellPrice || parseFloat(sellPrice) <= 0) {
      notification.error("请输入有效的价格");
      return;
    }

    try {
      setIsListing(true);
      const listingNotificationId = notification.loading("正在上架NFT...");
      
      // 获取合约地址
      const marketplaceAddress = deployedContracts[1337]?.NFTMarketplace?.address;
      
      if (!marketplaceAddress) {
        throw new Error("无法获取市场合约地址");
      }
      
      console.log(`[Listing] Approving marketplace ${marketplaceAddress} for token ${nft.id}`);
      
      // 首先需要授权市场合约操作这个 NFT
      await writeContractAsync({
        functionName: "approve",
        args: [marketplaceAddress, BigInt(nft.id.toString())],
      });

      console.log(`[Listing] Listing NFT ${nft.id} for ${sellPrice} ETH`);
      
      // 然后在市场上列出 NFT
      await writeMarketplaceContract({
        functionName: "listNFT",
        args: [
          deployedContracts[1337]?.YourCollectible?.address,
          BigInt(nft.id.toString()),
          parseEther(sellPrice)
        ],
      });

      notification.remove(listingNotificationId);
      notification.success("NFT 已成功上架到市场！");
      
      setShowSell(false);
      setSellPrice("");
    } catch (err: any) {
      console.error("Error listing NFT:", err);
      notification.error(err?.message || "上架失败，请重试");
    } finally {
      setIsListing(false);
    }
  };

  const handleCreateAuction = async () => {
    if (!minBid || parseFloat(minBid) <= 0) {
      notification.error("请输入有效的起拍价");
      return;
    }
    if (!commitDuration || parseInt(commitDuration) <= 0) {
      notification.error("请输入有效的竞价时长");
      return;
    }
    if (!revealDuration || parseInt(revealDuration) <= 0) {
      notification.error("请输入有效的揭示时长");
      return;
    }

    try {
      setIsListing(true);
      const auctionNotificationId = notification.loading("正在创建盲拍...");
      
      const marketplaceAddress = deployedContracts[1337]?.NFTMarketplace?.address;
      if (!marketplaceAddress) throw new Error("无法获取市场合约地址");

      // Approve integration
      await writeContractAsync({
        functionName: "approve",
        args: [marketplaceAddress, BigInt(nft.id.toString())],
      });

      // Validating durations (inputs are in minutes for UX, converting to seconds)
      const commitSeconds = BigInt(parseInt(commitDuration) * 60); 
      const revealSeconds = BigInt(parseInt(revealDuration) * 60);

      await writeMarketplaceContract({
        functionName: "createBlindAuction",
        args: [
          deployedContracts[1337]?.YourCollectible?.address,
          BigInt(nft.id.toString()),
          parseEther(minBid),
          commitSeconds,
          revealSeconds
        ],
      });

      notification.remove(auctionNotificationId);
      notification.success("盲拍创建成功！");
      setShowAuction(false);
      setMinBid("");
      setCommitDuration("");
      setRevealDuration("");

    } catch (err: any) {
      console.error("Error creating auction:", err);
      notification.error(err?.message || "创建失败，请重试");
    } finally {
      setIsListing(false);
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 border border-base-300 overflow-hidden group relative">
      {/* 选择复选框（批量模式） */}
      {selectable ? (
        <div className="absolute top-3 left-3 z-10">
          <input
            type="checkbox"
            className="checkbox checkbox-primary checkbox-sm"
            checked={!!selected}
            onChange={(e) => onSelectedChange?.(e.target.checked)}
          />
        </div>
      ) : null}

      <figure className="relative overflow-hidden">
        {/* eslint-disable-next-line  */}
        <img 
          src={nft.image} 
          alt="NFT Image" 
          className="h-64 w-full object-cover group-hover:scale-105 transition-transform duration-300" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <figcaption className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm text-white px-3 py-2 rounded-lg">
          <span className="font-bold">#{nft.id}</span>
        </figcaption>
        {nft.attributes && nft.attributes.length > 0 && (
          <div className="absolute top-4 right-4">
            <div className="badge badge-primary badge-sm">
              {nft.attributes[0]?.value}
            </div>
          </div>
        )}
      </figure>
      
      <div className="card-body p-6">
        {/* NFT Title and Description */}
        <div className="mb-4">
          <h3 className="card-title text-xl font-bold mb-2 line-clamp-1">{nft.name}</h3>
          <p className="text-sm opacity-70 line-clamp-2">{nft.description}</p>
        </div>

        {/* Attributes */}
        {nft.attributes && nft.attributes.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {nft.attributes.slice(0, 3).map((attr, index) => (
                <div key={index} className="badge badge-outline badge-sm">
                  <span className="text-xs">{attr.trait_type}: {attr.value}</span>
                </div>
              ))}
              {nft.attributes.length > 3 && (
                <div className="badge badge-ghost badge-sm">
                  +{nft.attributes.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Owner Info */}
        <div className="mb-4 p-3 bg-base-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold opacity-70">Owner</span>
            <Address address={nft.owner} size="sm" />
          </div>
        </div>

        {/* Action Buttons Section */}
        <div className="card-actions flex-col">
          {!showTransfer && !showSell && !showAuction ? (
            <div className="flex gap-2 w-full">
              <button
                className="btn btn-outline btn-sm flex-1"
                onClick={() => setShowTransfer(true)}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer
              </button>
              <button
                className="btn btn-primary btn-sm flex-1"
                onClick={() => setShowSell(true)}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                Sell
              </button>
              <button
                className="btn btn-secondary btn-sm flex-1"
                onClick={() => setShowAuction(true)}
              >
                 <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Auction
              </button>
            </div>
          ) : showTransfer ? (
            <div className="w-full space-y-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-semibold">Transfer to:</span>
                </label>
                <AddressInput
                  value={transferToAddress}
                  placeholder="Enter recipient address"
                  onChange={newValue => setTransferToAddress(newValue)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => {
                    setShowTransfer(false);
                    setTransferToAddress("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm flex-1"
                  disabled={!transferToAddress}
                  onClick={() => {
                    try {
                      writeContractAsync({
                        functionName: "transferFrom",
                        args: [nft.owner, transferToAddress, BigInt(nft.id.toString())],
                      });
                      setShowTransfer(false);
                      setTransferToAddress("");
                    } catch (err) {
                      console.error("Error calling transferFrom function", err);
                    }
                  }}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send
                </button>
              </div>
            </div>
          ) : showSell ? (
            <div className="w-full space-y-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-semibold">Sale Price (ETH):</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Enter price in ETH"
                  className="input input-bordered input-sm w-full"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => {
                    setShowSell(false);
                    setSellPrice("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm flex-1"
                  disabled={!sellPrice || parseFloat(sellPrice) <= 0 || isListing}
                  onClick={handleSellNFT}
                >
                  {isListing ? (
                    <>
                      <span className="loading loading-spinner loading-xs mr-1"></span>
                      Listing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                      </svg>
                      List for Sale
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : showAuction ? (
            <div className="w-full space-y-3">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-sm font-semibold">起拍价 (Min Bid ETH):</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="ETH"
                  className="input input-bordered input-sm w-full"
                  value={minBid}
                  onChange={(e) => setMinBid(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <div className="form-control flex-1">
                  <label className="label py-1">
                    <span className="label-text text-xs">竞价时长(分)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Mins"
                    className="input input-bordered input-sm w-full"
                    value={commitDuration}
                    onChange={(e) => setCommitDuration(e.target.value)}
                  />
                </div>
                <div className="form-control flex-1">
                  <label className="label py-1">
                    <span className="label-text text-xs">揭示时长(分)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Mins"
                    className="input input-bordered input-sm w-full"
                    value={revealDuration}
                    onChange={(e) => setRevealDuration(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                 <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => {
                    setShowAuction(false);
                    setMinBid("");
                    setCommitDuration("");
                    setRevealDuration("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-secondary btn-sm flex-1"
                  disabled={!minBid || !commitDuration || !revealDuration || isListing}
                  onClick={handleCreateAuction}
                >
                  {isListing ? (
                    <>
                      <span className="loading loading-spinner loading-xs mr-1"></span>
                      Creating...
                    </>
                  ) : (
                    <>Start Auction</>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
