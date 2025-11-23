const { ethers } = require("ethers");
const { sign } = require("@noble/ed25519");

// Use webcrypto if available for @noble/ed25519
if (typeof globalThis !== "undefined" && !globalThis.crypto) {
  const { webcrypto } = require("node:crypto");
  globalThis.crypto = webcrypto;
}

/**
 * Create Orderly API signature for authenticated requests
 * Based on Orderly API authentication: https://orderly.network/docs/build-on-omnichain/evm-api/api-authentication
 *
 * @param {string} message - Normalized message to sign (timestamp + method + path + body)
 * @param {Uint8Array} privateKey - ed25519 private key (32 bytes)
 * @returns {Promise<string>} - Base64url encoded signature
 */
async function createOrderlySignature(message, privateKey) {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  const signature = await sign(messageBytes, privateKey);
  // Convert signature to base64url format (as per Orderly API documentation)
  return Buffer.from(signature).toString("base64url");
}

/**
 * Normalize request content for Orderly API authentication
 * Based on Orderly API authentication: https://orderly.network/docs/build-on-omnichain/evm-api/api-authentication
 *
 * @param {number} timestamp - Timestamp in milliseconds
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string} path - Request path (e.g., "/v1/client/withdraw_request")
 * @param {string} body - Request body as JSON string (empty string for GET/DELETE)
 * @returns {string} - Normalized message string
 */
function normalizeRequestMessage(timestamp, method, path, body = "") {
  return `${timestamp}${method}${path}${body}`;
}

/**
 * Get Content-Type header based on HTTP method
 * Based on Orderly API authentication: GET and DELETE use form-urlencoded, others use JSON
 *
 * @param {string} method - HTTP method
 * @returns {string} - Content-Type header value
 */
function getContentType(method) {
  const upperMethod = method.toUpperCase();
  if (upperMethod === "GET" || upperMethod === "DELETE") {
    return "application/x-www-form-urlencoded";
  }
  return "application/json";
}

/**
 * Create authenticated fetch request configuration
 * Based on Orderly API authentication: https://orderly.network/docs/build-on-omnichain/evm-api/api-authentication
 *
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string} path - Request path (e.g., "/v1/client/withdraw_request")
 * @param {string|Object} body - Request body (will be JSON stringified if object)
 * @param {string} accountId - Orderly account ID
 * @param {string} orderlyKey - Orderly public key (ed25519:...)
 * @param {Uint8Array} orderlyPrivateKey - Orderly private key (32 bytes)
 * @returns {Promise<Object>} - Fetch request configuration with headers and body
 */
async function createAuthenticatedRequest(
  method,
  path,
  body,
  accountId,
  orderlyKey,
  orderlyPrivateKey
) {
  // Generate timestamp
  const timestamp = Date.now();

  // Prepare body string
  let bodyString = "";
  if (body) {
    bodyString = typeof body === "string" ? body : JSON.stringify(body);
  }

  // Normalize request message
  const normalizedMessage = normalizeRequestMessage(
    timestamp,
    method.toUpperCase(),
    path,
    bodyString
  );

  // Create signature
  const signature = await createOrderlySignature(
    normalizedMessage,
    orderlyPrivateKey
  );

  // Build headers
  const headers = {
    "Content-Type": getContentType(method),
    "orderly-timestamp": String(timestamp),
    "orderly-account-id": accountId,
    "orderly-key": orderlyKey,
    "orderly-signature": signature,
  };

  // Build request config
  const requestConfig = {
    method: method.toUpperCase(),
    headers: headers,
  };

  // Add body for POST/PUT requests
  if (
    bodyString &&
    (method.toUpperCase() === "POST" || method.toUpperCase() === "PUT")
  ) {
    requestConfig.body = bodyString;
  }

  return requestConfig;
}

/**
 * Convert hex string private key to Uint8Array
 *
 * @param {string} privateKeyHex - Private key in hex format
 * @returns {Uint8Array} - Private key as Uint8Array
 */
function hexToPrivateKey(privateKeyHex) {
  return ethers.getBytes(privateKeyHex);
}

module.exports = {
  createOrderlySignature,
  normalizeRequestMessage,
  getContentType,
  createAuthenticatedRequest,
  hexToPrivateKey,
};
