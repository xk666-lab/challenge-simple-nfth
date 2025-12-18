"use client";

import { useState, useEffect, useMemo } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { Address } from "~~/components/scaffold-eth";

// Client-side check to avoid SSR issues
const isClient = typeof window !== "undefined";

interface MarketplaceListing {
  listingId: bigint;
  tokenId: bigint;
  seller: string;
  price: bigint;
  active: boolean;
  nftContract: string;
}

interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
}

interface MarketplaceNFT extends MarketplaceListing {
  metadata?: NFTMetadata;
}

export default function Marketplace() {
  const { address: connectedAddress } = useAccount();
  const [listings, setListings] = useState<MarketplaceNFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingTokenId, setBuyingTokenId] = useState<string | null>(null);
  // 分页状态：每页 5 个
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // 新增：批量购买状态
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedListingIds, setSelectedListingIds] = useState<bigint[]>([]);
  const [isBulkBuying, setIsBulkBuying] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current?: bigint } | null>(null);

  // 新增：筛选与排序状态
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [sellerQuery, setSellerQuery] = useState<string>("");
  const [contractQuery, setContractQuery] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      return p.get("contract") ?? "";
    }
    return "";
  });
  const [excludeMine, setExcludeMine] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"recent" | "priceAsc" | "priceDesc" | "tokenIdAsc" | "tokenIdDesc">("recent");

  // 新增：我的上架管理（改价/暂停）状态
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<bigint | null>(null);
  const [pausingId, setPausingId] = useState<bigint | null>(null);
  // 新增：报价状态
  const [offerPrices, setOfferPrices] = useState<Record<string, string>>({});
  const [offerDurations, setOfferDurations] = useState<Record<string, string>>({}); // 新增：报价有效期
  const [offeringId, setOfferingId] = useState<bigint | null>(null);
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);

  const { writeContractAsync: buyNFT } = useScaffoldWriteContract({ contractName: "NFTMarketplace" });
  const { writeContractAsync: writeMarketplace } = useScaffoldWriteContract({ contractName: "NFTMarketplace" });
  const { writeContractAsync: makeOffer } = useScaffoldWriteContract({ contractName: "NFTMarketplace" });

  // ... (lines 78-166 omitted)

  // 新增：提交报价
  const handleMakeOffer = async (listing: MarketplaceNFT) => {
    const key = listing.listingId.toString();
    const priceStr = offerPrices[key];
    const durationStr = offerDurations[key] || "1"; // 默认1天

    if (!connectedAddress) {
      alert("请先连接钱包");
      return;
    }
    if (!priceStr || parseFloat(priceStr) <= 0) {
      alert("请输入有效的报价");
      return;
    }
    const days = parseFloat(durationStr);
    if (days <= 0) {
       alert("请输入有效的有效期天数");
       return;
    }

    try {
      setOfferingId(listing.listingId);
      const expiration = BigInt(Math.floor(Date.now() / 1000) + Math.ceil(days * 24 * 3600));
      await makeOffer({ functionName: "makeOffer", args: [listing.listingId, expiration], value: parseEther(priceStr as any) });
      alert("报价已提交！资金已托管至合约，请等待卖家接受。");
      setOfferPrices(prev => ({ ...prev, [key]: "" }));
      setOfferDurations(prev => ({ ...prev, [key]: "" }));
    } catch (e) {
      console.error("Make offer failed", e);
      alert("报价失败，请重试");
    } finally {
      setOfferingId(null);
    }
  };

  // ... (lines 191-561 omitted, navigating to UI part)



  // 获取所有活跃的市场列表
  const { data: activeListings, refetch: refetchListings } = useScaffoldReadContract({
    contractName: "NFTMarketplace",
    functionName: "getAllActiveListings",
  });

  // 获取 NFT 元数据
  const fetchNFTMetadata = async (tokenId: bigint): Promise<NFTMetadata | undefined> => {
    try {
      const response = await fetch(`/api/nft/metadata/${tokenId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("Error fetching NFT metadata:", error);
    }
    return undefined;
  };

  // 处理购买 NFT（单个）
  const handleBuyNFT = async (listing: MarketplaceNFT) => {
    if (!connectedAddress) {
      alert("请先连接钱包");
      return;
    }

    try {
      setBuyingTokenId(listing.tokenId.toString());
      await buyNFT({
        functionName: "buyNFT",
        args: [listing.listingId],
        value: listing.price,
      });
      alert("购买成功！");
      refetchListings();
    } catch (error) {
      console.error("Error buying NFT:", error);
      alert("购买失败，请重试");
    } finally {
      setBuyingTokenId(null);
    }
  };

  // 新增：改价
  const handleUpdatePrice = async (listing: MarketplaceNFT) => {
    const key = listing.listingId.toString();
    const priceStr = editPrices[key];
    if (!priceStr) return;
    try {
      setUpdatingId(listing.listingId);
      const newPrice = parseEther(priceStr as any);
      await writeMarketplace({ functionName: "updatePrice", args: [listing.listingId, newPrice] });
      await refetchListings();
    } catch (e) {
      console.error("Update price failed", e);
      alert("改价失败，请检查输入并重试");
    } finally {
      setUpdatingId(null);
    }
  };

  // 新增：暂停
  const handlePauseListing = async (listing: MarketplaceNFT) => {
    try {
      setPausingId(listing.listingId);
      await writeMarketplace({ functionName: "pauseListing", args: [listing.listingId] });
      await refetchListings();
    } catch (e) {
      console.error("Pause listing failed", e);
      alert("暂停失败，请重试");
    } finally {
      setPausingId(null);
    }
  };

  // 新增：恢复
  const handleResumeListing = async (listing: MarketplaceNFT) => {
    try {
      setPausingId(listing.listingId);
      await writeMarketplace({ functionName: "resumeListing", args: [listing.listingId] });
      await refetchListings();
    } catch (e) {
      console.error("Resume listing failed", e);
      alert("恢复失败，请重试");
    } finally {
      setPausingId(null);
    }
  };



  // 新增：接受报价
  const handleAcceptOffer = async (listingId: bigint, offerIndex: number) => {
    try {
      setAcceptingKey(`${listingId}-${offerIndex}`);
      await writeMarketplace({ functionName: "acceptOffer", args: [listingId, BigInt(offerIndex)] });
      alert("已接受报价并完成交易");
      await refetchListings();
    } catch (e) {
      console.error("Accept offer failed", e);
      alert("接受报价失败，请重试");
    } finally {
      setAcceptingKey(null);
    }
  };

  // 新增：批量购买
  const handleBulkBuy = async () => {
    if (!connectedAddress || selectedListingIds.length === 0) return;
    try {
      setIsBulkBuying(true);
      setBulkProgress({ done: 0, total: selectedListingIds.length });
      for (let i = 0; i < selectedListingIds.length; i++) {
        const id = selectedListingIds[i];
        const listing = listings.find(l => l.listingId === id);
        if (!listing) continue;
        // 跳过自己的 NFT
        if (listing.seller.toLowerCase() === connectedAddress.toLowerCase()) continue;
        setBulkProgress({ done: i, total: selectedListingIds.length, current: id });
        await buyNFT({ functionName: "buyNFT", args: [id], value: listing.price });
      }
      setBulkProgress({ done: selectedListingIds.length, total: selectedListingIds.length });
      alert("批量购买完成");
      setSelectedListingIds([]);
      setBulkMode(false);
      refetchListings();
    } catch (e) {
      console.error("Bulk buy failed", e);
      alert("批量购买失败，请重试");
    } finally {
      setIsBulkBuying(false);
    }
  };

  // 加载列表和元数据
  useEffect(() => {
    if (!isClient) return;
    
    const loadListings = async () => {
      if (!activeListings || activeListings.length === 0) {
        setLoading(false);
        return;
      }

      const listingsWithMetadata = await Promise.all(
        activeListings.map(async (listing: MarketplaceListing) => {
          const metadata = await fetchNFTMetadata(listing.tokenId);
          return {
            ...listing,
            metadata,
          };
        })
      );

      setListings(listingsWithMetadata);
      setLoading(false);
      setCurrentPage(1); // 数据更新后重置到第一页
      setSelectedListingIds([]); // 重置选择
    };

    loadListings();
  }, [activeListings]);

  // 新增：聚合筛选
  const filteredListings = useMemo(() => {
    let result = listings;
    // 价格过滤（输入为字符串 ETH）
    let min: bigint | null = null;
    let max: bigint | null = null;
    try { min = minPrice ? parseEther(minPrice as any) : null; } catch {}
    try { max = maxPrice ? parseEther(maxPrice as any) : null; } catch {}

    result = result.filter(l => {
      const priceOk = (min === null || l.price >= min) && (max === null || l.price <= max);
      const sellerOk = sellerQuery ? l.seller.toLowerCase().includes(sellerQuery.toLowerCase()) : true;
      const contractOk = contractQuery ? l.nftContract.toLowerCase() === contractQuery.toLowerCase() : true;
      const mineOk = excludeMine && connectedAddress ? l.seller.toLowerCase() !== connectedAddress.toLowerCase() : true;
      return priceOk && sellerOk && contractOk && mineOk;
    });

    return result;
  }, [listings, minPrice, maxPrice, sellerQuery, contractQuery, excludeMine, connectedAddress]);

  // 新增：排序
  const sortedListings = useMemo(() => {
    const arr = [...filteredListings];
    switch (sortBy) {
      case "priceAsc":
        arr.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
        break;
      case "priceDesc":
        arr.sort((a, b) => (a.price > b.price ? -1 : a.price < b.price ? 1 : 0));
        break;
      case "tokenIdAsc":
        arr.sort((a, b) => (a.tokenId < b.tokenId ? -1 : a.tokenId > b.tokenId ? 1 : 0));
        break;
      case "tokenIdDesc":
        arr.sort((a, b) => (a.tokenId > b.tokenId ? -1 : a.tokenId < b.tokenId ? 1 : 0));
        break;
      case "recent":
      default:
        // 以 listingId 倒序近似“最近”
        arr.sort((a, b) => (a.listingId > b.listingId ? -1 : a.listingId < b.listingId ? 1 : 0));
        break;
    }
    return arr;
  }, [filteredListings, sortBy]);

  // 分页派生（基于排序后的结果）
  const pageCount = Math.max(1, Math.ceil(sortedListings.length / pageSize));
  const currentPageSafe = Math.min(currentPage, pageCount);
  const startIndex = (currentPageSafe - 1) * pageSize;
  const pageListings = sortedListings.slice(startIndex, startIndex + pageSize);

  const gotoPage = (p: number) => {
    const next = Math.max(1, Math.min(p, pageCount));
    setCurrentPage(next);
  };

  // 计算选中总价（用于提示）
  const totalSelectedPrice = useMemo(() => {
    return selectedListingIds.reduce((acc, id) => {
      const listing = listings.find(l => l.listingId === id);
      return acc + (listing?.price ?? 0n);
    }, 0n);
  }, [selectedListingIds, listings]);

  if (!isClient || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="mt-4 text-lg">Loading marketplace...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">NFT Marketplace</h1>
        <p className="text-lg opacity-70">Discover and buy unique NFTs</p>
      </div>

      <div className="mb-6 p-4 bg-base-200 rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="form-control">
            <label className="label"><span className="label-text">最低价格 (ETH)</span></label>
            <input className="input input-bordered input-sm" placeholder="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">最高价格 (ETH)</span></label>
            <input className="input input-bordered input-sm" placeholder="" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">卖家地址包含</span></label>
            <input className="input input-bordered input-sm" placeholder="0x..." value={sellerQuery} onChange={e => setSellerQuery(e.target.value)} />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">合约地址</span></label>
            <input className="input input-bordered input-sm" placeholder="0x..." value={contractQuery} onChange={e => setContractQuery(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text mr-2">排除我的上架</span>
              <input type="checkbox" className="checkbox checkbox-sm" checked={excludeMine} onChange={e => setExcludeMine(e.target.checked)} />
            </label>
          </div>
          <select className="select select-bordered select-sm" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
            <option value="recent">最近</option>
            <option value="priceAsc">价格升序</option>
            <option value="priceDesc">价格降序</option>
            <option value="tokenIdAsc">TokenId升序</option>
            <option value="tokenIdDesc">TokenId降序</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => { setMinPrice(""); setMaxPrice(""); setSellerQuery(""); setContractQuery(""); setExcludeMine(false); setSortBy("recent"); setCurrentPage(1); }}>清空筛选</button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 items-center">
        {!bulkMode ? (
          <button className="btn btn-primary btn-sm" onClick={() => setBulkMode(true)}>批量购买</button>
        ) : (
          <div className="flex flex-wrap gap-2 items-center w-full">
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedListingIds(pageListings.map(i => i.listingId))}>
              全选本页
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedListingIds([])}>
              清空选择
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setBulkMode(false); setSelectedListingIds([]); }}>
              退出批量
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={!connectedAddress || isBulkBuying || selectedListingIds.length === 0}
              onClick={handleBulkBuy}
            >
              {isBulkBuying ? (
                <>
                  <span className="loading loading-spinner loading-xs mr-1"></span>
                  购买中...
                </>
              ) : (
                <>购买选中({selectedListingIds.length})</>
              )}
            </button>
            {selectedListingIds.length > 0 && (
              <span className="text-xs opacity-70">预估总价 ~ {formatEther(totalSelectedPrice)} ETH</span>
            )}
            {isBulkBuying && bulkProgress ? (
              <span className="text-xs opacity-70">进度 {bulkProgress.done}/{bulkProgress.total}</span>
            ) : null}
          </div>
        )}
      </div>

      {listings.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏪</div>
          <h2 className="text-2xl font-bold mb-2">No NFTs for sale</h2>
          <p className="text-lg opacity-70">Be the first to list an NFT on the marketplace!</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {pageListings.map((listing) => (
              <div
                key={`${listing.nftContract}-${listing.tokenId}`}
                className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 border border-base-300 overflow-hidden group relative"
              >
                {bulkMode ? (
                  <div className="absolute top-3 left-3 z-10">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary checkbox-sm"
                      checked={selectedListingIds.includes(listing.listingId)}
                      disabled={listing.seller.toLowerCase() === connectedAddress?.toLowerCase()}
                      onChange={e => {
                        const checked = e.target.checked;
                        setSelectedListingIds(prev => {
                          const exists = prev.includes(listing.listingId);
                          if (checked) return exists ? prev : [...prev, listing.listingId];
                          return prev.filter(id => id !== listing.listingId);
                        });
                      }}
                    />
                  </div>
                ) : null}

                <figure className="relative overflow-hidden">
                  {listing.metadata?.image ? (
                    <img
                      src={listing.metadata.image}
                      alt={listing.metadata.name || "NFT"}
                      className="h-64 w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="h-64 w-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                      <span className="text-4xl">🖼️</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <figcaption className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm text-white px-3 py-2 rounded-lg">
                    <span className="font-bold">#{listing.tokenId.toString()}</span>
                  </figcaption>
                </figure>

                <div className="card-body p-6">
                  <h3 className="card-title text-xl font-bold mb-2 line-clamp-1">
                    {listing.metadata?.name || `NFT #${listing.tokenId.toString()}`}
                  </h3>
                  {listing.metadata?.description && (
                    <p className="text-sm opacity-70 line-clamp-2 mb-4">
                      {listing.metadata.description}
                    </p>
                  )}

                  {listing.metadata?.attributes && listing.metadata.attributes.length > 0 && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2">
                        {listing.metadata.attributes.slice(0, 2).map((attr, index) => (
                          <div key={index} className="badge badge-outline badge-sm">
                            <span className="text-xs">{attr.trait_type}: {attr.value}</span>
                          </div>
                        ))}
                        {listing.metadata.attributes.length > 2 && (
                          <div className="badge badge-ghost badge-sm">
                            {"+"}{listing.metadata.attributes.length - 2} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mb-4 p-3 bg-base-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold opacity-70">Seller</span>
                      <Address address={listing.seller} size="sm" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                      <span className="text-sm font-semibold">Price</span>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">
                          {formatEther(listing.price)} ETH
                        </div>
                      </div>
                    </div>

                    {connectedAddress && listing.seller.toLowerCase() === connectedAddress.toLowerCase() ? (
                      <div className="p-3 bg-base-200 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            className="input input-bordered input-sm flex-1"
                            placeholder="新价格 (ETH)"
                            value={editPrices[listing.listingId.toString()] || ""}
                            onChange={e => setEditPrices(prev => ({ ...prev, [listing.listingId.toString()]: e.target.value }))}
                          />
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={updatingId === listing.listingId}
                            onClick={() => handleUpdatePrice(listing)}
                          >
                            {updatingId === listing.listingId ? (
                              <>
                                <span className="loading loading-spinner loading-xs mr-1"></span>
                                改价中...
                              </>
                            ) : (
                              <>改价</>
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className={`btn btn-sm flex-1 ${listing.active ? 'btn-warning' : 'btn-success'}`}
                            disabled={pausingId === listing.listingId}
                            onClick={() => listing.active ? handlePauseListing(listing) : handleResumeListing(listing)}
                          >
                            {pausingId === listing.listingId ? (
                              <>
                                <span className="loading loading-spinner loading-xs mr-1"></span>
                                {listing.active ? '暂停中...' : '激活中...'}
                              </>
                            ) : (
                              <>{listing.active ? '暂停' : '激活'}</>
                            )}
                          </button>
                        </div>
                        {/* 卖家查看报价并接受 */}
                        <SellerOffersPanel listingId={listing.listingId} onAccept={handleAcceptOffer} acceptingKey={acceptingKey} />
                      </div>
                    ) : (
                      <div className="p-3 bg-base-200 rounded-lg space-y-3">
                        {/* 购买区域 - 强调 */}
                        <div className="flex flex-col gap-2">
                           <button
                            className="btn btn-primary btn-sm w-full font-bold"
                            disabled={buyingTokenId === listing.tokenId.toString()}
                            onClick={() => handleBuyNFT(listing)}
                          >
                            {buyingTokenId === listing.tokenId.toString() ? (
                              <>
                                <span className="loading loading-spinner loading-xs mr-1"></span>
                                购买中...
                              </>
                            ) : (
                              <>立即购买 ({formatEther(listing.price)} ETH)</>
                            )}
                          </button>
                          <div className="text-xs text-center opacity-60">
                            直接支付全款购买，立即成交
                          </div>
                        </div>
                        
                        <div className="divider my-0">OR</div>

                        {/* 报价区域 - 折叠或弱化 */}
                        <div className="collapse collapse-arrow bg-base-100 border border-base-300">
                          <input type="checkbox" /> 
                          <div className="collapse-title text-sm font-medium p-2 min-h-0">
                            我想出价 (Make Offer)
                          </div>
                          <div className="collapse-content p-2">
                            <div className="flex flex-col gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <input
                                  className="input input-bordered input-sm flex-1"
                                  placeholder="输入价格 (ETH)"
                                  value={offerPrices[listing.listingId.toString()] || ""}
                                  onChange={e => setOfferPrices(prev => ({ ...prev, [listing.listingId.toString()]: e.target.value }))}
                                />
                                <div className="join">
                                   <input
                                    className="input input-bordered input-sm w-20 join-item"
                                    placeholder="天数"
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    value={offerDurations[listing.listingId.toString()] || ""}
                                    onChange={e => setOfferDurations(prev => ({ ...prev, [listing.listingId.toString()]: e.target.value }))}
                                  />
                                  <span className="btn btn-sm btn-disabled join-item bg-base-200">天有效期</span>
                                </div>
                              </div>
                              <button
                                className="btn btn-sm btn-secondary w-full"
                                disabled={offeringId === listing.listingId}
                                onClick={() => handleMakeOffer(listing)}
                              >
                                {offeringId === listing.listingId ? (
                                  <>
                                    <span className="loading loading-spinner"></span>
                                  </>
                                ) : (
                                  <>提交</>
                                )}
                              </button>
                            </div>
                            <div className="text-xs opacity-60">
                              注意：您的资金将暂时锁定在合约中，需卖家接受报价后方可成交。
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="join flex justify-center my-6">
            <button className="join-item btn" onClick={() => gotoPage(currentPageSafe - 1)} disabled={currentPageSafe <= 1}>
              «
            </button>
            <button className="join-item btn">第 {currentPageSafe} / {pageCount} 页</button>
            <button className="join-item btn" onClick={() => gotoPage(currentPageSafe + 1)} disabled={currentPageSafe >= pageCount}>
              »
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// 卖家报价面板组件
function SellerOffersPanel({
  listingId,
  onAccept,
  acceptingKey,
}: {
  listingId: bigint;
  onAccept: (listingId: bigint, offerIndex: number) => void;
  acceptingKey: string | null;
}) {
  const { data: offers, isLoading } = useScaffoldReadContract({
    contractName: "NFTMarketplace",
    functionName: "getOffers",
    args: [listingId],
  });

  if (isLoading) return <div className="text-sm">加载报价...</div>;
  if (!offers || (offers as any[]).length === 0) return <div className="text-sm opacity-60">暂无报价</div>;

  return (
    <div className="space-y-2">
      <div className="font-semibold text-sm">收到的报价</div>
      {(offers as any[]).map((offer, idx) => {
        const amount = (offer.amount ?? offer[1]) as bigint;
        const offerer = (offer.offerer ?? offer[0]) as string;
        const expiration = (offer.expiration ?? offer[2]) as bigint;
        const active = (offer.active ?? offer[3]) as boolean;
        const expired = Number(expiration) * 1000 < Date.now();
        const key = `${listingId}-${idx}`;
        return (
          <div key={key} className="flex items-center justify-between text-sm bg-base-300 rounded px-2 py-1">
            <div className="flex items-center gap-2">
              <Address address={offerer} format="short" />
              <span className="opacity-70">{formatEther(amount)} ETH</span>
              <span className={`opacity-70 ${expired ? "text-error" : ""}`}>{expired ? "已过期" : "未过期"}</span>
              {!active && <span className="badge badge-outline">已取消</span>}
            </div>
            <button
              className="btn btn-xs btn-success"
              disabled={!active || expired || acceptingKey === key}
              onClick={() => onAccept(listingId, idx)}
            >
              {acceptingKey === key ? (
                <>
                  <span className="loading loading-spinner loading-xs mr-1"></span>
                  处理中...
                </>
              ) : (
                <>接受报价</>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}