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
 * Get orders from Orderly Network
 * Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/get-orders
 * Authentication: https://orderly.network/docs/build-on-omnichain/evm-api/api-authentication
 *
 * @param {Object} filterParams - Filter parameters (all optional)
 * @param {string} [filterParams.symbol] - Trading symbol (e.g., "PERP_ETH_USDC")
 * @param {string} [filterParams.side] - Order side: "BUY" or "SELL"
 * @param {string} [filterParams.orderType] - Order type: "LIMIT" or "MARKET"
 * @param {string} [filterParams.status] - Order status: "NEW", "CANCELLED", "PARTIAL_FILLED", "FILLED", "REJECTED", "INCOMPLETE", "COMPLETED"
 * @param {string} [filterParams.orderTag] - Order tag
 * @param {number} [filterParams.startT] - Start timestamp (13-digit timestamp in milliseconds)
 * @param {number} [filterParams.endT] - End timestamp (13-digit timestamp in milliseconds)
 * @param {number} [filterParams.page] - Page number (starts from 1)
 * @param {number} [filterParams.size] - Page size (max: 500)
 * @param {string} [filterParams.sortBy] - Sort by: "CREATED_TIME_DESC", "CREATED_TIME_ASC", "UPDATED_TIME_DESC", "UPDATED_TIME_ASC"
 * @param {string} accountId - Orderly account ID
 * @param {string} orderlyKey - Orderly public key (ed25519:...)
 * @param {Uint8Array} orderlyPrivateKey - Orderly private key (32 bytes)
 * @returns {Promise<Object>} - Orders result with pagination metadata
 */
async function getOrders(
  filterParams,
  accountId,
  orderlyKey,
  orderlyPrivateKey
) {
  try {
    const {
      symbol,
      side,
      orderType,
      status,
      orderTag,
      startT,
      endT,
      page,
      size,
      sortBy,
    } = filterParams;

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (symbol) queryParams.append("symbol", symbol);
    if (side) queryParams.append("side", side.toUpperCase());
    if (orderType) queryParams.append("order_type", orderType.toUpperCase());
    if (status) queryParams.append("status", status.toUpperCase());
    if (orderTag) queryParams.append("order_tag", orderTag);
    if (startT !== undefined) queryParams.append("start_t", startT.toString());
    if (endT !== undefined) queryParams.append("end_t", endT.toString());
    if (page !== undefined) queryParams.append("page", page.toString());
    if (size !== undefined) queryParams.append("size", size.toString());
    if (sortBy) queryParams.append("sort_by", sortBy.toUpperCase());

    const path = `/v1/orders${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    const requestConfig = await createAuthenticatedRequest(
      "GET",
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
      throw new Error(`Failed to get orders: ${JSON.stringify(data)}`);
    }

    if (!data.success) {
      throw new Error(`Get orders failed: ${JSON.stringify(data)}`);
    }

    console.log("Orders retrieved successfully!");
    console.log(`Total orders: ${data.data?.meta?.total || 0}`);
    console.log(`Page: ${data.data?.meta?.current_page || 1} of ${Math.ceil((data.data?.meta?.total || 0) / (data.data?.meta?.records_per_page || 25))}`);
    console.log(`Orders in this page: ${data.data?.rows?.length || 0}`);
    console.log("\nOrders:", JSON.stringify(data.data?.rows || [], null, 2));

    return {
      success: true,
      data: data.data,
      orders: data.data?.rows || [],
      meta: data.data?.meta,
    };
  } catch (error) {
    console.error("Error getting orders:", error);
    throw error;
  }
}

/**
 * Main function - Get orders from command line
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

  // Parse command line arguments (all optional)
  // Usage: node get-orders.js [symbol] [side] [orderType] [status] [page] [size]
  const symbol = process.argv[2];
  const side = process.argv[3];
  const orderType = process.argv[4];
  const status = process.argv[5];
  const page = process.argv[6] ? parseInt(process.argv[6]) : undefined;
  const size = process.argv[7] ? parseInt(process.argv[7]) : undefined;

  const filterParams = {};
  if (symbol) filterParams.symbol = symbol;
  if (side) filterParams.side = side;
  if (orderType) filterParams.orderType = orderType;
  if (status) filterParams.status = status;
  if (page) filterParams.page = page;
  if (size) filterParams.size = size;

  try {
    const result = await getOrders(
      filterParams,
      accountId,
      orderlyKey,
      orderlyPrivateKey
    );
    console.log("\nOrders retrieved successfully!");
    console.log(`Total: ${result.meta?.total || 0} orders`);
    console.log(`Showing page ${result.meta?.current_page || 1} (${result.orders.length} orders)`);
  } catch (error) {
    console.error("\nFailed to get orders:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  getOrders,
};

