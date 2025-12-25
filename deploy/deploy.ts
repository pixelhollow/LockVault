import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedLockVault = await deploy("LockVault", {
    from: deployer,
    log: true,
  });

  console.log(`LockVault contract: `, deployedLockVault.address);
};
export default func;
func.id = "deploy_lockVault"; // id required to prevent reexecution
func.tags = ["LockVault"];
