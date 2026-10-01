import { create } from "zustand";

/** The brand an admin is working on (All maps, admin new pin / hotspot). */
export type SelectedCreator = { id: string; name: string; profileUrl: string | null };

interface SelectCreatorProps {
  data?: SelectedCreator;
  setData: (data: SelectedCreator) => void;
}

export const useSelectCreatorStore = create<SelectCreatorProps>((set) => ({ data: undefined, setData: (data) => set({ data }) }));
