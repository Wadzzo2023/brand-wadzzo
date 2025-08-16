export interface BountyTypes {
    id: number;
    title: string;
    description: string;
    priceInUSD: number;
    priceInBand: number;
    requiredBalance: number;
    currentWinnerCount: number;
    imageUrls: string[];
    totalWinner: number;
    status: "PENDING" | "APPROVED" | "REJECTED";
    creatorId: string;
    _count: {
        participants: number;
        BountyWinner: number;
    }
    creator: {
        name: string;
        profileUrl: string | null;
    },
    BountyWinner: {
        user: {
            id: string;
        }
    }[],
    isJoined: boolean;
    isOwner: boolean;

}


export enum sortOptionEnum {
    DATE_ASC = "DATE_ASC",
    DATE_DESC = "DATE_DESC",
    PRICE_ASC = "PRICE_ASC",
    PRICE_DESC = "PRICE_DESC",
}
