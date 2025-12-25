import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'LockVault',
  projectId: 'lockvault-proto-01',
  chains: [sepolia],
  ssr: false,
});
