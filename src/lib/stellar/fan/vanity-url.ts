import { db } from "~/server/db"
import { addMonths } from 'date-fns'
import { type SignUserType, WithSing } from "../utils";
import { Horizon, Keypair, Operation, TransactionBuilder, } from "@stellar/stellar-sdk";
import { PLATFORM_ASSET, STELLAR_URL, TrxBaseFee, networkPassphrase } from "../constant";
import { MOTHER_SECRET } from "../marketplace/SECRET";


export async function getVanitySubscriptionXDR({
    amount,
    signWith,
    userPubKey,
}: {
    amount: number;
    signWith: SignUserType;
    userPubKey: string;
}) {
    const server = new Horizon.Server(STELLAR_URL);
    const motherAcc = Keypair.fromSecret(MOTHER_SECRET);
    const account = await server.loadAccount(motherAcc.publicKey());

    const transaction = new TransactionBuilder(account, {
        fee: TrxBaseFee,
        networkPassphrase,
    });

    transaction.addOperation(
        Operation.payment({
            destination: motherAcc.publicKey(),
            asset: PLATFORM_ASSET,
            amount: amount.toFixed(7).toString(),
            source: userPubKey,
        }),
    );
    transaction.setTimeout(0);

    const buildTrx = transaction.build();
    buildTrx.sign(motherAcc);
    const xdr = buildTrx.toXDR();


    const singedXdr = WithSing({ xdr, signWith });

    return singedXdr;
}


export async function createOrRenewVanitySubscription(
    {
        creatorId,
        isChanging,
        amount,
        vanityURL
    }: {
        creatorId: string;
        isChanging: boolean;
        amount: number;
        vanityURL: string
    }

) {
    const creator = await db.creator.findUnique({
        where: { id: creatorId },
        include: { vanitySubscription: true },
    })
    const now = new Date()
    const endDate = addMonths(now, 1)

    if (!creator) {
        throw new Error('Creator not found')
    }


    if (isChanging) {
        // Change vanity URL
        return db.creator.update({
            where: { id: creatorId },
            data: {
                vanityURL: vanityURL,
                vanitySubscription: {
                    update: {
                        lastPaymentAmount: amount,
                        lastPaymentDate: now,
                    },
                },
            },
        })
    }


    if (creator.vanitySubscription) {
        // Renew existing subscription
        return db.vanitySubscription.update({
            where: { id: creator.vanitySubscription.id },
            data: {
                endDate,
                lastPaymentAmount: amount,
                lastPaymentDate: now,

            },
        })
    }
    else {
        return db.creator.update({
            where: { id: creatorId },
            data: {
                vanityURL: vanityURL,
                vanitySubscription: {
                    create: {
                        endDate,
                        lastPaymentAmount: amount,
                        lastPaymentDate: now,
                    },
                },
            },
        })
    }
}

export async function checkAvailability(
    vanityURL: string

) {
    const existingCreator = await db.creator.findUnique({
        where: { vanityURL: vanityURL },
    });

    return { isAvailable: !existingCreator };
}

/** What a vanity URL costs: setting (or renewing, per month) and changing it. */
export const VANITY_PRICE =
    PLATFORM_ASSET.code.toLowerCase() === "wadzzo" ? { set: 200, change: 500 } : { set: 300000, change: 750000 };

export type VanityState = "none" | "active" | "expired";

export function vanityState(sub: { endDate: Date } | null | undefined): VanityState {
    if (!sub) return "none";
    return sub.endDate >= new Date() ? "active" : "expired";
}

/** Changing an active URL costs the change price; setting or renewing costs the monthly price. */
export function vanityPrice(state: VanityState) {
    return state === "active" ? VANITY_PRICE.change : VANITY_PRICE.set;
}

const PAYMENT_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Checks on the network that `txHash` is a successful payment of at least
 * `amount` platform asset from the creator to the platform account, made
 * after `after` (the last payment we accepted, so one payment can't be used
 * twice) and within the last hour.
 */
export async function verifyVanityPayment({
    txHash,
    creatorId,
    amount,
    after,
}: {
    txHash: string;
    creatorId: string;
    amount: number;
    after?: Date | null;
}) {
    const server = new Horizon.Server(STELLAR_URL);
    let tx: Horizon.ServerApi.TransactionRecord;
    try {
        tx = await server.transactions().transaction(txHash).call();
    } catch {
        throw new Error("We couldn't find your payment on the network yet. Try again in a moment.");
    }
    if (!tx.successful) throw new Error("That payment didn't go through.");

    const created = new Date(tx.created_at);
    if (after && created <= after) throw new Error("That payment has already been used.");
    if (Date.now() - created.getTime() > PAYMENT_MAX_AGE_MS) throw new Error("That payment is too old to use.");

    const platform = Keypair.fromSecret(MOTHER_SECRET).publicKey();
    const ops = await server.operations().forTransaction(txHash).call();
    const paid = ops.records.some((op) => {
        if (op.type !== Horizon.HorizonApi.OperationResponseType.payment) return false;
        const p = op;
        return (
            p.from === creatorId &&
            p.to === platform &&
            p.asset_code === PLATFORM_ASSET.code &&
            p.asset_issuer === PLATFORM_ASSET.issuer &&
            Number(p.amount) >= amount - 1e-7
        );
    });
    if (!paid) throw new Error("That transaction isn't the vanity URL payment.");
}
