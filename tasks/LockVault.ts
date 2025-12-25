import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:vault-address", "Prints the LockVault address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const lockVault = await deployments.get("LockVault");
  console.log("LockVault address is " + lockVault.address);
});

task("task:create-database", "Creates a new encrypted database")
  .addParam("name", "Database name")
  .addParam("secret", "6 digit secret value")
  .addOptionalParam("address", "Override LockVault contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const lockVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("LockVault");
    console.log(`LockVault: ${lockVaultDeployment.address}`);

    const signers = await ethers.getSigners();
    const secretValue = parseInt(taskArguments.secret);

    const encryptedSecret = await fhevm
      .createEncryptedInput(lockVaultDeployment.address, signers[0].address)
      .add32(secretValue)
      .encrypt();

    const contract = await ethers.getContractAt("LockVault", lockVaultDeployment.address);

    const tx = await contract
      .connect(signers[0])
      .createDatabase(taskArguments.name, encryptedSecret.handles[0], encryptedSecret.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    const ids = await contract.getDatabaseIds(signers[0].address);
    console.log(`Your database ids: ${ids}`);
  });

task("task:add-entry", "Stores an encrypted entry for a database")
  .addParam("database", "Database id")
  .addParam("value", "Numeric value to store")
  .addOptionalParam("address", "Override LockVault contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const lockVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("LockVault");
    console.log(`LockVault: ${lockVaultDeployment.address}`);

    const signers = await ethers.getSigners();
    const value = BigInt(taskArguments.value);

    const encryptedValue = await fhevm
      .createEncryptedInput(lockVaultDeployment.address, signers[0].address)
      .add64(value)
      .encrypt();

    const contract = await ethers.getContractAt("LockVault", lockVaultDeployment.address);

    const tx = await contract
      .connect(signers[0])
      .storeEntry(taskArguments.database, encryptedValue.handles[0], encryptedValue.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    const count = await contract.getEntryCount(taskArguments.database);
    console.log(`Entries stored for database ${taskArguments.database}: ${count}`);
  });

task("task:decrypt-secret", "Decrypts the database secret")
  .addParam("database", "Database id")
  .addOptionalParam("address", "Override LockVault contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const lockVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("LockVault");
    console.log(`LockVault: ${lockVaultDeployment.address}`);

    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("LockVault", lockVaultDeployment.address);

    const secret = await contract.getDatabaseSecret(taskArguments.database);
    const decryptedSecret = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      secret,
      lockVaultDeployment.address,
      signers[0],
    );

    console.log(`Decrypted secret for database ${taskArguments.database}: ${decryptedSecret}`);
  });

task("task:decrypt-entry", "Decrypts a specific entry and removes the secret offset")
  .addParam("database", "Database id")
  .addParam("index", "Entry index to decrypt")
  .addOptionalParam("address", "Override LockVault contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const lockVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("LockVault");
    console.log(`LockVault: ${lockVaultDeployment.address}`);

    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("LockVault", lockVaultDeployment.address);

    const entries = await contract.getEntries(taskArguments.database);
    const entry = entries[Number(taskArguments.index)];
    const secret = await contract.getDatabaseSecret(taskArguments.database);

    const decryptedEntry = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      entry,
      lockVaultDeployment.address,
      signers[0],
    );
    const decryptedSecret = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      secret,
      lockVaultDeployment.address,
      signers[0],
    );

    console.log(`Locked value: ${decryptedEntry}`);
    console.log(`Original value: ${BigInt(decryptedEntry) - BigInt(decryptedSecret)}`);
  });
