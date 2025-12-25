import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { LockVault, LockVault__factory } from "../types";

type Signers = {
  owner: HardhatEthersSigner;
  other: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("LockVault")) as LockVault__factory;
  const lockVault = (await factory.deploy()) as LockVault;
  const contractAddress = await lockVault.getAddress();

  return { lockVault, contractAddress };
}

describe("LockVault", function () {
  let signers: Signers;
  let lockVault: LockVault;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { owner: ethSigners[0], other: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    ({ lockVault, contractAddress } = await deployFixture());
  });

  it("creates a database and stores the encrypted secret", async function () {
    const secretValue = 654321;
    const encryptedSecret = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .add32(secretValue)
      .encrypt();

    const tx = await lockVault
      .connect(signers.owner)
      .createDatabase("Personal vault", encryptedSecret.handles[0], encryptedSecret.inputProof);
    const receipt = await tx.wait();
    expect(receipt?.status).to.eq(1);

    const database = await lockVault.getDatabase(1);

    expect(database[0]).to.eq("Personal vault");
    expect(database[1]).to.eq(signers.owner.address);

    const decryptedSecret = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      database[2],
      contractAddress,
      signers.owner,
    );
    expect(decryptedSecret).to.eq(secretValue);
  });

  it("locks entries with the database secret and tracks owner ids", async function () {
    const secretValue = 123456;
    const entryValue = 77n;

    const encryptedSecret = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .add32(secretValue)
      .encrypt();

    await lockVault
      .connect(signers.owner)
      .createDatabase("Numbers", encryptedSecret.handles[0], encryptedSecret.inputProof);

    const encryptedEntry = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .add64(entryValue)
      .encrypt();

    await lockVault
      .connect(signers.owner)
      .storeEntry(1, encryptedEntry.handles[0], encryptedEntry.inputProof);

    const ids = await lockVault.getDatabaseIds(signers.owner.address);
    expect(ids.length).to.eq(1);
    expect(ids[0]).to.eq(1);

    const entries = await lockVault.getEntries(1);
    expect(entries.length).to.eq(1);

    const decryptedSecret = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      (await lockVault.getDatabase(1))[2],
      contractAddress,
      signers.owner,
    );
    const decryptedEntry = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      entries[0],
      contractAddress,
      signers.owner,
    );

    expect(BigInt(decryptedEntry) - BigInt(decryptedSecret)).to.eq(entryValue);
  });

  it("restricts entry storage to the database owner", async function () {
    const encryptedSecret = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .add32(111111)
      .encrypt();

    await lockVault
      .connect(signers.owner)
      .createDatabase("Team", encryptedSecret.handles[0], encryptedSecret.inputProof);

    const encryptedEntry = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .add64(5)
      .encrypt();

    await expect(
      lockVault.connect(signers.other).storeEntry(1, encryptedEntry.handles[0], encryptedEntry.inputProof),
    )
      .to.be.revertedWithCustomError(lockVault, "NotDatabaseOwner")
      .withArgs(signers.other.address);
  });
});
