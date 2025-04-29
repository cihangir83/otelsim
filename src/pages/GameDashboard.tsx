import React, { useState, useEffect } from 'react';
// Keep existing service imports
import { getUserData, saveUserDecision, updateUserMetrics } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase/config'; // Use provided path
// Keep existing firestore imports
import { getDoc, collection, query, where, getDocs, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
// Keep existing type imports
// *** IMPORTANT: Ensure UserDecision type in '../types/firebase' includes `baoScore?: number;` ***
import { UserData, UserDecision, MetricValues } from '../types/firebase';

ChartJS.register(ArcElement, Tooltip, Legend);

interface GameSetup {
    hotelType: string;
    role: string;
}

// Explicit type for effects object to ensure consistency
interface ScenarioOptionEffect extends MetricValues {} // Assuming MetricValues covers all effect keys

interface ScenarioOption {
    text: string;
    effects: ScenarioOptionEffect;
}

interface CurrentScenario {
    id: string;
    text: string;
    department: string;
    difficulty: number;
    options: ScenarioOption[];
}

// --- BAO Score Integration START ---
const metricWeights: { [key in keyof MetricValues]: number } = {
    revenue: 0.25,
    customerSatisfaction: 0.25,
    staffSatisfaction: 0.2,
    occupancyRate: 0.15,
    sustainability: 0.15,
};

const getEmojiForScore = (score: number): string => {
    if (score >= 4) return '🎉'; // Excellent
    if (score >= 1) return '👍'; // Good
    if (score >= -1) return '🙂'; // Neutral/Slight
    if (score >= -4) return '🤔'; // Caution
    return '😱'; // Bad
};

// Helper function to calculate BAO score for an option's effects
const calculateBAOScore = (effects: ScenarioOptionEffect): number => {
    let weightedSum = 0;
    let totalWeight = 0;

    // Iterate over defined weights for type safety and clarity
    (Object.keys(metricWeights) as Array<keyof MetricValues>).forEach((key) => {
        // Check if the effect exists for this metric key
        if (effects.hasOwnProperty(key)) {
            const effectValue = effects[key];
            const weightValue = metricWeights[key];
            weightedSum += effectValue * weightValue;
            totalWeight += weightValue;
        }
    });

    // Prevent division by zero
    const baoScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    // Round to one decimal place for cleaner display
    return Math.round(baoScore * 10) / 10;
};
// --- BAO Score Integration END ---


const GameDashboard = () => {
    const navigate = useNavigate();
    const [gameSetup, setGameSetup] = useState<GameSetup | null>(null);
    const [metrics, setMetrics] = useState<MetricValues | null>(null);
    const [isChartOpen, setIsChartOpen] = useState(false);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [currentDayScenarios, setCurrentDayScenarios] = useState<CurrentScenario[]>([]);
    const [answeredCount, setAnsweredCount] = useState(0);
    const [userDecisions, setUserDecisions] = useState<UserDecision[]>([]);
    const [isLoading, setIsLoading] = useState(true); // Start loading initially
    const [error, setError] = useState<string | null>(null);
const [averageBaoScore, setAverageBaoScore] = useState<number | null>(null);

    // Calculate average BAO score whenever userDecisions changes
    useEffect(() => {
        if (userDecisions.length > 0) {
            const totalBaoScore = userDecisions.reduce((sum, decision) => sum + (decision.baoScore ?? 0), 0);
            const avgScore = totalBaoScore / userDecisions.length;
            setAverageBaoScore(Math.round(avgScore * 10) / 10); // Round to one decimal place
        } else {
            setAverageBaoScore(null); // Reset if no decisions
        }
    }, [userDecisions]);

    // Başarımları kontrol et
    const checkAchievements = async (newMetrics: MetricValues) => {
        // Ensure userData and achievements array exist
        if (!userData || !auth.currentUser || !Array.isArray(userData.achievements)) {
            console.warn("Başarım kontrolü atlandı: Kullanıcı verisi veya başarımlar dizisi eksik.");
            return;
        }

        const userRef = doc(db, 'users', auth.currentUser.uid);
        const currentAchievements = userData.achievements;
        const newAchievements = [...currentAchievements];
        let achievementAdded = false;

        // Define achievement conditions
        const achievementsConfig = {
            'HAPPY_CUSTOMERS': { metric: 'customerSatisfaction', threshold: 90 },
            'REVENUE_MASTER': { metric: 'revenue', threshold: 80 },
            'STAFF_CHAMPION': { metric: 'staffSatisfaction', threshold: 85 },
        };

        // Check metric-based achievements
        for (const [key, config] of Object.entries(achievementsConfig)) {
            const metricKey = config.metric as keyof MetricValues;
            if (newMetrics[metricKey] >= config.threshold && !newAchievements.includes(key)) {
                newAchievements.push(key);
                achievementAdded = true;
            }
        }

        // Check first decision achievement (based on decision history)
        if (userDecisions.length === 0 && !newAchievements.includes('FIRST_DECISION')) {
             newAchievements.push('FIRST_DECISION');
             achievementAdded = true;
             console.log("⭐ İlk karar başarımı kontrol ediliyor (geçmiş boş).")
        }


        if (achievementAdded) {
             const added = newAchievements.filter(ach => !currentAchievements.includes(ach));
             console.log(`🏆 Yeni başarım(lar) eklendi: ${added.join(', ')}`);
             try {
                 await updateDoc(userRef, { achievements: newAchievements });
                 // Update local state immediately
                 setUserData(prev => prev ? {...prev, achievements: newAchievements} : null);
             } catch (err) {
                 console.error("Başarım güncellenirken hata:", err);
             }
        }
    };

    const logout = () => {
        setIsLoading(true); // Show loading during logout
        auth.signOut().then(() => {
            // Clear relevant local storage items
            localStorage.removeItem('userData');
            localStorage.removeItem('currentGameId');
            localStorage.removeItem('gameSetup');
            console.log("🚪 Kullanıcı çıkış yaptı ve local storage temizlendi.");
            navigate('/game-setup'); // Redirect to setup page
        }).catch((error) => {
            console.error("Çıkış hatası:", error);
            setError("Çıkış yapılırken bir hata oluştu.");
        }).finally(() => {
            setIsLoading(false);
        });
    };

    // Kullanıcı verilerini yükle
    const loadUserData = async () => {
        if (!auth.currentUser) {
            console.log("Kullanıcı girişi yapılmamış, '/' sayfasına yönlendiriliyor.");
            navigate('/');
            return;
        }
        // Loading is handled by the caller (initDashboard)
        try {
            console.log(`👤 ${auth.currentUser.uid} için kullanıcı verisi yükleniyor...`);
            const fetchedUserData = await getUserData(auth.currentUser.uid);

            if (fetchedUserData) {
                console.log("✅ Kullanıcı verisi başarıyla yüklendi.");
                // Ensure achievements is an array
                 if (!Array.isArray(fetchedUserData.achievements)) {
                    fetchedUserData.achievements = [];
                 }
                setUserData(fetchedUserData);
                if (fetchedUserData.metrics) {
                    console.log("📊 Metrikler kullanıcı verisinden yüklendi:", fetchedUserData.metrics);
                    setMetrics(fetchedUserData.metrics);
                } else {
                    console.log("📊 Kullanıcı verisinde metrik bulunamadı, otel varsayılanları beklenecek.");
                    setMetrics(null); // Ensure hotel metrics will be loaded if needed
                }
            } else {
                console.warn('Kullanıcı verisi Firestore\'da bulunamadı.');
                setError('Kullanıcı verisi bulunamadı.');
                setUserData(null); // Set to null if not found
                setMetrics(null);
            }
        } catch (error) {
            console.error('❌ Kullanıcı verisi yükleme hatası:', error);
            setError("Kullanıcı verileri yüklenirken bir hata oluştu.");
            setUserData(null);
            setMetrics(null);
        }
    };

    // Load initial hotel metrics if not loaded from user data
    const loadHotelMetrics = async () => {
        if (metrics || !gameSetup?.hotelType) {
            // If metrics already exist or no hotel type, don't load
            return;
        }

        console.log(`🏨 ${gameSetup.hotelType} için başlangıç metrikleri yükleniyor...`);
        // Loading is handled by the caller (initDashboard)
        try {
            const hotelRef = doc(db, "hotelMetrics", gameSetup.hotelType);
            const hotelSnap = await getDoc(hotelRef);

            if (hotelSnap.exists() && hotelSnap.data()?.metrics) {
                const initialMetrics = hotelSnap.data().metrics as MetricValues;
                console.log("✅ Otel başlangıç metrikleri bulundu:", initialMetrics);
                setMetrics(initialMetrics);
                // Save to user if it's the first time (metrics were null)
                if (userData && auth.currentUser) {
                     const userRef = doc(db, 'users', auth.currentUser.uid);
                     await updateDoc(userRef, { metrics: initialMetrics });
                     setUserData(prev => prev ? { ...prev, metrics: initialMetrics } : null);
                     console.log("📝 Başlangıç metrikleri kullanıcıya kaydedildi.");
                }
            } else {
                console.error("❌ Otel başlangıç metrikleri bulunamadı!", gameSetup.hotelType);
                setError(`Başlangıç metrikleri bulunamadı. Varsayılan değerler kullanılıyor.`);
                 const defaultMetrics = { revenue: 50, customerSatisfaction: 50, staffSatisfaction: 50, occupancyRate: 50, sustainability: 50 };
                 setMetrics(defaultMetrics);
                 if (userData && auth.currentUser) {
                      const userRef = doc(db, 'users', auth.currentUser.uid);
                      await updateDoc(userRef, { metrics: defaultMetrics });
                      setUserData(prev => prev ? { ...prev, metrics: defaultMetrics } : null);
                 }
            }
        } catch (error) {
            console.error("🔥 Otel metrikleri yüklenirken hata oluştu:", error);
            setError("Otel başlangıç metrikleri yüklenemedi.");
        }
    };

     // Load scenarios for the current day/role
     const loadScenario = async () => {
         if (!gameSetup?.role || !userData) {
             console.log("⚠️ Senaryo yüklenemiyor: Kurulum, rol veya kullanıcı verisi eksik.");
             return;
         }

         // Avoid reloading if scenarios are already present and not fully answered
         // Consider removing this check if refresh should always reload scenarios for the day
         // Removed check to always attempt fetching scenarios based on current state


         console.log(`🔍 Gün ${userData.currentDay}, Rol ${gameSetup.role}: Senaryolar çekiliyor...`);
         setIsLoading(true); // Loading specifically for scenarios
         setError(null);

         try {
             const scenariosRef = collection(db, "questions");
             const q = query(scenariosRef, where("department", "==", gameSetup.role));
             const querySnapshot = await getDocs(q);

             if (querySnapshot.empty) {
                 console.warn("❌ Bu role ait senaryo bulunamadı:", gameSetup.role);
                 setCurrentDayScenarios([]);
                 // Set a user-friendly message instead of error state if desired
                 // setError(`Bu departman için uygun senaryo bulunamadı.`);
                 return;
             }

             let allQuestions: CurrentScenario[] = querySnapshot.docs.map(docSnapshot => {
                 const data = docSnapshot.data();
                 // Validate options and effects
                 const options = (Array.isArray(data.options) ? data.options : []).map((opt: any) => ({
                     text: opt.text || "Seçenek metni eksik",
                     effects: { // Ensure all keys exist with default 0
                         revenue: opt.effects?.revenue ?? 0,
                         customerSatisfaction: opt.effects?.customerSatisfaction ?? 0,
                         staffSatisfaction: opt.effects?.staffSatisfaction ?? 0,
                         occupancyRate: opt.effects?.occupancyRate ?? 0,
                         sustainability: opt.effects?.sustainability ?? 0,
                     } as ScenarioOptionEffect
                 }));
                 return {
                     id: docSnapshot.id,
                     text: data.text || "Senaryo metni eksik!",
                     department: data.department || "Bilinmeyen Departman",
                     difficulty: data.difficulty ?? 1,
                     options: options,
                 };
             });
             console.log(`[loadScenario] 📚 Total questions fetched for role ${gameSetup.role}: ${allQuestions.length}`); // ADDED LOG

             // Filter out already answered questions *in this game session*
             const answeredQuestionIds = new Set(userDecisions.map(dec => dec.questionId));
             console.log(`[loadScenario] 🚫 Answered Question IDs in this session:`, answeredQuestionIds); // ADDED LOG
             let availableQuestions = allQuestions.filter(q => !answeredQuestionIds.has(q.id));

             if (availableQuestions.length === 0) {
                  console.warn("✅ Bu departmandaki mevcut tüm senaryolar cevaplanmış.");
                  setCurrentDayScenarios([]);
                  return;
             }

             availableQuestions.sort(() => 0.5 - Math.random());

             const randomCount = Math.floor(Math.random() * 2) + 1; // 1 or 2 scenarios
             const selectedScenarios = availableQuestions.slice(0, randomCount);

             setCurrentDayScenarios(selectedScenarios);
             setAnsweredCount(0);

             console.log(`✅ ${selectedScenarios.length} adet senaryo yüklendi.`);

         } catch (error) {
             console.error("🔥 Senaryo yükleme hatası:", error);
             setError("Senaryolar yüklenirken bir hata oluştu.");
             setCurrentDayScenarios([]);
         } finally {
             setIsLoading(false); // Stop scenario loading indicator
         }
     };


    // Kullanıcı kararlarını yükle
    const loadUserDecisions = async () => {
        if (!auth.currentUser) {
            console.warn("Karar geçmişi yüklenemedi: Kullanıcı girişi yok.");
            return;
        }
        const currentGameId = localStorage.getItem('currentGameId');
        if (!currentGameId) {
            console.warn("Karar geçmişi yüklenemedi: Oyun ID'si yok.");
            setUserDecisions([]); // Ensure it's empty
            return;
        }

        console.log("📜 Karar geçmişi yükleniyor (Oyun ID:", currentGameId, ")");
        // No global loading set here, it's part of initial load or background refresh
        try {
            const decisionsRef = collection(db, 'userDecisions');
            const q = query(
                decisionsRef,
                where('userId', '==', auth.currentUser.uid),
                where('gameId', '==', currentGameId)
                // Optionally add: orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);

            const decisions = querySnapshot.docs.map(docSnapshot => {
                const data = docSnapshot.data();
                return {
                    id: docSnapshot.id,
                    userId: data.userId,
                    questionId: data.questionId || "ID Yok", // Default if missing
                    selectedOption: data.selectedOption, // Keep index
                    metrics: data.metrics || { before: {}, after: {} }, // Default empty objects
                    createdAt: data.createdAt, // Keep as Timestamp or undefined
                    day: data.day || null,
                    scenarioText: data.scenarioText || "Senaryo metni yok",
                    selectedOptionText: data.selectedOptionText || "Seçenek metni yok",
                    gameId: data.gameId,
                    baoScore: data.baoScore // Will be number or undefined
                } as UserDecision;
            })
            // Sort client-side if needed (e.g., by day then timestamp)
            .sort((a, b) => (b.day ?? 0) - (a.day ?? 0) || (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));

            setUserDecisions(decisions);
            console.log(`✅ ${decisions.length} adet karar geçmişi yüklendi.`);

            // Scenario loading is now handled by the useEffect hook watching userDecisions.
            // Removed explicit call: loadScenario();

        } catch (error) {
            console.error('❌ Karar geçmişi yükleme hatası:', error);
            setError("Karar geçmişi yüklenirken bir sorun oluştu.");
            setUserDecisions([]); // Clear on error
            // If decisions fail to load, scenarios cannot be filtered correctly,
            // so we should also attempt to clear scenarios or show an error state for scenarios.
            // For now, let's just clear decisions and rely on the error state.
        }
    };

    // Senaryo kararını işle (UPDATED with BAO)
    const handleDecision = async (questionId: string, optionIndex: number) => {
        // Pre-checks
        if (!userData || !auth.currentUser || !metrics || !gameSetup) {
            console.error("❌ Karar işlenemiyor: Eksik veri.", { userData, auth: !!auth.currentUser, metrics, gameSetup });
            setError("İşlem yapılamadı, gerekli veriler eksik. Sayfayı yenileyin.");
            return;
        }

        const scenario = currentDayScenarios.find(s => s.id === questionId);
        if (!scenario) {
            console.warn("Senaryo bulunamadı, ID:", questionId);
            setError("Senaryo işlenemedi.");
            return;
        }
        const selectedOption = scenario.options[optionIndex];
        if (!selectedOption) {
            console.warn("Seçenek bulunamadı, Index:", optionIndex);
            setError("Seçenek işlenemedi.");
            return;
        }

        // Start Processing
        setIsLoading(true);
        setError(null);

        try {
            // 1. Calculate Metric Changes
            const oldMetrics = { ...metrics };
            const newMetrics = { ...metrics };
            (Object.keys(selectedOption.effects) as Array<keyof ScenarioOptionEffect>).forEach((key) => {
                if (newMetrics.hasOwnProperty(key)) { // Check if metric exists in state
                    newMetrics[key] = Math.min(100, Math.max(0, newMetrics[key] + selectedOption.effects[key]));
                }
            });

            // --- BAO Score Calculation ---
            const baoScore = calculateBAOScore(selectedOption.effects);
            console.log(`🌟 Karar BAO Skoru: ${baoScore.toFixed(1)} (Seçenek: ${optionIndex + 1})`);
            // --- End BAO Calculation ---

            // 2. Update Metrics in Firestore
            await updateUserMetrics(auth.currentUser.uid, newMetrics);

            // 3. Get Game ID & Save Decision
            const currentGameId = localStorage.getItem('currentGameId');
            if (!currentGameId) {
                throw new Error("Oyun ID'si bulunamadı!");
            }

            await saveUserDecision({
                userId: auth.currentUser.uid,
                questionId: scenario.id,
                selectedOption: optionIndex, // Save index
                metrics: { before: oldMetrics, after: newMetrics },
                day: userData.currentDay,
                scenarioText: scenario.text,
                selectedOptionText: selectedOption.text,
                gameId: currentGameId,
                baoScore: baoScore, // *** Save the calculated BAO score ***
                // createdAt handled by service
            });
            console.log("✅ Karar kaydedildi.");

            // 4. Check Achievements (Check *after* decision is saved, using new metrics)
            // Pass userDecisions + the new decision temporarily for FIRST_DECISION check
            await checkAchievements(newMetrics); // FIRST_DECISION check inside uses userDecisions state, which is updated later


            // 5. Update Local State
            setMetrics(newMetrics);
            const remainingScenarios = currentDayScenarios.filter(q => q.id !== questionId);
            setCurrentDayScenarios(remainingScenarios);
            const newAnsweredCount = answeredCount + 1;
            setAnsweredCount(newAnsweredCount);
            // Update userData's metrics locally too
            setUserData(prev => prev ? { ...prev, metrics: newMetrics } : null);

            // 6. Check if Day Ends
            if (remainingScenarios.length === 0) {
                console.log("🔚 Bugünkü sorular bitti, gün ilerletiliyor...");

                const nextDay = userData.currentDay + 1;
                const completedTurns = userData.completedScenarios + 1;

                 // Update Firestore first
                 await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                     currentDay: nextDay,
                     completedScenarios: completedTurns,
                     lastLoginDate: serverTimestamp() // Update login date on day change
                 });


                 // Check Game Over
                 if (completedTurns >= 10) {
                     console.log("🎉 Oyun bitti! Yönlendiriliyor...");
                      // Update local state before navigating
                     setUserData(prev => prev ? { ...prev, currentDay: nextDay, completedScenarios: completedTurns } : null);
                     navigate(`/game-over?gameId=${currentGameId}`);
                     setIsLoading(false); // Stop loading before navigate
                     return; // Exit function
                 } else {
                     // Proceed to next day - Update local state
                     console.log(`🌅 Yeni güne geçildi: Gün ${nextDay}`);
                     setUserData(prev => prev ? { ...prev, currentDay: nextDay, completedScenarios: completedTurns } : null);
                     // New scenarios will load via useEffect hook watching userData.currentDay
                 }
            }

            // 7. Refresh Decision History
            // Needs to run *after* potential state updates and saving the decision
            await loadUserDecisions();

            // 8. Load next scenarios - Removed direct call.
            // Scenarios will now load via the useEffect hook triggered by
            // the userDecisions state update in loadUserDecisions (called in step 7).


        } catch (error) {
            console.error("🔥 Karar işleme hatası:", error);
            setError(`Karar işlenirken hata oluştu: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(false); // Stop loading indicator
        }
    };

    // Başarım bilgilerini getir
    const getAchievementInfo = (achievementId: string) => {
        const achievementsMap: { [key: string]: { icon: string; name: string; desc: string } } = {
            'HAPPY_CUSTOMERS': { icon: '😊', name: 'Mutlu Müşteriler', desc: "Memnuniyet %90+" },
            'REVENUE_MASTER': { icon: '💰', name: 'Gelir Ustası', desc: 'Gelir %80+' },
            'STAFF_CHAMPION': { icon: '👥', name: 'Personel Şampiyonu', desc: 'Personel Mem. %85+' },
            'FIRST_DECISION': { icon: '⭐', name: 'İlk Adım', desc: 'İlk karar verildi!' }
        };
        return achievementsMap[achievementId] || { icon: '🏆', name: 'Bilinmeyen', desc: '' };
    };

    // --- useEffect Hooks ---

    // Initial Setup Effect
    useEffect(() => {
        const initDashboard = async () => {
            console.log("🚀 Dashboard başlatılıyor...");
            setIsLoading(true);
            setError(null);

            if (!auth.currentUser) {
                console.log("👤 Kullanıcı girişi yok, /game-setup yönlendiriliyor.");
                navigate('/game-setup');
                setIsLoading(false);
                return;
            }

            try {
                // 1. Game Setup
                const setupData = localStorage.getItem('gameSetup');
                if (!setupData) throw new Error("Oyun kurulumu bulunamadı.");
                const setup = JSON.parse(setupData) as GameSetup;
                if (!setup.hotelType || !setup.role) throw new Error("Geçersiz oyun kurulumu.");
                setGameSetup(setup);
                console.log("✅ Oyun Kurulumu:", setup);

                // 2. Game ID
                let currentGameId = localStorage.getItem('currentGameId');
                if (!currentGameId) {
                    currentGameId = `game_${auth.currentUser.uid}_${Date.now()}`;
                    localStorage.setItem('currentGameId', currentGameId);
                    console.log("🎮 Yeni Oyun ID'si oluşturuldu:", currentGameId);
                } else {
                    console.log("🎮 Mevcut Oyun ID'si:", currentGameId);
                }

                // 3. Load User Data & Decisions (Metrics might be loaded here)
                await loadUserData();
                await loadUserDecisions(); // Load history

                // 4. Load Hotel Metrics (if needed) - Handled by separate useEffect

                // 5. Daily Login Check - Handled by separate useEffect

                console.log("✅ Dashboard ilk kurulum tamamlandı.");

            } catch (error) {
                console.error('❌ Dashboard başlatma hatası:', error);
                setError(error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu.");
                // Consider navigating away or showing retry options
            } finally {
                setIsLoading(false); // Stop initial loading
            }
        };

        initDashboard();
    }, [navigate]); // Run once on mount


    // Effect to load hotel metrics if they weren't loaded from user data
    useEffect(() => {
        // Run only if setup exists and metrics are still null after user data load attempt
        if (gameSetup && metrics === null && !isLoading) { // Added !isLoading check
             loadHotelMetrics();
        }
    }, [gameSetup, metrics, isLoading]); // Depend on these states


    // Effect to load scenarios when day changes or role changes (and game is ready)
    useEffect(() => {
        // Ensure game is ready (setup, user, metrics exist) and not currently loading critical data
        // Ensure game is ready (setup and user data exist)
        if (gameSetup?.role && userData?.currentDay) { // Removed metrics and !isLoading from condition
            console.log(`🔄 İzleyici: Gün ${userData.currentDay} veya rol ${gameSetup.role} değişti, senaryo yükleme tetiklendi.`);
            loadScenario();
        }
    }, [gameSetup?.role, userData?.currentDay, userDecisions]); // Dependencies remain the same


    // Effect for Daily Login Update
    useEffect(() => {
        if (!userData?.lastLoginDate || !auth.currentUser) return; // Basic checks

        try {
            const lastLoginTimestamp = userData.lastLoginDate as Timestamp;
            // Check if it's a valid Firestore Timestamp
            if (typeof lastLoginTimestamp?.toDate !== 'function') {
                console.warn("Geçersiz lastLoginDate formatı:", userData.lastLoginDate);
                return;
            }
            const lastLoginDate = lastLoginTimestamp.toDate();
            const today = new Date();

            const isDifferentDay = lastLoginDate.getFullYear() !== today.getFullYear() ||
                                   lastLoginDate.getMonth() !== today.getMonth() ||
                                   lastLoginDate.getDate() !== today.getDate();

            if (isDifferentDay) {
                console.log("📅 Farklı günde giriş, lastLoginDate güncelleniyor.");
                const userRef = doc(db, 'users', auth.currentUser.uid);
                updateDoc(userRef, { lastLoginDate: serverTimestamp() })
                    .catch(err => console.error("lastLoginDate güncellenemedi:", err));
            }
        } catch (error) {
            console.error('❌ Tarih kontrolü hatası:', error);
        }
    }, [userData]); // Rerun when userData potentially changes


    // --- Render Logic ---

    // Initial Loading State
    if (isLoading && !gameSetup && !userData) { // More specific initial load check
        return (
            <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f7fa' }}>
                <div style={{ textAlign: 'center' }}>
                    <h2 style={{ color: '#1e3c72' }}>Oyun Yükleniyor...</h2>
                    <p style={{ color: '#666' }}>Lütfen bekleyin</p>
                     {/* Simple Spinner */}
                     <div style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite', margin: '15px auto' }}></div>
                     <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    // Error State
    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f7fa' }}>
                <div style={{ textAlign: 'center', background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', border: '2px solid #dc3545' }}>
                    <h2 style={{ color: '#dc3545', marginBottom: '15px' }}>Hata Oluştu</h2>
                    <p style={{ color: '#666', marginBottom: '20px' }}>{error}</p>
                     <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', background: '#1e3c72', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1em', marginRight: '10px' }}>
                         Tekrar Dene
                     </button>
                     <button onClick={logout} style={{ padding: '10px 20px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1em' }}>
                         Oyundan Çık
                     </button>
                </div>
            </div>
        );
    }

    // Fallback if essential data is somehow still missing after load attempts
     if (!gameSetup || !userData || !metrics) {
         console.error("Render hatası: Gerekli veriler eksik.", { gameSetup, userData, metrics });
         return (
             <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f7fa', color: '#6c757d', textAlign: 'center' }}>
                  <div>
                      <h2>Oyun Verileri Yüklenemedi</h2>
                      <p>Lütfen sayfayı yenileyin veya çıkış yapıp tekrar deneyin.</p>
                      <button onClick={logout} style={{ padding: '10px 20px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginTop: '20px' }}>
                          Oyundan Çık
                      </button>
                  </div>
             </div>
         );
     }


    // --- Chart and Metric Display Helpers ---
    const chartData = {
        labels: ['Gelir', 'Müşteri Mem.', 'Personel Mem.', 'Doluluk', 'Sürdürülebilirlik'],
        datasets: [{
            label: 'Metrikler (%)',
            data: metrics ? [
                metrics.revenue,
                metrics.customerSatisfaction,
                metrics.staffSatisfaction,
                metrics.occupancyRate,
                metrics.sustainability
            ] : [0, 0, 0, 0, 0],
            backgroundColor: ['#2196f3', '#4caf50', '#ff9800', '#f44336', '#9c27b0'],
            borderColor: '#ffffff',
            borderWidth: 2
        }]
    };
    const chartOptions = {
        responsive: true,
        plugins: {
            legend: { display: false }, // Hide legend inside doughnut
            tooltip: {
                callbacks: { label: (context: any) => `${context.label}: ${context.parsed}%` }
            }
        }
    };

    const getMetricColor = (value: number): string => {
        if (value >= 80) return '#28a745';
        if (value >= 60) return '#2193b0';
        if (value >= 40) return '#ffc107';
        return '#dc3545';
    };

    const MetricBar = ({ label, value }: { label: string; value: number }) => (
        <div style={{ marginBottom: '12px' }}> {/* Reduced margin */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                <span style={{ color: '#555', fontSize: '0.9em' }}>{label}</span> {/* Darker gray */}
                <span style={{ color: getMetricColor(value), fontWeight: 'bold', fontSize: '0.95em' }}>{value}%</span>
            </div>
            <div style={{ height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden' }}> {/* Slimmer bar */}
                <div style={{
                    width: `${value}%`, height: '100%', background: getMetricColor(value),
                    borderRadius: '3px', transition: 'width 0.4s ease-out'
                }} />
            </div>
        </div>
    );

    // Helper for Hotel Type Name
    const getHotelTypeName = (type: string): string => {
        const types: { [key: string]: string } = { '5_star': '5 Yıldızlı Otel', 'boutique': 'Butik Otel', 'resort': 'Tatil Köyü' };
        return types[type] || type;
    };

    // Helper for Role Name
    const getRoleName = (role: string): string => {
        const roles: { [key: string]: string } = { 'reservation': 'Rezervasyon', 'customer_relations': 'Müşteri İlişkileri', 'operations': 'Operasyon', 'financial': 'Gelir Yönetimi', 'hr': 'Personel' };
        return roles[role] || role;
    };


    // --- Main Render Structure ---
    return (
        <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '15px' }}> {/* Slightly different background */}
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ background: 'white', padding: '15px 20px', borderRadius: '10px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                        <h2 style={{ color: '#1e3c72', marginBottom: '2px', fontSize: '1.3em' }}>
                            {getHotelTypeName(gameSetup.hotelType)}
                        </h2>
                        <p style={{ color: '#555', fontSize: '0.9em' }}>
                            Rol: {getRoleName(gameSetup.role)} | Gün: {userData.currentDay} | Tur: {userData.completedScenarios}/10
                        </p>
                    </div>
                     {/* Action Button */}
                    <button onClick={logout} disabled={isLoading} style={{ padding: '8px 15px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1, transition: 'opacity 0.2s', fontSize:'0.9em' }}>
                        Oyundan Çık
                    </button>
                </div>

                {/* Average BAO Score Summary */}
                {averageBaoScore !== null && (
                    <div style={{ background: 'white', padding: '15px 20px', borderRadius: '10px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', fontSize: '1.1em', color: '#1e3c72' }}>
                        <strong>Genel Ortalama BAO Skoru:</strong>{' '}
                        <span style={{ color: getMetricColor(averageBaoScore * 10), fontWeight: 'bold' }}>
                            {getEmojiForScore(averageBaoScore)} {averageBaoScore.toFixed(1)}
                        </span>
                    </div>
                )}

                {/* BAO Explanation Section */}
                <div style={{ background: 'white', padding: '15px 20px', borderRadius: '10px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h4 style={{ color: '#1e3c72', marginBottom: '10px', fontSize: '1em' }}>BAO Skoru Nedir?</h4>
                    <p style={{ color: '#555', fontSize: '0.9em', lineHeight: '1.4', marginBottom: '10px' }}>
                        BAO Skoru (Basit Ağırlıklı Ortalama), kararlarınızın otel metrikleri üzerindeki etkilerinin ağırlıklı ortalamasını gösterir. Bu skor, her bir metriğin etkisinin belirlenen ağırlıklarla çarpılıp toplanmasıyla hesaplanır.
                    </p>
                    <p style={{ color: '#555', fontSize: '0.9em', lineHeight: '1.4', fontStyle: 'italic' }}>
                        Formül: BAO = Σ (Metrik Etkisi * Metrik Ağırlığı) / Σ (Metrik Ağırlığı)
                    </p>
                    <p style={{ color: '#555', fontSize: '0.9em', lineHeight: '1.4', marginTop: '10px' }}>
                        Örneğin, Gelir metriğinin ağırlığı 0.25 ise ve bir karar Gelir üzerinde +10 etki yapıyorsa, bu metriğin skora katkısı 10 * 0.25 = 2.5 olur. Tüm metriklerin katkıları toplanarak toplam ağırlığa bölünür ve nihai BAO skoru elde edilir. Bu skor, kararınızın otelin genel performansına etkisini özetler.
                    </p>
                </div>

                {/* Main Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                    {/* Metrics Card */}
                    <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ marginBottom: '15px', color: '#1e3c72', borderBottom: '1px solid #eee', paddingBottom: '8px', fontSize:'1.1em' }}>
                            📊 Otel Metrikleri
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

                    {/* Active Scenario Card */}
                    <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.08)', border: '1px solid #e0e0e0' }}>
                        <h3 style={{ color: '#1e3c72', marginBottom: '15px', fontSize: '1.2em', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                            🎯 Günlük Kararlar
                        </h3>
                        {isLoading && currentDayScenarios.length === 0 && ( // Show loading only if no scenarios are visible
                             <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Senaryolar yükleniyor...</div>
                        )}
                        {!isLoading && currentDayScenarios.length === 0 && ( // Show message if loading finished and no scenarios
                            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                Bugün için yeni karar senaryosu bulunmuyor.
                                {userData.completedScenarios >= 10 && <p>Oyunu tamamladınız!</p>}
                            </div>
                        )}
                        {currentDayScenarios.length > 0 && (
                            currentDayScenarios.map((scenario, idx) => (
                                <div key={scenario.id} style={{ background: '#f8f9fa', border: '1px solid #eee', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                                    <p style={{ fontSize: '1em', color: '#333', marginBottom: '12px', lineHeight: '1.4' }}>
                                        <strong>{scenario.text}</strong>
                                        <span style={{ fontSize: '0.8em', color: '#666', marginLeft: '8px', background: '#e9ecef', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                             Zorluk: {'⭐'.repeat(scenario.difficulty)}
                                        </span>
                                    </p>

                                    {/* Options */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {/* --- UPDATED Options Rendering with BAO --- */}
                                        {scenario.options.map((option, optionIndex) => {
                                            const optionBAOScore = calculateBAOScore(option.effects);
                                            const scoreEmoji = getEmojiForScore(optionBAOScore);
                                            // Define style for BAO score indicator
                                            const baoStyle = {
                                                fontSize: '0.85em', fontWeight: 'bold', marginLeft: 'auto', // Push to the right
                                                padding: '3px 8px', borderRadius: '12px', color: 'white',
                                                background: optionBAOScore > 1 ? '#28a745' : optionBAOScore < -1 ? '#dc3545' : '#6c757d',
                                                whiteSpace: 'nowrap' as const // Ensure TypeScript knows this is valid
                                            };

                                            return (
                                                <button
                                                    key={optionIndex}
                                                    onClick={() => handleDecision(scenario.id, optionIndex)}
                                                    disabled={isLoading}
                                                    style={{
                                                        padding: '12px 15px', background: 'white',
                                                        border: '1px solid #ccc', borderRadius: '8px',
                                                        cursor: isLoading ? 'not-allowed' : 'pointer',
                                                        textAlign: 'left', transition: 'all 0.2s ease',
                                                        opacity: isLoading ? 0.6 : 1, display: 'flex', flexDirection: 'column', // Flex column layout
                                                        // Hover effect (simple version)
                                                        // Consider using CSS classes for better management
                                                    }}
                                                    onMouseEnter={(e) => !isLoading && (e.currentTarget.style.borderColor = '#0d6efd')}
                                                    onMouseLeave={(e) => !isLoading && (e.currentTarget.style.borderColor = '#ccc')}
                                                >
                                                     {/* Top Row: Option Text and BAO Score */}
                                                     <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom:'8px' }}>
                                                         <span style={{ color: '#333', flexGrow: 1, marginRight:'10px' }}>{option.text}</span> {/* Option text takes available space */}
                                                         <span style={baoStyle} title={`Genel Etki Skoru: ${optionBAOScore.toFixed(1)}`}>
                                                             {scoreEmoji} {optionBAOScore.toFixed(1)}
                                                         </span>
                                                     </div>

                                                    {/* Bottom Row: Detailed Effects */}
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.8em' }}>
                                                        {(Object.keys(option.effects) as Array<keyof ScenarioOptionEffect>).map((key) => {
                                                            const value = option.effects[key];
                                                            if (value === 0) return null; // Hide zero effects
                                                            const isPositive = value > 0;
                                                            const iconMap: { [key in keyof ScenarioOptionEffect]: string } = { revenue: '💰', customerSatisfaction: '😊', staffSatisfaction: '👥', occupancyRate: '🏨', sustainability: '♻️' };
                                                            const metricNames: { [key in keyof ScenarioOptionEffect]: string } = { revenue: 'Gelir', customerSatisfaction: 'Müşteri', staffSatisfaction: 'Personel', occupancyRate: 'Doluluk', sustainability: 'Sürdürü.' };

                                                            return (
                                                                <span key={key} title={`${metricNames[key]}: ${isPositive ? '+' : ''}${value}%`} style={{
                                                                    background: isPositive ? '#e9f7ec' : '#fdecea', color: isPositive ? '#1e7e34' : '#c9302c',
                                                                    padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap'
                                                                }}>
                                                                    {iconMap[key]} {isPositive ? '+' : ''}{value}%
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {/* --- END UPDATED Options Rendering --- */}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Chart & Achievements Combined Column (Optional Layout) */}
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                         {/* Chart Card */}
                         <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                             <h3 style={{ marginBottom: '15px', color: '#1e3c72', borderBottom: '1px solid #eee', paddingBottom: '8px', width: '100%', textAlign: 'center', fontSize:'1.1em' }}>
                                 📈 Metrik Dağılımı
                             </h3>
                             <div style={{ width: '100%', maxWidth: '250px' }}> {/* Adjusted size */}
                                 {metrics ? <Doughnut data={chartData} options={chartOptions} /> : <p>Yükleniyor...</p>}
                             </div>
                             {/* Simple Legend Below Chart */}
                              <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:'10px', marginTop:'15px', fontSize:'0.8em' }}>
                                  {chartData.labels.map((label, index) => (
                                      <span key={label} style={{ display:'flex', alignItems:'center' }}>
                                          <span style={{ width:'10px', height:'10px', borderRadius:'50%', backgroundColor: chartData.datasets[0].backgroundColor[index], marginRight:'5px' }}></span>
                                          {label}
                                      </span>
                                  ))}
                              </div>
                         </div>

                         {/* Achievements Card */}
                         <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                             <h3 style={{ color: '#1e3c72', marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '8px', fontSize:'1.1em' }}>
                                 🏆 Başarımlar
                             </h3>
                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '10px' }}>
                                 {['HAPPY_CUSTOMERS', 'REVENUE_MASTER', 'STAFF_CHAMPION', 'FIRST_DECISION'].map((id) => {
                                     const ach = getAchievementInfo(id);
                                     const isUnlocked = userData?.achievements?.includes(id) ?? false;
                                     return (
                                         <div key={id} title={`${ach.name}: ${ach.desc}${isUnlocked ? ' (Kazanıldı)' : ''}`} style={{ padding: '10px', background: isUnlocked ? '#e7f7ec' : '#f8f9fa', border: `1px solid ${isUnlocked ? '#b8e0c2' : '#dee2e6'}`, borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', opacity: isUnlocked ? 1 : 0.6, transition: 'all 0.3s ease' }}>
                                             <span style={{ fontSize: '1.5em', filter: isUnlocked ? 'none' : 'grayscale(80%)' }}>{ach.icon}</span>
                                             <strong style={{ marginTop: '5px', fontSize: '0.75em', color: '#444', lineHeight:'1.2' }}>{ach.name}</strong>
                                         </div>
                                     );
                                 })}
                             </div>
                         </div>
                    </div>
                </div>

                {/* History Card (Moved to full width below) */}
                <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', maxHeight: '400px', overflowY: 'auto', marginBottom: '15px' }}>
                    <h3 style={{ color: '#1e3c72', marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '8px', position: 'sticky', top: -20, background: 'white', zIndex: 1, fontSize:'1.1em' }}> {/* Adjust top for padding */}
                        📜 Karar Geçmişi ({userDecisions.length})
                    </h3>
                    <div style={{ paddingTop: '5px' }}>
                        {userDecisions.length > 0 ? userDecisions.map((decision) => (
                            <div key={decision.id} style={{ background: '#f8f9fa', border: '1px solid #eee', padding: '10px 15px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.9em' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#555', fontSize: '0.9em' }}>
                                    <strong>Gün {decision.day || '?'}</strong>
                                    <span>{(decision.createdAt instanceof Timestamp) ? decision.createdAt.toDate().toLocaleDateString() : 'Tarih yok'}</span>
                                </div>
                                <p style={{ margin: '4px 0', color: '#444', fontStyle: 'italic' }}>"{decision.scenarioText?.substring(0, 80) ?? '...'}"</p>
                                <p style={{ margin: '4px 0', color: '#0d6efd', display:'flex', alignItems:'center', flexWrap:'wrap' }}>
                                    <span style={{fontWeight: 'bold', marginRight:'5px'}}>Karar:</span>
                                    <span>{decision.selectedOptionText?.substring(0, 80) ?? `Seçenek ${decision.selectedOption + 1}`}</span>
                                    {/* BAO Score Display in History */}
                                    {typeof decision.baoScore === 'number' && (
                                        <span style={{
                                            marginLeft: '10px', padding: '2px 8px', borderRadius: '10px', fontSize: '0.85em',
                                            color: 'white', fontWeight: 'bold',
                                            background: decision.baoScore > 1 ? '#28a745' : decision.baoScore < -1 ? '#dc3545' : '#6c757d'
                                        }} title={`Kaydedilen Etki Skoru: ${decision.baoScore.toFixed(1)}`}>
                                             {getEmojiForScore(decision.baoScore)} {decision.baoScore.toFixed(1)}
                                        </span>
                                    )}
                                </p>
                            </div>
                        )) : (
                            <p style={{ textAlign: 'center', color: '#666', padding: '20px 0' }}>
                                Bu oyun için henüz karar geçmişi yok.
                            </p>
                        )}
                    </div>
                </div>


                {/* Grafik Modal (Less prominent now, could be removed) */}
                {isChartOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setIsChartOpen(false)}>
                        <div style={{ background: 'white', borderRadius: '12px', padding: '20px 30px', maxWidth: '500px', width: '90%', textAlign: 'center', position: 'relative', boxShadow: '0 5px 20px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
                            <h2 style={{ color: '#1e3c72', marginBottom: '20px' }}>Metrikler Grafiği</h2>
                            <Doughnut data={chartData} options={chartOptions} />
                            <button onClick={() => setIsChartOpen(false)} style={{ marginTop: '25px', padding: '10px 20px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1em' }}>
                                Kapat
                            </button>
                        </div>
                    </div>
              )}
            </div>
            {/* Spinner Keyframes removed */}
        </div>
    );
};

export default GameDashboard;
