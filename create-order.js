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
 * Create an order on Orderly Network
 * Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/create-order
 * Authentication: https://orderly.network/docs/build-on-omnichain/evm-api/api-authentication
 *
 * @param {Object} orderParams - Order parameters
 * @param {string} orderParams.symbol - Trading symbol (e.g., "PERP_ETH_USDC")
 * @param {string} orderParams.orderType - Order type: "LIMIT", "MARKET", "IOC", "FOK", "POST_ONLY", "ASK", "BID"
 * @param {string} orderParams.side - Order side: "BUY" or "SELL"
 * @param {number} [orderParams.orderPrice] - Order price (required for LIMIT, IOC, FOK, POST_ONLY)
 * @param {number} [orderParams.orderQuantity] - Order quantity in base currency
 * @param {number} [orderParams.orderAmount] - Order amount in quote currency (for MARKET/BID/ASK orders)
 * @param {number} [orderParams.visibleQuantity] - Visible quantity on orderbook (default: order_quantity)
 * @param {boolean} [orderParams.reduceOnly] - Reduce only flag (default: false)
 * @param {number} [orderParams.slippage] - Slippage tolerance for MARKET orders
 * @param {string} [orderParams.clientOrderId] - Custom client order ID (36 chars max, unique)
 * @param {string} [orderParams.orderTag] - Order tag
 * @param {number} [orderParams.level] - Level for BID/ASK orders (0-4)
 * @param {boolean} [orderParams.postOnlyAdjust] - Price adjustment for POST_ONLY orders
 * @param {string} accountId - Orderly account ID
 * @param {string} orderlyKey - Orderly public key (ed25519:...)
 * @param {Uint8Array} orderlyPrivateKey - Orderly private key (32 bytes)
 * @returns {Promise<Object>} - Order creation result
 */
async function createOrder(
  orderParams,
  accountId,
  orderlyKey,
  orderlyPrivateKey
) {
  try {
    const {
      symbol,
      orderType,
      side,
      orderPrice,
      orderQuantity,
      orderAmount,
      visibleQuantity,
      reduceOnly = false,
      slippage,
      clientOrderId,
      orderTag,
      level,
      postOnlyAdjust,
    } = orderParams;

    console.log(`Creating ${orderType} ${side} order for ${symbol}...`);

    // Validate required fields
    if (!symbol || !orderType || !side) {
      throw new Error(
        "Missing required fields: symbol, orderType, and side are required"
      );
    }

    // Validate order type
    const validOrderTypes = [
      "LIMIT",
      "MARKET",
      "IOC",
      "FOK",
      "POST_ONLY",
      "ASK",
      "BID",
    ];
    if (!validOrderTypes.includes(orderType.toUpperCase())) {
      throw new Error(
        `Invalid order type: ${orderType}. Must be one of: ${validOrderTypes.join(
          ", "
        )}`
      );
    }

    // Validate side
    if (!["BUY", "SELL"].includes(side.toUpperCase())) {
      throw new Error(`Invalid side: ${side}. Must be BUY or SELL`);
    }

    // Validate order_price requirement for certain order types
    const orderTypeUpper = orderType.toUpperCase();
    if (
      ["LIMIT", "IOC", "FOK", "POST_ONLY"].includes(orderTypeUpper) &&
      orderPrice === undefined
    ) {
      throw new Error(`orderPrice is required for ${orderType} orders`);
    }

    // Validate order_quantity or order_amount
    if (orderQuantity === undefined && orderAmount === undefined) {
      throw new Error("Either orderQuantity or orderAmount must be provided");
    }

    // Validate MARKET/BID/ASK order requirements
    if (["MARKET", "BID", "ASK"].includes(orderTypeUpper)) {
      if (side.toUpperCase() === "SELL" && orderAmount !== undefined) {
        throw new Error(
          "orderAmount is not supported for SELL orders with MARKET/BID/ASK order types"
        );
      }
      if (side.toUpperCase() === "BUY" && orderQuantity !== undefined) {
        throw new Error(
          "orderQuantity is not supported for BUY orders with MARKET/BID/ASK order types"
        );
      }
    }

    // Build request body
    const requestBody = {
      symbol: symbol,
      order_type: orderType.toUpperCase(),
      side: side.toUpperCase(),
    };

    // Add optional fields
    if (orderPrice !== undefined) {
      requestBody.order_price = orderPrice;
    }
    if (orderQuantity !== undefined) {
      requestBody.order_quantity = orderQuantity;
    }
    if (orderAmount !== undefined) {
      requestBody.order_amount = orderAmount;
    }
    if (visibleQuantity !== undefined) {
      requestBody.visible_quantity = visibleQuantity;
    }
    if (reduceOnly !== undefined) {
      requestBody.reduce_only = reduceOnly;
    }
    if (slippage !== undefined) {
      requestBody.slippage = slippage;
    }
    if (clientOrderId !== undefined) {
      requestBody.client_order_id = clientOrderId;
    }
    if (orderTag !== undefined) {
      requestBody.order_tag = orderTag;
    }
    if (level !== undefined) {
      requestBody.level = level;
    }
    if (postOnlyAdjust !== undefined) {
      requestBody.post_only_adjust = postOnlyAdjust;
    }

    const path = "/v1/order";
    const requestConfig = await createAuthenticatedRequest(
      "POST",
      path,
      requestBody,
      accountId,
      orderlyKey,
      orderlyPrivateKey
    );

    const response = await fetch(`${ORDERLY_API_URL}${path}`, requestConfig);
    const data = await response.json();

    // Check both HTTP status and success field in response body
    if (!response.ok) {
      throw new Error(`Failed to create order: ${JSON.stringify(data)}`);
    }

    if (!data.success) {
      throw new Error(`Order creation failed: ${JSON.stringify(data)}`);
    }

    console.log("Order created successfully!");
    console.log("Response:", JSON.stringify(data, null, 2));

    return {
      success: true,
      data: data.data,
      orderId: data.data?.order_id,
      clientOrderId: data.data?.client_order_id,
    };
  } catch (error) {
    console.error("Error creating order:", error);
    throw error;
  }
}

