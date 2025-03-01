import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GameLogin from './pages/GameLogin';
import GameSetup from './pages/GameSetup';
import GameDashboard from './pages/GameDashboard';
import GameOver from "./pages/Gameover";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/admin" element={<Login />} />
                <Route path="/admin/dashboard" element={<Dashboard />} />
                <Route path="/" element={<GameLogin />} />
                <Route path="/game-setup" element={<GameSetup />} />
                <Route path="/game-dashboard" element={<GameDashboard />} />
                <Route path="/game-over" element={<GameOver />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;