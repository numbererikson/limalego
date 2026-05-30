import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import Home from "./pages/Home";
import SetSearch from "./pages/SetSearch";
import SetDetail from "./pages/SetDetail";
import Scan from "./pages/Scan";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<SetSearch />} />
        <Route path="/set/:setNum" element={<SetDetail />} />
        <Route path="/scan/:setNum" element={<Scan />} />
        <Route path="/scan"         element={<Scan />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
