require("dotenv").config();
const {
  createAuthenticatedRequest,
  hexToPrivateKey,
} = require("./orderly-auth");

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

/**
 * Remove/Revoke Orderly Key for the given account
 * Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/remove-orderly-key
 * Authentication: https://orderly.network/docs/build-on-omnichain/evm-api/api-authentication
 *
 * @param {string} orderlyKeyToRemove - The Orderly Key to remove (format: "ed25519:...")
 * @param {string} accountId - Orderly account ID
 * @param {string} orderlyKey - Orderly public key for authentication (ed25519:...)
 * @param {Uint8Array} orderlyPrivateKey - Orderly private key for signing (32 bytes)
 * @returns {Promise<Object>} - Removal result
 */
async function removeOrderlyKey(
  orderlyKeyToRemove,
  accountId,
  orderlyKey,
  orderlyPrivateKey
) {
  try {
    console.log(`Removing Orderly Key: ${orderlyKeyToRemove}`);
    console.log(`Account ID: ${accountId}`);

    const path = "/v1/client/remove_orderly_key";
    const requestBody = {
      orderly_key: orderlyKeyToRemove,
    };

    const requestConfig = await createAuthenticatedRequest(
      "POST",
      path,
      requestBody,
      accountId,
      orderlyKey,
      orderlyPrivateKey
    );

    // Remove Orderly Key
    // Endpoint: /v1/client/remove_orderly_key
    // Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/remove-orderly-key
    console.log("Removing Orderly Key...");
    const response = await fetch(`${ORDERLY_API_URL}${path}`, requestConfig);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Failed to remove Orderly Key: ${JSON.stringify(data)}`);
    }

    console.log("Orderly Key removed successfully!");
    console.log("Response:", JSON.stringify(data, null, 2));

    return {
      success: true,
      data: data,
      removedOrderlyKey: orderlyKeyToRemove,
    };
  } catch (error) {
    console.error("Error removing Orderly Key:", error);
    throw error;
  }
}

/**
 * Main function - Remove Orderly Key from command line
 */
async function main() {
  // Get account ID from environment
  const accountId = process.env.ACCOUNT_ID || process.env.ORDERLY_ACCOUNT_ID;
  if (!accountId) {
    console.error(
      "Error: ACCOUNT_ID or ORDERLY_ACCOUNT_ID environment variable is required"
    );
    process.exit(1);
  }

  // Get Orderly Key (public key) from environment
  const orderlyKey = process.env.ORDERLY_KEY;
  if (!orderlyKey) {
    console.error(
      "Error: ORDERLY_KEY environment variable is required (should be in format 'ed25519:...')"
    );
    process.exit(1);
  }

  // Get Orderly Private Key from environment
  const orderlyPrivateKeyHex = process.env.ORDERLY_PRIVATE_KEY;
  if (!orderlyPrivateKeyHex) {
    console.error(
      "Error: ORDERLY_PRIVATE_KEY environment variable is required (ed25519 private key in hex format)"
    );
    process.exit(1);
  }

  // Convert hex string to Uint8Array
  const orderlyPrivateKey = hexToPrivateKey(orderlyPrivateKeyHex);

  // Get Orderly Key to remove from command line argument or environment variable
  const orderlyKeyToRemove =
    process.argv[2] || process.env.ORDERLY_KEY_TO_REMOVE;

  if (!orderlyKeyToRemove) {
    console.error("Usage: node remove-orderly-key.js <orderlyKeyToRemove>");
    console.error("Or set ORDERLY_KEY_TO_REMOVE environment variable");
    console.error("\nExample:");
    console.error('  node remove-orderly-key.js "ed25519:..."');
    console.error("  ORDERLY_KEY_TO_REMOVE=ed25519:... npm run remove-key");
    console.error("\nRequired environment variables:");
    console.error("  - ACCOUNT_ID or ORDERLY_ACCOUNT_ID");
    console.error("  - ORDERLY_KEY (the key used for authentication)");
    console.error("  - ORDERLY_PRIVATE_KEY (private key for signing)");
    process.exit(1);
  }

  try {
    const result = await removeOrderlyKey(
      orderlyKeyToRemove,
      accountId,
      orderlyKey,
      orderlyPrivateKey
    );
    console.log("\nOrderly Key removed successfully!");
    console.log(`Removed Key: ${result.removedOrderlyKey}`);
  } catch (error) {
    console.error("\nFailed to remove Orderly Key:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  removeOrderlyKey,
};
