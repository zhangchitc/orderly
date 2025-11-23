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
 * Cancel an order on Orderly Network
 * Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/cancel-order
 * Authentication: https://orderly.network/docs/build-on-omnichain/evm-api/api-authentication
 *
 * @param {number} orderId - Order ID to cancel
 * @param {string} symbol - Trading symbol (e.g., "PERP_ETH_USDC")
 * @param {string} accountId - Orderly account ID
 * @param {string} orderlyKey - Orderly public key (ed25519:...)
 * @param {Uint8Array} orderlyPrivateKey - Orderly private key (32 bytes)
 * @returns {Promise<Object>} - Cancellation result
 */
async function cancelOrder(
  orderId,
  symbol,
  accountId,
  orderlyKey,
  orderlyPrivateKey
) {
  try {
    console.log(`Cancelling order ${orderId} for symbol ${symbol}...`);

    // Validate required parameters
    if (!orderId || !symbol) {
      throw new Error("orderId and symbol are required");
    }

    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append("order_id", orderId.toString());
    queryParams.append("symbol", symbol);

    const path = `/v1/order?${queryParams.toString()}`;

    const requestConfig = await createAuthenticatedRequest(
      "DELETE",
      path,
      null,
      accountId,
      orderlyKey,
      orderlyPrivateKey
    );

    const response = await fetch(`${ORDERLY_API_URL}${path}`, requestConfig);
    const data = await response.json();

    // Check both HTTP status and success field in response body
    if (!response.ok) {
      throw new Error(`Failed to cancel order: ${JSON.stringify(data)}`);
    }

    if (!data.success) {
      throw new Error(`Cancel order failed: ${JSON.stringify(data)}`);
    }

    console.log("Order cancelled successfully!");
    console.log("Response:", JSON.stringify(data, null, 2));

    return {
      success: true,
      data: data.data,
      status: data.data?.status,
      orderId: orderId,
      symbol: symbol,
    };
  } catch (error) {
    console.error("Error cancelling order:", error);
    throw error;
  }
}

/**
 * Main function - Cancel order from command line
 */
async function main() {
  // Get Orderly Key credentials from environment
  const accountId = process.env.ACCOUNT_ID || process.env.ORDERLY_ACCOUNT_ID;
  if (!accountId) {
    console.error(
      "Error: ACCOUNT_ID or ORDERLY_ACCOUNT_ID environment variable is required"
    );
    process.exit(1);
  }

  const orderlyKey = process.env.ORDERLY_KEY;
  if (!orderlyKey) {
    console.error(
      "Error: ORDERLY_KEY environment variable is required (should be in format 'ed25519:...')"
    );
    process.exit(1);
  }

  const orderlyPrivateKeyHex = process.env.ORDERLY_PRIVATE_KEY;
  if (!orderlyPrivateKeyHex) {
    console.error(
      "Error: ORDERLY_PRIVATE_KEY environment variable is required (ed25519 private key in hex format)"
    );
    process.exit(1);
  }

  // Convert hex string to Uint8Array
  const orderlyPrivateKey = hexToPrivateKey(orderlyPrivateKeyHex);

  // Parse command line arguments
  // Usage: node cancel-order.js <orderId> <symbol>
  const orderId = process.argv[2] ? parseInt(process.argv[2]) : undefined;
  const symbol = process.argv[3];

  if (!orderId || !symbol) {
    console.error("Usage: node cancel-order.js <orderId> <symbol>");
    console.error("\nRequired parameters:");
    console.error("  orderId  - Order ID to cancel (number)");
    console.error("  symbol   - Trading symbol (e.g., PERP_ETH_USDC)");
    console.error("\nExamples:");
    console.error('  node cancel-order.js 12345 "PERP_ETH_USDC"');
    console.error('  npm run cancel-order 12345 "PERP_ETH_USDC"');
    process.exit(1);
  }

  try {
    const result = await cancelOrder(
      orderId,
      symbol,
      accountId,
      orderlyKey,
      orderlyPrivateKey
    );
    console.log("\nOrder cancelled successfully!");
    console.log(`Order ID: ${result.orderId}`);
    console.log(`Symbol: ${result.symbol}`);
    console.log(`Status: ${result.status}`);
  } catch (error) {
    console.error("\nFailed to cancel order:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  cancelOrder,
};

