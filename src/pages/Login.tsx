import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { signInWithEmailAndPassword } from 'firebase/auth';

const Login = () => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            await signInWithEmailAndPassword(auth, "admin@otelsim.com", password);
            console.log("Admin login başarılı"); // Debug log
            navigate('/admin/dashboard'); // Doğru yönlendirme
        } catch (err) {
            console.error("Login error:", err); // Debug log
            setError('Giriş başarısız. Lütfen şifrenizi kontrol edin.');
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h2 className="login-title">Otel Simulasyon Admin Paneli</h2>
                <form onSubmit={handleSubmit}>
                    <input
                        type="password"
                        className="input-field"
                        placeholder="Şifre"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                    />
                    {error && <div className="error-message">{error}</div>}
                    <button
                        type="submit"
                        className="login-button"
                        disabled={loading}
                    >
                        {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;