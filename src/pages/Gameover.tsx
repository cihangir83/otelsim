import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { getUserData, loadUserDecisions } from '../services/firebase';

const GameOver: React.FC = () => {
    const navigate = useNavigate();

    // Kullanıcı metrikleri ve kararları
    const [userMetrics, setUserMetrics] = useState<any>(null);
    const [decisions, setDecisions] = useState<any[]>([]);
    const [reportText, setReportText] = useState<string>('Rapor hazırlanıyor...');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!auth.currentUser) {
                navigate('/');
                return;
            }
            setLoading(true);

            try {
                const userId = auth.currentUser.uid;

                // Kullanıcı verilerini çek
                const userData = await getUserData(userId);
                setUserMetrics(userData?.metrics ?? null);

                // Karar geçmişini çek
                const userDecisions = await loadUserDecisions(userId);
                setDecisions(userDecisions || []);

                // Basit bir rapor metni oluştur (dilerseniz API çağrısı yapabilirsiniz)
                const mockReport = `
Sayın kullanıcı,
Tebrikler! 10 turu başarıyla tamamladınız.

Son metrikleriniz:
- Gelir: ${userData?.metrics?.revenue}
- Müşteri Memnuniyeti: ${userData?.metrics?.customerSatisfaction}
- Personel Memnuniyeti: ${userData?.metrics?.staffSatisfaction}
- Doluluk Oranı: ${userData?.metrics?.occupancyRate}
- Sürdürülebilirlik: ${userData?.metrics?.sustainability}

Toplam karar sayısı: ${userDecisions.length}
Kararlarınız:
${userDecisions
                    .map(
                        (dec) =>
                            `Soru: ${dec.questionId}, Seçilen Opsiyon: ${dec.selectedOption}`
                    )
                    .join('\n')}
`;

                setReportText(mockReport);
            } catch (error) {
                console.error('Oyun bitiş verileri çekilirken hata oluştu:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [navigate]);

    if (loading) {
        return (
            <div
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f5f7fa',
                }}
            >
                <h2 style={{ color: '#1e3c72', marginBottom: '20px' }}>Oyun Bitti</h2>
                <p style={{ color: '#666', fontSize: '1.1em' }}>
                    Rapor hazırlanıyor, lütfen bekleyin...
                </p>
            </div>
        );
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#f5f7fa',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '40px',
            }}
        >
            <h2 style={{ color: '#1e3c72', marginBottom: '20px' }}>Oyun Bitti</h2>

            <p style={{ color: '#666', fontSize: '1.1em', marginBottom: '30px' }}>
                10 turu başarıyla tamamladınız! Raporunuz aşağıda hazırlanmıştır:
            </p>

            <div
                style={{
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    maxWidth: '600px',
                    width: '100%',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    marginBottom: '20px',
                }}
            >
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
          {reportText}
        </pre>
            </div>

            <button
                onClick={() => navigate('/')}
                style={{
                    padding: '10px 20px',
                    background: '#1e3c72',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                }}
            >
                Ana Menüye Dön
            </button>
        </div>
    );
};

export default GameOver;
