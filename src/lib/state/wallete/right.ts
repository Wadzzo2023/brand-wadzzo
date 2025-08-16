import { create } from "zustand";
import { AdminAssetWithTag } from "../play/use-modal-store";

interface RightState {
  open: boolean;
  currentData?: AdminAssetWithTag;
  setOpen: (value: boolean) => void;
  setData: (value?: AdminAssetWithTag) => void;
}

export const useRightStore = create<RightState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  setData: (currentData) => set({ currentData }),
}));
