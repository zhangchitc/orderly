require("dotenv").config();
const { ethers } = require("ethers");
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
const CHAIN_ID = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 80001; // Example: Polygon Mumbai testnet
const BROKER_ID = process.env.BROKER_ID || "woofi_pro"; // Your broker ID
// Verifying contract for withdrawals (different from other operations)
// Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/create-withdraw-request
const WITHDRAW_VERIFYING_CONTRACT =
  "0x6F7a338F2aA472838dEFD3283eB360d4Dff5D203";

// Token decimals mapping (common tokens)
// Most stablecoins like USDC, USDT use 6 decimals
const TOKEN_DECIMALS = {
  USDC: 6,
  USDT: 6,
  DAI: 18,
  WETH: 18,
  ETH: 18,
};

/**
 * Get withdrawal nonce from Orderly API
 * Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/get-withdrawal-nonce
 *
 * @param {string} accountId - Orderly account ID from environment variable
 * @param {string} orderlyKey - Orderly public key (ed25519:...)
 * @param {Uint8Array} orderlyPrivateKey - Orderly private key (32 bytes)
 * @returns {Promise<number>} - Withdrawal nonce
 */
async function getWithdrawalNonce(accountId, orderlyKey, orderlyPrivateKey) {
  try {
    const path = "/v1/withdraw_nonce";
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

    if (!response.ok) {
      throw new Error(
        `Failed to get withdrawal nonce: ${JSON.stringify(data)}`
      );
    }

    console.log("Withdrawal nonce response:", JSON.stringify(data, null, 2));

    // Extract nonce from response (adjust based on actual API response structure)
    return (
      data.data?.withdraw_nonce ||
      data.data?.nonce ||
      data.withdrawNonce ||
      data.nonce
    );
  } catch (error) {
    console.error("Error getting withdrawal nonce:", error);
    throw error;
  }
}

/**
 * Withdraw funds from Orderly account
 * Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/user-flows/withdrawal-deposit
 *
 * @param {ethers.Wallet} wallet - The wallet instance
 * @param {string} amount - Amount to withdraw (in human-readable format, e.g., "100")
 * @param {string} token - Token symbol to withdraw (default: "USDC")
 * @param {number} targetChainId - Chain ID to withdraw to (defaults to CHAIN_ID from env)
 * @param {string} brokerId - The broker ID (defaults to BROKER_ID from env)
 * @returns {Promise<Object>} - Withdrawal result
 */
