import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { initFirebase } from "./lib/firebase";

const root = createRoot(document.getElementById("root")!);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

initFirebase()
  .then(async () => {
    const { App } = await import("./App");
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </StrictMode>,
    );
    if (!import.meta.env.DEV) registerSW({ immediate: true });
  })
  .catch((e) => {
    root.render(<p style={{ padding: 24 }}>Failed to start: {String(e)}</p>);
  });
