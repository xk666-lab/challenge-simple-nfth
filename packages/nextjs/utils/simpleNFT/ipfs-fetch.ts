import nftsMetadata from "./nftsMetadata";

const fetchFromApi = async ({ path, method, body }: { path: string; method: string; body?: object }, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting API call to ${path}, attempt ${i + 1}/${retries}`);
      
      const response = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`API call to ${path} successful:`, data);
      return data;
    } catch (error) {
      console.error(`Error on attempt ${i + 1}/${retries} for ${path}:`, error);
      
      if (i === retries - 1) {
        // Last attempt failed
        console.error(`All ${retries} attempts failed for ${path}`);
        return { error: `Failed after ${retries} attempts: ${error}` };
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
};

export const addToIPFS = (yourJSON: object) => fetchFromApi({ path: "/api/ipfs/add", method: "Post", body: yourJSON });

export const getMetadataFromIPFS = async (ipfsHash: string) => {
  console.log(`Getting metadata for IPFS hash: ${ipfsHash}`);
  
  // 验证 IPFS hash 格式 - 不应该包含 http
  if (!ipfsHash || ipfsHash.includes('http')) {
    console.error('Invalid IPFS hash (contains http or is empty):', ipfsHash);
    // 如果传入的是完整 URL，尝试提取 hash
    if (ipfsHash.includes('http')) {
      const patterns = [
        /\/ipfs\/([^\/\?]+)/,  // 匹配 /ipfs/hash 格式
      ];
      
      for (const pattern of patterns) {
        const match = ipfsHash.match(pattern);
        if (match && match[1]) {
          ipfsHash = match[1];
          console.log('Extracted hash from URL:', ipfsHash);
          break;
        }
      }
    }
  }
  
  // 多个 gateway 备份
  const gateways = [
    process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
  ];
  
  // 尝试每个 gateway
  for (const gateway of gateways) {
    try {
      console.log(`Trying gateway: ${gateway}${ipfsHash}`);
      
      const response = await fetch(`${gateway}${ipfsHash}`, {
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (response.ok) {
        const metadata = await response.json();
        console.log(`Successfully fetched metadata from ${gateway}:`, metadata);
        return metadata;
      }
      
      console.warn(`Gateway ${gateway} returned status ${response.status}`);
    } catch (error) {
      console.error(`Error fetching from gateway ${gateway}:`, error);
      // 继续尝试下一个 gateway
    }
  }
  
  // 所有 gateway 都失败，使用本地备份
  console.warn(`All gateways failed for hash ${ipfsHash}, falling back to local metadata`);
  
  // 使用哈希值来确定使用哪个本地元数据
  const hashCode = ipfsHash.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const index = Math.abs(hashCode) % nftsMetadata.length;
  
  console.log(`Using local metadata for index ${index}:`, nftsMetadata[index]);
  
  return nftsMetadata[index];
};