async function withdrawFunds(
  wallet,
  amount,
  token = "USDC",
  targetChainId = CHAIN_ID,
  brokerId = BROKER_ID
) {
  try {
    const userAddress = wallet.address;
    console.log(
      `Withdrawing ${amount} ${token} from Orderly account for address: ${userAddress} with brokerId: ${brokerId}`
    );
    console.log(`Target chain ID: ${targetChainId}`);

    // Step 1: Get account ID and Orderly Key from environment variables
    const accountId = process.env.ACCOUNT_ID || process.env.ORDERLY_ACCOUNT_ID;
    if (!accountId) {
      throw new Error(
        "ACCOUNT_ID or ORDERLY_ACCOUNT_ID environment variable is required for withdrawal"
      );
    }
    console.log(`Account ID: ${accountId}`);

    // Get Orderly Key (public key)
    const orderlyKey = process.env.ORDERLY_KEY;
    if (!orderlyKey) {
      throw new Error(
        "ORDERLY_KEY environment variable is required for withdrawal (should be in format 'ed25519:...')"
      );
    }

    // Get Orderly Private Key (hex string or base64)
    const orderlyPrivateKeyHex = process.env.ORDERLY_PRIVATE_KEY;
    if (!orderlyPrivateKeyHex) {
      throw new Error(
        "ORDERLY_PRIVATE_KEY environment variable is required for withdrawal (ed25519 private key in hex format)"
      );
    }

    // Convert hex string to Uint8Array
    const orderlyPrivateKey = hexToPrivateKey(orderlyPrivateKeyHex);

    // Step 2: Get withdrawal nonce
    console.log("Fetching withdrawal nonce...");
    const withdrawNonce = await getWithdrawalNonce(
      accountId,
      orderlyKey,
      orderlyPrivateKey
    );
    console.log(`Withdrawal nonce: ${withdrawNonce}`);

    // Step 3: Convert amount to smallest unit (uint256)
    // EIP-712 message requires amount as uint256 (smallest unit, not decimal)
    const tokenDecimals = TOKEN_DECIMALS[token.toUpperCase()] || 18; // Default to 18 if not found
    console.log(`Token: ${token}, Decimals: ${tokenDecimals}`);

    // Convert human-readable amount to smallest unit
    const amountInSmallestUnit = ethers.parseUnits(amount, tokenDecimals);
    console.log(
      `Amount: ${amount} ${token} = ${amountInSmallestUnit.toString()} (smallest unit)`
    );

    // Step 4: Create EIP-712 message for withdrawal
    // Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/create-withdraw-request
    const timestamp = Date.now();
    const message = {
      brokerId: brokerId,
      chainId: targetChainId,
      receiver: userAddress,
      token: token,
      amount: amountInSmallestUnit.toString(), // uint256 - use BigInt directly, ethers will handle conversion
      withdrawNonce: withdrawNonce.toString(), // uint64 - use number directly
      timestamp: timestamp.toString(), // uint64 - use number directly
    };

    console.log("Message:", JSON.stringify(message, null, 2));

    // Step 5: Create EIP-712 domain
    // Use withdraw-specific verifying contract for withdrawals
    // Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/create-withdraw-request
    const domain = {
      name: "Orderly",
      version: "1",
      chainId: targetChainId,
      verifyingContract: WITHDRAW_VERIFYING_CONTRACT,
    };

    // Step 6: Create EIP-712 types
    // Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/user-flows/withdrawal-deposit
    const types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Withdraw: [
        { name: "brokerId", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "receiver", type: "address" },
        { name: "token", type: "string" },
        { name: "amount", type: "uint256" },
        { name: "withdrawNonce", type: "uint64" },
        { name: "timestamp", type: "uint64" },
      ],
    };

    // Step 7: Sign the EIP-712 message
    console.log("Signing EIP-712 message...");
    const signature = await wallet.signTypedData(
      domain,
      { Withdraw: types.Withdraw },
      message
    );
    console.log(`Signature: ${signature}`);

    // Step 8: Create withdraw request with Orderly authentication headers
    // Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/create-withdraw-request
    // Authentication: https://orderly.network/docs/build-on-omnichain/evm-api/api-authentication
    console.log("Creating withdrawal request...");

    // Endpoint should be /v1/withdraw_request (not /v1/client/withdraw_request)
    const path = "/v1/withdraw_request";

    // For API request body, convert numeric values to strings as per API documentation
    const requestBody = {
      message: {
        brokerId: message.brokerId,
        chainId: message.chainId,
        receiver: message.receiver,
        token: message.token,
        amount: message.amount.toString(), // Convert BigInt to string for JSON
        withdrawNonce: message.withdrawNonce.toString(), // Convert to string for JSON
        timestamp: message.timestamp.toString(), // Convert to string for JSON
      },
      signature: signature,
      userAddress: userAddress,
      verifyingContract: WITHDRAW_VERIFYING_CONTRACT, // Required field according to API docs
    };

    console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const requestConfig = await createAuthenticatedRequest(
      "POST",
      path,
      requestBody,
      accountId,
      orderlyKey,
      orderlyPrivateKey
    );

    const withdrawResponse = await fetch(
      `${ORDERLY_API_URL}${path}`,
      requestConfig
    );

    const withdrawData = await withdrawResponse.json();

    // Check both HTTP status and success field in response body
    if (!withdrawResponse.ok) {
      throw new Error(
        `Withdrawal request failed: ${JSON.stringify(withdrawData)}`
      );
    }

    // Orderly API returns success: false in body even with 200 status
    if (!withdrawData.success) {
      throw new Error(
        `Withdrawal request failed: ${JSON.stringify(withdrawData)}`
      );
    }

    console.log("Withdrawal request successful!");
    console.log("Response:", JSON.stringify(withdrawData, null, 2));

    return {
      success: true,
      data: withdrawData,
      userAddress: userAddress,
      amount: amount,
      token: token,
      targetChainId: targetChainId,
      withdrawNonce: withdrawNonce,
    };
  } catch (error) {
    console.error("Error withdrawing funds:", error);
    throw error;
  }
}

/**
 * Main function - Withdraw funds from command line
 */
async function main() {
  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    console.error("Error: PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  // Get parameters from command line arguments or environment variables
  const amount = process.argv[2] || process.env.WITHDRAW_AMOUNT;
  const token = process.argv[3] || process.env.WITHDRAW_TOKEN || "USDC";
  const targetChainId = process.argv[4] ? parseInt(process.argv[4]) : CHAIN_ID;
  const brokerId = process.argv[5] || process.env.BROKER_ID || BROKER_ID;

  if (!amount) {
    console.error(
      "Usage: node withdraw.js <amount> [token] [targetChainId] [brokerId]"
    );
    console.error("Or set WITHDRAW_AMOUNT environment variable");
    console.error("\nExample:");
    console.error('  node withdraw.js "100" "USDC" 421614 "woofi_pro"');
    console.error("  WITHDRAW_AMOUNT=100 WITHDRAW_TOKEN=USDC npm run withdraw");
    process.exit(1);
  }

  // Validate minimum withdrawal amount
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum < 1.001) {
    console.error(
      `Error: Withdrawal amount must be at least 1.001. Got: ${amount}`
    );
    process.exit(1);
  }

  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);

  try {
    const result = await withdrawFunds(
      wallet,
      amount,
      token,
      targetChainId,
      brokerId
    );
    console.log("\nWithdrawal request submitted successfully!");
    console.log(`Amount: ${result.amount} ${result.token}`);
    console.log(`Target Chain ID: ${result.targetChainId}`);
    console.log(`Withdrawal Nonce: ${result.withdrawNonce}`);
    console.log("\nNote: The withdrawal will be processed by Orderly Network.");
    console.log(
      "Check your wallet on the target chain after processing completes."
    );
  } catch (error) {
    console.error("\nFailed to withdraw funds:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  withdrawFunds,
  getWithdrawalNonce,
};
