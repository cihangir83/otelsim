import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {auth, db} from '../firebase/config';
import { createNewUser, getInitialMetrics } from '../services/firebase';
import {doc, getDoc} from "firebase/firestore";

const GameSetup = () => {
    const navigate = useNavigate();
    const [selectedHotel, setSelectedHotel] = useState('');
    const [selectedRole, setSelectedRole] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const hotelTypes = [
        {
            id: '5_star',
            name: '5 Yıldızlı Otel',
            icon: '🏨',
            description: 'Lüks hizmet, tam donanımlı tesisler'
        },
        {
            id: 'boutique',
            name: 'Butik Otel',
            icon: '🏰',
            description: 'Özel konsept, kişiselleştirilmiş deneyim'
        },
        {
            id: 'resort',
            name: 'Tatil Köyü',
            icon: '🌴',
            description: 'Geniş aktivite yelpazesi, eğlence merkezi'
        }
    ];

    const roles = [
        {
            id: 'reservation',
            name: 'Rezervasyon Müdürü',
            icon: '📅',
            description: 'Doluluk oranını optimize edin'
        },
        {
            id: 'customer_relations',
            name: 'Müşteri İlişkileri Yöneticisi',
            icon: '🤝',
            description: 'Misafir memnuniyetini en üst düzeye çıkarın'
        },
        {
            id: 'operations',
            name: 'Operasyon Müdürü',
            icon: '⚙️',
            description: 'Günlük operasyonları yönetin'
        },
        {
            id: 'financial',
            name: 'Gelir Yöneticisi',
            icon: '💰',
            description: 'Karlılığı maksimize edin'
        },
        {
            id: 'hr',
            name: 'Personel Müdürü',
            icon: '👥',
            description: 'Ekip performansını artırın'
        }
    ];

    const handleGameStart = async () => {
        if (!selectedHotel || !selectedRole || !auth.currentUser) {
            return;
        }

        setIsLoading(true);
        try {
            // Yeni kullanıcı verisi oluştur
            const hotelRef = doc(db, "hotelMetrics", selectedHotel);
            const hotelSnap = await getDoc(hotelRef);
            const hotelMetrics = hotelSnap.exists() ? hotelSnap.data().metrics : getInitialMetrics(); // 🔥 Eğer Firestore'da varsa, onu al

            await createNewUser(auth.currentUser.uid, {
                email: auth.currentUser.email || '',
                name: auth.currentUser.displayName || '',
                currentRole: selectedRole,
                hotelType: selectedHotel,
                currentDay: 1,
                completedScenarios: 0,
                metrics: hotelMetrics,  // 🔥 Firestore'dan gelen metrikleri kullan
                achievements: []
            });


            // Oyun ayarlarını localStorage'a kaydet
            localStorage.setItem('gameSetup', JSON.stringify({
                hotelType: selectedHotel,
                role: selectedRole
            }));

            // Oyun dashboard'una yönlendir
            navigate('/game-dashboard');
        } catch (error) {
            console.error('Oyun başlatma hatası:', error);
            alert('Oyun başlatılırken bir hata oluştu!');
        } finally {
            setIsLoading(false);
        }
    };
    console.log("📌 localStorage 'gameSetup' içeriği:", localStorage.getItem("gameSetup"));

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
            padding: '40px 20px'
        }}>
            <div style={{
                maxWidth: '1000px',
                margin: '0 auto',
                background: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '20px',
                padding: '40px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
            }}>
                <h1 style={{
                    color: '#1e3c72',
                    textAlign: 'center',
                    fontSize: '2.5em',
                    marginBottom: '40px',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.1)'
                }}>
                    Otel Yönetim Simulasyonu
                </h1>

                <div style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        color: '#2a5298',
                        marginBottom: '20px',
                        fontSize: '1.8em'
                    }}>
                        Otel Tipini Seçin
                    </h2>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '20px'
                    }}>
                        {hotelTypes.map(hotel => (
                            <div
                                key={hotel.id}
                                onClick={() => setSelectedHotel(hotel.id)}
                                style={{
                                    padding: '25px',
                                    borderRadius: '15px',
                                    background: selectedHotel === hotel.id ? 'linear-gradient(135deg, #2193b0, #6dd5ed)' : 'white',
                                    color: selectedHotel === hotel.id ? 'white' : '#333',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                                    transform: selectedHotel === hotel.id ? 'translateY(-5px)' : 'none',
                                    transition: 'all 0.3s ease',
                                    border: '2px solid transparent',
                                    borderColor: selectedHotel === hotel.id ? '#fff' : 'transparent'
                                }}
                            >
                                <div style={{ fontSize: '40px', marginBottom: '15px' }}>{hotel.icon}</div>
                                <h3 style={{ marginBottom: '10px', fontSize: '1.3em' }}>{hotel.name}</h3>
                                <p style={{ opacity: 0.9 }}>{hotel.description}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        color: '#2a5298',
                        marginBottom: '20px',
                        fontSize: '1.8em'
                    }}>
                        Rolünüzü Seçin
                    </h2>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '20px'
                    }}>
                        {roles.map(role => (
                            <div
                                key={role.id}
                                onClick={() => setSelectedRole(role.id)}
                                style={{
                                    padding: '20px',
                                    borderRadius: '15px',
                                    background: selectedRole === role.id ? 'linear-gradient(135deg, #2193b0, #6dd5ed)' : 'white',
                                    color: selectedRole === role.id ? 'white' : '#333',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                                    transform: selectedRole === role.id ? 'translateY(-5px)' : 'none',
                                    transition: 'all 0.3s ease',
                                    border: '2px solid transparent',
                                    borderColor: selectedRole === role.id ? '#fff' : 'transparent'
                                }}
                            >
                                <div style={{ fontSize: '30px', marginBottom: '10px' }}>{role.icon}</div>
                                <h3 style={{ marginBottom: '8px', fontSize: '1.2em' }}>{role.name}</h3>
                                <p style={{ fontSize: '0.9em', opacity: 0.9 }}>{role.description}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleGameStart}
                    disabled={!selectedHotel || !selectedRole || isLoading}
                    style={{
                        width: '100%',
                        padding: '20px',
                        fontSize: '1.2em',
                        borderRadius: '12px',
                        border: 'none',
                        background: selectedHotel && selectedRole && !isLoading
                            ? 'linear-gradient(135deg, #1e3c72, #2a5298)'
                            : '#cccccc',
                        color: 'white',
                        cursor: selectedHotel && selectedRole && !isLoading ? 'pointer' : 'not-allowed',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                        transform: selectedHotel && selectedRole ? 'translateY(0)' : 'none'
                    }}
                >
                    {isLoading
                        ? '⏳ Oyun Başlatılıyor...'
                        : (selectedHotel && selectedRole
                            ? '🎮 Oyuna Başla'
                            : 'Lütfen seçimlerinizi tamamlayın')}
                </button>
            </div>
        </div>
    );
};

export default GameSetup;