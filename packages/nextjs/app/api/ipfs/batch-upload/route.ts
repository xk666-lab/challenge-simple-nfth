import { NextRequest, NextResponse } from "next/server";

const PINATA_API_KEY = process.env.PINATA_API_KEY || "";
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY || "";

// 带重试的上传函数
async function uploadWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  timeout = 60000
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Upload] Attempt ${attempt}/${retries} to ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      return response;
      
    } catch (error: any) {
      console.error(`[Upload] Attempt ${attempt} failed:`, error.message);
      
      if (attempt === retries) {
        throw error;
      }
      
      // 指数退避
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`[Upload] Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw new Error("Upload failed after all retries");
}

// 并发上传（限制并发数）
async function uploadInBatches<T>(
  items: T[],
  uploadFn: (item: T) => Promise<any>,
  batchSize = 3
): Promise<any[]> {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`[Batch] Processing batch ${Math.floor(i / batchSize) + 1}, items ${i + 1}-${Math.min(i + batchSize, items.length)}`);
    
    const batchResults = await Promise.all(
      batch.map(item => uploadFn(item))
    );
    
    results.push(...batchResults);
  }
  
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const csvFile = formData.get("csvFile") as File;
    const imageFiles = formData.getAll("imageFiles") as File[];

    if (!csvFile) {
      return NextResponse.json({ success: false, error: "CSV文件是必需的" });
    }

    if (imageFiles.length === 0) {
      return NextResponse.json({ success: false, error: "至少需要上传一张图片" });
    }

    console.log(`[Batch Upload] Starting upload of ${imageFiles.length} images`);

    // 解析CSV文件
    const csvText = await csvFile.text();
    console.log(`[CSV Parse] File size: ${csvText.length} bytes`);
    console.log(`[CSV Parse] First 200 characters:`, csvText.substring(0, 200));
    
    const lines = csvText.split('\n').filter(line => line.trim()); // 过滤空行
    
    if (lines.length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: "CSV文件格式错误：至少需要包含标题行和一行数据" 
      });
    }
    
    // 检测分隔符（逗号或分号）
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';
    console.log(`[CSV Parse] Detected delimiter: "${delimiter}"`);
    
    // 解析标题行
    const headers = firstLine
      .split(delimiter)
      .map(h => h.replace(/\r/g, '').replace(/"/g, '').trim())
      .filter(h => h); // 移除空标题
    
    console.log(`[CSV Parse] Headers:`, headers);
    
    // 验证必需的列
    if (!headers.includes('name') || !headers.includes('image_file')) {
      return NextResponse.json({ 
        success: false, 
        error: `CSV文件缺少必需的列。找到的列: ${headers.join(', ')}。必需的列: name, image_file` 
      });
    }
    
    const nftData = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line
        .split(delimiter)
        .map(v => v.replace(/\r/g, '').replace(/"/g, '').trim());
      
      const nft: any = {};
      headers.forEach((header, index) => {
        nft[header] = values[index] || '';
      });
      
      // 验证必需字段
      if (nft.name && nft.image_file) {
        nftData.push(nft);
      } else {
        console.warn(`[CSV Parse] Skipping row ${i + 1}: missing name or image_file`);
      }
    }

    console.log(`[CSV Parse] Parsed ${nftData.length} valid NFT records`);
    console.log(`[CSV Parse] Sample data:`, nftData.slice(0, 2));

    if (nftData.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "CSV文件中没有有效数据。请确保每行都包含 name 和 image_file 列的值。" 
      });
    }

    // 批量并发上传图片到Pinata
    const uploadedImages: { [key: string]: string } = {};
    
    const uploadImage = async (imageFile: File) => {
      const imageFormData = new FormData();
      imageFormData.append("file", imageFile);
      
      const pinataMetadata = JSON.stringify({
        name: `NFT_Image_${imageFile.name}_${Date.now()}`,
      });
      imageFormData.append("pinataMetadata", pinataMetadata);

      const pinataOptions = JSON.stringify({
        cidVersion: 0,
      });
      imageFormData.append("pinataOptions", pinataOptions);

      const pinataResponse = await uploadWithRetry(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
          method: "POST",
          headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_API_KEY,
          },
          body: imageFormData,
        }
      );

      const pinataResult = await pinataResponse.json();
      const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
      const imageUrl = `${PINATA_GATEWAY}${pinataResult.IpfsHash}`;
      
      console.log(`[Image Upload] Success: ${imageFile.name} -> ${imageUrl}`);
      return { name: imageFile.name, url: imageUrl };
    };

    // 并发上传图片（每次3个）
    const imageResults = await uploadInBatches(imageFiles, uploadImage, 3);
    imageResults.forEach(result => {
      uploadedImages[result.name] = result.url;
    });

    console.log(`[Batch Upload] All images uploaded, starting metadata upload`);
    console.log(`[Batch Upload] Uploaded image files:`, Object.keys(uploadedImages));
    console.log(`[Batch Upload] NFT data from CSV:`, nftData.map(n => ({ name: n.name, image_file: n.image_file })));

    // 为每个NFT创建元数据并上传到IPFS
    const metadataResults = [];
    
    const uploadMetadata = async (nft: any) => {
      // 验证必需字段
      if (!nft.image_file) {
        throw new Error(`NFT "${nft.name || 'Unknown'}" 缺少 image_file 字段`);
      }
      
      // 清理文件名（去除空格、特殊字符）
      const cleanFileName = nft.image_file.trim();
      
      // 首先尝试精确匹配
      let imageUrl = uploadedImages[cleanFileName];
      
      // 如果精确匹配失败，尝试不区分大小写匹配
      if (!imageUrl) {
        const lowerFileName = cleanFileName.toLowerCase();
        const matchedKey = Object.keys(uploadedImages).find(
          key => key.toLowerCase() === lowerFileName
        );
        if (matchedKey) {
          imageUrl = uploadedImages[matchedKey];
          console.log(`[Metadata] Case-insensitive match: "${cleanFileName}" -> "${matchedKey}"`);
        }
      }
      
      if (!imageUrl) {
        const availableFiles = Object.keys(uploadedImages).join(', ');
        console.error(`[Metadata] Image file not found for NFT "${nft.name}"`);
        console.error(`[Metadata] Looking for: "${cleanFileName}"`);
        console.error(`[Metadata] Available files: ${availableFiles}`);
        throw new Error(
          `图片文件 "${cleanFileName}" 未找到。` +
          `请确保图片文件名与CSV中的image_file列完全匹配。` +
          `可用的图片文件: ${availableFiles}`
        );
      }

      // 构建属性数组
      const attributes = [];
      for (let i = 1; i <= 3; i++) {
        const traitType = nft[`trait_type_${i}`];
        const traitValue = nft[`trait_value_${i}`];
        if (traitType && traitValue) {
          attributes.push({
            trait_type: traitType,
            value: traitValue
          });
        }
      }

      // 添加默认属性
      attributes.push({
        trait_type: "Batch Upload",
        value: "Excel Import"
      });
      attributes.push({
        trait_type: "Created",
        value: new Date().toISOString().split('T')[0]
      });

      const metadata = {
        name: nft.name,
        description: nft.description || `Custom NFT: ${nft.name}`,
        image: imageUrl,
        attributes: attributes
      };

      // 上传元数据到Pinata
      const metadataResponse = await uploadWithRetry(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_API_KEY,
          },
          body: JSON.stringify({
            pinataContent: metadata,
            pinataMetadata: {
              name: `${nft.name}-metadata.json`,
            },
          }),
        }
      );

      const metadataResult = await metadataResponse.json();
      console.log(`[Metadata Upload] Success: ${nft.name} -> ${metadataResult.IpfsHash}`);
      
      return {
        name: nft.name,
        metadataHash: metadataResult.IpfsHash,
        imageUrl: imageUrl
      };
    };

    // 并发上传元数据（每次3个）
    const results = await uploadInBatches(nftData, uploadMetadata, 3);
    metadataResults.push(...results);

    console.log(`[Batch Upload] Complete! Processed ${metadataResults.length} NFTs`);

    return NextResponse.json({
      success: true,
      message: `成功处理 ${metadataResults.length} 个NFT`,
      results: metadataResults
    });

  } catch (error) {
    console.error("Batch upload error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "批量上传失败"
    });
  }
}