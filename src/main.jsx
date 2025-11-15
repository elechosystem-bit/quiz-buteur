import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import Admin from "./pages/Admin.jsx";
import SuperAdmin from "./pages/SuperAdmin.jsx";
import TestSimulation from "./TestSimulation.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/superadmin" element={<SuperAdmin />} />
        <Route path="/test-simulation" element={<TestSimulation />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);