require("dotenv").config();
const { ethers } = require("ethers");
const { keccak256 } = require("ethers");

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

// USDC token addresses from Orderly documentation
// Source: https://orderly.network/docs/build-on-omnichain/addresses
const USDC_ADDRESSES = {
  // Ethereum
  1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // Ethereum Mainnet
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Ethereum Sepolia (Testnet)
  // Arbitrum
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum One (Mainnet)
  421614: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Arbitrum Sepolia (Testnet)
  // Optimism
  10: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // Optimism Mainnet
  11155420: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", // Optimism Sepolia (Testnet)
  // Base
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia (Testnet)
  // Mantle
  5000: "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9", // Mantle Mainnet (USDC.e)
  5003: "0xAcab8129E2cE587fD203FD770ec9ECAFA2C88080", // Mantle Sepolia (Testnet)
  // BNB Smart Chain
  56: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BNB Smart Chain Mainnet
  97: "0x31873b5804bABE258d6ea008f55e08DD00b7d51E", // BNB Smart Chain Testnet
};

// Standard ERC20 ABI for transfer function
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

// Orderly Vault contract addresses from Orderly documentation
// Source: https://orderly.network/docs/build-on-omnichain/addresses
const ORDERLY_VAULT = {
  // Ethereum
  1: "0x816f722424b49cf1275cc86da9840fbd5a6167e9", // Ethereum Mainnet
  11155111: "0x0EaC556c0C2321BA25b9DC01e4e3c95aD5CDCd2f", // Ethereum Sepolia (Testnet)
  // Arbitrum
  42161: "0x816f722424B49Cf1275cc86DA9840Fbd5a6167e9", // Arbitrum One (Mainnet)
  421614: "0x0EaC556c0C2321BA25b9DC01e4e3c95aD5CDCd2f", // Arbitrum Sepolia (Testnet)
  // Optimism
  10: "0x816f722424b49cf1275cc86da9840fbd5a6167e9", // Optimism Mainnet
  11155420: "0xEfF2896077B6ff95379EfA89Ff903598190805EC", // Optimism Sepolia (Testnet)
  // Base
  8453: "0x816f722424b49cf1275cc86da9840fbd5a6167e9", // Base Mainnet
  84532: "0xdc7348975aE9334DbdcB944DDa9163Ba8406a0ec", // Base Sepolia (Testnet)
  // Mantle
  5000: "0x816f722424b49cf1275cc86da9840fbd5a6167e9", // Mantle Mainnet
  5003: "0xfb0E5f3D16758984E668A3d76f0963710E775503", // Mantle Sepolia (Testnet)
  // BNB Smart Chain
  56: "0x816f722424B49Cf1275cc86DA9840Fbd5a6167e9", // BNB Smart Chain Mainnet
  97: "0xaf2036D5143219fa00dDd90e7A2dbF3E36dba050", // BNB Smart Chain Testnet
};

// RPC URLs for supported chain IDs (update with your provider keys if necessary)
const RPC_URLS = {
  // Ethereum
  1: "https://rpc.ankr.com/eth",
  11155111: "https://rpc.ankr.com/eth_sepolia",
  // Arbitrum
  42161: "https://arb1.arbitrum.io/rpc",
  421614: "https://sepolia-rollup.arbitrum.io/rpc",
  // Optimism
  10: "https://mainnet.optimism.io",
  11155420: "https://sepolia.optimism.io",
  // Base
  8453: "https://mainnet.base.org",
  84532: "https://sepolia.base.org",
  // Mantle
  5000: "https://rpc.mantle.xyz",
  5003: "https://rpc.sepolia.mantle.xyz",
  // BNB Smart Chain
  56: "https://bsc-dataseed.binance.org/",
  97: "https://data-seed-prebsc-1-s1.binance.org:8545/",
};

// Vault contract ABI (simplified - may need to be updated based on actual contract)
// Full ABI can be found on contract explorer or https://github.com/OrderlyNetwork/contract-evm-abi
const VAULT_ABI = [
  "function deposit(tuple(bytes32 accountId, bytes32 brokerHash, bytes32 tokenHash, uint128 tokenAmount) depositData) external payable",
  "function getDepositFee(address account, tuple(bytes32 accountId, bytes32 brokerHash, bytes32 tokenHash, uint128 tokenAmount) depositData) external view returns (uint256)",
];

