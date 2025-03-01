import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

const GameLogin = () => {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: ''  // Sadece kayıt için
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, formData.email, formData.password);
            } else {
                await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                // Burada kullanıcı adını da Firebase'e kaydedebiliriz
            }
            navigate('/game-setup');
        } catch (error: any) {
            setError(isLogin ? 'Giriş başarısız!' : 'Kayıt başarısız!');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="game-login">
            <div className="game-login-content">
                <div className="game-info">
                    <h1>Otel Yönetim Simulasyonu</h1>
                    <p>Gerçek otel senaryolarıyla yönetim deneyimi kazanın!</p>
                    <div className="feature-list">
                        <div className="feature-item">
                            <span className="feature-icon">🏨</span>
                            <p>Farklı otel tipleri</p>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">🎯</span>
                            <p>Gerçekçi senaryolar</p>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">📈</span>
                            <p>Performans takibi</p>
                        </div>
                    </div>
                </div>

                <div className="game-login-form">
                    <h2>{isLogin ? 'Oyuna Giriş' : 'Yeni Kayıt'}</h2>
                    <form onSubmit={handleSubmit}>
                        {!isLogin && (
                            <div className="form-group">
                                <label>İsim Soyisim</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    required
                                />
                            </div>
                        )}
                        <div className="form-group">
                            <label>E-posta</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({...formData, email: e.target.value})}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Şifre</label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({...formData, password: e.target.value})}
                                required
                            />
                        </div>
                        {error && <div className="error-message">{error}</div>}
                        <button type="submit" disabled={loading}>
                            {loading ? 'İşlem yapılıyor...' : (isLogin ? 'Giriş Yap' : 'Kayıt Ol')}
                        </button>
                    </form>
                    <button
                        className="toggle-form"
                        onClick={() => setIsLogin(!isLogin)}
                    >
                        {isLogin ? 'Yeni hesap oluştur' : 'Giriş yap'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GameLogin;