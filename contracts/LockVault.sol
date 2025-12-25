// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, euint64, externalEuint32, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title LockVault
/// @notice Stores encrypted databases where every record is locked with the database secret.
/// @dev All encrypted values grant ACL access to both the contract and the database owner.
contract LockVault is ZamaEthereumConfig {
    struct Database {
        string name;
        address owner;
        euint32 secret;
        uint256 createdAt;
    }

    uint256 private _nextDatabaseId = 1;
    mapping(uint256 => Database) private _databases;
    mapping(uint256 => euint64[]) private _entries;
    mapping(address => uint256[]) private _ownerToDatabases;

    event DatabaseCreated(uint256 indexed databaseId, address indexed owner, string name);
    event EntryStored(uint256 indexed databaseId, uint256 indexed entryIndex);

    error DatabaseNotFound(uint256 databaseId);
    error NotDatabaseOwner(address caller);
    error EmptyName();

    /// @notice Creates a new database with a random secret generated off-chain.
    /// @param name Human readable database name.
    /// @param secretInput Encrypted database secret (6 digit code) provided by the frontend.
    /// @param inputProof Proof attached to the encrypted secret.
    /// @return databaseId Identifier of the created database.
    function createDatabase(string calldata name, externalEuint32 secretInput, bytes calldata inputProof)
        external
        returns (uint256)
    {
        if (bytes(name).length == 0) revert EmptyName();

        euint32 secret = FHE.fromExternal(secretInput, inputProof);

        uint256 databaseId = _nextDatabaseId++;
        _databases[databaseId] =
            Database({name: name, owner: msg.sender, secret: secret, createdAt: block.timestamp});

        _ownerToDatabases[msg.sender].push(databaseId);

        // Grant ACL access to decrypt the stored secret
        FHE.allowThis(secret);
        FHE.allow(secret, msg.sender);

        emit DatabaseCreated(databaseId, msg.sender, name);
        return databaseId;
    }

    /// @notice Stores a numeric entry in a database by mixing it with the encrypted secret.
    /// @param databaseId Target database identifier.
    /// @param valueInput Encrypted value provided by the frontend.
    /// @param inputProof Proof attached to the encrypted value.
    function storeEntry(uint256 databaseId, externalEuint64 valueInput, bytes calldata inputProof) external {
        Database storage database = _databases[databaseId];
        if (database.owner == address(0)) revert DatabaseNotFound(databaseId);
        if (database.owner != msg.sender) revert NotDatabaseOwner(msg.sender);

        euint64 value = FHE.fromExternal(valueInput, inputProof);
        euint64 secret64 = FHE.asEuint64(database.secret);
        euint64 lockedValue = FHE.add(value, secret64);

        _entries[databaseId].push(lockedValue);

        FHE.allowThis(lockedValue);
        FHE.allow(lockedValue, msg.sender);

        emit EntryStored(databaseId, _entries[databaseId].length - 1);
    }

    /// @notice Returns database metadata and encrypted secret.
    /// @param databaseId Target database identifier.
    /// @return name Database name.
    /// @return owner Database owner.
    /// @return secret Encrypted database secret.
    /// @return createdAt Block timestamp when the database was created.
    function getDatabase(uint256 databaseId) external view returns (string memory, address, euint32, uint256) {
        Database storage database = _databases[databaseId];
        if (database.owner == address(0)) revert DatabaseNotFound(databaseId);

        return (database.name, database.owner, database.secret, database.createdAt);
    }

    /// @notice Lists database ids created by a given owner.
    /// @param owner Address to query.
    /// @return Array of database identifiers.
    function getDatabaseIds(address owner) external view returns (uint256[] memory) {
        return _ownerToDatabases[owner];
    }

    /// @notice Returns only the encrypted secret for a database.
    /// @param databaseId Target database identifier.
    /// @return Encrypted database secret.
    function getDatabaseSecret(uint256 databaseId) external view returns (euint32) {
        Database storage database = _databases[databaseId];
        if (database.owner == address(0)) revert DatabaseNotFound(databaseId);

        return database.secret;
    }

    /// @notice Returns the number of entries stored in a database.
    /// @param databaseId Target database identifier.
    /// @return Entry count.
    function getEntryCount(uint256 databaseId) external view returns (uint256) {
        Database storage database = _databases[databaseId];
        if (database.owner == address(0)) revert DatabaseNotFound(databaseId);

        return _entries[databaseId].length;
    }

    /// @notice Retrieves every encrypted entry in a database.
    /// @param databaseId Target database identifier.
    /// @return Array of encrypted entries.
    function getEntries(uint256 databaseId) external view returns (euint64[] memory) {
        Database storage database = _databases[databaseId];
        if (database.owner == address(0)) revert DatabaseNotFound(databaseId);

        return _entries[databaseId];
    }
}