/**
 * Generate Orderly account ID
 * Based on Orderly documentation: accountId = keccak256(abi.encode(address, keccak256(abi.encodePacked(brokerId))))
 *
 * @param {string} address - User wallet address
 * @param {string} brokerId - Broker ID
 * @returns {string} - Account ID as bytes32 hex string
 */
function getAccountId(address, brokerId) {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  // keccak256(abi.encodePacked(brokerId)) - using solidityPackedKeccak256 for ABI-encoded string
  const brokerIdHash = ethers.solidityPackedKeccak256(["string"], [brokerId]);
  // keccak256(abi.encode(address, brokerIdHash))
  return keccak256(
    abiCoder.encode(["address", "bytes32"], [address, brokerIdHash])
  );
}

/**
 * Deposit USDC to Orderly account
 * This involves:
 * 1. Approving USDC transfer to Orderly Vault (if needed)
 * 2. Calling the deposit function on the Orderly Vault contract
 *
 * Vault addresses are configured from Orderly documentation:
 * https://orderly.network/docs/build-on-omnichain/addresses
 *
 * @param {ethers.Wallet} wallet - The wallet instance
 * @param {string} amount - Amount of USDC to deposit (in human-readable format, e.g., "100")
 * @param {string} brokerId - The broker ID (defaults to BROKER_ID from env)
 * @param {number} chainId - The chain ID (defaults to CHAIN_ID from env)
 * @returns {Promise<Object>} - Deposit result
 */
