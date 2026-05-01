import { createRoot } from "react-dom/client";
import App from "./App";
import "quill/dist/quill.snow.css";
import "quill-mention/dist/quill.mention.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
