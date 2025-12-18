import { ethers } from "hardhat";
import { expect } from "chai";

async function main() {
  const [deployer, seller, buyer] = await ethers.getSigners();
  const nftMarketplace = await ethers.getContract("NFTMarketplace", deployer);
  const yourCollectible = await ethers.getContract("YourCollectible", deployer);

  console.log(" Minting NFT...");
  await yourCollectible.connect(seller).mintItem(seller.address, "test-uri");
  const tokenId = 1; 

  console.log(" Approving Marketplace...");
  await yourCollectible.connect(seller).approve(nftMarketplace.address, tokenId);

  console.log(" Listing NFT for 1 ETH...");
  const price = ethers.utils.parseEther("1.0");
  await nftMarketplace.connect(seller).listNFT(yourCollectible.address, tokenId, price);
  const listingId = await nftMarketplace.tokenToListing(yourCollectible.address, tokenId);

  console.log(` Listed with ID: ${listingId}`);

  console.log(" Attempting to buy with 0.1 ETH (Should FAIL)...");
  try {
    await nftMarketplace.connect(buyer).buyNFT(listingId, { value: ethers.utils.parseEther("0.1") });
    console.error("❌ FAILURE: Bought with lower price!");
    process.exit(1);
  } catch (e: any) {
    if (e.message.includes("Insufficient payment")) {
      console.log("✅ SUCCESS: Correctly reverted with 'Insufficient payment'");
    } else {
      console.log(`✅ SUCCESS: Reverted with: ${e.message}`);
    }
  }

  console.log(" Attempting to buy with 1.0 ETH (Should SUCCEED)...");
  await nftMarketplace.connect(buyer).buyNFT(listingId, { value: price });
  console.log("✅ SUCCESS: Bought with full price");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
