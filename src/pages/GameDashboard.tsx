import React, { useState, useEffect } from 'react';
import { getUserData } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase/config';
import { getDoc, collection, query, where, getDocs} from 'firebase/firestore';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { UserData, UserDecision, MetricValues } from '../types/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Timestamp } from "firebase/firestore";
import {saveUserDecision, updateUserMetrics} from "../services/firebase";
ChartJS.register(ArcElement, Tooltip, Legend);

interface GameSetup {
    hotelType: string;
    role: string;
}

interface CurrentScenario {
    id: string;
    text: string;
    department: string;
    difficulty: number;
    options: Array<{
        text: string;
        effects: {
            revenue: number;
            customerSatisfaction: number;
            staffSatisfaction: number;
            occupancyRate: number;
            sustainability: number;
        };
    }>;
}

const GameDashboard = () => {
    const navigate = useNavigate();
    const [gameSetup, setGameSetup] = useState<GameSetup | null>(null);
    const [metrics, setMetrics] = useState<MetricValues | null>(null);
    const [isChartOpen, setIsChartOpen] = useState(false);

    // Yeni state'ler
    const [userData, setUserData] = useState<UserData | null>(null);
    // Bir günde birden fazla senaryo saklamak için dizi
    const [currentDayScenarios, setCurrentDayScenarios] = useState<CurrentScenario[]>([]);

// Opsiyonel: Bir günde cevaplanan soru sayısını takip edeceksiniz diye örnek
    const [answeredCount, setAnsweredCount] = useState(0);

    const [userDecisions, setUserDecisions] = useState<UserDecision[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Başarımları kontrol et
    const checkAchievements = async (newMetrics: MetricValues) => {
        if (!userData || !auth.currentUser) return;

        const newAchievements = [...userData.achievements];

        if (newMetrics.customerSatisfaction >= 90 && !newAchievements.includes('HAPPY_CUSTOMERS')) {
            newAchievements.push('HAPPY_CUSTOMERS');
        }
        if (newMetrics.revenue >= 80 && !newAchievements.includes('REVENUE_MASTER')) {
            newAchievements.push('REVENUE_MASTER');
        }
        if (newMetrics.staffSatisfaction >= 85 && !newAchievements.includes('STAFF_CHAMPION')) {
            newAchievements.push('STAFF_CHAMPION');
        }

        if (newAchievements.length > userData.achievements.length) {
            const userRef = doc(db, 'users', auth.currentUser.uid);
            await updateDoc(userRef, { achievements: newAchievements });
            setUserData(prev => prev ? {...prev, achievements: newAchievements} : null);
        }
    };

    const logout = () => {
        localStorage.removeItem('userData');  // Sadece kullanıcı bilgisini temizle
        localStorage.removeItem('currentGameId'); // Oyun ID'sini temizle
        navigate('/game-setup');
    };

    // Kullanıcı verilerini yükle
    const loadUserData = async () => {
        if (!auth.currentUser) {
            navigate('/');
            return;
        }

        try {
            const userData = await getUserData(auth.currentUser.uid);

            if (userData) {
                setUserData(userData);
                setMetrics(userData.metrics);
            } else {
                throw new Error('Kullanıcı verisi bulunamadı');
            }
        } catch (error) {
            console.error('Kullanıcı verisi yükleme hatası:', error);
        }
    };

    const loadScenario = async () => {
        if (!gameSetup || !gameSetup.role) {
            console.log("⚠️ Game Setup veya role yok, senaryo çekilemez!");
            return;
        }

        console.log("🔍 Senaryolar çekiliyor... Departman:", gameSetup.role);

        try {
            const scenariosRef = collection(db, "questions");
            // limit(1) KALDIRILDI. Tüm departman sorularını alalım (isteğe göre limit ekleyebilirsiniz).
            const q = query(scenariosRef, where("department", "==", gameSetup.role));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                console.warn("❌ Bu role ait senaryo bulunamadı:", gameSetup.role);
                setCurrentDayScenarios([]);
                return;
            }

            // Tüm dokümanları diziye çevir
            let allQuestions: CurrentScenario[] = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    text: data.text || "Senaryo metni eksik!",
                    department: data.department || "Bilinmeyen Departman",
                    difficulty: data.difficulty ?? 1,
                    options: data.options || []
                };
            });

            // -- İSTERSENİZ: Burada userDecisions (karar geçmişi) ile daha önce cevaplanan ID'leri filtreleyebilirsiniz. --
            //  Örn:
            //  const usedIds = userDecisions.map(dec => dec.questionId);
            //  allQuestions = allQuestions.filter(q => !usedIds.includes(q.id));

            // Diziyi karıştır
            allQuestions.sort(() => 0.5 - Math.random());

            // 1–3 arasında rastgele bir sayı
            const randomCount = Math.floor(Math.random() * 3) + 1;
            // 1, 2 veya 3
            const selected = allQuestions.slice(0, randomCount);

            // State'e koy
            setCurrentDayScenarios(selected);
            setAnsweredCount(0); // Bugün cevaplanan sıfırla

            console.log("✅ Bugünün senaryoları:", selected);
        } catch (error) {
            console.error("🔥 Senaryo yükleme hatası:", error);
        }
    };

    const loadHotelMetrics = async () => {
        if (!gameSetup?.hotelType) {
            console.warn("⚠️ Otel tipi tanımlanmamış.");
            return;
        }

        console.log(`🏨 Otel metrikleri yükleniyor: ${gameSetup.hotelType}`); // LOG EKLE

        try {
            const hotelRef = doc(db, "hotelMetrics", gameSetup.hotelType);
            const hotelSnap = await getDoc(hotelRef);

            if (hotelSnap.exists()) {
                console.log("✅ Otel metrikleri bulundu:", hotelSnap.data()); // LOG EKLE
                setMetrics(hotelSnap.data().metrics);
            } else {
                console.error("❌ Otel metrikleri bulunamadı!");
            }
        } catch (error) {
            console.error("🔥 Otel metrikleri yüklenirken hata oluştu:", error);
        }
    };

    // Kullanıcı kararlarını yükle
    const loadUserDecisions = async () => {
        if (!auth.currentUser) return;

        try {
            const currentGameId = localStorage.getItem('currentGameId');
            if (!currentGameId) return;

            const decisionsRef = collection(db, 'userDecisions');
            const q = query(
                decisionsRef,
                where('userId', '==', auth.currentUser.uid),
                where('gameId', '==', currentGameId)
            );
            const querySnapshot = await getDocs(q);

            const decisions = querySnapshot.docs.map(doc => ({
                id: doc.id,
                userId: doc.data().userId,
                questionId: doc.data().questionId,
                selectedOption: doc.data().selectedOption,
                metrics: doc.data().metrics,
                createdAt: doc.data().createdAt,
                day: doc.data().day || null,
                scenarioText: doc.data().scenarioText || null,
                selectedOptionText: doc.data().selectedOptionText || null,
                gameId: doc.data().gameId || null
            })) as UserDecision[];

            setUserDecisions(decisions);
        } catch (error) {
            console.error('Karar geçmişi yükleme hatası:', error);
        }
    };

    // Senaryo kararını işle
    const handleDecision = async (questionId: string, optionIndex: number) => {
        if (!userData || !auth.currentUser || !metrics) return;

        setIsLoading(true);
        try {
            // 1) Dizide tıklanan senaryoyu bul
            const scenario = currentDayScenarios.find(s => s.id === questionId);
            if (!scenario) {
                console.warn("Senaryo bulunamadı, ID:", questionId);
                return;
            }

            const selectedOption = scenario.options[optionIndex];
            if (!selectedOption) return;

            // 2) Metrikleri güncelle
            const oldMetrics = { ...metrics };
            const newMetrics = { ...metrics };
            Object.keys(selectedOption.effects).forEach((key) => {
                const metricKey = key as keyof typeof metrics;
                newMetrics[metricKey] = Math.min(100, Math.max(0, newMetrics[metricKey] + selectedOption.effects[metricKey]));
            });

            // 3) Firestore'daki kullanıcı metriklerini kaydedin
            await updateUserMetrics(auth.currentUser.uid, newMetrics);

            // Mevcut gameId'yi al
            const currentGameId = localStorage.getItem('currentGameId');

            // 4) Kararı kaydet
            await saveUserDecision({
                userId: auth.currentUser.uid,
                questionId: scenario.id,
                selectedOption: optionIndex,
                metrics: {
                    before: oldMetrics,
                    after: newMetrics
                },
                day: userData.currentDay, // Mevcut gün
                scenarioText: scenario.text, // Senaryo metni
                selectedOptionText: selectedOption.text, // Seçilen seçeneğin metni
                gameId: currentGameId || undefined // Oyun ID'si
            });

            // 5) Achievements kontrol
            await checkAchievements(newMetrics);

            // 6) Local state güncelle (AMA buradan completedScenarios +1 alıyoruz!)
            setMetrics(newMetrics);
            setUserData((prev) =>
                prev ? {
                    ...prev,
                    metrics: newMetrics
                    // Daha önce her soru sonunda completedScenarios +1 vardı, bunu gün sonunda yapacağız
                } : null
            );

            // 7) Soruyu currentDayScenarios'tan çıkararak ekranda gizle
            //    (Kullanıcı aynı soruyu tekrar cevaplayamasın)
            const oldLength = currentDayScenarios.length;
            const newScenarios = currentDayScenarios.filter(q => q.id !== questionId);
            setCurrentDayScenarios(newScenarios);

            // 8) Bir günde kaç soru cevapladığımızı takip
            const newAnsweredCount = answeredCount + 1;
            setAnsweredCount(newAnsweredCount);

            // 9) Günün tüm soruları bitti mi? (yani eskiden 3 soru varsa, 3'ü de cevaplandı mı?)
            // 9) Günün tüm soruları bitti mi?
            if (newAnsweredCount >= oldLength) {
                console.log("🔚 Bugünkü sorular bitti, yeni güne (tura) geçiliyor...");

                // GÜN BİTTİĞİNDE completedScenarios +1
                setUserData((prev) => {
                    if (!prev) return null;

                    const updatedCompletedScenarios = prev.completedScenarios + 1;
                    // ADDED: 10 tura ulaşıldı mı? Oyun Bitti ekranına yönlendir.
                    if (updatedCompletedScenarios >= 10) {
                        console.log("✅ 10 tur tamamlandı, Oyun bitti! /game-over sayfasına yönlendiriliyor...");
                        // GameOver sayfasına geçerken mevcut gameId'yi de gönder
                        const currentGameId = localStorage.getItem('currentGameId');
                        if (currentGameId) {
                            navigate(`/game-over?gameId=${currentGameId}`);
                        } else {
                            navigate("/game-over");
                        }
                        return { ...prev, completedScenarios: updatedCompletedScenarios };
                    }

                    // 10 tur olmadıysa normal şekilde devam (gün ilerlet)
                    return {
                        ...prev,
                        completedScenarios: updatedCompletedScenarios,
                        currentDay: prev.currentDay + 1,
                    };
                });

                // Eğer 10 tur olmadıysa (navigate edilmediyse) loadScenario çağırarak yeni günü başlatabilirsiniz:
                await loadScenario();
            }

            // 10) Karar geçmişini tekrar çek
            await loadUserDecisions();
        } catch (error) {
            console.error("Karar işleme hatası:", error);
            setError("Karar işlenirken hata oluştu");
        } finally {
            setIsLoading(false);
        }
    };

    // Başarım bilgilerini getir
    const getAchievementInfo = (achievementId: string) => {
        const achievements = {
            'HAPPY_CUSTOMERS': {
                icon: '😊',
                name: 'Mutlu Müşteriler',
                desc: "Müşteri memnuniyeti %90'a ulaştı"
            },
            'REVENUE_MASTER': {
                icon: '💰',
                name: 'Gelir Ustası',
                desc: 'Gelir %80 seviyesine ulaştı'
            },
            'STAFF_CHAMPION': {
                icon: '👥',
                name: 'Personel Şampiyonu',
                desc: 'Personel memnuniyeti %85 seviyesine ulaştı'
            },
            'FIRST_DECISION': {
                icon: '⭐',
                name: 'İlk Karar',
                desc: 'İlk kararınızı verdiniz!'
            }
        };

        return achievements[achievementId as keyof typeof achievements] || {
            icon: '🏆',
            name: 'Bilinmeyen Başarım',
            desc: 'Bilgi bulunamadı'
        };
    };

    useEffect(() => {
        const initDashboard = async () => {
            setIsLoading(true);
            try {
                // 1️⃣ Oyun ID'si oluştur veya mevcut olanı al
                let currentGameId = localStorage.getItem('currentGameId');

                if (!currentGameId) {
                    currentGameId = 'game_' + Date.now();
                    localStorage.setItem('currentGameId', currentGameId);
                    console.log("🎮 Yeni Oyun ID'si oluşturuldu:", currentGameId);
                } else {
                    console.log("🎮 Mevcut Oyun ID'si kullanılıyor:", currentGameId);
                }

                // 2️⃣ localStorage'dan veriyi al
                const setupData = localStorage.getItem('gameSetup');

                if (!setupData) {
                    console.warn("⚠️ localStorage'dan 'gameSetup' yüklenemedi!");
                    navigate('/game-setup');
                    return;
                }

                // 3️⃣ JSON'a çevir ve kontrol et
                const setup = JSON.parse(setupData);
                console.log("✅ localStorage'dan Yüklenen Game Setup:", setup);

                if (!setup.hotelType || !setup.role) {
                    console.warn("⚠️ Game Setup eksik veya hatalı:", setup);
                    navigate('/game-setup');
                    return;
                }

                // 4️⃣ `gameSetup` state'ini güncelle
                setGameSetup(setup);

                // 5️⃣ Önce kullanıcı verisini yükle
                await loadUserData();

                // **ÖNEMLİ:** State'in güncellenmesini beklemek için kısa bir gecikme ekleyelim.
                setTimeout(async () => {
                    console.log("🔥 Oyun verileri yükleniyor...");
                    await loadHotelMetrics();  // ✅ Önce otel metriklerini yükle
                    await loadUserDecisions(); // ✅ Son olarak karar geçmişini yükle
                }, 400);

            } catch (error) {
                console.error('❌ Dashboard başlatma hatası:', error);
                setError('Oyun yüklenirken bir hata oluştu.');
            } finally {
                setIsLoading(false);
            }
        };

        void initDashboard();
    }, [navigate]);

    useEffect(() => {
        if (gameSetup && gameSetup.role) {
            (async () => {
                await loadScenario();
            })();
        }
    }, [gameSetup]);

    useEffect(() => {
        if (!userData || !userData.lastLoginDate) return;

        try {
            // 🎯 `as Timestamp` ile TypeScript'e bunun bir Firestore Timestamp olduğunu bildiriyoruz
            const lastLoginDate = (userData.lastLoginDate as Timestamp).toDate();

            const today = new Date();

            if (
                lastLoginDate.getDate() !== today.getDate() ||
                lastLoginDate.getMonth() !== today.getMonth() ||
                lastLoginDate.getFullYear() !== today.getFullYear()
            ) {
                if (auth.currentUser) {
                    const userRef = doc(db, 'users', auth.currentUser.uid);
                    updateDoc(userRef, {
                        lastLoginDate: serverTimestamp(),
                    }).catch(console.error);
                }
            }
        } catch (error) {
            console.error('Tarih kontrolü hatası:', error);
        }
    }, [userData]);

    if (isLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#f5f7fa'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <h2 style={{ color: '#1e3c72' }}>Oyun Yükleniyor...</h2>
                    <p style={{ color: '#666' }}>Lütfen bekleyin</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#f5f7fa'
            }}>
                <div style={{ textAlign: 'center', color: '#dc3545' }}>
                    <h2>Hata Oluştu</h2>
                    <p>{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '10px 20px',
                            background: '#1e3c72',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            marginTop: '20px',
                            cursor: 'pointer'
                        }}
                    >
                        Tekrar Dene
                    </button>
                </div>
            </div>
        );
    }

    // Chart verilerini hazırla
    const chartData = {
        labels: [
            'Gelir',
            'Müşteri Memnuniyeti',
            'Personel Memnuniyeti',
            'Doluluk Oranı',
            'Sürdürülebilirlik'
        ],
        datasets: [{
            data: metrics ? [
                metrics.revenue,
                metrics.customerSatisfaction,
                metrics.staffSatisfaction,
                metrics.occupancyRate,
                metrics.sustainability
            ] : [],
            backgroundColor: [
                '#2196f3',
                '#4caf50',
                '#ff9800',
                '#f44336',
                '#9c27b0'
            ],
            borderWidth: 1
        }]
    };

    const getMetricColor = (value: number) => {
        if (value >= 80) return '#28a745';
        if (value >= 60) return '#2193b0';
        if (value >= 40) return '#ffc107';
        return '#dc3545';
    };

    const MetricBar = ({ label, value }: { label: string; value: number }) => (
        <div style={{ marginBottom: '15px' }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '5px'
            }}>
                <span style={{ color: '#666' }}>{label}</span>
                <span style={{
                    color: getMetricColor(value),
                    fontWeight: 'bold'
                }}>
                    {value}%
                </span>
            </div>
            <div style={{
                height: '8px',
                background: '#e9ecef',
                borderRadius: '4px',
                overflow: 'hidden'
            }}>
                <div style={{
                    width: `${value}%`,
                    height: '100%',
                    background: getMetricColor(value),
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                }}/>
            </div>
        </div>
    );

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f5f7fa',
            padding: '20px'
        }}>
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto'
            }}>
                {/* Üst Bilgi Çubuğu */}
                <div style={{
                    background: 'white',
                    padding: '20px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <h2 style={{ color: '#1e3c72', marginBottom: '5px' }}>
                            {gameSetup?.hotelType === '5_star' ? '5 Yıldızlı Otel' :
                                gameSetup?.hotelType === 'boutique' ? 'Butik Otel' : 'Tatil Köyü'}
                        </h2>
                        <p style={{ color: '#666' }}>
                            {gameSetup?.role === 'reservation' ? 'Rezervasyon Müdürü' :
                                gameSetup?.role === 'customer_relations' ? 'Müşteri İlişkileri Yöneticisi' :
                                    gameSetup?.role === 'operations' ? 'Operasyon Müdürü' :
                                        gameSetup?.role === 'financial' ? 'Gelir Yöneticisi' : 'Personel Müdürü'}
                        </p>
                    </div>
                    <button onClick={logout} style={{
                        padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none',
                        borderRadius: '6px', cursor: 'pointer'
                    }}>
                        Oyundan Çık
                    </button>

                </div>

                {/* İlerleme Çubuğu */}
                <div style={{
                    background: 'white',
                    padding: '20px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '10px'
                    }}>
                        <span style={{ color: '#1e3c72', fontWeight: 'bold' }}>
                            Oyun İlerlemesi
                        </span>
                        <span style={{ color: '#666' }}>
                            {userData?.completedScenarios || 0}/10 Senaryo
                        </span>
                    </div>
                    <div style={{
                        height: '8px',
                        background: '#e9ecef',
                        borderRadius: '4px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${((userData?.completedScenarios || 0) / 10) * 100}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #2193b0, #6dd5ed)',
                            borderRadius: '4px',
                            transition: 'width 0.3s ease'
                        }}/>
                    </div>
                </div>

                {/* Ana Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '20px',
                    marginBottom: '20px'
                }}>
                    {/* Metrikler Kartı */}
                    <div style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        <h3 style={{ marginBottom: '20px', color: '#1e3c72' }}>
                            Otel Metrikleri
                        </h3>
                        {metrics && (
                            <>
                                <MetricBar label="Gelir" value={metrics.revenue} />
                                <MetricBar label="Müşteri Memnuniyeti" value={metrics.customerSatisfaction} />
                                <MetricBar label="Personel Memnuniyeti" value={metrics.staffSatisfaction} />
                                <MetricBar label="Doluluk Oranı" value={metrics.occupancyRate} />
                                <MetricBar label="Sürdürülebilirlik" value={metrics.sustainability} />
                            </>
                        )}
                    </div>

                    {/* Aktif Senaryo Kartı */}
                    <div style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                        border: '2px solid #e3f2fd'
                    }}>
                        <h3 style={{
                            color: '#1e3c72',
                            marginBottom: '20px',
                            fontSize: '1.5em',
                            borderBottom: '2px solid #e3f2fd',
                            paddingBottom: '10px'
                        }}>
                            🎯 Bugünün Soruları
                        </h3>

                        {currentDayScenarios.length > 0 ? (
                            currentDayScenarios.map((scenario, idx) => (
                                <div key={scenario.id} style={{
                                    background: '#f8f9fa',
                                    padding: '15px',
                                    borderRadius: '8px',
                                    marginBottom: '20px'
                                }}>
                                    <p style={{
                                        fontSize: '1.1em',
                                        color: '#2c3e50',
                                        marginBottom: '15px',
                                        lineHeight: '1.5',
                                        fontWeight: 'bold'
                                    }}>
                                        Senaryo #{idx + 1} (Zorluk:
                                        {scenario.difficulty === 1 ? 'Kolay'
                                            : scenario.difficulty === 2 ? 'Orta'
                                                : 'Zor'})
                                    </p>

                                    <p style={{ marginBottom: '10px' }}>{scenario.text}</p>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {scenario.options.map((option, optionIndex) => (
                                            <button
                                                key={optionIndex}
                                                onClick={() => handleDecision(scenario.id, optionIndex)}
                                                disabled={isLoading}
                                                style={{
                                                    padding: '15px',
                                                    background: 'white',
                                                    border: '2px solid #e3f2fd',
                                                    borderRadius: '8px',
                                                    cursor: isLoading ? 'not-allowed' : 'pointer',
                                                    textAlign: 'left',
                                                    transition: 'all 0.3s ease'
                                                }}
                                            >
                                                <div style={{ marginBottom: '8px' }}>{option.text}</div>
                                                <div style={{
                                                    display: 'flex',
                                                    gap: '10px',
                                                    fontSize: '0.9em',
                                                    color: '#666'
                                                }}>
                                                    {Object.entries(option.effects).map(([key, value]) => (
                                                        <span key={key}>
                    {key === 'revenue'
                        ? '💰'
                        : key === 'customerSatisfaction'
                            ? '😊'
                            : key === 'staffSatisfaction'
                                ? '👥'
                                : key === 'occupancyRate'
                                    ? '🏨'
                                    : '♻️'}
                                                            {value > 0 ? '+' : ''}
                                                            {value}%
                  </span>
                                                    ))}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                Bugün için senaryo yok.
                            </div>
                        )}
                    </div>


                    {/* Grafik Kartı */}
                    <div style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <h3 style={{ marginBottom: '20px', color: '#1e3c72' }}>
                            Otel Metrik Grafiği
                        </h3>

                        <div onClick={() => setIsChartOpen(true)}
                             style={{ cursor: 'pointer', width: '100%', maxWidth: '300px' }}>
                            <Doughnut data={chartData} />
                        </div>
                        <p style={{ fontSize: '0.8em', color: '#888', marginTop: '10px' }}>
                            Grafiği büyütmek için üzerine tıklayınız.
                        </p>
                    </div>
                </div>

                {/* Geçmiş ve Başarımlar Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '20px'
                }}>
                    {/* Karar Geçmişi Kartı */}
                    <div style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        maxHeight: '400px',
                        overflowY: 'auto'
                    }}>
                        <h3 style={{
                            color: '#1e3c72',
                            marginBottom: '20px',
                            borderBottom: '2px solid #e3f2fd',
                            paddingBottom: '10px'
                        }}>
                            📜 Karar Geçmişi
                        </h3>
                        {userDecisions.length > 0 ? userDecisions.map((decision, index) => (
                            <div key={index} style={{
                                background: '#f8f9fa',
                                padding: '15px',
                                borderRadius: '8px',
                                marginBottom: '10px'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: '5px'
                                }}>
                                    <strong style={{ color: '#1e3c72' }}>
                                        Senaryo #{decision.questionId}
                                    </strong>
                                    <span style={{ color: '#666', fontSize: '0.9em' }}>
                                        Gün {decision.day || '?'} / {(decision.createdAt as Timestamp).toDate().toLocaleDateString()}
                                    </span>
                                </div>
                                <p style={{ margin: '5px 0', color: '#2c3e50' }}>
                                    Seçilen Opsiyon: {decision.selectedOption + 1}
                                </p>
                                <div style={{ marginTop: '5px', fontSize: '0.9em' }}>
                                    {Object.entries(decision.metrics.after).map(([key, value]) => (
                                        <span key={key} style={{
                                            marginRight: '10px',
                                            color: value > decision.metrics.before[key as keyof typeof decision.metrics.before]
                                                ? '#28a745'
                                                : '#dc3545'
                                        }}>
                                            {key}: {value}%
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )) : (
                            <p style={{ textAlign: 'center', color: '#666' }}>
                                Henüz karar geçmişi bulunmuyor.
                            </p>
                        )}
                    </div>

                    {/* Başarımlar Kartı */}
                    <div style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        <h3 style={{
                            color: '#1e3c72',
                            marginBottom: '20px',
                            borderBottom: '2px solid #e3f2fd',
                            paddingBottom: '10px'
                        }}>
                            🏆 Başarımlar
                        </h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                            gap: '15px'
                        }}>
                            {(['HAPPY_CUSTOMERS', 'REVENUE_MASTER', 'STAFF_CHAMPION', 'FIRST_DECISION']).map((achievementId) => {
                                const achievement = getAchievementInfo(achievementId);
                                const isUnlocked = userData?.achievements.includes(achievementId);

                                return (
                                    <div key={achievementId} style={{
                                        padding: '15px',
                                        background: isUnlocked ? '#d1f7c4' : '#f8d7da',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        textAlign: 'center',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                    }}>
                                        <span style={{ fontSize: '2em' }}>{achievement.icon}</span>
                                        <strong style={{ marginTop: '10px', color: '#333' }}>
                                            {achievement.name}
                                        </strong>
                                        <small style={{ color: '#666', fontSize: '0.9em' }}>
                                            {achievement.desc}
                                        </small>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Grafik Modal */}
                {isChartOpen && (
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
                            padding: '20px',
                            maxWidth: '600px',
                            width: '90%',
                            textAlign: 'center',
                            position: 'relative'
                        }}>
                            <h2 style={{ color: '#1e3c72', marginBottom: '20px' }}>
                                Metrikler Grafiği
                            </h2>
                            <Doughnut data={chartData} />
                            <button
                                onClick={() => setIsChartOpen(false)}
                                style={{
                                    marginTop: '20px',
                                    padding: '8px 16px',
                                    background: '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GameDashboard;
