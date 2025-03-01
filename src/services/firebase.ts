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
    getDocs
} from 'firebase/firestore';
import {
    UserData,
    MetricValues,
    UserDecision
} from '../types/firebase';

// Kullanıcı işlemleri
export const createNewUser = async (userId: string, userData: {
    email: string;
    name: string;
    currentRole: string;
    hotelType: string;
    currentDay: number;
    completedScenarios: number;
    metrics: MetricValues;
    achievements: any[]
}) => {
    try {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, {
            ...userData,
            createdAt: Timestamp.now(),
            lastLoginDate: Timestamp.now()
        });
    } catch (error) {
        console.error('Kullanıcı oluşturma hatası:', error);
        throw error;
    }
};

export const getUserData = async (userId: string): Promise<UserData | null> => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            return userDoc.data() as UserData;
        }
        return null;
    } catch (error) {
        console.error('Kullanıcı verisi getirme hatası:', error);
        throw error;
    }
};

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

// Karar kaydetme işlemi - Yeni alanları (day, scenarioText, selectedOptionText, gameId) ekledim
// Karar kaydetme işlemi - güncellenmiş versiyon
// Mevcut tip yapısını bozmadan yeni alanları opsiyonel olarak kabul eder
// Bu fonksiyon firebase.ts içinde yer aldığı gibi güncellenmeli

// Karar kaydetme işlemi - Yeni alanları da kabul edecek şekilde
export const saveUserDecision = async (decision: Omit<UserDecision, 'createdAt' | 'id'> & {
    day?: number;
    scenarioText?: string;
    selectedOptionText?: string;
    gameId?: string;
}) => {
    try {
        await addDoc(collection(db, 'userDecisions'), {
            userId: decision.userId,
            questionId: decision.questionId,
            selectedOption: decision.selectedOption,
            metrics: decision.metrics,
            // Yeni alanlar - varsa ekle
            ...(decision.day !== undefined ? { day: decision.day } : {}),
            ...(decision.scenarioText ? { scenarioText: decision.scenarioText } : {}),
            ...(decision.selectedOptionText ? { selectedOptionText: decision.selectedOptionText } : {}),
            ...(decision.gameId ? { gameId: decision.gameId } : {}),
            createdAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Karar kaydetme hatası:', error);
        throw error;
    }
};

// Kullanıcı kararlarını yükleme fonksiyonu
export const loadUserDecisions = async (userId: string): Promise<UserDecision[]> => {
    try {
        const decisionsRef = collection(db, 'userDecisions');
        const q = query(decisionsRef, where('userId', '==', userId));
        const querySnapshot = await getDocs(q);

        // Her dokümanı UserDecision tipinde bir objeye dönüştürüyoruz
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId,
                questionId: data.questionId,
                selectedOption: data.selectedOption,
                metrics: data.metrics,
                createdAt: data.createdAt,
                day: data.day,
                scenarioText: data.scenarioText,
                selectedOptionText: data.selectedOptionText,
                gameId: data.gameId
            } as UserDecision;
        });
    } catch (error) {
        console.error('Karar geçmişi yükleme hatası:', error);
        throw error;
    }
};
// Başlangıç metriklerini oluştur
export const getInitialMetrics = (): MetricValues => ({
    revenue: 50,
    customerSatisfaction: 50,
    staffSatisfaction: 50,
    occupancyRate: 50,
    sustainability: 50
});
