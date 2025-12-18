// Pinata API configuration
const PINATA_API_KEY = process.env.PINATA_API_KEY || "";
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY || "";

// 验证 API 密钥是否配置
const isPinataConfigured = () => {
  if (!PINATA_API_KEY || !PINATA_SECRET_API_KEY) {
    throw new Error("Pinata API keys are not configured. Please set PINATA_API_KEY and PINATA_SECRET_API_KEY in .env.local");
  }
  if (PINATA_API_KEY === "your_pinata_api_key_here" || PINATA_SECRET_API_KEY === "your_pinata_secret_key_here") {
    throw new Error("Please replace placeholder Pinata API keys with actual values in .env.local");
  }
};

// Pinata API client for uploading to IPFS
export const ipfsClient = {
  async add(content: string, retries = 3) {
    // 验证 API 密钥
    isPinataConfigured();

    let lastError: Error | null = null;

    // 重试逻辑
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[Pinata Upload] Attempt ${attempt}/${retries}...`);
        
        // 创建 AbortController 用于超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          console.error(`[Pinata Upload] Request timeout after 30 seconds`);
        }, 30000); // 30秒超时

        const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_API_KEY,
          },
          body: JSON.stringify({
            pinataContent: JSON.parse(content),
            pinataMetadata: {
              name: `NFT Metadata ${Date.now()}`,
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Pinata API error! Status: ${response.status}, Message: ${errorText}`);
        }

        const result = await response.json();
        console.log(`[Pinata Upload] ✅ Success! IPFS Hash: ${result.IpfsHash}`);
        
        return { path: result.IpfsHash };

      } catch (error: any) {
        lastError = error;
        
        // 记录详细错误信息
        if (error.name === 'AbortError') {
          console.error(`[Pinata Upload] ❌ Attempt ${attempt} failed: Request timeout (30s)`);
        } else {
          console.error(`[Pinata Upload] ❌ Attempt ${attempt} failed:`, error.message);
        }

        // 如果不是最后一次尝试，等待后重试（指数退避）
        if (attempt < retries) {
          const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`[Pinata Upload] ⏳ Waiting ${waitTime / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // 所有重试都失败
    console.error(`[Pinata Upload] ❌ All ${retries} attempts failed`);
    throw new Error(
      `Failed to upload to Pinata after ${retries} attempts. Last error: ${lastError?.message || 'Unknown error'}. ` +
      `Please check your internet connection and Pinata API credentials.`
    );
  },
};

export async function getNFTMetadataFromIPFS(ipfsHash: string) {
  try {
    // Use Pinata gateway to fetch metadata
    const response = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const jsonObject = await response.json();
    return jsonObject;
  } catch (error) {
    console.log("Error fetching from IPFS:", error);
    return undefined;
  }
}
