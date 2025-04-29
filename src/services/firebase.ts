// ../services/firebase.ts dosyasının içinde

import { db } from '../firebase/config';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    addDoc,
    Timestamp, // Timestamp'i serverTimestamp yerine kullanıyoruz, Firestore bunu otomatik dönüştürür
    query,
    where,
    getDocs
} from 'firebase/firestore';
import {
    UserData,
    MetricValues,
    UserDecision // UserDecision tipinin baoScore?: number içerdiğini varsayıyoruz
} from '../types/firebase';

// ... (createNewUser, getUserData, updateUserMetrics fonksiyonları aynı kalır) ...

// Karar kaydetme işlemi - baoScore alanını da içerecek şekilde güncellendi
export const saveUserDecision = async (
    // Parametre tipi UserDecision'dan türetilmiş ve baoScore'u da içeriyor
    decision: Omit<UserDecision, 'id' | 'createdAt'> & {
        // Bu ek alanlar zaten vardı, baoScore'u da ekliyoruz (tip tanımında optional olmalı)
        baoScore?: number;
    }
) => {
    try {
        const decisionDataToSave = {
            userId: decision.userId,
            questionId: decision.questionId,
            selectedOption: decision.selectedOption,
            metrics: decision.metrics,
            // Opsiyonel alanları kontrol ederek ekle
            ...(decision.day !== undefined && decision.day !== null ? { day: decision.day } : {}),
            ...(decision.scenarioText ? { scenarioText: decision.scenarioText } : {}),
            ...(decision.selectedOptionText ? { selectedOptionText: decision.selectedOptionText } : {}),
            ...(decision.gameId ? { gameId: decision.gameId } : {}),
            // --- YENİ: baoScore alanını kontrol ederek ekle ---
            ...(typeof decision.baoScore === 'number' ? { baoScore: decision.baoScore } : {}),
            // ----------------------------------------------
            createdAt: Timestamp.now() // Firestore'a gönderirken Timestamp.now() kullanmak yaygındır
            // Alternatif olarak serverTimestamp() da kullanılabilir, ancak addDoc ile Timestamp.now() daha direkt olabilir.
            // İkisi de sunucu zamanını kullanır.
        };

        console.log("💾 Karar Firestore'a kaydediliyor:", decisionDataToSave); // Kaydedilecek veriyi logla
        await addDoc(collection(db, 'userDecisions'), decisionDataToSave);
        console.log("✅ Karar başarıyla kaydedildi.");

    } catch (error) {
        console.error('❌ Karar kaydetme hatası:', error);
        throw error; // Hatanın yukarıya iletilmesi için tekrar fırlat
    }
};


// --- loadUserDecisions fonksiyonu da baoScore'u okuyacak şekilde güncellenebilir ---
export const loadUserDecisions = async (userId: string, gameId: string): Promise<UserDecision[]> => {
    // gameId parametresini ekledik, çünkü genellikle belirli bir oyunun kararları yüklenir
    if (!gameId) {
        console.warn("loadUserDecisions: gameId eksik.");
        return [];
    }
    try {
        const decisionsRef = collection(db, 'userDecisions');
        // userId ve gameId'ye göre sorgu yap
        const q = query(
            decisionsRef,
            where('userId', '==', userId),
            where('gameId', '==', gameId)
            // orderBy('createdAt', 'desc') // İsteğe bağlı: Zaman göre sırala
        );
        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(docSnapshot => {
            const data = docSnapshot.data();
            return {
                id: docSnapshot.id,
                userId: data.userId,
                questionId: data.questionId,
                selectedOption: data.selectedOption,
                metrics: data.metrics,
                createdAt: data.createdAt, // Firestore'dan Timestamp olarak gelir
                day: data.day,
                scenarioText: data.scenarioText,
                selectedOptionText: data.selectedOptionText,
                gameId: data.gameId,
                baoScore: data.baoScore // baoScore alanını da oku (undefined olabilir)
            } as UserDecision; // UserDecision tipine dönüştür
        })
        // İstemci tarafında tekrar sıralama (opsiyonel, Firestore sıralaması tercih edilebilir)
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
    } catch (error) {
        console.error('Karar geçmişi yükleme hatası:', error);
        throw error;
    }
};

// ... (getInitialMetrics fonksiyonu aynı kalır) ...

// Örnek: createNewUser fonksiyonunda da achievements array olarak tanımlanmalı
export const createNewUser = async (userId: string, userData: {
    email: string | null; // email null olabilir
    name: string | null; // name null olabilir
    currentRole: string;
    hotelType: string;
    currentDay: number;
    completedScenarios: number;
    metrics: MetricValues;
    // achievements: any[] // Bu yerine string[] kullanmak daha iyi
    achievements: string[]; // Başlangıçta boş dizi olabilir []
}) => {
    try {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, {
            ...userData,
            achievements: Array.isArray(userData.achievements) ? userData.achievements : [], // Dizi olduğundan emin ol
            createdAt: Timestamp.now(),
            lastLoginDate: Timestamp.now()
        });
    } catch (error) {
        console.error('Kullanıcı oluşturma hatası:', error);
        throw error;
    }
};

// getUserData fonksiyonunda da achievement tipini kontrol etmek iyi olabilir
export const getUserData = async (userId: string): Promise<UserData | null> => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            const data = userDoc.data();
            // achievements alanının bir dizi olduğundan emin ol
            if (data.achievements && !Array.isArray(data.achievements)) {
                console.warn(`Kullanıcı ${userId} için 'achievements' alanı bir dizi değil, boş dizi olarak ayarlanıyor.`);
                data.achievements = [];
            } else if (!data.achievements) {
                data.achievements = []; // Eğer alan hiç yoksa boş dizi ata
            }
            return data as UserData;
        }
        return null;
    } catch (error) {
        console.error('Kullanıcı verisi getirme hatası:', error);
        throw error;
    }
};

// updateUserMetrics fonksiyonu aynı kalabilir
export const updateUserMetrics = async (
    userId: string,
    newMetrics: MetricValues
) => {
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { metrics: newMetrics });
    } catch (error) {
        console.error('Metrik güncelleme hatası:', error);
        throw error;
    }
};

// getInitialMetrics fonksiyonu aynı kalabilir
export const getInitialMetrics = (): MetricValues => ({
    revenue: 50,
    customerSatisfaction: 50,
    staffSatisfaction: 50,
    occupancyRate: 50,
    sustainability: 50
});