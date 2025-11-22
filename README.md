# Orderly Network Scripts

A collection of JavaScript scripts for interacting with the Orderly Network API, including account registration, account checking, and Orderly Key management functionality.

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory (or copy from `.env.example`):

```bash
# Orderly API Configuration
ORDERLY_API_URL=https://api.orderly.org  # or https://testnet-api.orderly.org for testnet
CHAIN_ID=80001                            # Example: Polygon Mumbai testnet
BROKER_ID=woofi_pro                       # Your broker ID

# Wallet Configuration (required for registration and key operations)
PRIVATE_KEY=your_private_key_here         # Your Ethereum wallet private key
ORDERLY_KEY=ed25519:...                   # Orderly public key (for adding keys)
```

### Environment Variables

- `ORDERLY_API_URL`: Orderly API base URL (default: `https://api.orderly.org`)
- `CHAIN_ID`: The chain ID to use (default: `80001` for Polygon Mumbai testnet)
- `BROKER_ID`: Your broker ID (default: `woofi_pro`)
- `PRIVATE_KEY`: Your Ethereum wallet private key (required for registration and adding keys)
- `ADDRESS`: Wallet address (optional, can be passed as CLI argument)
- `CHAIN_TYPE`: Chain type - `EVM` or `SOL` (default: `EVM`)
- `ORDERLY_KEY`: Orderly public key to announce (required for adding keys)

## Scripts

### 1. Check Account (`check-account.js`)

Check if an Orderly account exists for a given wallet address and broker ID combination.

#### Usage

```bash
# Using npm script
npm run check <address> [brokerId] [chainType]

# Direct execution
node check-account.js <address> [brokerId] [chainType]

# Using environment variables
ADDRESS=0x1234... BROKER_ID=woofi_pro node check-account.js
```

#### Examples

```bash
# Check account with all parameters
npm run check 0x1234... "woofi_pro" EVM

# Check account using environment variables
ADDRESS=0x1234... BROKER_ID=woofi_pro CHAIN_TYPE=EVM npm run check

# Check account with default broker ID from .env
npm run check 0x1234...
```

#### Using as a Module

```javascript
const { checkAccountExists } = require("./check-account");

// Check if account exists
const exists = await checkAccountExists(
  "0x1234...", // wallet address
  "woofi_pro", // broker ID
  "EVM" // chain type: 'EVM' or 'SOL'
);

if (exists) {
  console.log("Account exists!");
} else {
  console.log("Account does not exist");
}
```

#### API Details

- **Endpoint**: `/v1/get_account`
- **Method**: GET
- **Parameters**:
  - `address` (required): Wallet address
  - `broker_id` (required): Broker ID
  - `chain_type` (optional): Chain type (EVM or SOL)

---

### 2. Register Account (`register-account.js`)

Register a new account on Orderly Network using a wallet address and broker ID.

#### Usage

```bash
# Using npm script (reads from .env file)
npm run register

# Direct execution
node register-account.js
```

#### Prerequisites

- `PRIVATE_KEY` must be set in `.env` file
- `BROKER_ID` must be set in `.env` file or defaults to `woofi_pro`
- `CHAIN_ID` must be set in `.env` file or defaults to `80001`

#### Examples

```bash
# Register with environment variables from .env
npm run register

# Register with inline environment variables
PRIVATE_KEY=0x... BROKER_ID=woofi_pro CHAIN_ID=80001 npm run register
```

#### Using as a Module

```javascript
const { registerAccount } = require("./register-account");
const { ethers } = require("ethers");

// Create wallet from private key
const wallet = new ethers.Wallet("your_private_key");

// Register account
const result = await registerAccount(
  wallet, // ethers.Wallet instance
  "woofi_pro", // broker ID (optional, defaults to BROKER_ID from env)
  80001 // chain ID (optional, defaults to CHAIN_ID from env)
);

console.log("Registration result:", result);
```

#### How It Works

1. Checks if an account already exists for the wallet address and broker ID combination
2. Fetches a registration nonce from the Orderly API
3. Creates an EIP-712 typed data message with:
   - Broker ID
   - Chain ID
   - Timestamp
   - Registration nonce
4. Signs the message using EIP-712 standard
5. Sends the registration request to Orderly API with the signature

#### Example Output

```
Registering account for address: 0x1234... with brokerId: woori_pro
Fetching registration nonce...
Registration nonce: 194528949540
Signing EIP-712 message...
Signature: 0xabcd...
Registering account...
Registration successful!
```

#### API Details

