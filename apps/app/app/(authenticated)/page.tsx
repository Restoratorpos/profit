import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ProFit",
  description: "Gym management.",
};

/**
 * Intentionally empty — the shell is built, pages land one at a time.
 * Deliberately renders no text: anything hardcoded here would be untranslated
 * and contradict the language switcher.
 */
const App = () => <div className="flex-1" />;

export default App;
