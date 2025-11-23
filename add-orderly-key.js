require("dotenv").config();
const { ethers } = require("ethers");
const { getPublicKey, utils } = require("@noble/ed25519");
const bs58 = require("bs58");
const fs = require("fs");
const path = require("path");

// Use webcrypto if available for @noble/ed25519
if (typeof globalThis !== "undefined" && !globalThis.crypto) {
  const { webcrypto } = require("node:crypto");
  globalThis.crypto = webcrypto;
}

// Use native fetch in Node.js 18+ or fallback to node-fetch
let fetch;
if (typeof globalThis !== "undefined" && globalThis.fetch) {
  fetch = globalThis.fetch;
} else {
  try {
    fetch = require("node-fetch");
  } catch (e) {
    throw new Error(
      "fetch is not available. Please install node-fetch: npm install node-fetch"
    );
  }
}

// Configuration
const ORDERLY_API_URL =
  process.env.ORDERLY_API_URL || "https://api.orderly.org"; // or https://testnet-api.orderly.org for testnet
const CHAIN_ID = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 80001; // Example: Polygon Mumbai testnet
const BROKER_ID = process.env.BROKER_ID || "woofi_pro"; // Your broker ID
const VERIFYING_CONTRACT = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";

/**
 * Generate an ed25519 key pair and encode the public key
 * Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/user-flows/wallet-authentication
 *
 * @returns {Promise<Object>} - Object with orderlyKey (public key) and privateKeyHex (private key in hex format)
 */
async function generateOrderlyKey() {
  const privateKey = utils.randomPrivateKey();
  const publicKey = await getPublicKey(privateKey);
  // Encode public key using base58 (as shown in Orderly documentation examples)
  // getPublicKey returns Uint8Array, bs58.encode accepts Uint8Array
  const encodedKey = bs58.encode(publicKey);
  const orderlyKey = `ed25519:${encodedKey}`;

  // Convert private key to hex format for storage
  const privateKeyHex = ethers.hexlify(privateKey);

  return {
    orderlyKey: orderlyKey,
    privateKeyHex: privateKeyHex,
  };
}

/**
 * Add Orderly Key for the given wallet
 * Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/user-flows/wallet-authentication
 *
 * @param {ethers.Wallet} wallet - The wallet instance
 * @param {string} brokerId - The broker ID (defaults to BROKER_ID from env)
 * @param {number} chainId - The chain ID (defaults to CHAIN_ID from env)
 * @returns {Promise<Object>} - Result with generated orderlyKey
 */
async function addOrderlyKey(wallet, brokerId = BROKER_ID, chainId = CHAIN_ID) {
  try {
    const userAddress = wallet.address;
    console.log(
      `Adding Orderly Key for address: ${userAddress} with brokerId: ${brokerId}`
    );

    // Generate ed25519 key pair
    console.log("Generating ed25519 key pair...");
    const keyPair = await generateOrderlyKey();
    const orderlyKey = keyPair.orderlyKey;
    const orderlyPrivateKeyHex = keyPair.privateKeyHex;
    console.log(`Generated Orderly Key: ${orderlyKey}`);
    console.log(`Generated Orderly Private Key: ${orderlyPrivateKeyHex}`);

    // Set defaults for scope and expiration
    const scope = "read,trading";
    const expirationDays = 365;

    // Create EIP-712 message for adding Orderly Key
    // Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/user-flows/wallet-authentication
    const timestamp = Date.now();
    const expiration = timestamp + expirationDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    const message = {
      brokerId: brokerId,
      chainId: chainId,
      orderlyKey: orderlyKey,
      scope: scope,
      timestamp: timestamp,
      expiration: expiration,
    };

    // Create EIP-712 domain
    const domain = {
      name: "Orderly",
      version: "1",
      chainId: chainId,
      verifyingContract: VERIFYING_CONTRACT,
    };

    // Create EIP-712 types
    // Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/user-flows/wallet-authentication
    const types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      AddOrderlyKey: [
        { name: "brokerId", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "orderlyKey", type: "string" },
        { name: "scope", type: "string" },
        { name: "timestamp", type: "uint64" },
        { name: "expiration", type: "uint64" },
      ],
    };

    // Sign the EIP-712 message
    console.log("Signing EIP-712 message...");
    const signature = await wallet.signTypedData(
      domain,
      { AddOrderlyKey: types.AddOrderlyKey },
      message
    );
    console.log(`Signature: ${signature}`);

    // Add Orderly Key
    // Endpoint: /v1/orderly_key (based on Orderly documentation)
    console.log("Adding Orderly Key...");
    const response = await fetch(`${ORDERLY_API_URL}/v1/orderly_key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message,
        signature: signature,
        userAddress: userAddress,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Failed to add Orderly Key: ${JSON.stringify(data)}`);
    }

    console.log("Orderly Key added successfully!");
    console.log("Response:", JSON.stringify(data, null, 2));

    // Save Orderly Key and Private Key to .env file
    const envPath = path.join(process.cwd(), ".env");
    let envContent = "";

    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    // Check if ORDERLY_KEY already exists in .env
    const hasOrderlyKey = /^ORDERLY_KEY=/.test(envContent);
    const hasOrderlyPrivateKey = /^ORDERLY_PRIVATE_KEY=/.test(envContent);

    // Update or append ORDERLY_KEY
    if (hasOrderlyKey) {
      envContent = envContent.replace(
        /^ORDERLY_KEY=.*$/m,
        `ORDERLY_KEY=${orderlyKey}`
      );
    } else {
      envContent +=
        (envContent && !envContent.endsWith("\n") ? "\n" : "") +
        `ORDERLY_KEY=${orderlyKey}\n`;
    }

    // Update or append ORDERLY_PRIVATE_KEY
    if (hasOrderlyPrivateKey) {
      envContent = envContent.replace(
        /^ORDERLY_PRIVATE_KEY=.*$/m,
        `ORDERLY_PRIVATE_KEY=${orderlyPrivateKeyHex}`
      );
    } else {
      envContent += `ORDERLY_PRIVATE_KEY=${orderlyPrivateKeyHex}\n`;
    }

    // Write back to .env file
    fs.writeFileSync(envPath, envContent, "utf8");
    console.log("\n✅ Saved to .env file:");
    console.log(`   ORDERLY_KEY=${orderlyKey}`);
    console.log(`   ORDERLY_PRIVATE_KEY=${orderlyPrivateKeyHex}`);

    return {
      success: true,
      data: data,
      userAddress: userAddress,
      orderlyKey: orderlyKey,
      orderlyPrivateKeyHex: orderlyPrivateKeyHex,
    };
  } catch (error) {
    console.error("Error adding Orderly Key:", error);
    throw error;
  }
}

/**
 * Main function - Usage example
 */
async function main() {
  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    console.error("Error: PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  const brokerId = process.argv[2] || process.env.BROKER_ID || BROKER_ID;
  const chainId = process.argv[3] ? parseInt(process.argv[3]) : CHAIN_ID;

  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);

  try {
    // Orderly key will be generated automatically inside addOrderlyKey function
    const result = await addOrderlyKey(wallet, brokerId, chainId);
    console.log("\nOrderly Key added successfully!");
    console.log(`Generated Orderly Key: ${result.orderlyKey}`);
    console.log(`Account Address: ${result.userAddress}`);
  } catch (error) {
    console.error("\nFailed to add Orderly Key:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  addOrderlyKey,
  generateOrderlyKey,
};
