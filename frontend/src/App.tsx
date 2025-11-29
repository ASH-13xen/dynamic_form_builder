import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import HomePage from "./pages/HomePage";
import CreateForm from "./pages/CreateForm";
import PublicForm from "./pages/PublicForm";
import ResponseList from "./pages/ResponseList"; // <--- 1. Import this

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<HomePage />} />
        <Route path="/create" element={<CreateForm />} />
        <Route path="/form/:formId/responses" element={<ResponseList />} />
        <Route path="/form/:formId" element={<PublicForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