async function depositUSDC(
  wallet,
  amount,
  brokerId = BROKER_ID,
  chainId = CHAIN_ID
) {
  try {
    const userAddress = wallet.address;
    console.log(
      `Depositing ${amount} USDC to Orderly account for address: ${userAddress} with brokerId: ${brokerId}`
    );

    // Get USDC contract address for the chain
    const usdcAddress = USDC_ADDRESSES[chainId];
    if (!usdcAddress) {
      throw new Error(
        `USDC address not configured for chain ID ${chainId}. Please update USDC_ADDRESSES.`
      );
    }

    // Get Orderly Vault contract address
    const vaultAddress = process.env.ORDERLY_VAULT || ORDERLY_VAULT[chainId];
    if (!vaultAddress) {
      throw new Error(
        `Orderly Vault address not configured for chain ID ${chainId}. ` +
          `Please set ORDERLY_VAULT in .env or update ORDERLY_VAULT. ` +
          `See https://orderly.network/docs/build-on-omnichain/addresses for addresses.`
      );
    }
    console.log(`Orderly Vault: ${vaultAddress}`);

    // Step 2: Get provider
    // You should set RPC_URL in .env file for the chain you're using
    const rpcUrl = RPC_URLS[chainId];
    if (!rpcUrl) {
      throw new Error(
        "RPC_URL environment variable is required for on-chain operations"
      );
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const walletWithProvider = wallet.connect(provider);

    // Step 3: Get USDC contract instance
    const usdcContract = new ethers.Contract(
      usdcAddress,
      ERC20_ABI,
      walletWithProvider
    );

    // Step 4: Get USDC decimals
    const decimals = await usdcContract.decimals();
    console.log(`USDC decimals: ${decimals}`);

    // Step 5: Convert amount to wei/smallest unit
    const amountWei = ethers.parseUnits(amount, decimals);
    console.log(`Amount in smallest unit: ${amountWei.toString()}`);

    // Step 6: Check balance
    const balance = await usdcContract.balanceOf(userAddress);
    console.log(
      `Current USDC balance: ${ethers.formatUnits(balance, decimals)}`
    );

    if (balance < amountWei) {
      throw new Error(
        `Insufficient balance. Required: ${amount}, Available: ${ethers.formatUnits(
          balance,
          decimals
        )}`
      );
    }

    // Step 7: Check and approve USDC allowance if needed
    const vaultContract = new ethers.Contract(
      vaultAddress,
      VAULT_ABI,
      walletWithProvider
    );

    const currentAllowance = await usdcContract.allowance(
      userAddress,
      vaultAddress
    );
    console.log(
      `Current allowance: ${ethers.formatUnits(currentAllowance, decimals)}`
    );

    if (currentAllowance < amountWei) {
      console.log("Approving USDC transfer to Orderly Vault...");
      const approveTx = await usdcContract.approve(vaultAddress, amountWei);
      console.log(`Approval transaction hash: ${approveTx.hash}`);
      await approveTx.wait();
      console.log("Approval confirmed");

      // Verify allowance updated (poll up to 10 times with 1s delay)
      for (let i = 0; i < 10; i++) {
        const verifiedAllowance = await usdcContract.allowance(
          userAddress,
          vaultAddress
        );
        if (verifiedAllowance >= amountWei) break;
        if (i === 9) {
          throw new Error(
            `Allowance verification failed. Expected: ${ethers.formatUnits(
              amountWei,
              decimals
            )}, Got: ${ethers.formatUnits(verifiedAllowance, decimals)}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Step 8: Prepare deposit data
    // Based on Orderly documentation: https://orderly.network/docs/build-on-omnichain/user-flows/withdrawal-deposit
    const orderlyAccountId = getAccountId(userAddress, brokerId);
    const encoder = new TextEncoder();
    const brokerHash = keccak256(encoder.encode(brokerId));
    const tokenHash = keccak256(encoder.encode("USDC"));

    // Convert amountWei to uint128 (truncate if necessary)
    const tokenAmount =
      BigInt(amountWei.toString()) &
      BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");

    const depositData = {
      accountId: orderlyAccountId,
      brokerHash: brokerHash,
      tokenHash: tokenHash,
      tokenAmount: tokenAmount,
    };

    console.log("Deposit data prepared:");
    console.log(`  Account ID: ${orderlyAccountId}`);
    console.log(`  Broker Hash: ${brokerHash}`);
    console.log(`  Token Hash: ${tokenHash}`);
    console.log(`  Token Amount: ${tokenAmount.toString()}`);

    // Step 9: Get deposit fee
    console.log("Calculating deposit fee...");
    const depositFee = await vaultContract.getDepositFee(
      userAddress,
      depositData
    );
    console.log(`Deposit fee: ${ethers.formatEther(depositFee)} ETH`);

    // Step 10: Call deposit function on Orderly Vault contract
    console.log(`Depositing ${amount} USDC to Orderly Vault...`);
    const tx = await vaultContract.deposit(depositData, { value: depositFee });
    console.log(`Transaction hash: ${tx.hash}`);
    console.log("Waiting for transaction confirmation...");

    // Step 11: Wait for transaction confirmation
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      vaultAddress: vaultAddress,
      amount: amount,
      token: "USDC",
      userAddress: userAddress,
    };
  } catch (error) {
    console.error("Error depositing USDC:", error);
    throw error;
  }
}

/**
 * Main function - Deposit USDC from command line
 */
async function main() {
  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    console.error("Error: PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  // Get amount from command line argument or environment variable
  const amount = process.argv[2] || process.env.DEPOSIT_AMOUNT;
  const brokerId = process.argv[3] || process.env.BROKER_ID || BROKER_ID;
  const chainId = process.argv[4] ? parseInt(process.argv[4]) : CHAIN_ID;

  if (!amount) {
    console.error("Usage: node deposit.js <amount> [brokerId] [chainId]");
    console.error("Or set DEPOSIT_AMOUNT environment variable");
    console.error("\nExample:");
    console.error('  node deposit.js "100" "woofi_pro" 80001');
    console.error("  DEPOSIT_AMOUNT=100 npm run deposit");
    process.exit(1);
  }

  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);

  try {
    const result = await depositUSDC(wallet, amount, brokerId, chainId);
    console.log("\nDeposit successful!");
    console.log(`Transaction Hash: ${result.transactionHash}`);
    console.log(`Vault Address: ${result.vaultAddress}`);
    console.log(`Amount: ${result.amount} USDC`);
  } catch (error) {
    console.error("\nFailed to deposit USDC:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  depositUSDC,
};
