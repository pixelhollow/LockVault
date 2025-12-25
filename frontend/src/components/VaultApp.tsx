import { useEffect, useMemo, useState } from 'react';
import { Contract } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/VaultApp.css';

type DatabaseDetails = {
  name: string;
  owner: string;
  secretHandle: string;
  createdAt: bigint;
};

type DecryptedEntry = {
  index: number;
  locked: bigint;
  clear: bigint;
};

export function VaultApp() {
  const { address, isConnected } = useAccount();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const signerPromise = useEthersSigner();

  const [contractAddress, setContractAddress] = useState<string>(CONTRACT_ADDRESS);
  const [databaseName, setDatabaseName] = useState('');
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [entryValue, setEntryValue] = useState('');
  const [generatedSecret, setGeneratedSecret] = useState<number | null>(null);
  const [creationNote, setCreationNote] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [decryptedSecret, setDecryptedSecret] = useState<bigint | null>(null);
  const [decryptedEntries, setDecryptedEntries] = useState<DecryptedEntry[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isStoring, setIsStoring] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const zeroAddress = '0x0000000000000000000000000000000000000000';
  const validContract = useMemo(
    () => /^0x[0-9a-fA-F]{40}$/.test(contractAddress) && contractAddress !== zeroAddress,
    [contractAddress]
  );
  const contractAddressForRead = validContract
    ? (contractAddress as `0x${string}`)
    : (zeroAddress as `0x${string}`);

  const {
    data: databaseIds,
    refetch: refetchIds,
    isFetching: fetchingIds,
  } = useReadContract({
    address: contractAddressForRead,
    abi: CONTRACT_ABI,
    functionName: 'getDatabaseIds',
    args: address ? [address] : undefined,
    query: { enabled: !!address && validContract },
  });

  const {
    data: rawDatabase,
    refetch: refetchDatabase,
    isFetching: _fetchingDatabase,
  } = useReadContract({
    address: contractAddressForRead,
    abi: CONTRACT_ABI,
    functionName: 'getDatabase',
    args: selectedId ? [selectedId] : undefined,
    query: { enabled: !!selectedId && validContract },
  });

  const {
    data: rawEntries,
    refetch: refetchEntries,
    isFetching: fetchingEntries,
  } = useReadContract({
    address: contractAddressForRead,
    abi: CONTRACT_ABI,
    functionName: 'getEntries',
    args: selectedId ? [selectedId] : undefined,
    query: { enabled: !!selectedId && validContract },
  });

  useEffect(() => {
    setDecryptedSecret(null);
    setDecryptedEntries([]);
  }, [selectedId]);

  useEffect(() => {
    setSelectedId(null);
    setDecryptedSecret(null);
    setDecryptedEntries([]);
  }, [contractAddress]);

  const parsedDatabase: DatabaseDetails | null = useMemo(() => {
    if (!rawDatabase) return null;
    const [name, owner, secret, createdAt] = rawDatabase as readonly [
      string,
      `0x${string}`,
      string,
      bigint
    ];
    return {
      name: name as string,
      owner,
      secretHandle: secret,
      createdAt,
    };
  }, [rawDatabase]);

  const normalizedIds = useMemo(() => {
    return (databaseIds as readonly bigint[] | undefined) ?? [];
  }, [databaseIds]);

  const entryHandles = useMemo(() => {
    return (rawEntries as readonly string[] | undefined) ?? [];
  }, [rawEntries]);

  const buildStatus = () => {
    if (zamaLoading) return 'Loading encryption runtime...';
    if (zamaError) return zamaError;
    if (!validContract) return 'Set the deployed Sepolia contract address to begin.';
    return statusMessage || 'Ready to encrypt.';
  };

  const handleCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!databaseName.trim()) {
      setStatusMessage('Please choose a database name.');
      return;
    }
    if (!validContract) {
      setStatusMessage('Set a valid contract address from deployments.');
      return;
    }
    if (!instance || !address || !signerPromise) {
      setStatusMessage('Wallet and encryption engine must be ready.');
      return;
    }

    const secretCode = Math.floor(100000 + Math.random() * 900000);
    setGeneratedSecret(secretCode);
    setIsCreating(true);
    setStatusMessage('Encrypting your secret and creating the database...');

    try {
      const input = instance.createEncryptedInput(contractAddress, address);
      input.add32(secretCode);
      const encryptedSecret = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) throw new Error('Signer unavailable');

      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.createDatabase(
        databaseName.trim(),
        encryptedSecret.handles[0],
        encryptedSecret.inputProof
      );
      await tx.wait();

      setCreationNote('Database ready. The six-digit code below is not stored off-chain, keep it safe.');
      setDatabaseName('');

      const updated = await refetchIds();
      const ids = (updated.data as readonly bigint[] | undefined) ?? [];
      if (ids.length) {
        const newest = ids[ids.length - 1];
        setSelectedId(newest);
        await refetchDatabase();
        await refetchEntries();
      }
      setStatusMessage('Database created and synced with the chain.');
    } catch (error) {
      console.error('Failed to create database', error);
      setStatusMessage('Failed to create database. Please retry.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleStoreEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      setStatusMessage('Select a database before storing data.');
      return;
    }
    if (!validContract) {
      setStatusMessage('Set a valid contract address from deployments.');
      return;
    }
    if (!decryptedSecret) {
      setStatusMessage('Decrypt the database secret before pushing new data.');
      return;
    }
    if (!entryValue.trim()) {
      setStatusMessage('Enter a number to store.');
      return;
    }
    if (!instance || !address || !signerPromise) {
      setStatusMessage('Wallet and encryption engine must be ready.');
      return;
    }

    setIsStoring(true);
    setStatusMessage('Encrypting your entry and locking it with the database secret...');

    try {
      const numericValue = BigInt(entryValue);
      const input = instance.createEncryptedInput(contractAddress, address);
      input.add64(numericValue);
      const encryptedValue = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) throw new Error('Signer unavailable');

      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.storeEntry(
        selectedId,
        encryptedValue.handles[0],
        encryptedValue.inputProof
      );
      await tx.wait();

      setEntryValue('');
      await refetchEntries();
      setStatusMessage('Entry stored. You can decrypt to view the clear value.');
    } catch (error) {
      console.error('Failed to store entry', error);
      setStatusMessage('Failed to store entry. Please retry.');
    } finally {
      setIsStoring(false);
    }
  };

  const handleDecrypt = async () => {
    if (!instance || !address || !signerPromise) {
      setStatusMessage('Wallet and encryption engine must be ready.');
      return;
    }
    if (!validContract) {
      setStatusMessage('Set a valid contract address from deployments.');
      return;
    }
    if (!parsedDatabase) {
      setStatusMessage('Select a database to decrypt.');
      return;
    }

    setIsDecrypting(true);
    setStatusMessage('Requesting user decryption for secret and stored entries...');

    try {
      const keypair = instance.generateKeypair();
      const handles = [
        { handle: parsedDatabase.secretHandle, contractAddress },
        ...entryHandles.map((handle) => ({ handle, contractAddress })),
      ];

      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [contractAddress];

      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays
      );

      const signer = await signerPromise;
      if (!signer) throw new Error('Signer unavailable');

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await instance.userDecrypt(
        handles,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );

      const secretValue = BigInt(result[parsedDatabase.secretHandle] ?? 0);
      const unlockedEntries = entryHandles.map((handle, index) => {
        const locked = BigInt(result[handle] ?? 0);
        return {
          index,
          locked,
          clear: locked - secretValue,
        };
      });

      setDecryptedSecret(secretValue);
      setDecryptedEntries(unlockedEntries);
      setStatusMessage('Decryption complete. Data is visible only in this session.');
    } catch (error) {
      console.error('Failed to decrypt data', error);
      setStatusMessage('Decryption failed. Please try again.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const formattedCreatedAt = useMemo(() => {
    if (!parsedDatabase) return '';
    return new Date(Number(parsedDatabase.createdAt) * 1000).toLocaleString();
  }, [parsedDatabase]);

  return (
    <div className="vault-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">LockVault</p>
          <h2 className="hero-title">Encrypted databases powered by Zama FHE</h2>
          <p className="hero-text">
            Generate a six digit secret, encrypt it on-chain, and use it to lock every record you store.
            Decrypt the database before interacting so you always control the clear data.
          </p>
          <div className="hero-meta">
            <span className="pill">writes via ethers</span>
            <span className="pill">reads via viem</span>
            <span className="pill">no localstorage</span>
          </div>
        </div>
        <div className="hero-stats">
          <div className="stat-card">
            <p className="stat-label">My databases</p>
            <p className="stat-value">
              {isConnected ? (normalizedIds.length ?? 0) : '-'}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Selected</p>
            <p className="stat-value">{selectedId ? selectedId.toString() : 'None'}</p>
          </div>
        </div>
      </section>

      {!isConnected ? (
        <div className="panel muted">
          <p>Please connect your wallet to start creating encrypted databases.</p>
        </div>
      ) : (
        <>
      <section className="panel grid">
        <div className="card">
          <div className="card-header">
            <h3>Create database</h3>
            <p>Frontend generates the 6-digit code and encrypts it with Zama before storing.</p>
          </div>
          <form className="form" onSubmit={handleCreateDatabase}>
            <label className="field">
              <span>Contract address (Sepolia)</span>
              <input
                type="text"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value.trim())}
                placeholder="0x..."
              />
            </label>
            <label className="field">
              <span>Database name</span>
              <input
                type="text"
                value={databaseName}
                    onChange={(e) => setDatabaseName(e.target.value)}
                    placeholder="e.g. Medical vault"
                  />
                </label>
                <button type="submit" className="primary" disabled={isCreating || zamaLoading}>
                  {isCreating ? 'Encrypting secret...' : 'Create encrypted database'}
                </button>
                {generatedSecret && (
                  <div className="secret-box">
                    <p className="secret-label">Your generated code</p>
                    <p className="secret-value">{generatedSecret}</p>
                    <p className="secret-note">{creationNote}</p>
                  </div>
                )}
              </form>
            </div>

            <div className="card">
              <div className="card-header">
                <h3>My databases</h3>
                <p>Select a database, decrypt it, then store values using its secret.</p>
              </div>
              <p className="muted-text">
                ABI is synced from the generated artifacts. Paste the Sepolia deployment address above to start reading.
              </p>
              <div className="chips">
                {fetchingIds && <span className="pill">Refreshing...</span>}
                {normalizedIds.length === 0 && <p className="muted-text">No databases yet.</p>}
                {normalizedIds.map((id) => (
                  <button
                    key={id.toString()}
                    className={`chip ${selectedId === id ? 'chip-active' : ''}`}
                    onClick={() => setSelectedId(id)}
                    type="button"
                  >
                    #{id.toString()}
                  </button>
                ))}
              </div>
              {parsedDatabase && (
                <div className="info-grid">
                  <div>
                    <p className="label">Name</p>
                    <p className="value">{parsedDatabase.name}</p>
                  </div>
                  <div>
                    <p className="label">Owner</p>
                    <p className="value mono">{parsedDatabase.owner}</p>
                  </div>
                  <div>
                    <p className="label">Created at</p>
                    <p className="value">{formattedCreatedAt}</p>
                  </div>
                </div>
              )}
              <div className="actions-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    refetchIds();
                    if (selectedId) {
                      refetchDatabase();
                      refetchEntries();
                    }
                  }}
                >
                  Refresh data
                </button>
                <button
                  type="button"
                  className="primary ghost"
                  disabled={!selectedId || isDecrypting || zamaLoading}
                  onClick={handleDecrypt}
                >
                  {isDecrypting ? 'Decrypting...' : 'Decrypt database'}
                </button>
              </div>
              {decryptedSecret !== null && (
                <div className="secret-box">
                  <p className="secret-label">Decrypted code</p>
                  <p className="secret-value">{decryptedSecret.toString()}</p>
                  <p className="secret-note">
                    Keep this window open while you work. The value is not persisted anywhere.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="panel grid">
            <div className="card">
              <div className="card-header">
                <h3>Store encrypted value</h3>
                <p>Values are combined with the secret on-chain so only you can reconstruct them.</p>
              </div>
              <form className="form" onSubmit={handleStoreEntry}>
                <label className="field">
                  <span>Number to store</span>
                  <input
                    type="number"
                    value={entryValue}
                    onChange={(e) => setEntryValue(e.target.value)}
                    placeholder="e.g. 202501"
                  />
                </label>
                <button
                  type="submit"
                  className="primary"
                  disabled={isStoring || zamaLoading || !selectedId}
                >
                  {isStoring ? 'Storing...' : 'Encrypt and store'}
                </button>
                <p className="muted-text">
                  Requirement: decrypt the database first so the secret is available for calculations.
                </p>
              </form>
            </div>

            <div className="card">
              <div className="card-header">
                <h3>Stored entries</h3>
                <p>Decrypt to see each locked value and the clear number after removing the secret.</p>
              </div>
              {fetchingEntries && <p className="muted-text">Loading entries...</p>}
              {entryHandles.length === 0 && <p className="muted-text">No entries stored yet.</p>}
              <div className="entry-list">
                {decryptedEntries.length > 0 ? (
                  decryptedEntries.map((entry) => (
                    <div key={entry.index} className="entry-row">
                      <div>
                        <p className="label">Entry #{entry.index + 1}</p>
                        <p className="value mono">Locked: {entry.locked.toString()}</p>
                      </div>
                      <div>
                        <p className="label">Clear value</p>
                        <p className="value highlight">{entry.clear.toString()}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  entryHandles.map((_, index) => (
                    <div key={index} className="entry-row muted">
                      <p className="value">Entry #{index + 1} is encrypted</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}

      <div className="status-bar">
        <span>{buildStatus()}</span>
      </div>
    </div>
  );
}
