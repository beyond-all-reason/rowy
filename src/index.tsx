import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import Providers from "./Providers";
import App from "./App";

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(
  // <StrictMode>
  <Providers>
    <App />
  </Providers>
  // </StrictMode>
);
