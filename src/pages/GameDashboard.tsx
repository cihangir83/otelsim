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
    Legend,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    PointElement, // Added for Line Chart
    LineElement,   // Added for Line Chart
    ChartData,     // Import ChartData type
    ChartOptions   // Import ChartOptions type
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2'; // Added Line

// Keep existing type imports
// *** IMPORTANT: Ensure UserDecision type in '../types/firebase' is updated as shown below! ***
import { UserData, UserDecision as ExternalUserDecision, MetricValues } from '../types/firebase';

// --- LOCAL TYPE DEFINITION ---
// Using intersection to ensure local type includes all expected score fields,
// even if the external type might be slightly behind.
interface LocalUserDecision extends ExternalUserDecision {
    baoScore?: number;
    sawScore?: number; // Keeping for clarity, but calculation is same as BAO
    topsisScore?: number;
    vikorSScore?: number;
    vikorRScore?: number;
    ahpScore?: number;
    electreScore?: number;
    mavtScore?: number;
    // If 'vikorScore' existed in ExternalUserDecision and isn't needed,
    // you might need to exclude it here if it causes issues.
    // Example: omit 'vikorScore' if it exists in ExternalUserDecision
    // vikorScore?: never; // This would make its type 'never' effectively removing it
}

// --- END LOCAL TYPE DEFINITION ---


ChartJS.register(
    ArcElement,
    Tooltip,
    Legend,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    PointElement, // Added for Line Chart
    LineElement   // Added for Line Chart
);

interface GameSetup {
    hotelType: string;
    role: string;
}

interface ScenarioOptionEffect extends MetricValues {}

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

// Define metric weights
const metricWeights: { [key in keyof MetricValues]: number } = {
    revenue: 0.25,
    customerSatisfaction: 0.25,
    staffSatisfaction: 0.2,
    occupancyRate: 0.15,
    sustainability: 0.15,
};

// Assuming maximum possible effect magnitude for scaling proxies
// Based on typical scenario effects, e.g., +/- 20%
const MAX_EFFECT_MAGNITUDE: number = 20; // Explicitly type as number
const MIN_EFFECT_MAGNITUDE: number = -20; // Explicitly type as number

// Helper for score emojis (primarily for scores scaled around 0)
const getEmojiForScore = (score: number | undefined | null): string => {
     if (score === undefined || score === null) return '❓'; // Handle missing score
    if (score >= 4) return '🎉';
    if (score >= 1) return '👍';
    if (score >= -1) return '🙂';
    if (score >= -4) return '🤔';
    return '😱';
};

// --- MCDA Score Calculations ---

// 1. BAO Score (Simple Additive Weighting - SAW)
// SAW is mathematically identical to BAO in this setup where weights sum to 1.
const calculateBAOScore = (effects: ScenarioOptionEffect): number => {
    let weightedSum = 0;
    (Object.keys(metricWeights) as Array<keyof MetricValues>).forEach((key) => {
        // Ensure effectValue is treated as a number, defaulting to 0 if null/undefined
        const effectValue = effects[key] ?? 0;
        const weightValue = metricWeights[key];
        weightedSum += effectValue * weightValue;
    });
    return Math.round(weightedSum * 10) / 10;
};

// Re-using BAO calculation for SAW as they are the same method here
const calculateSAWScore = calculateBAOScore;


// 2. Simplified TOPSIS Score (Scaled Net Benefit Ratio)
const calculateSimplifiedTopsisScore = (effects: ScenarioOptionEffect): number => {
     let positiveWeightedSum = 0;
     let totalAbsoluteWeightedImpact = 0;

     (Object.keys(metricWeights) as Array<keyof MetricValues>).forEach((key) => {
         const effectValue = effects[key] ?? 0;
         const weightValue = metricWeights[key];

         if (effectValue > 0) {
             positiveWeightedSum += effectValue * weightValue;
         }
         totalAbsoluteWeightedImpact += Math.abs(effectValue) * weightValue;
     });

     if (totalAbsoluteWeightedImpact === 0) {
         return 0; // Avoid division by zero
     }

     const topsisRatio = positiveWeightedSum / totalAbsoluteWeightedImpact;
     const scaledScore = (topsisRatio * 10) - 5; // Scale [0, 1] to [-5, 5]

     return Math.round(scaledScore * 10) / 10;
};

// 3. Simplified VIKOR Scores (S and R) - Regret based
const calculateSimplifiedVikorScores = (effects: ScenarioOptionEffect): { sScore: number, rScore: number } => {
    let sScoreSumOfRegret = 0; // Sum of weighted absolute negative effects
    let rScoreMaxRegret = 0;    // Max weighted absolute negative effect

    (Object.keys(metricWeights) as Array<keyof MetricValues>).forEach((key) => {
        const effectValue = effects[key] ?? 0;
        const weightValue = metricWeights[key];

        if (effectValue < 0) {
            const weightedNegativeEffectAbsolute = Math.abs(effectValue) * weightValue;
            sScoreSumOfRegret += weightedNegativeEffectAbsolute;
            rScoreMaxRegret = Math.max(rScoreMaxRegret, weightedNegativeEffectAbsolute);
        }
    });

    return {
        sScore: Math.round(sScoreSumOfRegret * 10) / 10,
        rScore: Math.round(rScoreMaxRegret * 10) / 10
    };
};

// 4. Simplified AHP Proxy (Weighted Standardized Impact)
const calculateSimplifiedAhpScore = (effects: ScenarioOptionEffect): number => {
    let weightedStandardizedSum = 0;
    let totalWeight = 0;

    (Object.keys(metricWeights) as Array<keyof MetricValues>).forEach((key) => {
        const effectValue = effects[key] ?? 0;
        const weightValue = metricWeights[key];

        // Standardize effect by MAX_EFFECT_MAGNITUDE (which is constant and > 0)
        // No need for complex ternary or checks here as MAX_EFFECT_MAGNITUDE is hardcoded > 0
        const standardizedEffect = MAX_EFFECT_MAGNITUDE !== 0 ? effectValue / MAX_EFFECT_MAGNITUDE : 0;


        weightedStandardizedSum += standardizedEffect * weightValue;
        totalWeight += weightValue;
    });

    // Scale the result (range roughly [-1, 1]) to [-5, 5]
    const scaledScore = (totalWeight > 0 ? weightedStandardizedSum / totalWeight : 0) * 5;

    return Math.round(scaledScore * 10) / 10;
};

// 5. Simplified ELECTRE Proxy (Weighted Concordance - Discordance by Threshold)
const DISCORDANCE_THRESHOLD = -5; // Effects less than -5% are "significantly negative"

const calculateSimplifiedElectreScore = (effects: ScenarioOptionEffect): number => {
    let concordanceWeightSum = 0; // Sum of weights where effect > 0
    let discordanceWeightSum = 0; // Sum of weights where effect < DISCORDANCE_THRESHOLD
    let totalWeight = 0;

    (Object.keys(metricWeights) as Array<keyof MetricValues>).forEach((key) => {
        const effectValue = effects[key] ?? 0;
        const weightValue = metricWeights[key];

        if (effectValue > 0) {
            concordanceWeightSum += weightValue;
        } else if (effectValue < DISCORDANCE_THRESHOLD) {
            discordanceWeightSum += weightValue;
        }
         totalWeight += weightValue;
    });

    // Score is concordance evidence minus discordance evidence. Range is [-totalWeight, totalWeight].
    const rawScore = concordanceWeightSum - discordanceWeightSum;

    // Scale the result from [-1, 1] to [-5, 5]
    const scaledScore = rawScore * 5;

    return Math.round(scaledScore * 10) / 10;
};


// 6. Simplified MAVT Proxy (Weighted Non-Linear Utility)
const NEGATIVE_EFFECT_PENALTY_FACTOR = 1.5;

const calculateSimplifiedMavtScore = (effects: ScenarioOptionEffect): number => {
    let weightedUtilitySum = 0;
    let totalWeight = 0;

    (Object.keys(metricWeights) as Array<keyof MetricValues>).forEach((key) => {
        const effectValue = effects[key] ?? 0;
        const weightValue = metricWeights[key];

        let utilityValue = effectValue;
        if (effectValue < 0) {
            utilityValue = effectValue * NEGATIVE_EFFECT_PENALTY_FACTOR;
        }

        weightedUtilitySum += utilityValue * weightValue;
        totalWeight += weightValue;
    });

     // Scale this score based on the *expected* range based on MAX_EFFECT_MAGNITUDE and PENALTY.
     // Assumed max raw score: MAX_EFFECT_MAGNITUDE * totalWeight (20 * 1 = 20)
     // Assumed min raw score: MIN_EFFECT_MAGNITUDE * PENALTY_FACTOR * totalWeight (-20 * 1.5 * 1 = -30)
     // Raw range: 50. Target range: 10 ([-5, 5]). Scale factor: 10/50 = 0.2
     // scaled_score = (raw_score - min_raw) * scale_factor + min_target
     // scaled_score = (raw_score - (-30)) * 0.2 + (-5)
     // scaled_score = (raw_score + 30) * 0.2 - 5

     const assumedMinRaw = MIN_EFFECT_MAGNITUDE * NEGATIVE_EFFECT_PENALTY_FACTOR * (totalWeight > 0 ? totalWeight : 1);
     const assumedMaxRaw = MAX_EFFECT_MAGNITUDE * (totalWeight > 0 ? totalWeight : 1);
     const assumedRawRange = assumedMaxRaw - assumedMinRaw;

     let scaledScore = 0;
     if (assumedRawRange !== 0) {
         const targetRange = 10; // [-5, 5]
         const scaleFactor = targetRange / assumedRawRange;
         scaledScore = (weightedUtilitySum - assumedMinRaw) * scaleFactor + (-5); // Apply offset correctly
     }

    return Math.round(scaledScore * 10) / 10;
};
// --- End MCDA Score Calculations ---


