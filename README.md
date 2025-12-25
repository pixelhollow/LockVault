# LockVault

LockVault is an end-to-end encrypted database dApp built on Zama FHEVM. It lets a user create a database with a
frontend-generated six-digit secret, store numeric entries locked by that secret on-chain, and decrypt everything only
when the user explicitly signs a decryption request.

## Overview

LockVault keeps sensitive numbers off the public ledger while still allowing on-chain storage and indexing. Each
database has a human-readable name, an owner, and an encrypted secret. Every entry is stored as an encrypted value
combined with the encrypted secret, so only the owner can reconstruct the clear data after a user-driven decryption.

## Problem It Solves

Public blockchains expose data by default. Traditional encryption workflows usually rely on off-chain servers to hold
keys, which brings centralization risk and makes it hard to prove that data stayed private. LockVault uses Fully
Homomorphic Encryption (FHE) to keep secrets and records encrypted on-chain while still allowing the contract to
operate on them.

## Advantages

- On-chain privacy: secrets and entries are stored as encrypted values, not plaintext.
- User-controlled decryption: data is decrypted only after the user signs a Zama relayer request.
- No backend services: the frontend encrypts data and interacts directly with the contract.
- Clear separation of reads and writes: reads use viem, writes use ethers.
- No local persistence: decrypted data is kept in memory only, never in localStorage.
- Deterministic data model: each database is self-contained and keyed by an on-chain id.

## How It Works

1. **Create database**
   - The frontend generates a 6-digit secret (A).
   - A is encrypted via the Zama relayer SDK.
   - The encrypted secret and database name are stored on-chain.
2. **Decrypt database**
   - The user requests decryption and signs an EIP-712 payload.
   - The relayer returns clear values for the encrypted secret and entries.
3. **Store entry**
   - The user inputs a number, the frontend encrypts it, and the contract stores `value + secret`.
4. **Read entries**
   - After decryption, the UI subtracts the secret from each stored value to reveal the clear data.

## Architecture

- **Smart contract**: `LockVault.sol` stores encrypted databases and entries on Sepolia.
- **Frontend**: React + Vite UI that handles encryption, wallet signatures, and decryption.
- **Tasks + tests**: Hardhat tasks for CLI workflows and tests for correctness on a local FHEVM mock.

## Tech Stack

- **Smart contracts**: Solidity 0.8.27, Hardhat, hardhat-deploy, TypeChain
- **FHE**: Zama FHEVM, `@fhevm/solidity`, `@fhevm/hardhat-plugin`
- **Frontend**: React, Vite, TypeScript, RainbowKit, wagmi, viem, ethers v6
- **Network**: Sepolia

## Data Model

- **Database**
  - `id`: auto-incremented integer
  - `name`: string
  - `owner`: address
  - `secret`: encrypted 6-digit code (euint32)
  - `createdAt`: timestamp
- **Entry**
  - encrypted `value + secret` stored as euint64

## Smart Contract Details

Key functions in `contracts/LockVault.sol`:

- `createDatabase(name, secretInput, inputProof)`: creates a database with an encrypted secret.
- `storeEntry(databaseId, valueInput, inputProof)`: encrypts and stores a locked entry for the owner.
- `getDatabase(databaseId)`: returns metadata plus the encrypted secret.
- `getDatabaseIds(owner)`: lists database ids for an owner.
- `getEntries(databaseId)`: returns encrypted entries.
- `getEntryCount(databaseId)`: returns number of entries.

Events:

- `DatabaseCreated(databaseId, owner, name)`
- `EntryStored(databaseId, entryIndex)`

Access control:

- Only the database owner can store entries.
- Encrypted values grant ACL access to both the contract and the owner via `FHE.allow`.

## Frontend Behavior

- Wallet connection is handled through RainbowKit and wagmi.
- Reads use `useReadContract` (viem). Writes use ethers signers.
- Encryption and decryption are performed through the Zama relayer SDK.
- Decrypted values live only in memory and are cleared when changing database or contract address.
- The frontend is locked to Sepolia; it is not intended for localhost chains.
- Contract address and ABI are stored in `frontend/src/config/contracts.ts` and must be updated after deployment.

## Project Structure

```
contracts/               Smart contracts
deploy/                  Hardhat deployment scripts
tasks/                   Hardhat tasks for CLI workflows
test/                    Unit tests
frontend/                React + Vite client
deployments/sepolia/     Generated ABI and deployment artifacts
```

## Setup and Usage

### Prerequisites

- Node.js 20+
- npm
- A funded Sepolia wallet for deployment

### Install Dependencies

```bash
npm install
```

### Compile and Test

```bash
npm run compile
npm run test
```

### Local Node and Local Deployment (contract-only)

```bash
npx hardhat node
npx hardhat deploy --network anvil
```

### Deploy to Sepolia

1. Create a `.env` in the project root with:

   ```
   PRIVATE_KEY=your_private_key
   INFURA_API_KEY=your_infura_key
   ETHERSCAN_API_KEY=optional
   ```

2. Deploy and verify:

   ```bash
   npx hardhat deploy --network sepolia
   npx hardhat verify --network sepolia <DEPLOYED_CONTRACT_ADDRESS>
   ```

### Update the Frontend Contract Config

- Copy the ABI from `deployments/sepolia/LockVault.json`.
- Paste it into `frontend/src/config/contracts.ts` and set the deployed address.
- The frontend does not use environment variables.

### Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open the local Vite URL, connect your wallet to Sepolia, and paste the contract address in the UI.

### CLI Tasks

```bash
# Print deployed address
npx hardhat task:vault-address --network sepolia

# Create database (secret is a 6-digit number)
npx hardhat task:create-database --name "Medical vault" --secret 123456 --network sepolia

# Store an entry
npx hardhat task:add-entry --database 1 --value 42 --network sepolia

# Decrypt the secret
npx hardhat task:decrypt-secret --database 1 --network sepolia

# Decrypt an entry
npx hardhat task:decrypt-entry --database 1 --index 0 --network sepolia
```

## Security and Privacy Notes

- Secrets and entries are encrypted with FHE and never stored in plaintext on-chain.
- Decryption requires a signed request; the relayer only returns clear values to the signing user.
- The six-digit secret is intentionally short for usability and demo purposes; it is not high-entropy.
- This project stores numeric values only.
- Decrypted values are kept in memory and not persisted to disk or local storage.

## Future Roadmap

- Secret rotation and re-encryption of existing entries.
- Multi-user access (shared database with per-user ACL).
- Richer record types beyond single numbers.
- Pagination and indexing for large datasets.
- Improved UX for decryption sessions and session expiration.
- Optional metadata encryption and per-field access rules.
- Multi-chain deployments as FHEVM support expands.

## License

BSD-3-Clause-Clear. See `LICENSE`.
