import { createContext, useContext } from "react";

// How the generic renderer navigates to another object (a reference field's
// target, a Lists-section entry, a list member row) without needing to know
// how routing works. The composition root (App.tsx) provides the real
// implementation once react-router is wired in; until then this is a no-op
// so components can be built and used independently of that.
export const NavigateToObjectContext = createContext<(objectType: string, id: number) => void>(
  () => {
    // No-op until the composition root provides real navigation.
  }
);

export function useNavigateToObject() {
  return useContext(NavigateToObjectContext);
}