- **Get Nonce Endpoint**: `/v1/registration_nonce`
- **Register Endpoint**: `/v1/register_account`
- **Method**: POST
- **Request Body**:
  ```json
  {
    "message": {
      "brokerId": "string",
      "chainId": 80001,
      "timestamp": 1234567890,
      "registrationNonce": "string"
    },
    "signature": "0x...",
    "userAddress": "0x..."
  }
  ```

---

### 3. Add Orderly Key (`add-orderly-key.js`)

Add/announce an Orderly Key for an account. This allows the account to use Orderly Key-based authentication.

#### Usage

```bash
# Using npm script
npm run add-key <orderlyKey> [brokerId] [chainId]

# Direct execution
node add-orderly-key.js <orderlyKey> [brokerId] [chainId]
```

#### Prerequisites

- `PRIVATE_KEY` must be set in `.env` file
- `ORDERLY_KEY` must be provided (Orderly public key to announce)
- Account must be registered on Orderly Network

#### Examples

```bash
# Add Orderly Key with all parameters
npm run add-key "ed25519:..." "woofi_pro" 80001

# Add Orderly Key using environment variable
ORDERLY_KEY=ed25519:... npm run add-key

# Add Orderly Key with inline environment variables
PRIVATE_KEY=0x... ORDERLY_KEY=ed25519:... npm run add-key
```

#### Using as a Module

```javascript
const { addOrderlyKey } = require("./add-orderly-key");
const { ethers } = require("ethers");

// Create wallet from private key
const wallet = new ethers.Wallet("your_private_key");

// Add Orderly Key
const result = await addOrderlyKey(
  wallet, // ethers.Wallet instance
  "ed25519:...", // Orderly public key
  "woofi_pro", // broker ID (optional, defaults to BROKER_ID from env)
  80001 // chain ID (optional, defaults to CHAIN_ID from env)
);

console.log("Orderly Key added:", result);
```

#### How It Works

1. Creates an EIP-712 typed data message with:
   - Broker ID
   - Chain ID
   - Timestamp
   - Orderly Key (public key)
2. Signs the message using EIP-712 standard
3. Sends the announcement request to Orderly API with the signature

#### Example Output

```
Adding Orderly Key for address: 0x1234... with brokerId: woori_pro
Orderly Key: ed25519:...
Signing EIP-712 message...
Signature: 0xabcd...
Announcing Orderly Key...
Orderly Key announcement successful!
```

#### API Details

- **Announce Key Endpoint**: `/v1/user_announce_key`
- **Method**: POST
- **Request Body**:
  ```json
  {
    "message": {
      "brokerId": "string",
      "chainId": 80001,
      "timestamp": 1234567890,
      "orderlyKey": "ed25519:..."
    },
    "signature": "0x...",
    "userAddress": "0x..."
  }
  ```

---

## Supported Chains

Based on the Orderly documentation, you can register on any EVM-compatible chain that Orderly supports. Common options include:

| Chain                  | Chain ID   | Type    |
| ---------------------- | ---------- | ------- |
| Polygon Mumbai Testnet | `80001`    | Testnet |
| Polygon Mainnet        | `137`      | Mainnet |
| Ethereum Sepolia       | `11155111` | Testnet |
| Ethereum Mainnet       | `1`        | Mainnet |

## Error Handling

All scripts handle common errors:

- **Account already exists**: Registration script will skip registration if account exists
- **Invalid private key**: Registration script will fail with clear error message
- **API connection errors**: All scripts handle network errors gracefully
- **Invalid parameters**: Scripts validate inputs and provide usage instructions
- **Registration failures**: Registration script provides detailed error messages from API

## Security Notes

⚠️ **Important Security Considerations:**

- **Never commit your private key to version control!** Always use environment variables or secure secret management
- The `.env` file is automatically ignored by git (see `.gitignore`)
- Use `.env.example` as a template without sensitive values
- Consider using a testnet for development and testing
- Keep your private keys secure and never share them

## Development

### Project Structure

```
orderly/
├── check-account.js      # Check account existence script
├── register-account.js   # Register account script
├── add-orderly-key.js    # Add/announce Orderly Key script
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables (not in git)
├── .env.example          # Example environment variables
└── README.md            # This file
```

### Adding New Scripts

To add a new script:

1. Create a new `.js` file (e.g., `new-script.js`)
2. Add the npm script to `package.json`:
   ```json
   "scripts": {
     "new-script": "node new-script.js"
   }
   ```
3. Update this README with documentation for the new script
4. Follow the existing patterns for:
   - Environment variable configuration
   - Error handling
   - Module exports
   - CLI argument parsing

### Dependencies

- `ethers`: Ethereum library for wallet operations and EIP-712 signing
- `dotenv`: Load environment variables from `.env` file
- `node-fetch`: HTTP client (fallback for Node.js < 18)

## License

ISC
