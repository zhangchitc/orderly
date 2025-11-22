require("dotenv").config();

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
const BROKER_ID = process.env.BROKER_ID || "woofi_pro"; // Your broker ID

/**
 * Check if account exists for the given wallet address and brokerId combination
 * Note: Orderly accounts are uniquely identified by both address and brokerId
 * Uses /v1/get_account endpoint which requires address and broker_id parameters
 *
 * @param {string} userAddress - The wallet address to check
 * @param {string} brokerId - The broker ID (defaults to BROKER_ID from env)
 * @param {string} chainType - The chain type: "EVM" or "SOL" (defaults to "EVM")
 * @returns {Promise<boolean>} - True if account exists, false otherwise
 */
async function checkAccountExists(
  userAddress,
  brokerId = BROKER_ID,
  chainType = "EVM"
) {
  try {
    // Use /v1/get_account endpoint with address and broker_id as required parameters
    const url = new URL(`${ORDERLY_API_URL}/v1/get_account`);
    url.searchParams.set("address", userAddress);
    url.searchParams.set("broker_id", brokerId);
    url.searchParams.set("chain_type", chainType);

    const response = await fetch(url.toString());
    const data = await response.json();

    console.log(JSON.stringify(data, null, 2));

    // According to Orderly API docs:
    // - code 0 means wallet is registered
    // - code 600004 means wallet is not registered
    if (response.ok && data.success === true) {
      return true;
    }
    // Account doesn't exist or not registered
    return false;
  } catch (error) {
    console.error("Error checking account existence:", error);
    return false;
  }
}

/**
 * Main function - Check account existence from command line
 */
async function main() {
  // Get address from command line arguments or environment variable
  const address = process.argv[2] || process.env.ADDRESS;
  const brokerId = process.argv[3] || process.env.BROKER_ID || BROKER_ID;
  const chainType = process.argv[4] || process.env.CHAIN_TYPE || "EVM";

  if (!address) {
    console.error(
      "Usage: node check-account.js <address> [brokerId] [chainType]"
    );
    console.error("Or set ADDRESS environment variable");
    console.error("\nExample:");
    console.error('  node check-account.js 0x1234... "woofi_pro" EVM');
    console.error(
      "  ADDRESS=0x1234... BROKER_ID=woofi_pro node check-account.js"
    );
    process.exit(1);
  }

  console.log(`Checking account existence for:`);
  console.log(`  Address: ${address}`);
  console.log(`  Broker ID: ${brokerId}`);
  console.log(`  Chain Type: ${chainType}`);
  console.log();

  try {
    const exists = await checkAccountExists(address, brokerId, chainType);
    if (exists) {
      console.log(
        `✓ Account exists for address ${address} with brokerId ${brokerId}`
      );
      process.exit(0);
    } else {
      console.log(
        `✗ Account does not exist for address ${address} with brokerId ${brokerId}`
      );
      process.exit(1);
    }
  } catch (error) {
    console.error("Failed to check account:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  checkAccountExists,
};
