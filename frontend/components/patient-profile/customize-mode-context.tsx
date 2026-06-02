"use client";

import { createContext, useContext } from "react";

/** cpfc-01 — read by ShellPaneHeader, PaneTabStrip, and PaneDropOverlay mount. */
const CustomizeModeContext = createContext(false);

export const useCustomizeMode = () => useContext(CustomizeModeContext);

export { CustomizeModeContext };
