"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { addToIPFS } from "~~/utils/simpleNFT/ipfs-fetch";
import nftsMetadata from "~~/utils/simpleNFT/nftsMetadata";

type Phase = 'idle' | 'uploading' | 'uploaded' | 'minting' | 'completed';

export const BatchNFTMinter = () => {
  const { address: connectedAddress } = useAccount();
  const [batchSize, setBatchSize] = useState<number>(5);
  const [phase, setPhase] = useState<Phase>('idle');
  
  // 上传阶段状态
  const [uploadedHashes, setUploadedHashes] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  
  // 铸造阶段状态
  const [mintingProgress, setMintingProgress] = useState<number>(0);
  const [isMinting, setIsMinting] = useState(false);

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "YourCollectible" });

  // 阶段 1: 批量上传元数据到 IPFS
  const handleBatchUpload = async () => {
    if (batchSize < 1 || batchSize > 20) {
      notification.error("批量数量必须在1-20之间");
      return;
    }

    setIsUploading(true);
    setPhase('uploading');
    setUploadProgress(0);
    setUploadedHashes([]);
    
    let currentNotificationId = notification.loading(`开始上传 ${batchSize} 个NFT元数据到IPFS...`);
    const hashes: string[] = [];

    try {
      const CONCURRENT_LIMIT = 3; // 每次并发 3 个
      
      // 分批并发上传
      for (let i = 0; i < batchSize; i += CONCURRENT_LIMIT) {
        const batch = [];
        const batchEnd = Math.min(i + CONCURRENT_LIMIT, batchSize);
        
        // 创建当前批次的上传任务
        for (let j = i; j < batchEnd; j++) {
          const metadata = nftsMetadata[j % nftsMetadata.length];
          batch.push(
            addToIPFS(metadata).catch(error => {
              console.error(`Upload failed for NFT ${j + 1}:`, error);
              throw new Error(`NFT ${j + 1} 上传失败: ${error.message}`);
            })
          );
        }
        
        // 并发执行当前批次
        console.log(`[Batch Upload] Uploading batch ${i / CONCURRENT_LIMIT + 1}, items ${i + 1}-${batchEnd}`);
        const results = await Promise.all(batch);
        
        // 收集结果
        hashes.push(...results.map(r => r.path));
        setUploadProgress(hashes.length);
        
        // 更新通知
        notification.remove(currentNotificationId);
        currentNotificationId = notification.loading(`已上传 ${hashes.length}/${batchSize} 个元数据...`);
      }

      setUploadedHashes(hashes);
      setPhase('uploaded');
      notification.remove(currentNotificationId);
      
      // 成功通知，3秒后自动消失
      const successId = notification.success(`成功上传 ${hashes.length} 个NFT元数据到IPFS！`);
      setTimeout(() => notification.remove(successId), 3000);
      
      console.log(`[Batch Upload] All metadata uploaded:`, hashes);
      
    } catch (error: any) {
      notification.remove(currentNotificationId);
      notification.error(error.message || "批量上传失败");
      console.error("批量上传错误:", error);
      setPhase('idle');
    } finally {
      setIsUploading(false);
    }
  };

  // 阶段 2: 批量铸造 NFT
  const handleBatchMint = async () => {
    if (uploadedHashes.length === 0) {
      notification.error("请先上传元数据");
      return;
    }

    setIsMinting(true);
    setPhase('minting');
    setMintingProgress(0);
    
    const notificationId = notification.loading(`开始铸造 ${uploadedHashes.length} 个NFT...`);

    try {
      for (let i = 0; i < uploadedHashes.length; i++) {
        console.log(`[Batch Mint] Minting NFT ${i + 1}/${uploadedHashes.length} with hash: ${uploadedHashes[i]}`);
        
        // 铸造 NFT
        await writeContractAsync({
          functionName: "mintItem",
          args: [connectedAddress, uploadedHashes[i]],
        });

        // 更新进度
        setMintingProgress(i + 1);
        
        // 更新通知
        notification.remove(notificationId);
        notification.loading(`已铸造 ${i + 1}/${uploadedHashes.length} 个NFT...`);
        
        // 短暂延迟避免网络拥堵
        if (i < uploadedHashes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      notification.remove(notificationId);
      notification.success(`成功铸造了 ${uploadedHashes.length} 个NFT！`);
      
      // 重置状态
      setPhase('completed');
      setTimeout(() => {
        setPhase('idle');
        setUploadedHashes([]);
        setUploadProgress(0);
        setMintingProgress(0);
        setBatchSize(5);
      }, 2000);
      
    } catch (error: any) {
      notification.remove(notificationId);
      notification.error(`铸造失败，已成功铸造 ${mintingProgress} 个NFT`);
      console.error("批量铸造错误:", error);
      setPhase('uploaded'); // 回到已上传状态，允许重试
    } finally {
      setIsMinting(false);
    }
  };

  // 重置状态
  const handleReset = () => {
    setPhase('idle');
    setUploadedHashes([]);
    setUploadProgress(0);
    setMintingProgress(0);
    setBatchSize(5);
  };

  return (
    <div className="card bg-base-100 shadow-xl w-full max-w-md mx-auto">
      <div className="card-body">
        <h2 className="card-title text-center">批量铸造 NFT</h2>
        <p className="text-center text-sm opacity-70 mb-4">
          两阶段铸造：先上传元数据，再批量铸造
        </p>
        
        {/* 批量数量选择 */}
        <div className="form-control w-full">
          <label className="label">
            <span className="label-text">铸造数量</span>
            <span className="label-text-alt">1-20个</span>
          </label>
          <input
            type="number"
            min="1"
            max="20"
            value={batchSize}
            onChange={(e) => setBatchSize(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            className="input input-bordered w-full"
            disabled={phase !== 'idle'}
          />
        </div>

        {/* 阶段 1: 上传进度 */}
        {(phase === 'uploading' || phase === 'uploaded') && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span>📤 上传进度</span>
              <span>{uploadProgress}/{batchSize}</span>
            </div>
            <progress 
              className="progress progress-primary w-full" 
              value={uploadProgress} 
              max={batchSize}
            ></progress>
          </div>
        )}

        {/* 阶段 2: 铸造进度 */}
        {(phase === 'minting' || phase === 'completed') && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span>⛏️ 铸造进度</span>
              <span>{mintingProgress}/{uploadedHashes.length}</span>
            </div>
            <progress 
              className="progress progress-success w-full" 
              value={mintingProgress} 
              max={uploadedHashes.length}
            ></progress>
          </div>
        )}

        {/* 状态提示 */}
        {phase === 'uploaded' && (
          <div className="alert alert-success mt-4">
            <span>✓ 元数据已上传完成，可以开始铸造！</span>
          </div>
        )}

        {phase === 'completed' && (
          <div className="alert alert-success mt-4">
            <span>🎉 批量铸造完成！</span>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2 mt-4">
          {phase === 'idle' && (
            <button
              className="btn btn-primary flex-1"
              onClick={handleBatchUpload}
              disabled={isUploading || batchSize < 1 || batchSize > 20}
            >
              {isUploading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  上传中... ({uploadProgress}/{batchSize})
                </>
              ) : (
                `1️⃣ 上传 ${batchSize} 个元数据`
              )}
            </button>
          )}

          {phase === 'uploaded' && (
            <>
              <button
                className="btn btn-success flex-1"
                onClick={handleBatchMint}
                disabled={isMinting}
              >
                {isMinting ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    铸造中... ({mintingProgress}/{uploadedHashes.length})
                  </>
                ) : (
                  `2️⃣ 铸造 ${uploadedHashes.length} 个NFT`
                )}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleReset}
                disabled={isMinting}
              >
                重置
              </button>
            </>
          )}

          {(phase === 'uploading' || phase === 'minting') && (
            <button className="btn btn-disabled flex-1" disabled>
              处理中...
            </button>
          )}

          {phase === 'completed' && (
            <button
              className="btn btn-primary flex-1"
              onClick={handleReset}
            >
              开始新的批量铸造
            </button>
          )}
        </div>

        {/* 说明文字 */}
        <div className="text-xs opacity-60 mt-2 text-center">
          <div className="font-semibold mb-1">两阶段流程：</div>
          <div>1️⃣ 上传：并发上传元数据到IPFS（快速）</div>
          <div>2️⃣ 铸造：逐个铸造NFT（需要钱包确认）</div>
          <div className="mt-1 text-warning">* 上传失败可重试，铸造失败可从断点继续</div>
        </div>
      </div>
    </div>
  );
};