import { useSession } from "next-auth/react";
import Link from "next/link";
import React from "react";
import { Button } from "~/components/shadcn/ui/button";
import { WalletType } from "package/connect_wallet";
import { isRechargeAbleClient } from "~/utils/recharge/is-rechargeable-client";

export default function RechargeLink() {
    const session = useSession();
    const walletType = session.data?.user.walletType ?? WalletType.none;

    const isFBorGoogle = isRechargeAbleClient(walletType);
    if (isFBorGoogle)
        return (
            <Link className="  w-full" href={isFBorGoogle ? "/recharge" : "/"}>
                <Button className="shadow-sm shadow-black  w-full">Recharge</Button>
            </Link>
        );
}