/**
 * Main function - Create order from command line
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
  // Usage: node create-order.js <symbol> <orderType> <side> [orderPrice] [orderQuantity] [orderAmount]
  const symbol = process.argv[2];
  const orderType = process.argv[3];
  const side = process.argv[4];

  // Parse numeric arguments (skip if "undefined" string or empty)
  const parseNumericArg = (arg) => {
    if (!arg || arg === "undefined" || arg === "null") return undefined;
    const num = parseFloat(arg);
    return isNaN(num) ? undefined : num;
  };

  const orderPrice = parseNumericArg(process.argv[5]);
  const orderQuantity = parseNumericArg(process.argv[6]);
  const orderAmount = parseNumericArg(process.argv[7]);

  if (!symbol || !orderType || !side) {
    console.error(
      "Usage: node create-order.js <symbol> <orderType> <side> [orderPrice] [orderQuantity] [orderAmount]"
    );
    console.error("\nRequired parameters:");
    console.error("  symbol        - Trading symbol (e.g., PERP_ETH_USDC)");
    console.error(
      "  orderType     - LIMIT, MARKET, IOC, FOK, POST_ONLY, ASK, BID"
    );
    console.error("  side          - BUY or SELL");
    console.error("\nOptional parameters:");
    console.error(
      "  orderPrice    - Order price (required for LIMIT/IOC/FOK/POST_ONLY)"
    );
    console.error("  orderQuantity - Order quantity in base currency");
    console.error(
      "  orderAmount   - Order amount in quote currency (for MARKET/BID/ASK BUY orders)"
    );
    console.error("\nExamples:");
    console.error("  # LIMIT BUY order");
    console.error(
      '  node create-order.js "PERP_ETH_USDC" "LIMIT" "BUY" 2000 0.1'
    );
    console.error("  # MARKET BUY order (using orderAmount)");
    console.error(
      '  node create-order.js "PERP_ETH_USDC" "MARKET" "BUY" undefined undefined 100'
    );
    console.error("  # LIMIT SELL order");
    console.error(
      '  node create-order.js "PERP_ETH_USDC" "LIMIT" "SELL" 2100 0.05'
    );
    process.exit(1);
  }

  try {
    const orderParams = {
      symbol,
      orderType,
      side,
      orderPrice,
      orderQuantity,
      orderAmount,
    };

    const result = await createOrder(
      orderParams,
      accountId,
      orderlyKey,
      orderlyPrivateKey
    );
    console.log("\nOrder created successfully!");
    console.log(`Order ID: ${result.orderId}`);
    if (result.clientOrderId) {
      console.log(`Client Order ID: ${result.clientOrderId}`);
    }
  } catch (error) {
    console.error("\nFailed to create order:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  createOrder,
};
