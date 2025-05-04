import React, { useEffect, useState, useCallback } from 'react'; // useCallback import edildi
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase/config';
// *** Doğru servis fonksiyonunu import ettiğinizden emin olun ***
import { getUserData, loadUserDecisions } from '../services/firebase';
// *** UserDecision tipinin baoScore içerdiğinden emin olun ***
import { UserDecision, MetricValues, UserData } from '../types/firebase'; // Tipleri import et

const GameOver: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // URL'den gameId'yi al
    const queryParams = new URLSearchParams(location.search);
    const gameIdFromUrl = queryParams.get('gameId');

    // State tanımlamaları
    const [reportText, setReportText] = useState<string>('Rapor hazırlanıyor...');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null); // Hata state'i eklendi
    // gameId state'ini URL'den alınan değerle başlat
    const [gameId] = useState<string | null>(gameIdFromUrl);
    const [userData, setUserData] = useState<UserData | null>(null); // Kullanıcı verisi için state
    const [userDecisions, setUserDecisions] = useState<UserDecision[]>([]); // Kararlar için state

    // Yapay Zeka Analizi için state'ler
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
    const [showAiAnalysis, setShowAiAnalysis] = useState(false);

    // Kararları günlere göre grupla (Tip güvenliği artırıldı)
    const groupDecisionsByDay = (decisions: UserDecision[]) => {
        const grouped: { [key: string]: UserDecision[] } = {}; // Anahtar string, değer UserDecision dizisi

        decisions.forEach(decision => {
            // decision.day null veya undefined ise '?' kullan, değilse string'e çevir
            const day = decision.day !== undefined && decision.day !== null
                ? String(decision.day)
                : '?';

            if (!grouped[day]) {
                grouped[day] = [];
            }
            grouped[day].push(decision);
        });

        return grouped;
    };

    // Detaylı rapor oluştur (Tip güvenliği artırıldı)
    const generateDetailedReport = useCallback((groupedDecisions: { [key: string]: UserDecision[] }, metrics: MetricValues | undefined | null) => {
        let report = `
=== OYUN SONU RAPORU ===

Son Metrikleriniz:
- Gelir: ${metrics?.revenue ?? '?'}%
- Müşteri Memnuniyeti: ${metrics?.customerSatisfaction ?? '?'}%
- Personel Memnuniyeti: ${metrics?.staffSatisfaction ?? '?'}%
- Doluluk Oranı: ${metrics?.occupancyRate ?? '?'}%
- Sürdürülebilirlik: ${metrics?.sustainability ?? '?'}%

-----------------------

${Object.keys(groupedDecisions).length > 0 ? '10 TUR BOYUNCA KARARLARINIZ:' : 'Oyun boyunca hiç karar verilmedi.'}
`;

        // Günleri sayısal olarak sırala, '?' olanları sona at
        Object.keys(groupedDecisions)
            .sort((a, b) => {
                const numA = a === '?' ? Infinity : Number(a);
                const numB = b === '?' ? Infinity : Number(b);
                return numA - numB;
            })
            .forEach(day => {
                const dayDecisions = groupedDecisions[day];
                report += `\n=== GÜN ${day === '?' ? 'Bilinmeyen' : day} ===\n`;

                dayDecisions.forEach((decision: UserDecision, index: number) => {
                    report += `\nSenaryo ${index + 1}: `;
                    report += decision.scenarioText ? `"${decision.scenarioText}"\n` : `(ID: ${decision.questionId})\n`;
                    report += `Seçiminiz: `;
                    report += decision.selectedOptionText ? `"${decision.selectedOptionText}"\n` : `(Opsiyon #${decision.selectedOption + 1})\n`;

                     // --- MCDA Skorlarını ekle ---
                     const scores: string[] = [];
                     if (typeof decision.baoScore === 'number') scores.push(`BAO: ${decision.baoScore.toFixed(1)}`);
                     if (typeof decision.topsisScore === 'number') scores.push(`TOPSIS: ${decision.topsisScore.toFixed(1)}`);
                     if (typeof decision.ahpScore === 'number') scores.push(`AHP: ${decision.ahpScore.toFixed(1)}`);
                     if (typeof decision.electreScore === 'number') scores.push(`ELECTRE: ${decision.electreScore.toFixed(1)}`);
                     if (typeof decision.mavtScore === 'number') scores.push(`MAVT: ${decision.mavtScore.toFixed(1)}`);
                     if (typeof decision.vikorSScore === 'number' && typeof decision.vikorRScore === 'number') scores.push(`VIKOR(S/R): ${decision.vikorSScore.toFixed(1)}/${decision.vikorRScore.toFixed(1)}`);

                     if (scores.length > 0) {
                         report += `Hesaplanan Skorlar: ${scores.join(' | ')}\n`;
                     }
                     // --------------------------


                    // Etki bilgilerini ekle
                    if (decision.metrics?.before && decision.metrics?.after) {
                        report += 'Kararınızın Metrik Etkileri:\n';
                        const before = decision.metrics.before;
                        const after = decision.metrics.after;

                        (Object.keys(before) as Array<keyof MetricValues>).forEach(key => { // Tip güvenliği için
                            const metricNameMap: { [key in keyof MetricValues]: string } = {
                                revenue: 'Gelir', customerSatisfaction: 'Müşteri Mem.', staffSatisfaction: 'Personel Mem.', occupancyRate: 'Doluluk', sustainability: 'Sürdürülebilirlik'
                            };
                            const metricName = metricNameMap[key] || key;
                            const change = (after[key] ?? 0) - (before[key] ?? 0); // Null check
                            const changeSymbol = change > 0 ? '↑' : change < 0 ? '↓' : '→';
                            report += `  ${metricName}: ${before[key] ?? '?'}% → ${after[key] ?? '?'}% (${changeSymbol}${Math.abs(change)}%)\n`;
                        });
                    } else {
                        report += 'Metrik etkisi bilgisi kaydedilmemiş.\n';
                    }
                    report += '--------------------------\n';
                });
            });

        return report;
    }, []); // useCallback bağımlılığı boş dizi, çünkü dış değişkenlere bağlı değil


    // Yapay Zeka Analizi için özet veri oluştur (Tip güvenliği artırıldı)
    const generateAIAnalysisData = useCallback((decisions: UserDecision[]) => {
        let analysisData = `# Otel Yönetim Simülasyonu - Karar Analizi\n\n`;
        const groupedDecisions = groupDecisionsByDay(decisions);

        Object.keys(groupedDecisions)
            .sort((a, b) => { // Sayısal sıralama
                const numA = a === '?' ? Infinity : Number(a);
                const numB = b === '?' ? Infinity : Number(b);
                return numA - numB;
            })
            .forEach(day => {
                const dayDecisions = groupedDecisions[day];
                analysisData += `## GÜN ${day === '?' ? 'Bilinmeyen' : day}\n\n`;

                dayDecisions.forEach((decision: UserDecision, index: number) => {
                    analysisData += `### Senaryo ${index + 1}\n`;
                    analysisData += `**Durum:** ${decision.scenarioText || '(Metin Yok)'}\n`;
                    analysisData += `**Oyuncunun Seçimi:** ${decision.selectedOptionText || `(Opsiyon #${decision.selectedOption + 1})`}\n`;
                     // --- MCDA Skorlarını ekle ---
                     const scoreEntries: string[] = [];
                     if (typeof decision.baoScore === 'number') scoreEntries.push(`BAO: ${decision.baoScore.toFixed(1)}`);
                     if (typeof decision.topsisScore === 'number') scoreEntries.push(`TOPSIS: ${decision.topsisScore.toFixed(1)}`);
                     if (typeof decision.ahpScore === 'number') scoreEntries.push(`AHP: ${decision.ahpScore.toFixed(1)}`);
                     if (typeof decision.electreScore === 'number') scoreEntries.push(`ELECTRE: ${decision.electreScore.toFixed(1)}`);
                     if (typeof decision.mavtScore === 'number') scoreEntries.push(`MAVT: ${decision.mavtScore.toFixed(1)}`);
                     if (typeof decision.vikorSScore === 'number' && typeof decision.vikorRScore === 'number') scoreEntries.push(`VIKOR(S/R): ${decision.vikorSScore.toFixed(1)}/${decision.vikorRScore.toFixed(1)}`);

                     if (scoreEntries.length > 0) {
                         analysisData += `**Hesaplanan Skorlar:** ${scoreEntries.join(' | ')}\n`;
                     }
                     // --------------------------
                    analysisData += `---\n\n`;
                });
            });
        return analysisData;
    }, []); // useCallback bağımlılığı boş dizi

    // Yapay Zeka Analizi istek gönderme fonksiyonu
    const analyzeGameWithAI = async () => {
        if (userDecisions.length === 0) { // userDecisions state'ini kullan
            alert('Analiz için karar verisi bulunamadı!');
            return;
        }

        setIsAnalyzing(true);
        setAiAnalysisResult(null); // Önceki sonucu temizle
        setShowAiAnalysis(false); // Modal'ı gizle

         try {
             const analysisData = generateAIAnalysisData(userDecisions); // userDecisions state'ini kullan
             const prompt = `
 Sen bir otel yönetim uzmanısın. Aşağıda bir otel yönetim simülasyonu oyununun karar özeti verilmiştir. Her kararın yanında çeşitli Çok Kriterli Karar Verme (MCDA) yöntemlerine dayalı hesaplanmış skorlar bulunmaktadır:
 - BAO/SAW: Basit ağırlıklı ortalama etki. Yüksek pozitif = iyi.
 - TOPSIS: İdeal çözüme yakınlık oranı (net fayda). Yüksek pozitif = iyi.
 - AHP Proxy: Etkilerin ağırlıklara göre uyumu. Yüksek pozitif = iyi.
 - ELECTRE Proxy: Uyum (iyi etki) - Uyumsuzluk (kötü etki) dengesi. Yüksek pozitif = iyi.
 - MAVT Proxy: Negatif etkileri daha çok cezalandıran değer teorisi. Yüksek pozitif = iyi.
 - VIKOR (S/R): Pişmanlık skorları (toplam/maksimum). Düşük = iyi.

 Bu kararlara ve TÜM MCDA skorlarına dayanarak oyuncunun otel yönetim performansını kapsamlı bir şekilde analiz et. Farklı skorların ne anlama geldiğini göz önünde bulundurarak kararların güçlü ve zayıf yönlerini değerlendir.

 Şu başlıklar altında kısa ve öz analiz yap (maksimum 700 kelime):
 1. Genel Performans Özeti (Ortalama skorlar ve genel eğilimler dahil)
 2. Öne Çıkan Başarılı Kararlar (Farklı skor türlerine göre başarılı olan kararlar ve nedenleri)
 3. Geliştirilebilecek Kararlar/Alanlar (Farklı skor türlerine göre zayıf kalan kararlar ve nedenleri, özellikle VIKOR skorları yüksek olanlar)
 4. Genel Yönetim Yaklaşımı ve Tutarlılık (Kararların farklı metrikler ve skorlar üzerindeki genel etkisi, risk alma/kaçınma eğilimi)
 5. 2-3 adet Anahtar Tavsiye (Farklı MCDA skorlarını iyileştirmeye yönelik spesifik öneriler)

 Analizin yapıcı, anlaşılır ve oyuncuya yol gösterici olsun. Skorların farklı bakış açıları sunduğunu vurgula.

 İŞTE OYUNCUNUN KARARLARI VE SKORLARI:
 ${analysisData}`;

            // Gemini API endpoint ve anahtarını kullan
            // Gemini API endpoint ve anahtarını kullan
            // Gemini API endpoint ve anahtarını kullan
            const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent', { // Model adı güncellendi
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': 'AIzaSyChYYGCr50OdWaDAAjh9laauPDt8gqZVTo' // Sağlanan Gemini API Anahtarı
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                     }],
                     generationConfig: {
                         temperature: 0.6,
                         maxOutputTokens: 2048 // Increased token limit
                     }
                 })
            });

            if (!response.ok) { // HTTP hata kontrolü
                 const errorData = await response.json();
                 console.error('Gemini API Hatası:', errorData);
                 throw new Error(`API Hatası: ${response.status} - ${errorData.error?.message || 'Bilinmeyen hata'}`);
            }

            const data = await response.json();

            // Gemini yanıt formatına göre içeriği al
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                setAiAnalysisResult(data.candidates[0].content.parts[0].text.trim());
                setShowAiAnalysis(true); // Analiz başarılıysa modal'ı göster
            } else {
                console.error('API yanıt formatı beklenmiyor:', data);
                throw new Error('Yapay zeka yanıtı alınamadı veya format hatalı.');
            }
        } catch (error) {
            console.error('Yapay zeka analizi sırasında hata:', error);
            setAiAnalysisResult(`Analiz yapılırken bir hata oluştu: ${error instanceof Error ? error.message : String(error)}`);
            setShowAiAnalysis(true); // Hata olsa bile modal'ı gösterip hatayı belirt
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Veri çekme işlemini useEffect içine taşı
    useEffect(() => {
        const fetchData = async () => {
            if (!auth.currentUser) {
                console.log("Kullanıcı girişi yok, yönlendiriliyor.");
                navigate('/'); // Kullanıcı yoksa ana sayfaya yönlendir
                return;
            }
            setLoading(true);
            setError(null); // Başlangıçta hatayı temizle

            // gameId'nin geçerli olduğundan emin ol (URL'den veya state'den)
            const currentValidGameId = gameId; // State'deki değeri kullan
            if (!currentValidGameId) {
                setError('Geçerli bir oyun ID bulunamadı.');
                setLoading(false);
                setReportText('Rapor oluşturulamadı: Oyun ID eksik.'); // Rapor metnini güncelle
                return; // gameId yoksa işlemi durdur
            }

            try {
                const userId = auth.currentUser.uid;

                // 1. Kullanıcı verilerini çek
                const fetchedUserData = await getUserData(userId);
                if (!fetchedUserData) {
                    throw new Error("Kullanıcı verileri bulunamadı.");
                }
                setUserData(fetchedUserData); // Kullanıcı verisini state'e ata
                const metrics = fetchedUserData.metrics;

                // 2. Karar geçmişini çek (userId VE gameId ile)
                // *** BURASI GÜNCELLENDİ: İki argüman gönderiliyor ***
                const decisions = await loadUserDecisions(userId, currentValidGameId);
                setUserDecisions(decisions); // Kararları state'e ata

                // 3. Kararları grupla ve rapor oluştur
                const grouped = groupDecisionsByDay(decisions);
                const detailedReport = generateDetailedReport(grouped, metrics);
                setReportText(detailedReport);

            } catch (error) {
                console.error('Oyun bitiş verileri çekilirken hata oluştu:', error);
                const errorMessage = error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu.";
                setError(`Rapor oluşturulurken bir hata oluştu: ${errorMessage}`);
                setReportText(`Rapor oluşturulamadı: ${errorMessage}`); // Rapor metnini güncelle
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        // Bağımlılıkları doğru ayarlayın
    }, [navigate, gameId, generateDetailedReport]); // gameId ve generateDetailedReport eklendi

    // Başka bir oyuna başla
    const startNewGame = () => {
        localStorage.removeItem('currentGameId'); // Sadece oyun ID'sini temizle
        navigate('/game-setup');
    };

    // Analiz modalını kapat
    const closeAnalysis = () => {
        setShowAiAnalysis(false);
    };

    // Yükleme durumu
    if (loading) {
        return (
            <div style={styles.container}>
                <h2 style={styles.title}>Oyun Bitti</h2>
                 <div style={styles.loadingContainer}>
                     <div style={styles.spinner}></div>
                     <p style={styles.loadingText}>Rapor hazırlanıyor...</p>
                 </div>
                 <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    // Hata durumu
    if (error) {
        return (
            <div style={styles.container}>
                <h2 style={{ ...styles.title, color: '#dc3545' }}>Hata</h2>
                <div style={{ ...styles.reportContainer, textAlign: 'center', borderColor: '#dc3545' }}>
                    <p style={{ color: '#dc3545', marginBottom: '20px' }}>{error}</p>
                    <button onClick={() => window.location.reload()} style={{...styles.button, background: '#6c757d'}}>
                        Sayfayı Yenile
                    </button>
                </div>
            </div>
        );
    }

    // Başarılı render
    return (
        <div style={styles.container}>
            <h2 style={styles.title}>Oyun Bitti!</h2>
            <p style={styles.subtitle}>
                10 turu başarıyla tamamladınız. Detaylı raporunuz:
            </p>

            {/* Rapor Alanı */}
            <div style={styles.reportContainer}>
                <pre style={styles.preformattedText}>
                    {reportText}
                </pre>
            </div>

            {/* Butonlar */}
            <div style={styles.buttonGroup}>
                <button onClick={() => { /* Rapor İndirme */
                    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' }); // UTF-8 eklendi
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `OtelSim_Rapor_${gameId || 'oyun'}.txt`; // Dinamik dosya adı
                    a.click();
                    URL.revokeObjectURL(url); // Belleği serbest bırak
                }} style={{ ...styles.button, background: '#4caf50' }}>
                    Raporu İndir
                </button>

                <button onClick={analyzeGameWithAI} disabled={isAnalyzing || userDecisions.length === 0} style={{ ...styles.button, background: '#9c27b0', cursor: (isAnalyzing || userDecisions.length === 0) ? 'not-allowed' : 'pointer', opacity: (isAnalyzing || userDecisions.length === 0) ? 0.6 : 1 }}>
                    {isAnalyzing ? <><div style={styles.buttonSpinner}></div> Analiz Yapılıyor...</> : '🧠 Yapay Zeka Analizi'}
                </button>

                <button onClick={startNewGame} style={{ ...styles.button, background: '#2196f3' }}>
                    Yeni Oyun Başlat
                </button>

                <button onClick={() => navigate('/')} style={{ ...styles.button, background: '#1e3c72' }}>
                    Ana Menü
                </button>
            </div>

            {/* Yapay Zeka Analiz Sonucu Modalı */}
            {showAiAnalysis && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <button onClick={closeAnalysis} style={styles.modalCloseButton}>✕</button>
                        <h2 style={styles.modalTitle}>🧠 Yapay Zeka Performans Analizi</h2>
                        <div style={styles.modalText}>
                            {aiAnalysisResult || "Analiz sonucu yükleniyor..."}
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '20px' }}>
                            <button onClick={() => { /* Analiz İndirme */
                                if (aiAnalysisResult) {
                                    const blob = new Blob([aiAnalysisResult], { type: 'text/plain;charset=utf-8' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `OtelSim_AI_Analiz_${gameId || 'oyun'}.txt`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }
                            }} style={{ ...styles.button, background: '#9c27b0' }} disabled={!aiAnalysisResult}>
                                Analizi İndir
                            </button>
                        </div>
                    </div>
                </div>
            )}
             <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

// Stil tanımlamaları (Daha okunabilir olması için dışarı alındı)
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        minHeight: '100vh',
        background: '#f0f2f5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 20px', // Increased top/bottom padding
        boxSizing: 'border-box',
    },
    title: {
        color: '#1e3c72',
        marginBottom: '10px', // Reduced margin
        fontSize: '2em', // Slightly larger title
        textAlign: 'center',
    },
    subtitle: {
        color: '#555',
        fontSize: '1.1em', // Slightly larger subtitle
        marginBottom: '30px', // Increased margin
        textAlign: 'center',
    },
    loadingContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: '30px', // Increased margin
    },
    spinner: {
        display: 'inline-block',
        width: '30px', // Slightly larger spinner
        height: '30px',
        border: '4px solid rgba(0,0,0,0.1)', // Thicker border
        borderRadius: '50%',
        borderTopColor: '#1e3c72',
        animation: 'spin 1s linear infinite',
        marginRight: '15px', // Increased margin
    },
     buttonSpinner: {
        display: 'inline-block',
        width: '18px', // Slightly larger
        height: '18px',
        border: '3px solid rgba(255,255,255,0.3)',
        borderRadius: '50%',
        borderTopColor: 'white',
        animation: 'spin 1s linear infinite',
        marginRight: '10px', // Increased margin
     },
    loadingText: {
        color: '#666',
        fontSize: '1.2em', // Slightly larger text
    },
    reportContainer: {
        backgroundColor: 'white',
        padding: '30px', // Increased padding
        borderRadius: '10px',
        maxWidth: '900px', // Increased max width
        width: '100%',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)', // More prominent shadow
        marginBottom: '30px', // Increased margin
        maxHeight: '70vh', // Increased max height
        overflowY: 'auto',
        border: '1px solid #e0e0e0',
    },
    preformattedText: {
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '1em', // Slightly larger font
        lineHeight: '1.7', // Increased line height
        color: '#333',
    },
    buttonGroup: {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '20px', // Increased gap between buttons
        marginBottom: '30px', // Increased margin
    },
    button: {
        padding: '12px 25px', // Increased padding
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '1em', // Slightly larger font
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px', // Increased gap
        transition: 'background-color 0.2s ease, opacity 0.2s ease',
    },
    modalOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.75)', // Darker overlay
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        padding: '20px',
        boxSizing: 'border-box',
    },
    modalContent: {
        background: 'white',
        borderRadius: '10px',
        padding: '30px 35px', // Increased padding
        maxWidth: '800px', // Increased max width
        width: '100%',
        maxHeight: '90vh', // Increased max height
        overflowY: 'auto',
        position: 'relative',
        boxShadow: '0 5px 25px rgba(0,0,0,0.3)', // More prominent shadow
    },
    modalCloseButton: {
        position: 'absolute',
        top: '15px', // Adjusted position
        right: '20px', // Adjusted position
        background: 'transparent',
        border: 'none',
        fontSize: '28px', // Larger close button
        cursor: 'pointer',
        color: '#666', // Darker color
        padding: '5px',
        lineHeight: '1',
    },
    modalTitle: {
        color: '#9c27b0',
        marginBottom: '25px', // Increased margin
        textAlign: 'center',
        fontSize: '1.6em', // Larger title
    },
    modalText: {
        fontSize: '1em', // Slightly larger font
        lineHeight: '1.8', // Increased line height
        color: '#333',
        whiteSpace: 'pre-wrap', // AI yanıtındaki formatlamayı koru
        wordWrap: 'break-word',
    }
};

export default GameOver;