const GameDashboard = () => {
    const navigate = useNavigate();
    const [gameSetup, setGameSetup] = useState<GameSetup | null>(null);
    const [metrics, setMetrics] = useState<MetricValues | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [currentDayScenarios, setCurrentDayScenarios] = useState<CurrentScenario[] | null>(null); // null means still loading
    const [userDecisions, setUserDecisions] = useState<LocalUserDecision[] | null>(null); // null means still loading
    const [isLoading, setIsLoading] = useState(true); // Tracks initial loading and decision processing
    const [error, setError] = useState<string | null>(null);

    // State for Average MCDA Scores
    const [avgBaoScore, setAvgBaoScore] = useState<number | null>(null);
    const [avgTopsisScore, setAvgTopsisScore] = useState<number | null>(null);
    const [avgVikorSScore, setAvgVikorSScore] = useState<number | null>(null);
    const [avgVikorRScore, setAvgVikorRScore] = useState<number | null>(null);
    const [avgAhpScore, setAvgAhpScore] = useState<number | null>(null);
    const [avgElectreScore, setAvgElectreScore] = useState<number | null>(null);
    const [avgMavtScore, setAvgMavtScore] = useState<number | null>(null);


    // State for MCDA Score History Chart
    const [mcdaChartData, setMcdaChartData] = useState<any>(null); // Chart data type might need refinement

    // State for Explanation Sections Visibility
    const [showBaoExplanation, setShowBaoExplanation] = useState(false);
    const [showTopsisExplanation, setShowTopsisExplanation] = useState(false);
    const [showVikorExplanation, setShowVikorExplanation] = useState(false);
    const [showAhpExplanation, setShowAhpExplanation] = useState(false);
    const [showElectreExplanation, setShowElectreExplanation] = useState(false);
    const [showMavtExplanation, setShowMavtExplanation] = useState(false);

    // State for Chart Modal Visibility (unused but kept)
    const [isChartOpen, setIsChartOpen] = useState(false);


    // Calculate Average MCDA scores and prepare chart data whenever userDecisions changes
    useEffect(() => {
        console.log("📊 useEffect[userDecisions] tetiklendi. Karar sayısı:", userDecisions?.length);
        if (userDecisions === null || userDecisions.length === 0) {
             setAvgBaoScore(null);
             setAvgTopsisScore(null);
             setAvgVikorSScore(null);
             setAvgVikorRScore(null);
             setAvgAhpScore(null);
             setAvgElectreScore(null);
             setAvgMavtScore(null);
             setMcdaChartData(null);
             console.log("📊 Karar olmadığı için ortalama MCDA ve grafik sıfırlandı.");
             return;
        }

        // Calculate Averages
        const totalBao = userDecisions.reduce((sum, d) => sum + (d.baoScore ?? 0), 0);
        const totalTopsis = userDecisions.reduce((sum, d) => sum + (d.topsisScore ?? 0), 0);
        const totalVikorS = userDecisions.reduce((sum, d) => sum + (d.vikorSScore ?? 0), 0);
        const totalVikorR = userDecisions.reduce((sum, d) => sum + (d.vikorRScore ?? 0), 0);
         const totalAhp = userDecisions.reduce((sum, d) => sum + (d.ahpScore ?? 0), 0);
         const totalElectre = userDecisions.reduce((sum, d) => sum + (d.electreScore ?? 0), 0);
         const totalMavt = userDecisions.reduce((sum, d) => sum + (d.mavtScore ?? 0), 0);

        const decisionCount = userDecisions.length;

        setAvgBaoScore(Math.round((totalBao / decisionCount) * 10) / 10);
        setAvgTopsisScore(Math.round((totalTopsis / decisionCount) * 10) / 10);
        setAvgVikorSScore(Math.round((totalVikorS / decisionCount) * 10) / 10);
        setAvgVikorRScore(Math.round((totalVikorR / decisionCount) * 10) / 10);
        setAvgAhpScore(Math.round((totalAhp / decisionCount) * 10) / 10);
        setAvgElectreScore(Math.round((totalElectre / decisionCount) * 10) / 10);
        setAvgMavtScore(Math.round((totalMavt / decisionCount) * 10) / 10);


        console.log("📈 Ortalama MCDA skorları hesaplandı.");


        // Prepare data for MCDA history chart (Line Chart)
        // Sort by day then timestamp ascending for chronological chart display
        const sortedDecisions = [...userDecisions].sort((a, b) =>
             (a.day ?? 0) - (b.day ?? 0) || (a.createdAt instanceof Timestamp && b.createdAt instanceof Timestamp ? a.createdAt.toMillis() - b.createdAt.toMillis() : 0)
        );

        const labels = sortedDecisions.map((_, index) => `Karar ${index + 1}`);

        setMcdaChartData({
            labels: labels,
            datasets: [
                {
                    label: 'BAO',
                    data: sortedDecisions.map(d => d.baoScore ?? null), // Use null for missing data points
                    borderColor: '#2196f3', // Blue
                    backgroundColor: '#2196f3',
                    tension: 0.3, // Smooth line
                    fill: false, // Don't fill area under line
                    pointRadius: 5,
                    pointHoverRadius: 7,
                },
                {
                    label: 'TOPSIS',
                    data: sortedDecisions.map(d => d.topsisScore ?? null),
                    borderColor: '#ff9800', // Orange
                    backgroundColor: '#ff9800',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                },
                 {
                     label: 'VIKOR S',
                     data: sortedDecisions.map(d => d.vikorSScore ?? null),
                     borderColor: '#4caf50', // Green
                     backgroundColor: '#4caf50',
                     tension: 0.3,
                     fill: false,
                     pointRadius: 5,
                     pointHoverRadius: 7,
                     // Note: Higher VIKOR is worse. Chart scale might need care.
                 },
                  {
                      label: 'VIKOR R',
                      data: sortedDecisions.map(d => d.vikorRScore ?? null),
                      borderColor: '#f44336', // Red
                      backgroundColor: '#f44336',
                      tension: 0.3,
                      fill: false,
                      pointRadius: 5,
                      pointHoverRadius: 7,
                      // Note: Higher VIKOR is worse.
                  },
                   {
                       label: 'AHP Proxy',
                       data: sortedDecisions.map(d => d.ahpScore ?? null),
                       borderColor: '#9b59b6', // Purple
                       backgroundColor: '#9b59b6',
                       tension: 0.3,
                       fill: false,
                       pointRadius: 5,
                       pointHoverRadius: 7,
                   },
                    {
                        label: 'ELECTRE Proxy',
                        data: sortedDecisions.map(d => d.electreScore ?? null),
                        borderColor: '#1abc9c', // Teal
                        backgroundColor: '#1abc9c',
                        tension: 0.3,
                        fill: false,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                    },
                     {
                         label: 'MAVT Proxy',
                         data: sortedDecisions.map(d => d.mavtScore ?? null),
                         borderColor: '#e74c3c', // Dark Red
                         backgroundColor: '#e74c3c',
                         tension: 0.3,
                         fill: false,
                         pointRadius: 5,
                         pointHoverRadius: 7,
                     },
            ]
        });
        console.log("📊 MCDA Chart datası hazırlandı.");

    }, [userDecisions]); // Depend only on userDecisions


    // Başarımları kontrol et
    const checkAchievements = async (newMetrics: MetricValues, currentUserDecisionsCount: number) => {
        console.log("🏆 checkAchievements başladı. Karar Sayısı:", currentUserDecisionsCount);
        // Ensure userData and achievements are not null/undefined and achievements is an array
        if (!userData || !auth.currentUser || !Array.isArray(userData.achievements)) {
            console.warn("🏆 Başarım kontrolü atlandı: Kullanıcı verisi veya başarımlar dizisi eksik veya hatalı.");
            return;
        }

        const userRef = doc(db, 'users', auth.currentUser.uid);
        const currentAchievements = userData.achievements;
        const newAchievements = [...currentAchievements];
        let achievementAdded = false;

        const achievementsConfig = {
            'HAPPY_CUSTOMERS': { metric: 'customerSatisfaction', threshold: 90 },
            'REVENUE_MASTER': { metric: 'revenue', threshold: 80 },
            'STAFF_CHAMPION': { metric: 'staffSatisfaction', threshold: 85 },
        };

        for (const [key, config] of Object.entries(achievementsConfig)) {
            const metricKey = config.metric as keyof MetricValues;
            // Ensure newMetrics[metricKey] is a number before comparison
            const metricValue = newMetrics[metricKey] ?? 0; // Use 0 if metric is missing
            if (metricValue >= config.threshold && !newAchievements.includes(key)) {
                newAchievements.push(key);
                achievementAdded = true;
                 console.log(`🏆 Yeni başarım kazanıldı (Metrik): ${key}`);
            }
        }

         if (currentUserDecisionsCount === 1 && !newAchievements.includes('FIRST_DECISION')) {
              newAchievements.push('FIRST_DECISION');
              achievementAdded = true;
              console.log("⭐ İlk karar başarımı eklendi.")
         }

        if (achievementAdded) {
             const added = newAchievements.filter(ach => !currentAchievements.includes(ach));
             console.log(`🏆 Yeni başarım(lar) Firestore'a kaydediliyor: ${added.join(', ')}`);
             try {
                 await updateDoc(userRef, { achievements: newAchievements });
                 setUserData(prev => prev ? {...prev, achievements: newAchievements} : null);
                 console.log("🏆 Başarımlar kullanıcı verisine kaydedildi ve state güncellendi.");
             } catch (err) {
                 console.error("❌ Başarım güncellenirken hata:", err);
                 // Handle achievement save error, perhaps display a message
             }
        } else {
            console.log("🏆 Yeni başarım kazanılmadı.");
        }
         console.log("🏆 checkAchievements tamamlandı.");
    };

    const logout = () => {
        console.log("🚪 Çıkış yapılıyor...");
        setIsLoading(true); // Keep global loading true during logout
        auth.signOut().then(() => {
            console.log("🚪 Auth çıkışı başarılı.");
            // Clear state on logout
            setGameSetup(null);
            setMetrics(null);
            setUserData(null);
            setCurrentDayScenarios(null);
            setUserDecisions(null);
             setAvgBaoScore(null); setAvgTopsisScore(null); setAvgVikorSScore(null);
             setAvgVikorRScore(null); setAvgAhpScore(null); setAvgElectreScore(null); setAvgMavtScore(null);
            setMcdaChartData(null);
            setShowBaoExplanation(false); setShowTopsisExplanation(false); setShowVikorExplanation(false);
            setShowAhpExplanation(false); setShowElectreExplanation(false); setShowMavtExplanation(false);

            localStorage.removeItem('userData'); // Consider removing this as user data is fetched from Firestore
            localStorage.removeItem('currentGameId');
            localStorage.removeItem('gameSetup');
            console.log("🚪 Local storage temizlendi.");
            navigate('/'); // Redirect to Login page
        }).catch((error) => {
            console.error("❌ Çıkış hatası:", error);
            setError("Çıkış yapılırken bir hata oluştu.");
             setIsLoading(false); // Stop loading on error
        });
    };

    const loadUserData = async () => {
        console.log("👤 loadUserData başladı.");
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.log("👤 Kullanıcı girişi yapılmamış, '/' sayfasına yönlendiriliyor.");
            navigate('/'); // Immediate navigation
            return null;
        }
        try {
            console.log(`👤 ${currentUser.uid} için kullanıcı verisi yükleniyor Firestore'dan...`);
            const fetchedUserData = await getUserData(currentUser.uid);

            if (fetchedUserData) {
                console.log("✅ Kullanıcı verisi Firestore'da bulundu.");
                 // Ensure achievements is always an array
                 if (!Array.isArray(fetchedUserData.achievements)) {
                     console.warn("👤 achievements alanı dizi değil veya eksik, boş dizi olarak ayarlanıyor.");
                    fetchedUserData.achievements = [];
                 }
                setUserData(fetchedUserData);
                // Set metrics from fetched user data if available
                if (fetchedUserData.metrics) {
                    console.log("📊 Metrikler kullanıcı verisinden yüklendi:", fetchedUserData.metrics);
                    setMetrics(fetchedUserData.metrics);
                } else {
                    console.log("📊 Kullanıcı verisinde metrik bulunamadı, otel varsayılanları bekleniyor.");
                    setMetrics(null); // Explicitly set to null if not found
                }
                console.log("👤 loadUserData başarıyla tamamlandı.");
                 return fetchedUserData; // Return fetched data for sequential loading
            } else {
                console.warn('👤 Kullanıcı verisi Firestore\'da bulunamadı.');
                setError('Kullanıcı verisi bulunamadı. Lütfen tekrar giriş yapmayı deneyin.');
                setUserData(null);
                setMetrics(null);
                 console.log("👤 loadUserData tamamlandı, kullanıcı bulunamadı.");
                 navigate('/'); // Redirect to login if user data is missing
                 return null;
            }
        } catch (error) {
            console.error('❌ Kullanıcı verisi yükleme hatası:', error);
            setError("Kullanıcı verileri yüklenirken bir hata oluştu.");
            setUserData(null);
            setMetrics(null);
             console.log("👤 loadUserData hata ile tamamlandı.");
             // Do not re-throw, let the caller handle the null return and error state
             return null;
        }
    };

    // Load hotel metrics only if user has no metrics saved
    const loadHotelMetrics = async (setup: GameSetup | null, existingMetrics: MetricValues | null, user: any, currentFetchedUserData: UserData | null) => {
        console.log("🏨 loadHotelMetrics başladı.");
        // Only proceed if user has no existing metrics AND setup/user data is available
        if (existingMetrics || !setup?.hotelType || !user || !currentFetchedUserData) {
            console.log("🏨 loadHotelMetrics atlandı:", {existingMetrics: !!existingMetrics, hotelType: setup?.hotelType, user: !!user, userData: !!currentFetchedUserData});
            return;
        }

        console.log(`🏨 ${setup.hotelType} için başlangıç metrikleri Firestore'dan yükleniyor...`);
        try {
            const hotelRef = doc(db, "hotelMetrics", setup.hotelType);
            console.log("🏨 Hotel Metrics dokümanı alınıyor:", setup.hotelType);
            const hotelSnap = await getDoc(hotelRef);
            console.log("🏨 Hotel Metrics dokümanı alındı:", hotelSnap.exists());

            let initialMetrics: MetricValues;
            if (hotelSnap.exists() && hotelSnap.data()?.metrics) {
                initialMetrics = hotelSnap.data().metrics as MetricValues;
                console.log("✅ Otel başlangıç metrikleri bulundu:", initialMetrics);
            } else {
                console.error("❌ Otel başlangıç metrikleri bulunamadı!", setup.hotelType);
                console.warn(`🏨 Başlangıç metrikleri bulunamadı. Varsayılan değerler kullanılıyor.`);
                 initialMetrics = { revenue: 50, customerSatisfaction: 50, staffSatisfaction: 50, occupancyRate: 50, sustainability: 50 };
                 // Consider setting an error here if default metrics are used due to missing data
                 // setError("Otel başlangıç metrikleri bulunamadı, varsayılanlar kullanılıyor.");
            }

            setMetrics(initialMetrics);
            const userRef = doc(db, 'users', user.uid);
            console.log("📝 Başlangıç metrikleri kullanıcıya kaydediliyor...");
            // Update metrics field specifically
            await updateDoc(userRef, { metrics: initialMetrics });
            // Update local userData state with new metrics
            setUserData(prev => prev ? { ...prev, metrics: initialMetrics } : null);
            console.log("✅ Başlangıç metrikleri kullanıcıya kaydedildi.");

             console.log("🏨 loadHotelMetrics başarıyla tamamlandı.");
        } catch (error) {
            console.error("🔥 Otel metrikleri yüklenirken hata oluştu:", error);
            setError("Otel başlangıç metrikleri yüklenemedi.");
             // Ensure metrics is set to a default or null on error if not already set
             if (metrics === null) {
                 const defaultMetrics = { revenue: 50, customerSatisfaction: 50, staffSatisfaction: 50, occupancyRate: 50, sustainability: 50 };
                 setMetrics(defaultMetrics);
             }
             console.log("🏨 loadHotelMetrics hata ile tamamlandı.");
             // Do not re-throw, handle within component
        }
    };

     const loadScenario = async (setup: GameSetup | null, currentDay: number | undefined, decisions: LocalUserDecision[] | null) => {
         console.log("📚 loadScenario başladı.");
         // Ensure all necessary dependencies are not null/undefined before proceeding
         if (!setup?.role || currentDay === undefined || !auth.currentUser || decisions === null) {
             console.log("⚠️ loadScenario atlandı: Kurulum, gün, kullanıcı veya kararlar eksik/bekleniyor.", {setup: !!setup, currentDay: currentDay, user: !!auth.currentUser, decisions: decisions !== null});
             // Set scenarios to empty array if decisions are loaded but conditions aren't met?
             // Or keep null to indicate loading... let's keep null if decisions is null, else empty array.
             if (decisions !== null) {
                 setCurrentDayScenarios([]); // No scenarios loaded yet for this state or dependencies not ready
             } else {
                 setCurrentDayScenarios(null); // Decisions not loaded, still loading scenarios depends on it
             }
             return;
         }

         console.log(`🔍 Gün ${currentDay}, Rol ${setup.role}: Senaryolar Firestore'dan çekiliyor...`);
         setError(null); // Clear previous errors before loading

         try {
             const scenariosRef = collection(db, "questions");
             const q = query(scenariosRef, where("department", "==", setup.role));
             console.log(`🔍 Query for questions: department == ${setup.role}`);
             const querySnapshot = await getDocs(q);
             console.log(`🔍 Query sonucu alındı. ${querySnapshot.size} belge bulundu.`);

             if (querySnapshot.empty) {
                 console.warn("❌ Bu role ait senaryo bulunamadı:", setup.role);
                 setCurrentDayScenarios([]); // Set to empty array if no scenarios found
                  console.log("📚 loadScenario tamamlandı, senaryo bulunamadı.");
                 return;
             }

             let allQuestions: CurrentScenario[] = querySnapshot.docs.map(docSnapshot => {
                 const data = docSnapshot.data();
                 // Ensure options and effects are properly typed and handle missing data
                 const options = (Array.isArray(data.options) ? data.options : []).map((opt: any) => ({
                     text: opt.text || "Seçenek metni eksik",
                     effects: {
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
                 } as CurrentScenario;
             });
             console.log(`📚 Toplam ${allQuestions.length} senaryo Firestore'dan çekildi.`);

             // Filter out already answered questions for the current game session
             const answeredQuestionIds = new Set(decisions.map(dec => dec.questionId));
             console.log(`🚫 Cevaplanan senaryo ID'leri (${answeredQuestionIds.size} adet):`, Array.from(answeredQuestionIds));
             let availableQuestions = allQuestions.filter(q => !answeredQuestionIds.has(q.id));

             if (availableQuestions.length === 0) {
                  console.warn(`✅ Gün ${currentDay}: Bu departmandaki mevcut tüm senaryolar cevaplanmış.`);
                  setCurrentDayScenarios([]); // Set to empty array
                   console.log("📚 loadScenario tamamlandı, mevcut senaryo yok.");
                  return;
             }

             // Select 1, 2, or 3 random scenarios from available ones
             availableQuestions.sort(() => 0.5 - Math.random()); // Shuffle
             // Ensure we pick at least 1, up to 3, but no more than available
             const maxScenariosToPick = Math.min(availableQuestions.length, 3);
             const randomCount = Math.floor(Math.random() * maxScenariosToPick) + 1;
             const selectedScenarios = availableQuestions.slice(0, randomCount);

             setCurrentDayScenarios(selectedScenarios); // Set state to the selected scenarios
             console.log(`✅ Gün ${currentDay}: ${selectedScenarios.length} adet senaryo yüklendi.`);
             console.log("📚 loadScenario başarıyla tamamlandı.");

         } catch (error) {
             console.error("🔥 Senaryo yükleme hatası:", error);
             setError("Senaryolar yüklenirken bir hata oluştu.");
             setCurrentDayScenarios([]); // Set to empty array on error
             console.log("📚 loadScenario hata ile tamamlandı.");
         }
     };


    const loadUserDecisions = async () => {
        console.log("📜 loadUserDecisions başladı.");
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.warn("📜 Karar geçmişi yüklenemedi: Kullanıcı girişi yok.");
            setUserDecisions([]); // Set to empty array if no user
             console.log("📜 loadUserDecisions tamamlandı, kullanıcı yok.");
            return [];
        }
        const currentGameId = localStorage.getItem('currentGameId');
        if (!currentGameId) {
            console.warn("📜 Karar geçmişi yüklenemedi: Oyun ID'si yok.");
            setUserDecisions([]); // Set to empty array if no game ID
             console.log("📜 loadUserDecisions tamamlandı, oyun ID yok.");
            return [];
        }

        console.log("📜 Karar geçmişi Firestore'dan yükleniyor (Oyun ID:", currentGameId, ")");
        try {
            const decisionsRef = collection(db, 'userDecisions');
            const q = query(
                decisionsRef,
                where('userId', '==', currentUser.uid),
                where('gameId', '==', currentGameId)
            );
            console.log(`📜 Query for user decisions: userId == ${currentUser.uid}, gameId == ${currentGameId}`);
            const querySnapshot = await getDocs(q);
            console.log(`📜 Query sonucu alındı. ${querySnapshot.size} belge bulundu.`);

            const decisions = querySnapshot.docs.map(docSnapshot => {
                const data = docSnapshot.data();
                // Map data to LocalUserDecision type, ensuring all expected fields are present,
                // defaulting to undefined/null if not found in Firestore data.
                return {
                    id: docSnapshot.id,
                    userId: data.userId,
                    questionId: data.questionId || "ID Yok",
                    selectedOption: data.selectedOption,
                    metrics: data.metrics || { before: {}, after: {} },
                    createdAt: data.createdAt,
                    day: data.day,
                    scenarioText: data.scenarioText,
                    selectedOptionText: data.selectedOptionText,
                    gameId: data.gameId,
                    // Include all new scores, they will be undefined if not in Firestore
                    baoScore: data.baoScore,
                    sawScore: data.sawScore,
                    topsisScore: data.topsisScore,
                    vikorSScore: data.vikorSScore,
                    vikorRScore: data.vikorRScore,
                    ahpScore: data.ahpScore,
                    electreScore: data.electreScore,
                    mavtScore: data.mavtScore,
                    // If 'vikorScore' existed in ExternalUserDecision and is not needed,
                    // you might need to explicitly set it to undefined or exclude it based on data.
                    // vikorScore: data.vikorScore !== undefined ? undefined : undefined, // Example of excluding it
                } as LocalUserDecision; // Explicitly cast to the local type
            })
            // Sort decisions - latest first (descending day, then descending timestamp)
            .sort((a, b) => {
                 const dayDiff = (b.day ?? 0) - (a.day ?? 0);
                 if (dayDiff !== 0) return dayDiff;

                 const timeA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
                 const timeB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
                 return timeB - timeA;
            });


            setUserDecisions(decisions); // Update state with fetched decisions
            console.log(`✅ ${decisions.length} adet karar geçmişi yüklendi.`);
            console.log("📜 loadUserDecisions başarıyla tamamlandı.");
             return decisions;
        } catch (error) {
            console.error('❌ Karar geçmişi yükleme hatası:', error);
            setError("Karar geçmişi yüklenirken bir sorun oluştu.");
            setUserDecisions([]); // Set to empty array on error
            console.log("📜 loadUserDecisions hata ile tamamlandı.");
            // Do not re-throw, handle within component
            return [];
        }
    };

    const handleDecision = async (questionId: string, optionIndex: number) => {
        console.log("🧠 handleDecision başladı.");
        // Check for all necessary data before proceeding
        if (!userData || !auth.currentUser || !metrics || !gameSetup || userDecisions === null || currentDayScenarios === null) {
            console.error("❌ Karar işlenemiyor: Eksik veri.", { userData: !!userData, auth: !!auth.currentUser, metrics: !!metrics, gameSetup: !!gameSetup, userDecisionsLoaded: userDecisions !== null, currentDayScenariosLoaded: currentDayScenarios !== null });
             const missingData = [];
             if (!userData) missingData.push('userData');
             if (!auth.currentUser) missingData.push('auth.currentUser');
             if (!metrics) missingData.push('metrics');
             if (!gameSetup) missingData.push('gameSetup');
             if (userDecisions === null) missingData.push('userDecisions not loaded');
             if (currentDayScenarios === null) missingData.push('currentDayScenarios not loaded');
            setError(`İşlem yapılamadı, gerekli veriler eksik: ${missingData.join(', ')}. Sayfayı yenilemeyi deneyin.`);
            setIsLoading(false); // Stop loading on error
            return;
        }

        // Find the scenario and selected option
        const scenario = currentDayScenarios.find(s => s.id === questionId);
        if (!scenario) {
            console.warn("🧠 Senaryo bulunamadı, ID:", questionId);
            setError("İşlem yapılacak senaryo bulunamadı.");
            setIsLoading(false);
            return;
        }
        const selectedOption = scenario.options[optionIndex];
        if (!selectedOption) {
            console.warn("🧠 Seçenek bulunamadı, Index:", optionIndex);
            setError("İşlem yapılacak seçenek bulunamadı.");
            setIsLoading(false);
            return;
        }

        // Set loading state for the action
        setIsLoading(true);
        setError(null); // Clear error before starting
        console.log("🧠 Karar işleme başlıyor...");

        try {
            console.log("🧠 Metrik değişiklikleri hesaplanıyor...");
            const oldMetrics = { ...metrics };
            const newMetrics = { ...metrics };
            (Object.keys(selectedOption.effects) as Array<keyof ScenarioOptionEffect>).forEach((key) => {
                if (newMetrics.hasOwnProperty(key)) {
                    const effectValue = selectedOption.effects[key] ?? 0;
                    const currentValue = newMetrics[key] ?? 0; // Ensure current value is also number
                    newMetrics[key] = Math.min(100, Math.max(0, currentValue + effectValue));
                } else {
                     console.warn(`Metric key "${key}" not found in current metrics.`);
                }
            });
            console.log("🧠 Yeni metrikler:", newMetrics);

            console.log("🧠 MCDA Skorları hesaplanıyor...");
             // Ensure effects passed to calculation functions are not null/undefined per key
            const optionEffectsNotNull: ScenarioOptionEffect = {
                 revenue: selectedOption.effects.revenue ?? 0,
                 customerSatisfaction: selectedOption.effects.customerSatisfaction ?? 0,
                 staffSatisfaction: selectedOption.effects.staffSatisfaction ?? 0,
                 occupancyRate: selectedOption.effects.occupancyRate ?? 0,
                 sustainability: selectedOption.effects.sustainability ?? 0,
            };
            const baoScore = calculateBAOScore(optionEffectsNotNull);
            const sawScore = calculateSAWScore(optionEffectsNotNull);
            const topsisScore = calculateSimplifiedTopsisScore(optionEffectsNotNull);
            const vikorScores = calculateSimplifiedVikorScores(optionEffectsNotNull);
            const ahpScore = calculateSimplifiedAhpScore(optionEffectsNotNull);
            const electreScore = calculateSimplifiedElectreScore(optionEffectsNotNull);
            const mavtScore = calculateSimplifiedMavtScore(optionEffectsNotNull);


            console.log(`🌟 Karar Skorları: BAO=${baoScore.toFixed(1)}, TOPSIS=${topsisScore.toFixed(1)}, VIKOR(S=${vikorScores.sScore.toFixed(1)}, R=${vikorScores.rScore.toFixed(1)}), AHP=${ahpScore.toFixed(1)}, ELECTRE=${electreScore.toFixed(1)}, MAVT=${mavtScore.toFixed(1)}`);

            console.log("🧠 Metrikler Firestore'a güncelleniyor...");
            await updateUserMetrics(auth.currentUser.uid, newMetrics);
            console.log("✅ Metrikler başarıyla güncellendi Firestore'da.");

            const currentGameId = localStorage.getItem('currentGameId');
            if (!currentGameId) {
                throw new Error("Oyun ID'si bulunamadı! Karar kaydedilemedi.");
            }

            // Define the decision data structure to save
            const decisionDataToSave: Omit<LocalUserDecision, 'id' | 'createdAt'> = {
                 userId: auth.currentUser.uid,
                 questionId: scenario.id,
                 selectedOption: optionIndex,
                 metrics: { before: oldMetrics, after: newMetrics },
                 day: userData.currentDay, // Use currentDay from userData state
                 scenarioText: scenario.text,
                 selectedOptionText: selectedOption.text,
                 gameId: currentGameId,
                 baoScore: baoScore,
                 sawScore: sawScore,
                 topsisScore: topsisScore,
                 vikorSScore: vikorScores.sScore,
                 vikorRScore: vikorScores.rScore,
                 ahpScore: ahpScore,
                 electreScore: electreScore,
                 mavtScore: mavtScore,
            };

            console.log("🧠 Karar verisi Firestore'a kaydediliyor...");
             // Assuming saveUserDecision expects a type compatible with decisionDataToSave
             await saveUserDecision(decisionDataToSave as any); // Revert to as any for safety if types aren't perfectly synced yet
            console.log("✅ Karar başarıyla kaydedildi Firestore'a.");

            console.log("🧠 Local state metrikler güncelleniyor...");
            setMetrics(newMetrics);
             console.log("🧠 Local state senaryolar güncelleniyor (cevaplanan çıkarılıyor)...");
            setCurrentDayScenarios(prevScenarios => prevScenarios ? prevScenarios.filter(q => q.id !== questionId) : []);
             console.log("✅ Local state metrikler ve senaryolar güncellendi.");

            console.log("🧠 Karar geçmişi refresh ediliyor...");
            const updatedDecisions = await loadUserDecisions();
            console.log(`✅ Karar geçmişi refresh edildi. Toplam ${updatedDecisions.length} karar var.`);

             console.log("🧠 Baş başarımlar kontrol ediliyor...");
             await checkAchievements(newMetrics, updatedDecisions.length);
             console.log("✅ Başarım kontrolü tamamlandı.");

             // Check if this was the last scenario for the current turn/day *before* filtering state
             const isLastScenarioOfTurn = (currentDayScenarios || []).length === 1;
             console.log(`🧠 Bu turun son senaryosu mu? ${isLastScenarioOfTurn}`);

            if (isLastScenarioOfTurn) {
                console.log("🔚 Bu turdaki/gündeki sorular bitti, tur/gün ilerletiliyor...");
                 const nextDay = (userData.currentDay ?? 0) + 1; // Still advance day conceptually
                 const completedTurns = (userData.completedScenarios ?? 0) + 1; // Advance the turn counter


                 console.log(`🧠 Kullanıcı Firestore'da gün ve tur güncelleniyor: Gün ${nextDay}, Tur ${completedTurns}`);
                 const userRef = doc(db, 'users', auth.currentUser.uid);
                 await updateDoc(userRef, {
                     currentDay: nextDay,
                     completedScenarios: completedTurns,
                     lastLoginDate: serverTimestamp()
                 });
                 console.log("✅ Kullanıcı gün/tur bilgisi Firestore'da güncellendi.");

                 setUserData(prev => prev ? { ...prev, currentDay: nextDay, completedScenarios: completedTurns, lastLoginDate: Timestamp.now() } : null);
                 setCurrentDayScenarios(null); // Reset scenarios to trigger loading for the new turn/day

                 if (completedTurns >= 10) {
                     console.log("🎉 Oyun bitti! 10 tur tamamlandı. Game Over sayfasına yönlendiriliyor...");
                     setIsLoading(false); // Stop loading before navigating
                     navigate(`/game-over?gameId=${currentGameId}`);
                     return; // Important: stop further execution in handleDecision
                 } else {
                     console.log(`🌅 Yeni tura/güne geçildi: Tur ${completedTurns}, Gün ${nextDay}. Yeni senaryolar yüklenecek.`);
                     // No need to explicitly set isLoading(false) here, the scenario loading useEffect will handle it
                     // when currentDayScenarios becomes null and other dependencies change.
                     // We might need to briefly set loading true again if scenario load depends on !isLoading
                     // Let's keep isLoading as is for now, the scenario useEffect should trigger.
                 }
            } else {
                 // Still scenarios left in this turn
                 console.log("🧠 Bu turda hala senaryo var. Karar işleme tamamlandı. Loading kapatılıyor.");
                 setIsLoading(false); // Stop the decision processing loading indicator
            }

        } catch (error) {
            console.error("🔥 Karar işleme hatası:", error);
            setError(`Karar işlenirken hata oluştu: ${error instanceof Error ? error.message : String(error)}`);
            setIsLoading(false);
             console.log("🧠 handleDecision hata ile tamamlandı.");
        }
    };

    const getAchievementInfo = (achievementId: string) => {
        const achievementsMap: { [key: string]: { icon: string; name: string; desc: string } } = {
            'HAPPY_CUSTOMERS': { icon: '😊', name: 'Mutlu Müşteriler', desc: "Müşteri Memnuniyeti %90 veya üzeri" },
            'REVENUE_MASTER': { icon: '💰', name: 'Gelir Ustası', desc: 'Gelir %80 veya üzeri' },
            'STAFF_CHAMPION': { icon: '👥', name: 'Personel Şampiyonu', desc: 'Personel Memnuniyeti %85 veya üzeri' },
            'FIRST_DECISION': { icon: '⭐', name: 'İlk Adım', desc: 'Oyundaki ilk karar verildi!' }
        };
        return achievementsMap[achievementId] || { icon: '🏆', name: 'Bilinmeyen Başarım', desc: achievementId };
    };

    // --- useEffect Hooks ---

    // Effect to perform initial data loading (user, game setup, decisions, metrics)
    useEffect(() => {
        const initDashboard = async () => {
            console.log("🚀 initDashboard başladı.");
            setIsLoading(true);
            setError(null);

            const currentUser = auth.currentUser;
            if (!currentUser) {
                console.log("👤 Kullanıcı girişi yok, '/' sayfasına yönlendiriliyor.");
                 navigate('/');
                return; // Stop init if no user
            }

            try {
                console.log("🚀 Oyun kurulumu localStorage'dan okunuyor...");
                const setupData = localStorage.getItem('gameSetup');
                if (!setupData) throw new Error("Oyun kurulumu bulunamadı. Lütfen ana sayfadan yeniden başlayın.");
                const setup = JSON.parse(setupData) as GameSetup;
                if (!setup.hotelType || !setup.role) throw new Error("Geçersiz oyun kurulumu. Lütfen ana sayfadan yeniden başlayın.");
                setGameSetup(setup);
                console.log("✅ Oyun Kurulumu yüklendi:", setup);

                console.log("🚀 Oyun ID'si kontrol ediliyor...");
                let currentGameId = localStorage.getItem('currentGameId');
                if (!currentGameId) {
                    currentGameId = `game_${currentUser.uid}_${Date.now()}`;
                    localStorage.setItem('currentGameId', currentGameId);
                    console.log("🎮 Yeni Oyun ID'si oluşturuldu:", currentGameId);
                } else {
                    console.log("🎮 Mevcut Oyun ID'si:", currentGameId);
                }

                 console.log("🚀 Kullanıcı verisi yükleniyor...");
                const fetchedUserData = await loadUserData(); // Handles null user and navigation

                if (!fetchedUserData) {
                      console.error("❌ Kullanıcı verisi yüklenemedi veya kullanıcı yok, initDashboard durduruluyor.");
                     setIsLoading(false); // Ensure loading is false if loadUserData failed/navigated
                     return;
                }
                 console.log("✅ Kullanıcı verisi initDashboard'da yüklendi.");

                 console.log("🚀 Otel metrikleri yükleniyor (kullanıcıda yoksa)...");
                 await loadHotelMetrics(setup, fetchedUserData.metrics, currentUser, fetchedUserData); // Handles its own errors
                 console.log("✅ Otel metrikleri yükleme tamamlandı.");

                 console.log("🚀 Karar geçmişi yükleniyor...");
                 await loadUserDecisions(); // Handles its own errors
                 console.log("✅ Karar geçmişi yükleme tamamlandı.");

                console.log("✅ Dashboard ilk kurulum tamamlandı.");
                // Do NOT set isLoading(false) here yet, the next effect handles scenarios.

            } catch (error) {
                console.error('❌ Dashboard başlatma hatası:', error);
                setError(error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu.");
                 setIsLoading(false); // Stop loading on caught error
            }
        };

        initDashboard();
         console.log("🚀 initDashboard useEffect tetiklendi.");
    }, [navigate]); // Dependencies: navigate is needed for the redirect logic


    // Effect to load scenario only when setup, user data (especially day), and decisions are ready
    useEffect(() => {
        console.log("🔄 Scenario load useEffect tetiklendi.");
        console.log("🔄 Dependencies:", { gameSetupReady: !!gameSetup?.role, currentDayReady: userData?.currentDay !== undefined, decisionsLoaded: userDecisions !== null, isLoading: isLoading });

        // Check if all necessary data is loaded AND we are NOT currently processing a decision
        // currentDayScenarios === null means it's the *initial* scenario load or it was reset to null to signal loading
        // currentDayScenarios === [] means no scenarios were found or all answered for the day
        if (gameSetup?.role && userData?.currentDay !== undefined && userDecisions !== null && currentDayScenarios === null && !isLoading) {
             console.log(`🔄 Scenario load koşulları sağlandı. Yükleme tetikleniyor.`);
             loadScenario(gameSetup, userData.currentDay, userDecisions);
        } else {
             console.log("⏭️ Scenario load atlandı. Koşullar sağlanmadı veya bekleniyor.");
             // If decisions loaded but scenarios are still null and not loading, try to load scenarios
             if (userDecisions !== null && currentDayScenarios === null && !isLoading && gameSetup?.role && userData?.currentDay !== undefined) {
                  console.log("🔄 Kararlar yüklü ancak senaryolar hala null, tekrar yükleme deneniyor.");
                  loadScenario(gameSetup, userData?.currentDay, userDecisions);
             }
             // If decisions is null, keep scenarios null to indicate waiting
              else if (userDecisions === null) {
                 setCurrentDayScenarios(null);
                 console.log("🔄 Kararlar null olduğu için senaryolar null yapıldı (bekleniyor).");
             }
        }
         console.log("🔄 Scenario load useEffect tamamlandı.");
         // Dependencies ensure this runs when gameSetup, currentDay, userDecisions, or isLoading change
    }, [gameSetup, userData?.currentDay, userDecisions, isLoading]);


     // Effect to handle setting initial loading=false after core initial data load completes
     // This runs AFTER initDashboard finishes loading gameSetup, userData, metrics, userDecisions
      useEffect(() => {
         console.log("🚦 Initial core load check useEffect triggered.");
         // Check if the core initial data (excluding scenarios) is loaded AND we are still in the initial loading phase
         const coreInitialDataLoaded = !!gameSetup && !!userData && metrics !== null && userDecisions !== null;

         if (coreInitialDataLoaded && isLoading && currentDayScenarios === null) { // Only turn off initial loading once core data is ready, before scenarios load
              console.log("✅ Core başlangıç verileri yüklendi (senaryolar hariç). Initial loading kapatılıyor.");
              setIsLoading(false); // Allow scenario loading useEffect to run
         } else if (error && isLoading) {
              // If a critical error occurred during initial load, ensure loading is false
              setIsLoading(false);
              console.log("🚦 Initial load sırasında hata oluştu. Initial loading kapatılıyor.");
         }
          console.log("🚦 Initial core load check useEffect finished.");
          // Depend on the core initial data states, error, and isLoading.
          // Do NOT depend on currentDayScenarios here to avoid the deadlock.
      }, [gameSetup, userData, metrics, userDecisions, error, isLoading]);


     useEffect(() => {
         console.log("📅 Daily login check useEffect tetiklendi.");
         const currentUser = auth.currentUser;
        if (!userData?.lastLoginDate || !currentUser) {
            console.log("📅 Daily login check atlandı: userData or user missing, or lastLoginDate missing.");
            return;
        }
         console.log("📅 lastLoginDate:", userData.lastLoginDate);

        try {
            // Check if lastLoginDate is a Firestore Timestamp instance
            if (!(userData.lastLoginDate instanceof Timestamp)) {
                console.warn("📅 lastLoginDate Firestore Timestamp formatında değil, güncelleniyor.");
                 const userRef = doc(db, 'users', currentUser.uid);
                 updateDoc(userRef, { lastLoginDate: serverTimestamp() })
                     .then(() => console.log("✅ lastLoginDate Firestore'da (format düzeltilerek) güncellendi."))
                     .catch(err => console.error("❌ lastLoginDate güncellenemedi:", err));
                 return;
            }

            const lastLoginDate = userData.lastLoginDate.toDate(); // Convert Timestamp to Date
            const today = new Date();

            const lastLoginStartOfDay = new Date(lastLoginDate.getFullYear(), lastLoginDate.getMonth(), lastLoginDate.getDate());
            const todayStartOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

            if (lastLoginStartOfDay < todayStartOfDay) {
                console.log("📅 Farklı günde giriş yapılmış. lastLoginDate güncelleniyor Firestore'da.");
                const userRef = doc(db, 'users', currentUser.uid);
                updateDoc(userRef, { lastLoginDate: serverTimestamp() })
                    .then(() => console.log("✅ lastLoginDate Firestore'da güncellendi."))
                    .catch(err => console.error("❌ lastLoginDate güncellenemedi:", err));
            } else {
                 console.log("📅 Same day login.");
            }
        } catch (error) {
            console.error('❌ Tarih kontrolü hatası:', error);
             // Optionally set an error state here if date check itself fails
        }
    }, [userData?.lastLoginDate, auth.currentUser]);


    // Helper for Hotel Type Name
    const getHotelTypeName = (type: string | undefined): string => { // Handle undefined type
        if (!type) return 'Otel Tipi Bilinmiyor';
        const types: { [key: string]: string } = { '5_star': '5 Yıldızlı Otel', 'boutique': 'Butik Otel', 'resort': 'Tatil Köyü' };
        return types[type] || type;
    };

    // Helper for Role Name
    const getRoleName = (role: string | undefined): string => { // Handle undefined role
        if (!role) return 'Rol Bilinmiyor';
        const roles: { [key: string]: string } = { 'reservation': 'Rezervasyon', 'customer_relations': 'Müşteri İlişkileri', 'operations': 'Operasyon', 'financial': 'Gelir Yönetimi', 'hr': 'Personel' };
        return roles[role] || role;
    };


    // Helper for coloring average scores
    const getScoreColor = (score: number | undefined | null, type: 'normal' | 'vikor' = 'normal'): string => {
        if (score === undefined || score === null) return '#6c757d'; // Gray for missing scores

        if (type === 'vikor') {
            // VIKOR scores are regret (lower is better).
            const maxPossibleEffect = Math.max(MAX_EFFECT_MAGNITUDE, Math.abs(MIN_EFFECT_MAGNITUDE));
            const maxPossibleWeight = Math.max(...Object.values(metricWeights));
            const assumedMaxR = maxPossibleEffect * maxPossibleWeight;
            const effectiveMaxR = assumedMaxR > 0 ? assumedMaxR : 5; // Default max regret if calculation is weird

            // Scale the score to a 0-100 range (0 regret -> 0, max regret -> 100)
            const scaledValue = (score / effectiveMaxR) * 100;
             const clampedScaledValue = Math.max(0, Math.min(100, scaledValue)); // Ensure within 0-100

             // Invert color logic: high scaledValue (high regret) is Red
            if (clampedScaledValue >= 60) return '#dc3545'; // Red
            if (clampedScaledValue >= 30) return '#ffc107'; // Orange
            return '#28a745'; // Green (low regret)
        } else {
             // 'normal' scores scaled around 0, typically [-5, 5] proxy.
            const scoreRange = 10; // from -5 to 5
            const normalizedValue = (score + 5) / scoreRange; // Maps [-5, 5] to [0, 1]
            const percentage = normalizedValue * 100; // Maps to [0, 100]
            const clampedPercentage = Math.max(0, Math.min(100, percentage)); // Clamp to 0-100
            return getMetricColor(clampedPercentage); // Reuse getMetricColor logic
        }
    };


    // --- Chart and Metric Display Helpers ---
    const getMetricColor = (value: number | undefined | null): string => { // Handle undefined/null metric values
        const numericValue = value ?? 0;
        if (numericValue >= 80) return '#28a745'; // Green
        if (numericValue >= 60) return '#2193b0'; // Blue-Green
        if (numericValue >= 40) return '#ffc107'; // Orange
        return '#dc3545'; // Red
    };

    const MetricBar = ({ label, value }: { label: string; value: number | undefined | null }) => (
        <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                <span style={{ color: '#555', fontSize: '0.9em' }}>{label}</span>
                <span style={{ color: getMetricColor(value), fontWeight: 'bold', fontSize: '0.95em' }}>{(value ?? 0).toFixed(1)}%</span>
            </div>
            <div style={{ height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                    width: `${value ?? 0}%`, height: '100%', background: getMetricColor(value),
                    borderRadius: '3px', transition: 'width 0.4s ease-out'
                }} />
            </div>
        </div>
    );

     // Re-usable Accordion / Collapsible component
     const Accordion = ({ title, children, isOpen, setIsOpen }: { title: string; children: React.ReactNode; isOpen: boolean; setIsOpen: (open: boolean) => void }) => (
        <div style={{ marginBottom: '10px', border: '1px solid #eee', borderRadius: '8px' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%', textAlign: 'left', padding: '12px 15px',
                    background: '#f8f9fa', border: 'none', cursor: 'pointer',
                    fontSize: '1em', color: '#1e3c72', fontWeight: 'bold',
                    borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
            >
                {title}
                <span>{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
                <div style={{ padding: '15px', borderTop: '1px solid #eee', color: '#555', fontSize: '0.9em', lineHeight: '1.4' }}>
                    {children}
                </div>
            )}
        </div>
     );


    // --- Doughnut Chart Data (Defined inside render but before return/conditionals) ---
    // Define chart data here as metrics is guaranteed non-null at this point of render
    const chartData: ChartData<'doughnut'> = {
        labels: ['Gelir', 'Müşteri Mem.', 'Personel Mem.', 'Doluluk', 'Sürdürülebilirlik'],
        datasets: [{
            label: 'Metrikler (%)',
            data: [
                metrics?.revenue ?? 0, // Use optional chaining and nullish coalescing
                metrics?.customerSatisfaction ?? 0,
                metrics?.staffSatisfaction ?? 0,
                metrics?.occupancyRate ?? 0,
                metrics?.sustainability ?? 0
            ],
            backgroundColor: ['#2196f3', '#4caf50', '#ff9800', '#f44336', '#9c27b0'],
            borderColor: '#ffffff',
            borderWidth: 2
        }]
    };
     // Define chart options here
    const chartOptions: ChartOptions<'doughnut'> = {
        responsive: true,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: { label: (context: any) => `${context.label}: ${context.parsed}%` }
            }
        }
    };
     // --- End Doughnut Chart Data ---


    // Global loading state check first for initial loading overlay
    const isInitialLoading = isLoading && (!gameSetup || !userData || metrics === null || userDecisions === null || currentDayScenarios === null);
    const isProcessingDecision = isLoading && (gameSetup && userData && metrics !== null && userDecisions !== null);


    if (isInitialLoading) {
         let loadingMessage = "Oyun Verileri Yükleniyor...";
         // Refine messages based on what is still null
         if (!gameSetup) loadingMessage = "Oyun Kurulumu Yükleniyor...";
         else if (!userData) loadingMessage = "Kullanıcı Verileri Yükleniyor...";
         else if (metrics === null) loadingMessage = "Otel Metrikleri Yükleniyor...";
         else if (userDecisions === null) loadingMessage = "Karar Geçmişi Yükleniyor...";
         else if (currentDayScenarios === null) loadingMessage = "Günlük Senaryolar Yükleniyor...";


        return (
            <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f7fa' }}>
                <div style={{ textAlign: 'center' }}>
                    <h2 style={{ color: '#1e3c72' }}>{loadingMessage}</h2>
                    <p style={{ color: '#666' }}>Lütfen bekleyin</p>
                     <div style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite', margin: '15px auto' }}></div>
                     <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    // Show a more specific error screen if critical data failed to load initially
    if (error && (!gameSetup || !userData || metrics === null || userDecisions === null)) {
        console.error("❌ Kritik hata ekranı gösteriliyor.");
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

    // If we reach here, core data should be loaded (gameSetup, userData, metrics, userDecisions are not null)
    // currentDayScenarios might still be null if loading or empty array if none found/answered.
    // Add a check for the essential data needed to render the dashboard layout
     if (!gameSetup || !userData || metrics === null || userDecisions === null) {
         console.error("❌ Render hatası: Gerekli ana veriler eksik (Unexpected State After Initial Load).", { gameSetup: !!gameSetup, userData: !!userData, metrics: metrics !== null, userDecisions: userDecisions !== null });
         // This case should ideally not happen if the initial loading blocks worked.
         return (
             <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f7fa', color: '#6c757d', textAlign: 'center' }}>
                  <div>
                      <h2>Oyun Verileri Yüklenemedi</h2>
                      <p>Beklenmeyen bir durum oluştu. Lütfen sayfayı yenileyin veya çıkış yapıp tekrar deneyin.</p>
                       {error && <p style={{color: '#dc3545', fontWeight: 'bold'}}>Son Hata: {error}</p>}
                      <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', background: '#1e3c72', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginTop: '20px', marginRight:'10px' }}>
                          Yenile
                      </button>
                      <button onClick={logout} style={{ padding: '10px 20px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginTop: '20px' }}>
                          Oyundan Çık
                      </button>
                  </div>
             </div>
         );
     }


    // All critical data is loaded, render the dashboard content
    return (
        <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '15px' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ background: 'white', padding: '15px 20px', borderRadius: '10px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <h2 style={{ color: '#1e3c72', marginBottom: '2px', fontSize: '1.3em' }}>
                            {getHotelTypeName(gameSetup.hotelType)}
                        </h2>
                        <p style={{ color: '#555', fontSize: '0.9em' }}>
                            Rol: {getRoleName(gameSetup.role)} | Gün: {userData.currentDay ?? '?'} | Tur: {userData.completedScenarios ?? 0}/10
                        </p>
                    </div>
                    <button onClick={logout} disabled={!!isProcessingDecision} style={{ padding: '8px 15px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', cursor: isProcessingDecision ? 'not-allowed' : 'pointer', opacity: isProcessingDecision ? 0.7 : 1, transition: 'opacity 0.2s', fontSize:'0.9em' }}>
                        Oyundan Çık
                    </button>
                </div>

                 {error && !isProcessingDecision && ( // Display temporary error message near the top if not currently processing
                     <div style={{ background: '#f8d7da', color: '#721c24', padding: '10px 15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #f5c6cb' }}>
                          {error}
                     </div>
                 )}

                {/* Average MCDA Scores Summary */}
                 {userDecisions.length > 0 && (
                     <div style={{ background: 'white', padding: '15px 20px', borderRadius: '10px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', fontSize: '1.1em', color: '#1e3c72', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px' }}>
                         {avgBaoScore !== null && (
                             <span>
                                 <strong>Ort. BAO:</strong>{' '}
                                 <span style={{ color: getScoreColor(avgBaoScore), fontWeight: 'bold' }} title={`Ortalama BAO Skoru: ${avgBaoScore.toFixed(1)}`}>
                                     {getEmojiForScore(avgBaoScore)} {avgBaoScore.toFixed(1)}
                                 </span>
                             </span>
                         )}
                          {avgTopsisScore !== null && (
                              <span>
                                  <strong>Ort. TOPSIS:</strong>{' '}
                                   <span style={{ color: getScoreColor(avgTopsisScore), fontWeight: 'bold' }} title={`Ortalama Basitleştirilmiş TOPSIS Göstergesi: ${avgTopsisScore.toFixed(1)}`}>
                                       {getEmojiForScore(avgTopsisScore)} {avgTopsisScore.toFixed(1)}
                                   </span>
                              </span>
                          )}
                           {avgAhpScore !== null && (
                               <span>
                                   <strong>Ort. AHP:</strong>{' '}
                                    <span style={{ color: getScoreColor(avgAhpScore), fontWeight: 'bold' }} title={`Ortalama Basitleştirilmiş AHP Proxy Göstergesi: ${avgAhpScore.toFixed(1)}`}>
                                        {getEmojiForScore(avgAhpScore)} {avgAhpScore.toFixed(1)}
                                    </span>
                               </span>
                           )}
                            {avgElectreScore !== null && (
                                <span>
                                    <strong>Ort. ELECTRE:</strong>{' '}
                                     <span style={{ color: getScoreColor(avgElectreScore), fontWeight: 'bold' }} title={`Ortalama Basitleştirilmiş ELECTRE Proxy Göstergesi: ${avgElectreScore.toFixed(1)}`}>
                                         {getEmojiForScore(avgElectreScore)} {avgElectreScore.toFixed(1)}
                                     </span>
                                </span>
                            )}
                             {avgMavtScore !== null && (
                                 <span>
                                     <strong>Ort. MAVT:</strong>{' '}
                                      <span style={{ color: getScoreColor(avgMavtScore), fontWeight: 'bold' }} title={`Ortalama Basitleştirilmiş MAVT Proxy Göstergesi: ${avgMavtScore.toFixed(1)}`}>
                                          {getEmojiForScore(avgMavtScore)} {avgMavtScore.toFixed(1)}
                                      </span>
                                 </span>
                             )}
                           {avgVikorSScore !== null && avgVikorRScore !== null && (
                               <span>
                                   <strong>Ort. VIKOR (S/R):</strong>{' '}
                                    <span style={{ color: getScoreColor(avgVikorRScore, 'vikor'), fontWeight: 'bold' }} title={`Ortalama Basitleştirilmiş VIKOR Pişmanlık Skorları: S=${(avgVikorSScore ?? 0).toFixed(1)}, R=${(avgVikorRScore ?? 0).toFixed(1)}. Daha düşük skor daha iyi.`}>
                                         S{(avgVikorSScore ?? 0).toFixed(1)} R{(avgVikorRScore ?? 0).toFixed(1)}
                                    </span>
                               </span>
                           )}
                     </div>
                 )}


                {/* MCDA Explanation Section with Accordions */}
                <div style={{ background: 'white', padding: '10px 20px', borderRadius: '10px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                     <h4 style={{ color: '#1e3c72', marginBottom: '15px', fontSize: '1em', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                         Karar Analizi Yöntemleri (Basitleştirilmiş Göstergeler)
                     </h4>
                     <Accordion
                        title="BAO / SAW Skoru (Basit Ağırlıklı Ortalama)"
                        isOpen={showBaoExplanation}
                        setIsOpen={setShowBaoExplanation}
                     >
                          <p style={{ margin: '0 0 10px 0' }}>
                              BAO (veya SAW) Skoru, kararlarınızın otel metrikleri üzerindeki etkilerinin ağırlıklı ortalamasını gösterir. Her metriğin etkisinin (örn. +10 Gelir) belirlenen ağırlıklarla (örn. Gelir için 0.25) çarpılıp toplanmasıyla hesaplanır. Ağırlıkların toplamı 1 olduğu için, bu skor aslında ağırlıklı etkilerin toplamına eşittir. Yüksek pozitif BAO skoru, kararın otel metrikleri üzerinde ağırlıklı olarak olumlu bir etki yaptığını gösterir. Bu skorlar yaklaşık -5 ile +5 arasında değişir.
                          </p>
                          <p style={{ margin: 0, fontStyle: 'italic' }}>
                              BAO = Σ (Metrik Etkisi * Metrik Ağırlığı)
                          </p>
                     </Accordion>
                     <Accordion
                         title="Basitleştirilmiş TOPSIS Göstergesi"
                         isOpen={showTopsisExplanation}
                         setIsOpen={setShowTopsisExplanation}
                     >
                          <p style={{ margin: '0 0 10px 0' }}>
                              Bu basitleştirilmiş TOPSIS göstergesi, kararınızın olumlu ve olumsuz etkilerinin mutlak büyüklüğüne göre net fayda oranını temsil eder.
                          </p>
                          <p style={{ margin: '0 0 10px 0' }}>
                               Skor, `(Pozitif Etkilerin Ağırlıklı Toplamı) / (Tüm Mutlak Etkilerin Ağırlıklı Toplamı)` oranı üzerinden hesaplanır ve sonuç -5 ile +5 arasına ölçeklenir. +5'e yakın skorlar ağırlıklı olarak olumlu etki, -5'e yakın skorlar ise ağırlıklı olarak olumsuz etki anlamına gelir. TOPSIS, "İdeal Çözüme Benzerliğe Göre Sıralama Tekniği" anlamına gelir.
                          </p>
                           <p style={{ margin: 0, fontStyle: 'italic' }}>
                               TOPSIS Proxy = ((Σ (Pozitif Etki * Ağırlık)) / (Σ (|Etki| * Ağırlık))) * 10 - 5
                          </p>
                     </Accordion>
                     <Accordion
                         title="Basitleştirilmiş VIKOR Göstergeleri (S ve R)"
                         isOpen={showVikorExplanation}
                         setIsOpen={setShowVikorExplanation}
                     >
                          <p style={{ margin: '0 0 10px 0' }}>
                              Bu basitleştirilmiş VIKOR göstergeleri, kararınızın olumsuz etkilerinden kaynaklanan "pişmanlığı" temsil eder. Pişmanlık skorlarıdır, yani daha düşük S ve R skorları daha iyidir (daha az pişmanlık). VIKOR, "Çok Kriterli Optimizasyon ve Uzlaşmacı Çözüm" anlamına gelir.
                          </p>
                          <p style={{ margin: '0 0 10px 0' }}>
                              <strong>S Skoru:</strong> Ağırlıklı negatif etkilerin mutlak değerlerinin toplamıdır. Kararınızın genel olumsuz etkisinin büyüklüğünü gösterir.
                          </p>
                           <p style={{ margin: 0, fontStyle: 'italic' }}>
                              S = Σ (|Negatif Etki| * Ağırlık)
                          </p>
                           <p style={{ margin: '10px 0 0 0' }}>
                              <strong>R Skoru:</strong> Ağırlıklı negatif etkilerin mutlak değerlerinin en büyüğüdür. Kararınızın en çok zarar veren tek bir etkisinin büyüklüğünü gösterir.
                          </p>
                            <p style={{ margin: 0, fontStyle: 'italic' }}>
                              R = Max(|Negatif Etki| * Ağırlık)
                          </p>
                     </Accordion>
                      <Accordion
                         title="Basitleştirilmiş AHP Göstergesi (Analitik Hiyerarşi Süreci)"
                         isOpen={showAhpExplanation}
                         setIsOpen={setShowAhpExplanation}
                     >
                          <p style={{ margin: '0 0 10px 0' }}>
                              Bu basitleştirilmiş AHP göstergesi, kararınızın metrikler üzerindeki etkilerini, her metriğin potansiyel maksimum etkisine göre standardize edip, metrik ağırlıklarıyla toplayarak bir uyum skoru hesaplar. Metriklerin önemine göre etkilerin ne kadar iyi hizalandığını gösterir.
                          </p>
                           <p style={{ margin: '0 0 10px 0' }}>
                              Skor, `Σ (Metrik Ağırlığı * (Metrik Etkisi / Maksimum Olası Etki Büyüklüğü))` formülü ile hesaplanır ve sonuç -5 ile +5 arasına ölçeklenir. Daha yüksek skorlar, kararın öncelikli metriklere olumlu yönde daha iyi hizalandığını gösterir.
                          </p>
                           <p style={{ margin: 0, fontStyle: 'italic' }}>
                              AHP Proxy = (Σ (Ağırlık * (Etki / Maks_Etki_Büyüklüğü))) * 5
                          </p>
                     </Accordion>
                      <Accordion
                          title="Basitleştirilmiş ELECTRE Göstergesi (Elemination Et Choix Traduisant la REalité)"
                          isOpen={showElectreExplanation}
                          setIsOpen={setShowElectreExplanation}
                      >
                           <p style={{ margin: '0 0 10px 0' }}>
                               Bu basitleştirilmiş ELECTRE göstergesi, kararınızın etkilerinin "uyum" (concordance - iyi etkiler) ve "uyumsuzluk" (discordance - kötü etkiler) kanıtlarını birleştirir. Seçenekleri birbirleriyle karşılaştırarak en iyi olanları belirlemeye odaklanır.
                           </p>
                           <p style={{ margin: '0 0 10px 0' }}>
                               Bu proxy skor, `(Pozitif Etki Yaratan Metriklerin Ağırlık Toplamı) - (Belirli Bir Eşiğin (örn. -5%) Altındaki Negatif Etki Yaratan Metriklerin Ağırlık Toplamı)` formülü ile hesaplanır ve sonuç -5 ile +5 arasına ölçeklenir. Yüksek pozitif skorlar güçlü uyum (iyi etkiler), düşük negatif skorlar ise güçlü uyumsuzluk (önemli kötü etkiler) anlamına gelir.
                           </p>
                           {/* Corrected < and > signs using HTML entities */}
                           <p style={{ margin: 0, fontStyle: 'italic' }}>
                               ELECTRE Proxy = (Σ (Ağırlık eğer Etki &gt; 0)) - (Σ (Ağırlık eğer Etki &lt; -5))) * 5
                           </p>
                      </Accordion>
                       <Accordion
                           title="Basitleştirilmiş MAVT Göstergesi (Çok Öznitelikli Değer Teorisi)"
                           isOpen={showMavtExplanation}
                           setIsOpen={setShowMavtExplanation}
                       >
                            <p style={{ margin: '0 0 10px 0' }}>
                                Bu basitleştirilmiş MAVT göstergesi, her metriğin etkisine bir "değer" (utility) atayan ve bu değerleri ağırlıklandırarak toplanan bir yaklaşımdır. Diğer yöntemlerden farklı olarak, negatif etkiler için doğrusal olmayan (daha sert cezalandırıcı) bir değer fonksiyonu kullanır.
                            </p>
                             <p style={{ margin: '0 0 10px 0' }}>
                                Örneğin, negatif etkiler pozitif etkilere göre daha büyük bir çarpanla (örn. 1.5) cezalandırılır. Skor, ağırlıklandırılmış değerlerin toplamı üzerinden hesaplanır ve -5 ile +5 arasına ölçeklenir. Daha yüksek skorlar, kararınızın otelin genel değerine daha fazla katkı sağladığını gösterir. MAVT, "Multi-Attribute Value Theory" anlamına gelir.
                            </p>
                            <p style={{ margin: 0, fontStyle: 'italic' }}>
                                MAVT Proxy = Ölçeklenmiş (Σ (Ağırlık * Metrik Değeri))
                            </p>
                            {/* Corrected >= and < signs using HTML entities */}
                             <p style={{ margin: '10px 0 0 0', fontStyle: 'italic' }}>
                                 Metrik Değeri = Etki (Eğer Etki &gt;= 0) veya Etki * Ceza Çarpanı (Eğer Etki &lt; 0)
                            </p>
                       </Accordion>
                </div>


                {/* Main Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                    {/* Metrics Card */}
                    <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ marginBottom: '15px', color: '#1e3c72', borderBottom: '1px solid #eee', paddingBottom: '8px', fontSize:'1.1em' }}>
                            📊 Otel Metrikleri
                        </h3>
                        {metrics ? (
                            <>
                                <MetricBar label="Gelir" value={metrics.revenue} />
                                <MetricBar label="Müşteri Memnuniyeti" value={metrics.customerSatisfaction} />
                                <MetricBar label="Personel Memnuniyeti" value={metrics.staffSatisfaction} />
                                <MetricBar label="Doluluk Oranı" value={metrics.occupancyRate} />
                                <MetricBar label="Sürdürülebilirlik" value={metrics.sustainability} />
                            </>
                        ) : (
                            <p style={{textAlign:'center', color:'#666'}}>Metrikler yükleniyor...</p>
                        )}
                    </div>

                    {/* Active Scenario Card */}
                    <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.08)', border: '1px solid #e0e0e0' }}>
                        <h3 style={{ color: '#1e3c72', marginBottom: '15px', fontSize: '1.2em', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                            🎯 Günlük Kararlar
                        </h3>
                         { currentDayScenarios === null ? (
                             <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Senaryolar yükleniyor...</div>
                         ) : currentDayScenarios.length > 0 ? (
                            currentDayScenarios.map((scenario) => (
                                <div key={scenario.id} style={{ background: '#f8f9fa', border: '1px solid #eee', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                                    <p style={{ fontSize: '1em', color: '#333', marginBottom: '12px', lineHeight: '1.4' }}>
                                        <strong>{scenario.text ?? 'Senaryo metni eksik!'}</strong>
                                        <span style={{ fontSize: '0.8em', color: '#666', marginLeft: '8px', background: '#e9ecef', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                             Zorluk: {'⭐'.repeat(scenario.difficulty ?? 1)}
                                        </span>
                                    </p>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {(scenario.options || []).map((option, optionIndex) => {
                                            const optionBAOScore = calculateBAOScore(option.effects);
                                            const scoreEmoji = getEmojiForScore(optionBAOScore);
                                            const baoStyle = {
                                                fontSize: '0.85em', fontWeight: 'bold', marginLeft: 'auto',
                                                padding: '3px 8px', borderRadius: '12px', color: 'white',
                                                background: optionBAOScore > 1 ? '#28a745' : optionBAOScore < -1 ? '#dc3545' : '#6c757d',
                                                whiteSpace: 'nowrap' as const
                                            };

                                            return (
                                                <button
                                                    key={optionIndex}
                                                    onClick={() => handleDecision(scenario.id, optionIndex)}
                                                    disabled={!!isProcessingDecision} // Use !! to ensure boolean
                                                    style={{
                                                        padding: '12px 15px', background: 'white',
                                                        border: '1px solid #ccc', borderRadius: '8px',
                                                        cursor: isProcessingDecision ? 'not-allowed' : 'pointer',
                                                        textAlign: 'left', transition: 'all 0.2s ease',
                                                        opacity: isProcessingDecision ? 0.6 : 1, display: 'flex', flexDirection: 'column',
                                                    }}
                                                    onMouseEnter={(e) => !isProcessingDecision && (e.currentTarget.style.borderColor = '#0d6efd')}
                                                    onMouseLeave={(e) => !isProcessingDecision && (e.currentTarget.style.borderColor = '#ccc')}
                                                >
                                                     <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom:'8px' }}>
                                                         <span style={{ color: '#333', flexGrow: 1, marginRight:'10px' }}>{option.text ?? 'Seçenek metni eksik'}</span>
                                                         <span style={baoStyle} title={`Genel Etki Skoru: ${optionBAOScore.toFixed(1)} (BAO / SAW)`}>
                                                             {scoreEmoji} {optionBAOScore.toFixed(1)}
                                                         </span>
                                                     </div>

                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.8em' }}>
                                                        {(Object.keys(option.effects || {}) as Array<keyof ScenarioOptionEffect>).map((key) => {
                                                            const value = option.effects[key];
                                                            if (value === 0 || value === undefined || value === null) return null;

                                                            const isPositive = value > 0;
                                                            const iconMap: { [key in keyof ScenarioOptionEffect]: string } = { revenue: '💰', customerSatisfaction: '😊', staffSatisfaction: '👥', occupancyRate: '🏨', sustainability: '♻️' };
                                                            const metricNames: { [key in keyof ScenarioOptionEffect]: string } = { revenue: 'Gelir', customerSatisfaction: 'Müşteri', staffSatisfaction: 'Personel', occupancyRate: 'Doluluk', sustainability: 'Sürdür.' };

                                                            return (
                                                                <span key={key} title={`${metricNames[key]}: ${isPositive ? '+' : ''}${value}%`} style={{
                                                                    background: isPositive ? '#e7f7ec' : '#fdecea',
                                                                     color: isPositive ? '#1e7e34' : '#c9302c',
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
                                    </div>
                                </div>
                            ))
                         ) : userData.completedScenarios !== undefined && userData.completedScenarios < 10 ? (
                             <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                 Bugün için yeni karar senaryosu bulunmuyor. Gün sonuna yaklaşıyorsunuz.
                             </div>
                         ) : userData.completedScenarios !== undefined && userData.completedScenarios >= 10 ? (
                              <div style={{ textAlign: 'center', padding: '20px', color: '#28a745', fontWeight:'bold' }}>
                                 🎉 Oyunu tamamladınız! Karar geçmişinize göz atabilirsiniz.
                                 <button onClick={() => navigate(`/game-over?gameId=${localStorage.getItem('currentGameId')}`)} style={{marginTop:'15px', padding: '10px 20px', background: '#1e3c72', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Sonuçları Gör</button>
                             </div>
                         ) : (
                              <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Senaryolar yüklenemedi veya bulunamadı.</div>
                         )}
                    </div>

                     <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                         {/* Metric Chart Card */}
                         <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                             <h3 style={{ marginBottom: '15px', color: '#1e3c72', borderBottom: '1px solid #eee', paddingBottom: '8px', width: '100%', textAlign: 'center', fontSize:'1.1em' }}>
                                 📊 Otel Metrik Dağılımı
                             </h3>
                             <div style={{ width: '100%', maxWidth: '250px' }}>
                                 {metrics ? <Doughnut data={chartData} options={chartOptions} /> : <p style={{textAlign:'center', color:'#666'}}>Yükleniyor...</p>}
                             </div>
                              <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:'10px', marginTop:'15px', fontSize:'0.8em' }}>
                                   {chartData?.datasets?.[0]?.backgroundColor && (chartData.labels ?? []).map((label, index) => (
                                      <span key={String(label)} style={{ display:'flex', alignItems:'center' }}>
                                          <span style={{ width:'10px', height:'10px', borderRadius:'50%', backgroundColor: (Array.isArray(chartData.datasets[0].backgroundColor) ? chartData.datasets[0].backgroundColor[index] : '#ccc') as string, marginRight:'5px' }}></span>
                                          {String(label)}
                                      </span>
                                  ))}
                              </div>
                         </div>

                         {/* Achievements Card */}
                         <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                             <h3 style={{ color: '#1e3c72', marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '8px', fontSize:'1.1em' }}>
                                 🏆 Baş başarımlar ({userData?.achievements?.length ?? 0}) {/* Use ?? 0 */}
                             </h3>
                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '10px' }}>
                                 {['HAPPY_CUSTOMERS', 'REVENUE_MASTER', 'STAFF_CHAMPION', 'FIRST_DECISION'].map((id) => {
                                     const ach = getAchievementInfo(id);
                                     const isUnlocked = userData?.achievements?.includes(id) ?? false;
                                     return (
                                         <div key={id} title={`${ach.name}: ${ach.desc}${isUnlocked ? ' (Kazanıldı)' : ''}`} style={{ padding: '10px', background: isUnlocked ? '#e7f7ec' : '#f8f9fa', border: `1px solid ${isUnlocked ? '#b8e0c2' : '#dee2e6'}`, borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', opacity: isUnlocked ? 1 : 0.6, transition: 'all 0.3s ease' }}>
                                             <span style={{ fontSize: '1.8em', filter: isUnlocked ? 'none' : 'grayscale(80%)', marginBottom:'5px' }}>{ach.icon}</span>
                                             <strong style={{ fontSize: '0.7em', color: '#444', lineHeight:'1.2' }}>{ach.name}</strong>
                                         </div>
                                     );
                                 })}
                             </div>
                         </div>
                    </div>
                </div>

                {/* MCDA Score History Chart (Line Chart) */}
                {mcdaChartData && mcdaChartData.labels && mcdaChartData.labels.length > 0 && (
                    <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '15px' }}>
                        <h3 style={{ marginBottom: '15px', color: '#1e3c72', borderBottom: '1px solid #eee', paddingBottom: '8px', fontSize:'1.1em' }}>
                            📈 Karar Skoru Geçmişi (En Eski → En Yeni)
                        </h3>
                        <div style={{ width: '100%', height: '300px' }}>
                            <Line
                                data={mcdaChartData}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: {
                                            display: true,
                                            position: 'top',
                                        },
                                        title: {
                                            display: true,
                                            text: 'Karar Bazında MCDA Skoru Değişimi',
                                            color: '#333',
                                            font: { size: 14 }
                                        },
                                        tooltip: {
                                            callbacks: {
                                                label: (context: any) => {
                                                    const label = context.dataset.label || '';
                                                    const value = context.parsed.y !== undefined ? context.parsed.y.toFixed(1) : 'N/A';
                                                     if (label === 'VIKOR S' || label === 'VIKOR R') {
                                                          return `${label} (Pişmanlık): ${value}`;
                                                     }
                                                    return `${label}: ${value}`;
                                                },
                                            }
                                        }
                                    },
                                    scales: {
                                        y: {
                                            beginAtZero: false,
                                            title: {
                                                display: true,
                                                text: 'Skor Değeri',
                                                color: '#333'
                                            },
                                        },
                                        x: {
                                            title: {
                                                display: true,
                                                text: 'Karar Sırası',
                                                color: '#333'
                                            }
                                        }
                                    }
                                }}
                            />
                        </div>
                    </div>
                )}


                {/* History Card */}
                <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', maxHeight: '400px', overflowY: 'auto', marginBottom: '15px' }}>
                    <h3 style={{ color: '#1e3c72', marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '8px', position: 'sticky', top: 0, background: 'white', zIndex: 1, fontSize:'1.1em' }}>
                        📜 Karar Geçmişi ({userDecisions?.length ?? 0})
                    </h3>
                    <div style={{ paddingTop: '5px' }}>
                          {userDecisions && userDecisions.length > 0 ? userDecisions.map((decision) => (
                             <div key={decision.id} style={{ background: '#f8f9fa', border: '1px solid #eee', padding: '10px 15px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.9em' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#555', fontSize: '0.9em' }}>
                                     <strong>Gün {decision.day ?? '?'}</strong>
                                     <span>{(decision.createdAt instanceof Timestamp) ? decision.createdAt.toDate().toLocaleDateString() : 'Tarih yok'}</span>
                                 </div>
                                 <p style={{ margin: '4px 0', color: '#444', fontStyle: 'italic' }}>"{decision.scenarioText?.substring(0, 80) ?? 'Senaryo metni eksik!'}"</p>
                                 <p style={{ margin: '4px 0', color: '#0d6efd'}}>
                                     <span style={{fontWeight: 'bold'}}>Karar:</span> {decision.selectedOptionText?.substring(0, 80) ?? `Seçenek ${decision.selectedOption + 1}`}
                                 </p>
                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', fontSize: '0.8em' }}>
                                     {typeof decision.baoScore === 'number' && (
                                         <span style={{
                                             padding: '2px 6px', borderRadius: '10px',
                                             color: 'white', fontWeight: 'bold',
                                             background: getScoreColor(decision.baoScore, 'normal')
                                         }} title={`BAO / SAW Skoru (Basit Ağırlıklı Ortalama): ${decision.baoScore.toFixed(1)}`}>
                                              BAO {decision.baoScore.toFixed(1)}
                                         </span>
                                     )}
                                      {typeof decision.topsisScore === 'number' && (
                                          <span style={{
                                              padding: '2px 6px', borderRadius: '10px',
                                              color: '#333', background: '#ffeb3b', fontWeight: 'bold'
                                          }} title={`Basitleştirilmiş TOPSIS (Net Fayda Oranı): ${decision.topsisScore.toFixed(1)}`}>
                                              TOPSIS {decision.topsisScore.toFixed(1)}
                                          </span>
                                      )}
                                        {typeof decision.ahpScore === 'number' && (
                                            <span style={{
                                                padding: '2px 6px', borderRadius: '10px',
                                                 color: '#333', background: '#d2b4de', fontWeight: 'bold'
                                            }} title={`Basitleştirilmiş AHP Proxy: ${decision.ahpScore.toFixed(1)}`}>
                                                 AHP {decision.ahpScore.toFixed(1)}
                                            </span>
                                        )}
                                         {typeof decision.electreScore === 'number' && (
                                             <span style={{
                                                 padding: '2px 6px', borderRadius: '10px',
                                                 color: '#333', background: '#a3e4d7', fontWeight: 'bold'
                                             }} title={`Basitleştirilmiş ELECTRE Proxy: ${decision.electreScore.toFixed(1)}`}>
                                                  ELECTRE {decision.electreScore.toFixed(1)}
                                             </span>
                                         )}
                                          {typeof decision.mavtScore === 'number' && (
                                              <span style={{
                                                  padding: '2px 6px', borderRadius: '10px',
                                                  color: '#333', background: '#f5b7b1', fontWeight: 'bold'
                                              }} title={`Basitleştirilmiş MAVT Proxy: ${decision.mavtScore.toFixed(1)}`}>
                                                   MAVT {decision.mavtScore.toFixed(1)}
                                              </span>
                                          )}
                                       {typeof decision.vikorSScore === 'number' && typeof decision.vikorRScore === 'number' && (
                                           <span style={{
                                               padding: '2px 6px', borderRadius: '10px',
                                               color: '#333', background: '#b2ebf2', fontWeight: 'bold'
                                           }} title={`Basitleştirilmiş VIKOR (Pişmanlık): S=${decision.vikorSScore.toFixed(1)}, R=${decision.vikorRScore.toFixed(1)}. Daha düşük skor daha iyi.`}>
                                               VIKOR S{decision.vikorSScore.toFixed(1)} R{decision.vikorRScore.toFixed(1)}
                                           </span>
                                       )}
                                 </div>
                             </div>
                         )) : (
                              <p style={{ textAlign: 'center', color: '#666', padding: '20px 0' }}>
                                 {userDecisions === null ? 'Geçmiş yükleniyor...' : 'Bu oyun için henüz karar geçmişi yok. İlk kararınızı verin!'}
                             </p>
                         )}
                    </div>
                </div>


                {/* Grafik Modal (Unused in this version, but kept) */}
                {isChartOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setIsChartOpen(false)}>
                        <div style={{ background: 'white', borderRadius: '12px', padding: '20px 30px', maxWidth: '500px', width: '90%', textAlign: 'center', position: 'relative', boxShadow: '0 5px 20px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
                            <h2 style={{ color: '#1e3c72', marginBottom: '20px' }}>Metrikler Grafiği</h2>
                             {/* chartData is defined outside this block, but guaranteed to be defined if the main render happens */}
                             <Doughnut data={chartData} options={chartOptions} />
                            <button onClick={() => setIsChartOpen(false)} style={{ marginTop: '25px', padding: '10px 20px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1em' }}>
                                Kapat
                            </button>
                        </div>
                    </div>
                 )}

             {/* Global Loading Spinner Overlay for decision processing */}
             {isProcessingDecision && (
                 <div style={{
                     position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                     backgroundColor: 'rgba(255, 255, 255, 0.8)', zIndex: 2000,
                     display: 'flex', justifyContent: 'center', alignItems: 'center'
                 }}>
                      <div style={{ textAlign: 'center' }}>
                         <h2 style={{ color: '#1e3c72' }}>Karar İşleniyor...</h2>
                         <p style={{ color: '#666' }}>Lütfen bekleyin</p>
                         <div style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '15px auto' }}></div>
                     </div>
                 </div>
             )}
             <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
};

export default GameDashboard;
