require("dotenv").config();
const { ethers } = require("ethers");
const { checkAccountExists } = require("./check-account");

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
 * Get registration nonce from Orderly API
 */
async function getRegistrationNonce() {
  try {
    const response = await fetch(`${ORDERLY_API_URL}/v1/registration_nonce`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        `Failed to get registration nonce: ${JSON.stringify(data)}`
      );
    }

    console.log(JSON.stringify(data, null, 2));

    return data.data.registration_nonce;
  } catch (error) {
    console.error("Error getting registration nonce:", error);
    throw error;
  }
}

/**
 * Register account on Orderly
 */
async function registerAccount(
  wallet,
  brokerId = BROKER_ID,
  chainId = CHAIN_ID
) {
  try {
    const userAddress = wallet.address;
    console.log(
      `Registering account for address: ${userAddress} with brokerId: ${brokerId}`
    );

    // Step 1: Check if account already exists for this address and brokerId combination
    const accountExists = await checkAccountExists(userAddress, brokerId);
    if (accountExists) {
      console.log(
        `Account already exists for address ${userAddress} and brokerId ${brokerId}`
      );
      return { success: true, message: "Account already exists" };
    }

    // Step 2: Get registration nonce
    console.log("Fetching registration nonce...");
    const registrationNonce = await getRegistrationNonce();
    console.log(`Registration nonce: ${registrationNonce}`);

    // Step 3: Create EIP-712 message
    const timestamp = Date.now();
    const message = {
      brokerId: brokerId,
      chainId: chainId,
      timestamp: timestamp,
      registrationNonce: registrationNonce,
    };

    // Step 4: Create EIP-712 domain
    const domain = {
      name: "Orderly",
      version: "1",
      chainId: chainId,
      verifyingContract: VERIFYING_CONTRACT,
    };

    // Step 5: Create EIP-712 types
    const types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Registration: [
        { name: "brokerId", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "timestamp", type: "uint64" },
        { name: "registrationNonce", type: "uint256" },
      ],
    };

    // Step 6: Sign the EIP-712 message
    console.log("Signing EIP-712 message...");
    // For ethers.js signTypedData, we need to pass the complete types object
    const signature = await wallet.signTypedData(
      domain,
      { Registration: types.Registration },
      message
    );
    console.log(`Signature: ${signature}`);

    // Step 7: Register account
    console.log("Registering account...");
    const registerResponse = await fetch(
      `${ORDERLY_API_URL}/v1/register_account`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message,
          signature: signature,
          userAddress: userAddress,
        }),
      }
    );

    const registerData = await registerResponse.json();

    if (!registerResponse.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(registerData)}`);
    }

    console.log("Registration successful!");
    console.log("Response:", JSON.stringify(registerData, null, 2));

    return {
      success: true,
      data: registerData,
      userAddress: userAddress,
    };
  } catch (error) {
    console.error("Error registering account:", error);
    throw error;
  }
}

/**
 * Main function - Usage example
 */
async function main() {
  // Example: Register account using private key
  // Replace with your actual private key or use environment variable
  const privateKey = process.env.PRIVATE_KEY;

  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);

  // Use broker ID and chain ID from environment or defaults
  const brokerId = BROKER_ID;
  const chainId = CHAIN_ID;

  try {
    const result = await registerAccount(wallet, brokerId, chainId);
    console.log("\nRegistration result:", result);
  } catch (error) {
    console.error("\nFailed to register account:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  registerAccount,
  getRegistrationNonce,
};
