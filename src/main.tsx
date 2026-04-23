import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Popover } from "./components/Popover";
import { getCurrentWindow } from "@tauri-apps/api/window";

const label = getCurrentWindow().label;
const Root = label === "popover" ? Popover : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
