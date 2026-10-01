import { create } from "zustand";

interface AutoSuggestionStore {
  selectedPlace: { lat: number; lng: number } | null;
  setSelectedPlace: (place: { lat: number; lng: number } | null) => void;
}
export const useSelectedAutoSuggestion = create<AutoSuggestionStore>((set) => ({
  selectedPlace: null,
  setSelectedPlace: (place) => set({ selectedPlace: place }),
}));
