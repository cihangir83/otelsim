import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase/config';
import { getUserData, loadUserDecisions } from '../services/firebase';

const GameOver: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // URL'den gameId'yi al
    const queryParams = new URLSearchParams(location.search);
    const gameIdFromUrl = queryParams.get('gameId');

    // State tanımlamaları
    const [reportText, setReportText] = useState<string>('Rapor hazırlanıyor...');
    const [loading, setLoading] = useState(true);
    const [gameId] = useState<string | null>(gameIdFromUrl);

    // Yapay Zeka Analizi için yeni state'ler
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
    const [showAiAnalysis, setShowAiAnalysis] = useState(false);
    const [allDecisions, setAllDecisions] = useState<any[]>([]);

    // Kararları günlere göre grupla
    const groupDecisionsByDay = (decisions: any[]) => {
        const grouped: { [key: string]: any[] } = {};

        decisions.forEach(decision => {
            const day = decision.day !== undefined && decision.day !== null
                ? decision.day.toString()
                : '?';

            if (!grouped[day]) {
                grouped[day] = [];
            }
            grouped[day].push(decision);
        });

        return grouped;
    };

    // Detaylı rapor oluştur
    const generateDetailedReport = (groupedDecisions: any, metrics: any) => {
        let report = `
=== OYUN SONU RAPORU ===

Son Metrikleriniz:
- Gelir: ${metrics?.revenue || '?'}%
- Müşteri Memnuniyeti: ${metrics?.customerSatisfaction || '?'}%
- Personel Memnuniyeti: ${metrics?.staffSatisfaction || '?'}%
- Doluluk Oranı: ${metrics?.occupancyRate || '?'}%
- Sürdürülebilirlik: ${metrics?.sustainability || '?'}%

-----------------------

10 TUR BOYUNCA KARARLARINIZ:
`;

        // Her tur/gün için detaylı rapor
        Object.keys(groupedDecisions)
            .sort((a, b) => {
                // "?" karakterini içerenleri sona at
                if (a === '?') return 1;
                if (b === '?') return -1;
                return Number(a) - Number(b);
            })
            .forEach(day => {
                const dayDecisions = groupedDecisions[day];

                report += `\n=== GÜN ${day} ===\n`;

                dayDecisions.forEach((decision: any, index: number) => {
                    report += `\nSenaryo ${index + 1}: `;

                    // Eğer scenarioText kaydedilmişse göster
                    if (decision.scenarioText) {
                        report += `"${decision.scenarioText}"\n`;
                    } else {
                        report += `(Senaryo #${decision.questionId})\n`;
                    }

                    // Eğer selectedOptionText kaydedilmişse göster
                    if (decision.selectedOptionText) {
                        report += `Seçiminiz: "${decision.selectedOptionText}"\n`;
                    } else {
                        report += `Seçilen Opsiyon: ${decision.selectedOption + 1}\n`;
                    }

                    // Etki bilgilerini ekle
                    if (decision.metrics && decision.metrics.before && decision.metrics.after) {
                        report += 'Kararınızın Etkileri:\n';

                        const before = decision.metrics.before;
                        const after = decision.metrics.after;

                        Object.keys(before).forEach(key => {
                            const metricName = key === 'revenue' ? 'Gelir' :
                                key === 'customerSatisfaction' ? 'Müşteri Memnuniyeti' :
                                    key === 'staffSatisfaction' ? 'Personel Memnuniyeti' :
                                        key === 'occupancyRate' ? 'Doluluk Oranı' :
                                            key === 'sustainability' ? 'Sürdürülebilirlik' : key;

                            const change = after[key] - before[key];
                            const changeSymbol = change > 0 ? '↑' : change < 0 ? '↓' : '→';

                            report += `  ${metricName}: ${before[key]}% → ${after[key]}% (${changeSymbol}${Math.abs(change)}%)\n`;
                        });
                    }

                    report += '--------------------------\n';
                });
            });

        return report;
    };

    // Yapay Zeka Analizi için özet veri oluştur
    const generateAIAnalysisData = (decisions: any[]) => {
        let analysisData = `# Otel Yönetim Simülasyonu - Karar Analizi\n\n`;

        // Kararları günlere göre gruplandır
        const groupedDecisions = groupDecisionsByDay(decisions);

        // Her gün için kararları analiz et
        Object.keys(groupedDecisions)
            .sort((a, b) => {
                if (a === '?') return 1;
                if (b === '?') return -1;
                return Number(a) - Number(b);
            })
            .forEach(day => {
                const dayDecisions = groupedDecisions[day];

                analysisData += `## GÜN ${day}\n\n`;

                dayDecisions.forEach((decision: any, index: number) => {
                    analysisData += `### Senaryo ${index + 1}\n`;

                    // Senaryo metni
                    if (decision.scenarioText) {
                        analysisData += `**Durum:** ${decision.scenarioText}\n\n`;
                    }

                    // Oyuncunun seçtiği seçenek
                    if (decision.selectedOptionText) {
                        analysisData += `**Oyuncunun Seçimi:** ${decision.selectedOptionText}\n\n`;
                    }

                    analysisData += `---\n\n`;
                });
            });

        return analysisData;
    };

    // Yapay Zeka Analizi istek gönderme fonksiyonu
    // analyzeGameWithAI fonksiyonunu Mistral API ile güncelleme
    const analyzeGameWithAI = async () => {
        if (allDecisions.length === 0) {
            alert('Analiz için veri bulunamadı!');
            return;
        }

        setIsAnalyzing(true);
        try {
            // Analiz için veri hazırla
            const analysisData = generateAIAnalysisData(allDecisions);

            // Mistral prompt hazırla
            const prompt = `
Sen bir otel yönetim uzmanısın. Aşağıda bir otel yönetim simülasyonu oyununun 10 turluk karar özeti verilmiştir.
Bu kararlara dayanarak oyuncunun otel yönetim performansını analiz et.

Şu başlıklar altında analiz yap:
1. Genel Performans Değerlendirmesi
2. Güçlü Yönler
3. Geliştirilmesi Gereken Alanlar
4. Karar Trendleri ve Tutarlılık
5. Tavsiyeler

Özellikle dikkat edilmesi gereken hususlar:
- Hangi kararlarda daha iyi seçimler yapılabilirdi?
- Oyuncu hangi tür kararlarında daha başarılı?
- Oyuncunun genel yönetim yaklaşımı nasıl?
- Daha iyi bir otel yöneticisi olmak için spesifik tavsiyeler nelerdir?

Analizin maksimum 700 kelime uzunluğunda olsun ve oyuncuya yararlı, yapıcı geri bildirimler içersin.

İŞTE OYUNCUNUN KARARLARI:

${analysisData}
`;

            // Mistral API isteği gönder
            const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer x14dK9qhpwT46kS5yh8zCz1pS8KnpRhF'
                },
                body: JSON.stringify({
                    model: "mistral-tiny", // mistral-tiny, mistral-small, mistral-medium
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 1024
                })
            });

            const data = await response.json();

            // API yanıtını kontrol et ve işle
            if (data.choices && data.choices.length > 0 &&
                data.choices[0].message &&
                data.choices[0].message.content) {

                const analysisText = data.choices[0].message.content;
                setAiAnalysisResult(analysisText);
                setShowAiAnalysis(true);
            } else {
                console.error('API yanıtı:', data);
                throw new Error('API yanıtı beklenen formatta değil');
            }
        } catch (error) {
            console.error('Yapay zeka analizi sırasında hata:', error);
            setAiAnalysisResult('Analiz yapılırken bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
            setShowAiAnalysis(true);
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!auth.currentUser) {
                navigate('/');
                return;
            }
            setLoading(true);

            try {
                const userId = auth.currentUser.uid;

                // 1. Oyun ID'sini kontrol et
                let currentGameId = gameId;
                if (!currentGameId) {
                    // Eğer URL'den alınamadıysa, localStorage'dan al
                    currentGameId = localStorage.getItem('currentGameId');
                }

                if (!currentGameId) {
                    throw new Error('Oyun ID bulunamadı');
                }

                // 2. Kullanıcı verilerini çek
                const userData = await getUserData(userId);
                const metrics = userData?.metrics;

                // 3. Karar geçmişini çek
                const userDecisions = await loadUserDecisions(userId);

                // Eğer gameId varsa, sadece o oyuna ait kararları filtrele
                const filteredDecisions = currentGameId
                    ? userDecisions.filter(d => d.gameId === currentGameId)
                    : userDecisions;

                // Yapay zeka analizi için kararları sakla
                setAllDecisions(filteredDecisions);

                // 4. Kararları günlere göre grupla
                const grouped = groupDecisionsByDay(filteredDecisions);

                // 5. Detaylı rapor oluştur
                const detailedReport = generateDetailedReport(grouped, metrics);
                setReportText(detailedReport);

            } catch (error) {
                console.error('Oyun bitiş verileri çekilirken hata oluştu:', error);
                setReportText('Rapor oluşturulurken bir hata oluştu: ' + (error as Error).message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [navigate, gameId]);

    // Başka bir oyuna başla
    const startNewGame = () => {
        // Mevcut oyun ID'sini temizle
        localStorage.removeItem('currentGameId');
        // Oyuncu kaldığı yere geri dönsün - genellikle setup sayfasına
        navigate('/game-setup');
    };

    // Analiz modalını kapat
    const closeAnalysis = () => {
        setShowAiAnalysis(false);
    };

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
                10 turu başarıyla tamamladınız! Detaylı raporunuz aşağıdadır:
            </p>

            <div
                style={{
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    maxWidth: '800px',
                    width: '100%',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    marginBottom: '20px',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                }}
            >
                <pre style={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    fontSize: '0.95em',
                    lineHeight: '1.5'
                }}>
                    {reportText}
                </pre>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                <button
                    onClick={() => {
                        const blob = new Blob([reportText], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'otel_yonetimi_raporu.txt';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    }}
                    style={{
                        padding: '10px 20px',
                        background: '#4caf50',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                    }}
                >
                    Raporu İndir
                </button>

                <button
                    onClick={analyzeGameWithAI}
                    disabled={isAnalyzing}
                    style={{
                        padding: '10px 20px',
                        background: '#9c27b0',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    {isAnalyzing ? (
                        <>
                            <span style={{
                                display: 'inline-block',
                                width: '16px',
                                height: '16px',
                                border: '3px solid rgba(255,255,255,0.3)',
                                borderRadius: '50%',
                                borderTopColor: 'white',
                                animation: 'spin 1s linear infinite'
                            }}></span>
                            Analiz Yapılıyor...
                        </>
                    ) : '🧠 Yapay Zeka Analizi'}
                </button>

                <button
                    onClick={startNewGame}
                    style={{
                        padding: '10px 20px',
                        background: '#2196f3',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                    }}
                >
                    Yeni Oyun Başlat
                </button>

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

            {/* Yapay Zeka Analiz Sonucu Modalı */}
            {showAiAnalysis && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        background: 'white',
                        borderRadius: '12px',
                        padding: '30px',
                        maxWidth: '800px',
                        width: '90%',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        position: 'relative'
                    }}>
                        <button
                            onClick={closeAnalysis}
                            style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                background: 'transparent',
                                border: 'none',
                                fontSize: '20px',
                                cursor: 'pointer',
                                color: '#666'
                            }}
                        >
                            ✕
                        </button>

                        <h2 style={{ color: '#9c27b0', marginBottom: '20px', textAlign: 'center' }}>
                            🧠 Yapay Zeka Performans Analizi
                        </h2>

                        <div style={{
                            fontSize: '1em',
                            lineHeight: '1.6',
                            color: '#333',
                            whiteSpace: 'pre-wrap'
                        }}>
                            {aiAnalysisResult}
                        </div>

                        <div style={{ textAlign: 'center', marginTop: '20px' }}>
                            <button
                                onClick={() => {
                                    if (aiAnalysisResult) {
                                        const blob = new Blob([aiAnalysisResult], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = 'otel_yonetimi_ai_analizi.txt';
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                    }
                                }}
                                style={{
                                    padding: '10px 20px',
                                    background: '#9c27b0',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                }}
                            >
                                Analizi İndir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CSS Animation for Spinner */}
            <style>
                {`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                `}
            </style>
        </div>
    );
};

export default GameOver;
