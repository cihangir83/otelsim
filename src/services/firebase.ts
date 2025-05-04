// ../services/firebase.ts

import { db } from '../firebase/config';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    addDoc,
    Timestamp,
    query,
    where,
    getDocs,
    serverTimestamp // serverTimestamp() kullanmak için import'u açalım
} from 'firebase/firestore';
import {
    UserData,
    MetricValues,
    UserDecision // UserDecision tipinin tüm MCDA skor alanlarını içerdiğini varsayıyoruz (baoScore, sawScore, topsisScore, vikorSScore, vikorRScore, ahpScore, electreScore, mavtScore)
} from '../types/firebase';

// --- createNewUser fonksiyonu ---
export const createNewUser = async (userId: string, userData: {
    email: string | null;
    name: string | null;
    currentRole: string;
    hotelType: string;
    currentDay: number;
    completedScenarios: number;
    metrics: MetricValues;
    achievements: string[];
}) => {
    try {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, {
            ...userData,
            achievements: Array.isArray(userData.achievements) ? userData.achievements : [],
            // createdAt ve lastLoginDate için serverTimestamp() kullanmak daha tutarlı olabilir
            createdAt: serverTimestamp(),
            lastLoginDate: serverTimestamp()
        });
         console.log("✅ Kullanıcı oluşturuldu:", userId);
    } catch (error) {
        console.error('❌ Kullanıcı oluşturma hatası:', error);
        throw error;
    }
};

// --- getUserData fonksiyonu ---
export const getUserData = async (userId: string): Promise<UserData | null> => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            const data = userDoc.data() as UserData;
            // achievements alanının bir dizi olduğundan emin ol
            if (data.achievements && !Array.isArray(data.achievements)) {
                console.warn(`Kullanıcı ${userId} için 'achievements' alanı bir dizi değil, boş dizi olarak ayarlanıyor.`);
                data.achievements = [];
            } else if (data.achievements === undefined || data.achievements === null) { // Sadece undefined/null durumunda ata
                data.achievements = [];
            }
            // Timestamp alanlarının doğru tipte olduğundan emin ol (Firestore okurken zaten Timestamp objesi döner)
            // Manuel dönüşüm veya kontrol genellikle gerekmez.
            return data;
        }
         console.log(`⚠️ Kullanıcı verisi bulunamadı: ${userId}`);
        return null;
    } catch (error) {
        console.error('❌ Kullanıcı verisi getirme hatası:', error);
        // Hatanın GameDashboard'da yakalanıp UI'a yansıtılması için tekrar fırlat
        throw error;
    }
};

// --- updateUserMetrics fonksiyonu ---
export const updateUserMetrics = async (
    userId: string,
    newMetrics: MetricValues
) => {
    try {
        const userRef = doc(db, 'users', userId);
        // metrics alanının null veya undefined gelme ihtimaline karşı kontrol
        if (newMetrics === null || newMetrics === undefined) {
             console.warn(`Metrik güncelleme: userId ${userId} için geçersiz metrik verisi.`);
             // İsteğe bağlı: Hata fırlat veya işlemi atla
             throw new Error("Geçersiz metrik verisi.");
        }
        await updateDoc(userRef, { metrics: newMetrics });
         console.log("✅ Metrikler güncellendi:", userId);
    } catch (error) {
        console.error('❌ Metrik güncelleme hatası:', error);
        throw error;
    }
};


// --- saveUserDecision fonksiyonu (güncellendi) ---
export const saveUserDecision = async (
    // GameDashboard'dan gönderilen tüm opsiyonel alanları ve MCDA skorlarını kabul etmeli
    // UserDecision tipinin id ve createdAt hariç tüm alanlarını alıyoruz
    // UserDecision tipinin artık MCDA skor alanlarını içerdiğini varsayıyoruz
    decisionData: Omit<UserDecision, 'id' | 'createdAt'>
) => {
    try {
        // Firestore dokümanları oluşturulurken Timestamp.now() yerine serverTimestamp() kullanmak daha güvenlidir
        // addDoc içinde serverTimestamp() kullanmak, client-side zaman farklılıklarını ortadan kaldırır.
        // decisionData zaten GameDashboard'da hesaplanan tüm MCDA skorlarını içeriyor.
        console.log("💾 Karar Firestore'a kaydediliyor:", decisionData);

        await addDoc(collection(db, 'userDecisions'), {
             ...decisionData, // Gelen decisionData objesini olduğu gibi kopyala (MCDA skorları dahil)
             createdAt: serverTimestamp() // serverTimestamp() kullanıyoruz
        });
        console.log("✅ Karar başarıyla kaydedildi.");

    } catch (error) {
        console.error('❌ Karar kaydetme hatası:', error);
        throw error;
    }
};


// --- loadUserDecisions fonksiyonu (DÜZELTİLDİ) ---
export const loadUserDecisions = async (userId: string, gameId: string): Promise<UserDecision[]> => {
    if (!userId) {
         console.warn("loadUserDecisions: userId eksik.");
         return [];
    }
    if (!gameId) {
        console.warn("loadUserDecisions: gameId eksik.");
        return [];
    }
    try {
        const decisionsRef = collection(db, 'userDecisions');
        const q = query(
            decisionsRef,
            where('userId', '==', userId),
            where('gameId', '==', gameId)
            // orderBy('createdAt', 'asc') // GameDashboard'da client-side sıralama yeterli
        );
        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(docSnapshot => {
            const data = docSnapshot.data();
            // Firestore'dan gelen veriyi UserDecision tipine dönüştür
            // TÜM BEKLENEN MCDA SKOR ALANLARINI DAHİL ET
            return {
                id: docSnapshot.id,
                userId: data.userId,
                questionId: data.questionId || "ID Yok",
                selectedOption: data.selectedOption,
                metrics: data.metrics || { before: {}, after: {} },
                createdAt: data.createdAt as Timestamp, // data.createdAt genellikle Timestamp objesi olacaktır
                day: data.day,
                scenarioText: data.scenarioText,
                selectedOptionText: data.selectedOptionText,
                gameId: data.gameId,
                // --- DÜZELTME: TÜM MCDA skor alanlarını oku ve dahil et ---
                baoScore: data.baoScore,
                sawScore: data.sawScore,
                topsisScore: data.topsisScore,
                vikorSScore: data.vikorSScore,
                vikorRScore: data.vikorRScore,
                ahpScore: data.ahpScore, // Eklendi
                electreScore: data.electreScore, // Eklendi
                mavtScore: data.mavtScore, // Eklendi
                // --- Eğer UserDecision tipinizde vikorScore varsa ve onu istemiyorsanız:
                // vikorScore: undefined, // veya hiç dahil etmeyin
                // -------------------------------------------------------
            } as UserDecision; // UserDecision tipine dönüştür (bu cast, tipin doğru olduğunu varsayar)
        });
        // Client-side sıralama GameDashboard'da yapılıyor
    } catch (error) {
        console.error('❌ Karar geçmişi yükleme hatası:', error);
        throw error;
    }
};

// --- getInitialMetrics fonksiyonu ---
export const getInitialMetrics = (): MetricValues => ({
    revenue: 50,
    customerSatisfaction: 50,
    staffSatisfaction: 50,
    occupancyRate: 50,
    sustainability: 50
});