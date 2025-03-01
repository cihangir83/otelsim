import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import QuestionForm from '../components/QuestionForm';
import QuestionList from '../components/QuestionList';
import MetricsManager from '../components/MetricsManager';
import HotelList from '../components/HotelList';

const Dashboard = () => {
    const navigate = useNavigate();
    const [activeSection, setActiveSection] = useState('questions');
    const [showQuestionForm, setShowQuestionForm] = useState(false);

    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate('/');
        } catch (error) {
            console.error('Çıkış yapılırken hata oluştu:', error);
        }
    };

    return (
        <div className="dashboard-container">
            {/* Sol Menü */}
            <div className="sidebar">
                <div className="logo">Otel Simulasyon Admin</div>
                <nav>
                    <button
                        className={activeSection === 'questions' ? 'active' : ''}
                        onClick={() => {
                            setActiveSection('questions');
                            setShowQuestionForm(false);
                        }}
                    >
                        Soru/Senaryo Yönetimi
                    </button>
                    <button
                        className={activeSection === 'metrics' ? 'active' : ''}
                        onClick={() => {
                            setActiveSection('metrics');
                            setShowQuestionForm(false);
                        }}
                    >
                        Metrik Yönetimi
                    </button>
                </nav>
                <button className="logout-button" onClick={handleLogout}>
                    Çıkış Yap
                </button>
            </div>

            {/* Ana İçerik Alanı */}
            <div className="main-content">
                {activeSection === 'questions' && (
                    <div className="questions-section">
                        <div className="section-header">
                            <h2>Soru/Senaryo Yönetimi</h2>
                            <button
                                className="add-button"
                                onClick={() => setShowQuestionForm(!showQuestionForm)}
                            >
                                {showQuestionForm ? 'Soru Listesi' : 'Yeni Soru Ekle'}
                            </button>
                        </div>

                        {showQuestionForm ? (
                            <QuestionForm />
                        ) : (
                            <QuestionList />
                        )}
                    </div>
                )}

                {/* Metrik Yönetimi + Otel Listesi */}
                {activeSection === 'metrics' && (
                    <div className="metrics-section">
                        <h2>Metrik Yönetimi</h2>
                        <MetricsManager />

                        {/* Buraya HotelList ekliyoruz */}
                        <div style={{ marginTop: '2rem' }}>
                            <h2>Kayıtlı Oteller</h2>
                            <HotelList />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
