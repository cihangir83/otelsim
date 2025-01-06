import React from 'react';
import PropTypes from 'prop-types';
import { Hotel, Users, TrendingUp, Shield } from 'lucide-react';
import './IntroPage.css';

const IntroPage = ({ onStartGame }) => {
    return (
        <div className="intro-container">
            <div className="intro-content">
                <div className="intro-header">
                    <div className="intro-icon">
                        <Hotel size={48} color="#3182ce" />
                    </div>
                    <h1 className="intro-title">Otel Simülasyonu</h1>
                    <p className="intro-subtitle">
                        Kendi otelinizi yönetin, stratejik kararlar alın ve başarıya ulaşın!
                    </p>
                </div>

                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-icon">
                            <Users size={24} color="#3182ce" />
                        </div>
                        <h3>Müşteri Yönetimi</h3>
                        <p>Farklı müşteri tipleriyle etkileşime geçin ve taleplerini değerlendirin.</p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">
                            <Shield size={24} color="#3182ce" />
                        </div>
                        <h3>Kriz Yönetimi</h3>
                        <p>Beklenmedik olaylarla başa çıkın ve otelinizi koruyun.</p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">
                            <TrendingUp size={24} color="#3182ce" />
                        </div>
                        <h3>Kaynak Yönetimi</h3>
                        <p>Kaynakları akıllıca kullanın ve otelinizi büyütün.</p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">
                            <Hotel size={24} color="#3182ce" />
                        </div>
                        <h3>Otel İşletmeciliği</h3>
                        <p>Müşteri memnuniyeti ve bütçe dengesi ile başarıya ulaşın.</p>
                    </div>
                </div>

                <button className="start-button" onClick={onStartGame}>
                    Oyuna Başla
                </button>
            </div>
        </div>
    );
};

IntroPage.propTypes = {
    onStartGame: PropTypes.func.isRequired
};

export default IntroPage;