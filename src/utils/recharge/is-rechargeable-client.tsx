import { WalletType } from "package/connect_wallet";

export function isRechargeAbleClient(walletType: WalletType): boolean {
    return (
        walletType == WalletType.facebook ||
        walletType == WalletType.google ||
        walletType == WalletType.emailPass ||
        walletType == WalletType.apple
    );
}