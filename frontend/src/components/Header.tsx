import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="brand">
          <div className="brand-mark">LV</div>
          <div>
            <p className="brand-title">LockVault</p>
            <p className="brand-subtitle">Encrypted database playground</p>
          </div>
        </div>
        <ConnectButton chainStatus="icon" />
      </div>
    </header>
  );
}
